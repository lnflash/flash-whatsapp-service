import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix for namespacing
  skipCache?: boolean; // Skip cache for this operation
  forceRefresh?: boolean; // Force refresh the cache
  batchSize?: number; // For batch operations
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  lastReset: Date;
}

export interface CacheKey {
  prefix: string;
  identifier: string;
  suffix?: string;
}

@Injectable()
export class CacheManagerService {
  private readonly logger = new Logger(CacheManagerService.name);
  private readonly metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    lastReset: new Date(),
  };

  // Default TTLs for different cache types (in seconds)
  private readonly defaultTTLs = {
    balance: 300, // 5 minutes
    price: 900, // 15 minutes
    username: 3600, // 1 hour
    transaction: 86400, // 24 hours
    session: 1800, // 30 minutes
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    // Override defaults with config values
    const cacheTTLs = this.configService.get('cache');
    if (cacheTTLs) {
      Object.assign(this.defaultTTLs, cacheTTLs);
    }
  }

  /**
   * Get a value from cache with automatic miss handling
   */
  async get<T>(
    key: string | CacheKey,
    factory?: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T | null> {
    const cacheKey = this.buildKey(key, options.prefix);

    try {
      // Skip cache if requested
      if (options.skipCache) {
        return factory ? await factory() : null;
      }

      // Force refresh if requested
      if (options.forceRefresh && factory) {
        const value = await factory();
        await this.set(key, value, options);
        return value;
      }

      // Try to get from cache
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.metrics.hits++;
        this.logger.debug(`Cache hit for key: ${cacheKey}`);
        return JSON.parse(cached);
      }

      // Cache miss
      this.metrics.misses++;
      this.logger.debug(`Cache miss for key: ${cacheKey}`);

      // If factory provided, fetch and cache
      if (factory) {
        const value = await factory();
        await this.set(key, value, options);
        return value;
      }

      return null;
    } catch (error) {
      this.metrics.errors++;
      this.logger.error(`Cache error for key ${cacheKey}:`, error);

      // Fallback to factory if available
      if (factory) {
        return await factory();
      }

      throw error;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string | CacheKey, value: T, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.buildKey(key, options.prefix);
    const ttl = options.ttl || this.getDefaultTTL(key);

    try {
      await this.redisService.set(cacheKey, JSON.stringify(value), ttl);
      this.logger.debug(`Cached key ${cacheKey} with TTL ${ttl}s`);
    } catch (error) {
      this.metrics.errors++;
      this.logger.error(`Failed to cache key ${cacheKey}:`, error);
      throw error;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string | CacheKey, options: CacheOptions = {}): Promise<void> {
    const cacheKey = this.buildKey(key, options.prefix);

    try {
      await this.redisService.del(cacheKey);
      this.logger.debug(`Deleted cache key: ${cacheKey}`);
    } catch (error) {
      this.metrics.errors++;
      this.logger.error(`Failed to delete cache key ${cacheKey}:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redisService.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.redisService.del(...keys);
      this.logger.debug(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
      return keys.length;
    } catch (error) {
      this.metrics.errors++;
      this.logger.error(`Failed to delete pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple values in a single operation
   */
  async mget<T>(
    keys: Array<string | CacheKey>,
    options: CacheOptions = {},
  ): Promise<Map<string, T | null>> {
    const cacheKeys = keys.map((key) => this.buildKey(key, options.prefix));
    const result = new Map<string, T | null>();

    try {
      const values = await this.redisService.mget(...cacheKeys);

      keys.forEach((key, index) => {
        const value = values[index];
        const cacheKey = this.buildKey(key, options.prefix);

        if (value) {
          this.metrics.hits++;
          result.set(cacheKey, JSON.parse(value));
        } else {
          this.metrics.misses++;
          result.set(cacheKey, null);
        }
      });

      return result;
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to mget:', error);
      throw error;
    }
  }

  /**
   * Set multiple values in a single operation
   */
  async mset<T>(
    entries: Array<{ key: string | CacheKey; value: T; ttl?: number }>,
    options: CacheOptions = {},
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      // Redis MSET doesn't support TTL, so we use a pipeline
      const pipeline = this.redisService.pipeline();

      for (const entry of entries) {
        const cacheKey = this.buildKey(entry.key, options.prefix);
        const ttl = entry.ttl || options.ttl || this.getDefaultTTL(entry.key);

        pipeline.set(cacheKey, JSON.stringify(entry.value), 'EX', ttl);
      }

      await pipeline.exec();
      this.logger.debug(`Cached ${entries.length} entries in batch`);
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to mset:', error);
      throw error;
    }
  }

  /**
   * Implement cache-aside pattern with automatic refresh
   */
  async getOrSet<T>(
    key: string | CacheKey,
    factory: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    return (await this.get(key, factory, options))!;
  }

  /**
   * Invalidate all caches for a specific entity
   */
  async invalidateEntity(entityType: string, entityId: string): Promise<void> {
    const pattern = `${entityType}:${entityId}:*`;
    const count = await this.deletePattern(pattern);
    this.logger.log(`Invalidated ${count} cache entries for ${entityType}:${entityId}`);
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.metrics.hits = 0;
    this.metrics.misses = 0;
    this.metrics.errors = 0;
    this.metrics.lastReset = new Date();
  }

  /**
   * Calculate cache hit rate
   */
  getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    if (total === 0) return 0;
    return (this.metrics.hits / total) * 100;
  }

  /**
   * Build a cache key from components
   */
  private buildKey(key: string | CacheKey, prefix?: string): string {
    if (typeof key === 'string') {
      return prefix ? `${prefix}:${key}` : key;
    }

    const parts = [key.prefix, key.identifier];
    if (key.suffix) {
      parts.push(key.suffix);
    }
    return parts.join(':');
  }

  /**
   * Get default TTL based on key pattern
   */
  private getDefaultTTL(key: string | CacheKey): number {
    const keyStr = typeof key === 'string' ? key : key.prefix;

    // Check if key matches any default TTL pattern
    for (const [pattern, ttl] of Object.entries(this.defaultTTLs)) {
      if (keyStr.toLowerCase().includes(pattern)) {
        return ttl;
      }
    }

    // Default fallback TTL
    return 300; // 5 minutes
  }

  /**
   * Warm cache with frequently accessed data
   */
  async warmCache(
    warmupData: Array<{ key: string | CacheKey; factory: () => Promise<any>; ttl?: number }>,
  ): Promise<void> {
    this.logger.log(`Warming cache with ${warmupData.length} entries...`);

    const results = await Promise.allSettled(
      warmupData.map(async ({ key, factory, ttl }) => {
        try {
          const value = await factory();
          await this.set(key, value, { ttl });
          return { key, success: true };
        } catch (error) {
          this.logger.error(`Failed to warm cache for key ${key}:`, error);
          return { key, success: false, error };
        }
      }),
    );

    const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    this.logger.log(`Cache warming complete: ${successful}/${warmupData.length} entries loaded`);
  }

  /**
   * Create cache key builders for common patterns
   */
  static keys = {
    balance: (userId: string, currency?: string): CacheKey => ({
      prefix: 'balance',
      identifier: userId,
      suffix: currency,
    }),

    price: (currency: string): CacheKey => ({
      prefix: 'price',
      identifier: currency.toUpperCase(),
    }),

    username: (username: string): CacheKey => ({
      prefix: 'username',
      identifier: username.toLowerCase(),
    }),

    transaction: (txId: string): CacheKey => ({
      prefix: 'transaction',
      identifier: txId,
    }),

    session: (sessionId: string): CacheKey => ({
      prefix: 'session',
      identifier: sessionId,
    }),

    user: (userId: string, dataType: string): CacheKey => ({
      prefix: 'user',
      identifier: userId,
      suffix: dataType,
    }),
  };
}
