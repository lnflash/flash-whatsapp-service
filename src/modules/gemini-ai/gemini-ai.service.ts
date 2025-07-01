import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { RedisService } from '../redis/redis.service';
import {
  FLASH_COMMANDS,
  TRAINING_EXAMPLES,
  CONVERSATION_CONTEXT,
  ERROR_RESPONSES,
} from './training/flash-knowledge-base';

@Injectable()
export class GeminiAiService {
  private readonly logger = new Logger(GeminiAiService.name);
  private readonly apiKey: string;
  private readonly model: any;
  private readonly cacheTtl: number = 60 * 60; // 1 hour in seconds

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.apiKey = this.configService.get<string>('geminiAi.apiKey') || '';

    if (!this.apiKey) {
      this.logger.warn(
        'Google Gemini AI API configuration incomplete. AI responses will be limited.',
      );
      this.model = null;
    } else {
      try {
        const genAI = new GoogleGenerativeAI(this.apiKey);

        // Use Gemini 1.5 Pro for better multilingual support
        this.model = genAI.getGenerativeModel({
          model: 'gemini-1.5-pro',
          generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 1024, // Increased from 100 to prevent message truncation
          },
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        });

        this.logger.log('Google Gemini AI initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize Google Gemini AI', error);
        this.model = null;
      }
    }
  }

  /**
   * Process a user query with Google Gemini AI
   */
  async processQuery(query: string, context: Record<string, any> = {}): Promise<string> {
    try {
      if (!this.model) {
        return this.getFallbackResponse(query);
      }

      // Check cache first
      const cacheKey = `ai:query:${this.hashString(query)}`;
      const cachedResponse = await this.redisService.get(cacheKey);

      if (cachedResponse) {
        this.logger.log(`Using cached response for query: ${query.substring(0, 30)}...`);
        return cachedResponse;
      }

      // Filter out any sensitive information from context
      const safeContext = this.sanitizeContext(context);

      // Build the prompt with context
      const prompt = this.buildPrompt(query, safeContext);

      // Generate response using Gemini
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini AI');
      }

      // Cache the response
      await this.redisService.set(cacheKey, text, this.cacheTtl);

      return text;
    } catch (error) {
      this.logger.error(`Error processing Gemini AI query: ${error.message}`, error.stack);
      return this.getFallbackResponse(query);
    }
  }

  /**
   * Build a comprehensive prompt for Gemini
   */
  private buildPrompt(query: string, context: Record<string, any>): string {
    // Find relevant training examples based on the query
    const relevantExamples = this.findRelevantExamples(query, 3);

    // Build command reference
    const commandReference = FLASH_COMMANDS.map((cmd) => {
      const authNote = cmd.requiresAuth ? ' (requires linked account)' : '';
      return `- ${cmd.command}: ${cmd.description}${authNote}
  Usage: ${cmd.usage}
  ${cmd.notes ? `Note: ${cmd.notes}` : ''}`;
    }).join('\n');

    // Build examples section from relevant training data
    const examplesSection =
      relevantExamples.length > 0
        ? `\nRelevant examples for similar questions:\n${relevantExamples
            .map((ex) => `Q: ${ex.question}\nA: ${ex.answer}`)
            .join('\n\n')}`
        : '';

    return `You are Pulse, a WhatsApp bot that helps users with their Bitcoin wallet and payment needs in the Caribbean.

YOUR IDENTITY:
- Your name is PULSE (not Flash Connect, not Flash assistant, just Pulse)
- You are a WhatsApp bot/assistant
- When asked "What is Pulse?", explain: "I'm Pulse, your WhatsApp Bitcoin wallet assistant"
- You help users send/receive money using their Flash account

PERSONALITY & TONE:
${CONVERSATION_CONTEXT.personality.tone}
Style: ${CONVERSATION_CONTEXT.personality.style}

IMPORTANT RULES:
${CONVERSATION_CONTEXT.important_rules.map((rule) => `- ${rule}`).join('\n')}

CURRENT USER CONTEXT:
- Authenticated: ${context.userId ? 'Yes' : 'No'}
- Has given AI consent: ${context.consentGiven ? 'Yes' : 'No'}
- Phone: ${context.phoneNumber || 'Not provided'}
- Last command used: ${context.lastCommand || 'None'}

AVAILABLE COMMANDS:
${commandReference}

${examplesSection}

COMMON USER MISTAKES TO WATCH FOR:
${CONVERSATION_CONTEXT.common_mistakes.map((m) => `- ${m.mistake}: ${m.correction}`).join('\n')}

ERROR MESSAGES TO USE:
${Object.entries(ERROR_RESPONSES)
  .map(([key, msg]) => `- ${key}: "${msg}"`)
  .join('\n')}

USER QUERY: ${query}

Instructions:
1. Answer the user's question directly and helpfully
2. If they're trying to use a command that requires authentication and they're not linked, guide them to link first
3. For the "receive" command, ALWAYS remind users it's USD only (not BTC)
4. Prioritize CLARITY and UNDERSTANDING - provide complete explanations
5. Be helpful and informative, explaining things clearly
6. For commands, show examples and explain what they do
7. For typos like "sent" instead of "send", explain the correct usage
8. Provide COMPLETE responses - do NOT truncate or cut off mid-sentence
9. Responses can be as long as needed to fully answer the question
10. For technical topics like Lightning Addresses, match the complexity level to the user's question

Please provide a clear, complete, and helpful response:`;
  }

  /**
   * Generate a fallback response when AI is unavailable
   */
  private getFallbackResponse(query: string): string {
    const lowerQuery = query.toLowerCase();

    // Try to find a relevant example from training data
    const relevantExamples = this.findRelevantExamples(query, 1);
    if (relevantExamples.length > 0) {
      return relevantExamples[0].answer;
    }

    // Check for specific command mentions
    const mentionedCommand = FLASH_COMMANDS.find((cmd) => lowerQuery.includes(cmd.command));

    if (mentionedCommand) {
      let response = `The "${mentionedCommand.command}" command ${mentionedCommand.description.toLowerCase()}.`;
      if (mentionedCommand.examples.length > 0) {
        response += ` Example: ${mentionedCommand.examples[0]}`;
      }
      if (mentionedCommand.requiresAuth) {
        response += ' (Note: You need to link your account first)';
      }
      return response;
    }

    // Check for common keywords
    if (lowerQuery.includes('receive') || lowerQuery.includes('invoice')) {
      return (
        ERROR_RESPONSES.btc_not_supported +
        ' Example: "receive 10" or "receive 25.50 Payment for services"'
      );
    }

    if (lowerQuery.includes('balance')) {
      return 'To check your balance, type "balance". Need to refresh? Use "refresh" to clear the cache.';
    }

    if (lowerQuery.includes('link') || lowerQuery.includes('connect')) {
      return 'To link your Flash account, type "link". You\'ll receive an OTP code in your Flash app to verify.';
    }

    if (
      lowerQuery.includes('support') ||
      lowerQuery.includes('help') ||
      lowerQuery.includes('contact')
    ) {
      return 'For help, type "help" to see available commands. For support, email support@flashapp.me or use the Help section in the Flash app.';
    }

    // Default response
    return "I'm having trouble understanding your question. Type 'help' to see available commands, or contact support@flashapp.me for assistance.";
  }

  /**
   * Remove any sensitive information from the context
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const safeContext = { ...context };

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'pin',
      'mfa',
      'otp',
      'ssn',
      'socialSecurity',
      'creditCard',
      'cardNumber',
      'cvv',
      'accountNumber',
      'balance',
      'wallet',
      'seed',
      'private',
    ];

    // Recursively sanitize the context
    const sanitizeObject = (obj: Record<string, any>) => {
      for (const [key, value] of Object.entries(obj)) {
        // Check if key contains sensitive information
        if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          // Recursively check nested objects
          sanitizeObject(value);
        }
      }
    };

    sanitizeObject(safeContext);
    return safeContext;
  }

  /**
   * Find relevant examples from training data based on query
   */
  private findRelevantExamples(query: string, limit: number = 3): typeof TRAINING_EXAMPLES {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    // Score each example based on keyword matches
    const scoredExamples = TRAINING_EXAMPLES.map((example) => {
      let score = 0;

      // Check if query contains any keywords
      example.keywords.forEach((keyword) => {
        if (queryLower.includes(keyword.toLowerCase())) {
          score += 2;
        }
      });

      // Check if example question/answer contains query words
      queryWords.forEach((word) => {
        if (word.length > 3) {
          // Skip short words
          if (example.question.toLowerCase().includes(word)) {
            score += 1;
          }
          if (example.answer.toLowerCase().includes(word)) {
            score += 0.5;
          }
        }
      });

      return { example, score };
    });

    // Sort by score and return top matches
    return scoredExamples
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.example);
  }

  /**
   * Create a hash of a string for caching
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
}
