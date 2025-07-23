import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CacheManagerService } from './cache-manager.service';
import { PriceService } from '../../flash-api/services/price.service';
import { SessionService } from '../../auth/services/session.service';

export interface CacheWarmupConfig {
  enabled: boolean;
  onStartup: boolean;
  schedule?: string; // Cron expression
  items: CacheWarmupItem[];
}

export interface CacheWarmupItem {
  type: 'price' | 'session' | 'custom';
  enabled: boolean;
  ttl?: number;
  data?: any;
}

@Injectable()
export class CacheWarmerService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmerService.name);
  private warmupConfig: CacheWarmupConfig;
  private isWarming = false;

  constructor(
    private readonly cacheManager: CacheManagerService,
    private readonly configService: ConfigService,
    private readonly priceService: PriceService,
    private readonly sessionService: SessionService,
  ) {
    this.warmupConfig = this.configService.get<CacheWarmupConfig>('cache.warmup', {
      enabled: true,
      onStartup: true,
      schedule: CronExpression.EVERY_HOUR,
      items: [
        { type: 'price', enabled: true },
        { type: 'session', enabled: true },
      ],
    });
  }

  async onModuleInit() {
    if (this.warmupConfig.enabled && this.warmupConfig.onStartup) {
      // Delay startup warming to allow services to initialize
      setTimeout(() => {
        this.warmCache().catch(error => {
          this.logger.error('Startup cache warming failed:', error);
        });
      }, 5000);
    }
  }

  /**
   * Scheduled cache warming
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledWarmup() {
    if (!this.warmupConfig.enabled) {
      return;
    }

    await this.warmCache();
  }

  /**
   * Warm the cache with frequently accessed data
   */
  async warmCache(): Promise<void> {
    if (this.isWarming) {
      this.logger.debug('Cache warming already in progress, skipping...');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      this.logger.log('Starting cache warming...');

      const warmupTasks = [];

      // Warm price cache
      if (this.shouldWarmType('price')) {
        warmupTasks.push(this.warmPriceCache());
      }

      // Warm active sessions
      if (this.shouldWarmType('session')) {
        warmupTasks.push(this.warmSessionCache());
      }

      // Execute all warmup tasks
      const results = await Promise.allSettled(warmupTasks);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const duration = Date.now() - startTime;

      this.logger.log(
        `Cache warming completed in ${duration}ms: ${successful} successful, ${failed} failed`,
      );

      // Log individual failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(`Warmup task ${index} failed:`, result.reason);
        }
      });

    } catch (error) {
      this.logger.error('Cache warming failed:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm price cache for common currencies
   */
  private async warmPriceCache(): Promise<void> {
    const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY'];
    const warmupData = [];
    let successCount = 0;
    let failureCount = 0;

    for (const currency of currencies) {
      warmupData.push({
        key: CacheManagerService.keys.price(currency),
        factory: async () => {
          try {
            const price = await this.priceService.getBitcoinPrice(currency);
            successCount++;
            return price;
          } catch (error) {
            failureCount++;
            // Enhanced error handling for specific Flash API errors
            if (error.message?.includes('PriceNotAvailableError')) {
              this.logger.warn(
                `Flash API: Price not available for ${currency}. This may be due to API configuration or unsupported currency.`,
              );
            } else if (error.message?.includes('Failed to retrieve Bitcoin price')) {
              this.logger.warn(
                `Flash API: Failed to retrieve price for ${currency}. Check API connectivity and credentials.`,
              );
            } else {
              this.logger.warn(`Failed to fetch price for ${currency}: ${error.message}`);
            }
            // Return null to allow cache warming to continue for other currencies
            return null;
          }
        },
        ttl: 900, // 15 minutes
      });
    }

    await this.cacheManager.warmCache(warmupData);
    
    if (failureCount > 0) {
      this.logger.warn(
        `Price cache warming completed with issues: ${successCount} successful, ${failureCount} failed out of ${currencies.length} currencies`,
      );
    } else {
      this.logger.debug(`Successfully warmed price cache for all ${currencies.length} currencies`);
    }
  }

  /**
   * Warm session cache for active sessions
   */
  private async warmSessionCache(): Promise<void> {
    try {
      // Get all active sessions
      const sessions = await this.sessionService.getAllActiveSessions();
      
      if (sessions.length === 0) {
        this.logger.debug('No active sessions to warm');
        return;
      }

      const warmupData = sessions.map(session => ({
        key: CacheManagerService.keys.session(session.sessionId),
        factory: async () => session,
        ttl: 1800, // 30 minutes
      }));

      await this.cacheManager.warmCache(warmupData);
      this.logger.debug(`Warmed cache for ${sessions.length} active sessions`);
    } catch (error) {
      this.logger.error('Failed to warm session cache:', error);
    }
  }

  /**
   * Check if a specific cache type should be warmed
   */
  private shouldWarmType(type: string): boolean {
    const item = this.warmupConfig.items.find(i => i.type === type);
    return item?.enabled ?? false;
  }

  /**
   * Manually trigger cache warming
   */
  async manualWarmup(): Promise<void> {
    this.logger.log('Manual cache warming triggered');
    await this.warmCache();
  }

  /**
   * Get warming status
   */
  getStatus(): { isWarming: boolean; config: CacheWarmupConfig } {
    return {
      isWarming: this.isWarming,
      config: this.warmupConfig,
    };
  }

  /**
   * Update warming configuration
   */
  updateConfig(config: Partial<CacheWarmupConfig>): void {
    this.warmupConfig = { ...this.warmupConfig, ...config };
    this.logger.log('Cache warming configuration updated');
  }
}