import { Injectable, Logger } from '@nestjs/common';

export interface DeduplicationOptions {
  ttl?: number; // Time in ms to keep the result cached
  throwOnError?: boolean; // Whether to throw errors or return them
}

/**
 * Service to prevent duplicate requests from being processed simultaneously.
 * When multiple identical requests come in, only the first one is processed,
 * and all others wait for and receive the same result.
 */
@Injectable()
export class RequestDeduplicator {
  private readonly logger = new Logger(RequestDeduplicator.name);
  private readonly inFlightRequests = new Map<string, Promise<any>>();
  private readonly resultCache = new Map<string, { result: any; expiresAt: number }>();

  /**
   * Deduplicates requests based on a key. If a request with the same key
   * is already in flight, returns the existing promise. Otherwise, executes
   * the factory function and caches the result.
   * 
   * @param key Unique identifier for the request
   * @param factory Function that performs the actual request
   * @param options Configuration options
   * @returns The result of the request
   */
  async deduplicate<T>(
    key: string,
    factory: () => Promise<T>,
    options: DeduplicationOptions = {}
  ): Promise<T> {
    const { ttl = 5000, throwOnError = true } = options;

    // Check if we have a cached result that hasn't expired
    const cached = this.resultCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Returning cached result for key: ${key}`);
      return cached.result;
    }

    // Check if request is already in flight
    const existing = this.inFlightRequests.get(key);
    if (existing) {
      this.logger.debug(`Request already in flight for key: ${key}`);
      return existing;
    }

    // Create new request
    this.logger.debug(`Starting new request for key: ${key}`);
    const promise = this.executeRequest(key, factory, ttl, throwOnError);
    this.inFlightRequests.set(key, promise);

    return promise;
  }

  /**
   * Clears a specific key from cache and in-flight requests
   */
  clear(key: string): void {
    this.inFlightRequests.delete(key);
    this.resultCache.delete(key);
    this.logger.debug(`Cleared deduplication data for key: ${key}`);
  }

  /**
   * Clears all cached data and in-flight requests
   */
  clearAll(): void {
    this.inFlightRequests.clear();
    this.resultCache.clear();
    this.logger.debug('Cleared all deduplication data');
  }

  /**
   * Gets the number of in-flight requests
   */
  getInFlightCount(): number {
    return this.inFlightRequests.size;
  }

  /**
   * Gets the number of cached results
   */
  getCacheSize(): number {
    return this.resultCache.size;
  }

  /**
   * Executes the request and manages caching
   */
  private async executeRequest<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number,
    throwOnError: boolean
  ): Promise<T> {
    try {
      const result = await factory();
      
      // Cache successful result
      if (ttl > 0) {
        this.resultCache.set(key, {
          result,
          expiresAt: Date.now() + ttl,
        });

        // Schedule cache cleanup
        setTimeout(() => {
          this.resultCache.delete(key);
        }, ttl);
      }

      return result;
    } catch (error) {
      this.logger.error(`Error in deduplicated request for key ${key}:`, error);
      
      if (throwOnError) {
        throw error;
      }
      
      return error as T;
    } finally {
      // Remove from in-flight map
      this.inFlightRequests.delete(key);
    }
  }

  /**
   * Periodic cleanup of expired cache entries
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.resultCache.entries()) {
      if (cached.expiresAt <= now) {
        this.resultCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }
}

/**
 * Helper function to generate deduplication keys for common scenarios
 */
export class DeduplicationKeyBuilder {
  static forUserCommand(userId: string, commandType: string, ...args: string[]): string {
    return `user:${userId}:cmd:${commandType}:${args.join(':')}`;
  }

  static forApiCall(endpoint: string, ...params: string[]): string {
    return `api:${endpoint}:${params.join(':')}`;
  }

  static forBalance(userId: string, currency?: string): string {
    return `balance:${userId}${currency ? `:${currency}` : ''}`;
  }

  static forPrice(currency: string): string {
    return `price:${currency}`;
  }

  static forTransaction(transactionId: string): string {
    return `tx:${transactionId}`;
  }

  static forUserProfile(userId: string): string {
    return `profile:${userId}`;
  }
}