import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlashApiService } from '../flash-api.service';
import { RedisService } from '../../redis/redis.service';

interface BalanceInfo {
  btcBalance: number;
  fiatBalance: number;
  fiatCurrency: string;
  lastUpdated: Date;
}

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);
  private readonly cacheTtl: number = 300; // 5 minutes in seconds
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second in ms

  constructor(
    private readonly configService: ConfigService,
    private readonly flashApiService: FlashApiService,
    private readonly redisService: RedisService,
  ) {
    // Override TTL from config if provided
    const configTtl = this.configService.get<number>('balanceCacheTtl');
    if (configTtl) {
      this.cacheTtl = configTtl;
    }
  }

  /**
   * Get user balance from Flash API with caching
   */
  async getUserBalance(userId: string): Promise<BalanceInfo> {
    try {
      // Try to get from cache first
      const cachedBalance = await this.getCachedBalance(userId);
      if (cachedBalance) {
        return cachedBalance;
      }

      // Not in cache, fetch from API
      const balance = await this.fetchBalanceFromApi(userId);
      
      // Store in cache for future requests
      await this.cacheBalance(userId, balance);
      
      return balance;
    } catch (error) {
      this.logger.error(`Error getting user balance: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to retrieve balance information');
    }
  }

  /**
   * Get cached balance for a user if available
   */
  private async getCachedBalance(userId: string): Promise<BalanceInfo | null> {
    try {
      const cacheKey = `balance:${userId}`;
      const cachedData = await this.redisService.get(cacheKey);
      
      if (!cachedData) {
        return null;
      }
      
      return JSON.parse(cachedData) as BalanceInfo;
    } catch (error) {
      this.logger.warn(`Error getting cached balance: ${error.message}`);
      return null; // Cache miss on error, will fallback to API
    }
  }

  /**
   * Store balance data in cache
   */
  private async cacheBalance(userId: string, balance: BalanceInfo): Promise<void> {
    try {
      const cacheKey = `balance:${userId}`;
      await this.redisService.set(cacheKey, JSON.stringify(balance), this.cacheTtl);
    } catch (error) {
      this.logger.warn(`Error caching balance: ${error.message}`);
      // Non-critical error, don't throw
    }
  }

  /**
   * Fetch balance data from Flash API with retries
   */
  private async fetchBalanceFromApi(userId: string, attempt: number = 1): Promise<BalanceInfo> {
    try {
      // GraphQL query for user balance
      const query = `
        query GetUserBalance($userId: ID!) {
          userBalance(userId: $userId) {
            btcBalance
            fiatBalance
            fiatCurrency
          }
        }
      `;
      
      const variables = { userId };
      
      // Execute the query
      const result = await this.flashApiService.executeQuery<{
        userBalance: {
          btcBalance: string; // API returns stringified numbers for precision
          fiatBalance: string;
          fiatCurrency: string;
        }
      }>(query, variables);
      
      // Format the response
      return {
        btcBalance: parseFloat(result.userBalance.btcBalance),
        fiatBalance: parseFloat(result.userBalance.fiatBalance),
        fiatCurrency: result.userBalance.fiatCurrency,
        lastUpdated: new Date(),
      };
    } catch (error) {
      if (attempt < this.maxRetries) {
        this.logger.warn(`Error fetching balance, retrying (${attempt}/${this.maxRetries}): ${error.message}`);
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt - 1)));
        
        return this.fetchBalanceFromApi(userId, attempt + 1);
      }
      
      this.logger.error(`Failed to fetch balance after ${this.maxRetries} attempts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format balance for display
   */
  formatBalanceMessage(balance: BalanceInfo): string {
    const btcFormatted = this.formatBitcoinAmount(balance.btcBalance);
    const fiatFormatted = this.formatFiatAmount(balance.fiatBalance, balance.fiatCurrency);
    
    return `*Your Current Flash Balance*\n\n• ${btcFormatted} BTC\n• ${fiatFormatted}\n\nLast updated: ${this.formatDateTime(balance.lastUpdated)}`;
  }

  /**
   * Format Bitcoin amount with appropriate precision
   */
  private formatBitcoinAmount(amount: number): string {
    // Use 8 decimal places for BTC
    return amount.toFixed(8);
  }

  /**
   * Format fiat amount with appropriate currency symbol and separators
   */
  private formatFiatAmount(amount: number, currency: string): string {
    const currencyFormatters: Record<string, (n: number) => string> = {
      'JMD': (n) => `JMD $${n.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      'USD': (n) => `USD $${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      // Add more currencies as needed
    };
    
    const formatter = currencyFormatters[currency] || ((n) => `${currency} ${n.toLocaleString()}`);
    return formatter(amount);
  }

  /**
   * Format date time for display
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}