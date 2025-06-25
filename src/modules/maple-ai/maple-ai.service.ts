import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MapleAiService {
  private readonly logger = new Logger(MapleAiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly cacheTtl: number = 60 * 60; // 1 hour in seconds

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.apiUrl = this.configService.get<string>('mapleAi.apiUrl') || '';
    this.apiKey = this.configService.get<string>('mapleAi.apiKey') || '';
    
    if (!this.apiUrl || !this.apiKey) {
      this.logger.warn('Maple AI API configuration incomplete. AI responses will be limited.');
    }
  }

  /**
   * Process a user query with Maple AI
   */
  async processQuery(query: string, context: Record<string, any> = {}): Promise<string> {
    try {
      if (!this.apiUrl || !this.apiKey) {
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
      
      // Add FAQ database and common queries to context
      const enhancedContext = {
        ...safeContext,
        faq: await this.getFaqDatabase(),
        product: 'Flash Bitcoin Wallet',
        userIsAuthenticated: !!safeContext.userId,
      };
      
      // Prepare API request
      const response = await fetch(`${this.apiUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          context: enhancedContext,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Maple AI API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      const aiResponse = data.response || this.getFallbackResponse(query);
      
      // Cache the response
      await this.redisService.set(cacheKey, aiResponse, this.cacheTtl);
      
      return aiResponse;
    } catch (error) {
      this.logger.error(`Error processing Maple AI query: ${error.message}`, error.stack);
      return this.getFallbackResponse(query);
    }
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
    if (query.toLowerCase().includes('balance')) {
      return "To check your balance, simply type 'balance' as a command. If you need to see transaction details, please use the Flash app.";
    }
    
    if (query.toLowerCase().includes('help')) {
      return "You can type 'help' to see a list of available commands.";
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
  private async getFaqDatabase(): Promise<Record<string, string>> {
    try {
      const cacheKey = 'ai:faq:database';
      const cachedFaq = await this.redisService.get(cacheKey);
      
      if (cachedFaq) {
        return JSON.parse(cachedFaq);
      }
      
      // In a real implementation, this would fetch from a database or API
      // For now, we'll provide a static FAQ database
      const faqDatabase = {
        'What is Flash?': 'Flash is a Bitcoin wallet and payment app focused on the Caribbean market, starting with Jamaica. It provides seamless, secure Bitcoin and digital payments through mobile and web platforms.',
        'How do I check my balance?': 'You can check your balance by simply typing "balance" in this chat.',
        'How do I make a payment?': 'Currently, you need to use the Flash app to make payments. We\'re working on adding payment functionality to WhatsApp in the future.',
        'Is my money safe?': 'Yes, Flash uses industry-standard security measures to protect your funds. All sensitive operations require multi-factor authentication.',
        'What currencies are supported?': 'Flash supports Bitcoin (BTC) and Jamaican Dollars (JMD).',
        'How do I contact support?': 'You can contact Flash support by email at support@flashapp.me or through the "Help" section in the Flash app.',
        'Is Flash available in my country?': 'Flash is currently available in Jamaica, with plans to expand to other Caribbean countries soon.',
        'What are the fees?': 'Flash has competitive fees that vary by transaction type. Please check the Flash app for current fee details.',
      };
      
      // Cache the FAQ database
      await this.redisService.set(cacheKey, JSON.stringify(faqDatabase), 60 * 60 * 24); // 24 hours
      
      return faqDatabase;
    } catch (error) {
      this.logger.error(`Error fetching FAQ database: ${error.message}`, error.stack);
      return {}; // Return empty FAQ on error
    }
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