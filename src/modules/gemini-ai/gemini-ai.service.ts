import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { RedisService } from '../redis/redis.service';

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
      this.logger.warn('Google Gemini AI API configuration incomplete. AI responses will be limited.');
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
            maxOutputTokens: 1024,
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
    const faqDatabase = this.getFaqDatabase();
    
    return `You are a helpful customer support assistant for Flash Connect, a Bitcoin wallet and payment service focused on the Caribbean market, particularly Jamaica. 

Your responses should be:
- Friendly and conversational, using appropriate Caribbean English when suitable
- Clear and concise
- Focused on helping users with Bitcoin and payment-related questions
- Security-conscious (never ask for passwords, private keys, or sensitive data)

Context about the user:
- Authenticated: ${context.userId ? 'Yes' : 'No'}
- Phone: ${context.phoneNumber || 'Unknown'}
- Previous command: ${context.lastCommand || 'None'}

Available Flash Connect commands:
- link: Connect Flash account to WhatsApp
- verify [code]: Complete OTP verification
- balance: Check Bitcoin and fiat balances (requires authentication)
- help: Display available commands

Common FAQs:
${Object.entries(faqDatabase).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}

Current user query: ${query}

Please provide a helpful response. If the user is asking about account-specific information and they're not authenticated, remind them to link their account first.`;
  }

  /**
   * Generate a fallback response when AI is unavailable
   */
  private getFallbackResponse(query: string): string {
    const commonResponses = [
      "I'm sorry, I'm having trouble accessing the information you need right now. Please try again later or contact Flash support for immediate assistance.",
      "I apologize, but I can't provide an answer to that question at the moment. For urgent inquiries, please contact Flash support through the app.",
      "I'm currently experiencing some issues connecting to my knowledge base. Please try again in a moment, or check the Flash app for more information.",
    ];
    
    // Check for common questions to provide basic responses
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('balance')) {
      return "To check your balance, simply type 'balance' as a command. If you need to see transaction details, please use the Flash app.";
    }
    
    if (lowerQuery.includes('help')) {
      return "You can type 'help' to see a list of available commands.";
    }
    
    if (lowerQuery.includes('link') || lowerQuery.includes('connect')) {
      return "To link your Flash account, type 'link' and follow the verification process.";
    }
    
    if (lowerQuery.includes('support') || lowerQuery.includes('contact')) {
      return "You can reach Flash support at support@flashapp.me or through the Help section in the Flash app.";
    }
    
    // Return a random fallback response
    const randomIndex = Math.floor(Math.random() * commonResponses.length);
    return commonResponses[randomIndex];
  }

  /**
   * Remove any sensitive information from the context
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const safeContext = { ...context };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'pin', 'mfa', 'otp',
      'ssn', 'socialSecurity', 'creditCard', 'cardNumber', 'cvv',
      'accountNumber', 'balance', 'wallet', 'seed', 'private',
    ];
    
    // Recursively sanitize the context
    const sanitizeObject = (obj: Record<string, any>) => {
      for (const [key, value] of Object.entries(obj)) {
        // Check if key contains sensitive information
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
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
   * Get the FAQ database for context enhancement
   */
  private getFaqDatabase(): Record<string, string> {
    return {
      'What is Flash?': 'Flash is a Bitcoin wallet and payment app focused on the Caribbean market, starting with Jamaica. It provides seamless, secure Bitcoin and digital payments through mobile and web platforms.',
      'How do I check my balance?': 'You can check your balance by simply typing "balance" in this chat.',
      'How do I make a payment?': 'Currently, you need to use the Flash app to make payments. We\'re working on adding payment functionality to WhatsApp in the future.',
      'Is my money safe?': 'Yes, Flash uses industry-standard security measures to protect your funds. All sensitive operations require multi-factor authentication.',
      'What currencies are supported?': 'Flash supports Bitcoin (BTC) and Jamaican Dollars (JMD), with plans to add more Caribbean currencies.',
      'How do I contact support?': 'You can contact Flash support by email at support@flashapp.me or through the "Help" section in the Flash app.',
      'Is Flash available in my country?': 'Flash is currently available in Jamaica, with plans to expand to Trinidad & Tobago, Barbados, and other Caribbean countries soon.',
      'What are the fees?': 'Flash has competitive fees that vary by transaction type. Please check the Flash app for current fee details.',
      'Can I use Flash without internet?': 'An internet connection is required for most Flash features, but we\'re exploring offline payment options for the future.',
      'How do I top up my account?': 'You can add funds through bank transfer, debit card, or by receiving Bitcoin from another wallet. Check the Flash app for available options in your country.',
    };
  }

  /**
   * Create a hash of a string for caching
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
}