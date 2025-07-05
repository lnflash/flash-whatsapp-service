import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CryptoService } from '../../common/crypto/crypto.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(
    private configService: ConfigService,
    private cryptoService: CryptoService,
  ) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis');

    this.redisClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('Redis client error:', err);
    });
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    return this.redisClient;
  }

  /**
   * Set key with expiry
   */
  async set(key: string, value: string, expiryInSeconds?: number): Promise<void> {
    if (expiryInSeconds) {
      await this.redisClient.set(key, value, 'EX', expiryInSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  /**
   * Delete key (alias for del)
   */
  async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  /**
   * Set key with expiry only if it doesn't exist
   */
  async setNX(key: string, value: string, expiryInSeconds: number): Promise<boolean> {
    const result = await this.redisClient.set(key, value, 'EX', expiryInSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Add member to a set
   */
  async addToSet(key: string, member: string): Promise<void> {
    await this.redisClient.sadd(key, member);
  }

  /**
   * Get all members of a set
   */
  async getSetMembers(key: string): Promise<string[]> {
    return this.redisClient.smembers(key);
  }

  /**
   * Add one or more members to a sorted set
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.redisClient.zadd(key, score, member);
  }

  /**
   * Get the number of members in a sorted set
   */
  async zcard(key: string): Promise<number> {
    return this.redisClient.zcard(key);
  }

  /**
   * Return a range of members in a sorted set, by index
   */
  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    if (withScores) {
      return this.redisClient.zrange(key, start, stop, 'WITHSCORES');
    }
    return this.redisClient.zrange(key, start, stop);
  }

  /**
   * Return a range of members in a sorted set, by index, with scores ordered from high to low
   */
  async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    if (withScores) {
      return this.redisClient.zrevrange(key, start, stop, 'WITHSCORES');
    }
    return this.redisClient.zrevrange(key, start, stop);
  }

  /**
   * Return a range of members in a sorted set, by score, with scores ordered from high to low
   */
  async zrevrangebyscore(key: string, max: number | string, min: number | string, withScores?: boolean, limit?: { offset: number; count: number }): Promise<string[]> {
    if (withScores && limit) {
      return this.redisClient.zrevrangebyscore(key, max, min, 'WITHSCORES', 'LIMIT', limit.offset, limit.count);
    } else if (withScores) {
      return this.redisClient.zrevrangebyscore(key, max, min, 'WITHSCORES');
    } else if (limit) {
      return this.redisClient.zrevrangebyscore(key, max, min, 'LIMIT', limit.offset, limit.count);
    } else {
      return this.redisClient.zrevrangebyscore(key, max, min);
    }
  }

  /**
   * Remove all members in a sorted set within the given indexes
   */
  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
    return this.redisClient.zremrangebyrank(key, start, stop);
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.redisClient.keys(pattern);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    return this.redisClient.incr(key);
  }

  /**
   * Set expiry on key
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.redisClient.expire(key, seconds);
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    return this.redisClient.ttl(key);
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.redisClient.publish(channel, message);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.redisClient.duplicate();

    await subscriber.subscribe(channel);

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  // ============= ENCRYPTED STORAGE METHODS =============

  /**
   * Set encrypted value with optional expiry
   */
  async setEncrypted(key: string, value: any, expiryInSeconds?: number): Promise<void> {
    try {
      const jsonString = JSON.stringify(value);
      const encrypted = this.cryptoService.encrypt(jsonString);

      if (expiryInSeconds) {
        await this.redisClient.set(key, encrypted, 'EX', expiryInSeconds);
      } else {
        await this.redisClient.set(key, encrypted);
      }
    } catch (error) {
      this.logger.error(`Failed to set encrypted value for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get and decrypt value
   */
  async getEncrypted(key: string): Promise<any | null> {
    try {
      const encrypted = await this.redisClient.get(key);
      if (!encrypted) return null;

      const decrypted = this.cryptoService.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error(`Failed to get encrypted value for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set encrypted value with NX (only if not exists)
   */
  async setNXEncrypted(key: string, value: any, expiryInSeconds: number): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(value);
      const encrypted = this.cryptoService.encrypt(jsonString);

      const result = await this.redisClient.set(key, encrypted, 'EX', expiryInSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to setNX encrypted value for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Add encrypted member to a set
   */
  async addToSetEncrypted(key: string, member: any): Promise<void> {
    try {
      const jsonString = JSON.stringify(member);
      const encrypted = this.cryptoService.encrypt(jsonString);
      await this.redisClient.sadd(key, encrypted);
    } catch (error) {
      this.logger.error(`Failed to add encrypted member to set ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all members of an encrypted set
   */
  async getSetMembersEncrypted(key: string): Promise<any[]> {
    try {
      const encryptedMembers = await this.redisClient.smembers(key);
      const decryptedMembers = [];

      for (const encrypted of encryptedMembers) {
        try {
          const decrypted = this.cryptoService.decrypt(encrypted);
          decryptedMembers.push(JSON.parse(decrypted));
        } catch (error) {
          this.logger.warn(`Failed to decrypt member in set ${key}:`, error);
        }
      }

      return decryptedMembers;
    } catch (error) {
      this.logger.error(`Failed to get encrypted set members for ${key}:`, error);
      return [];
    }
  }

  /**
   * Hash a key for privacy (useful for phone numbers, emails)
   */
  hashKey(prefix: string, identifier: string): string {
    return `${prefix}:${this.cryptoService.hash(identifier)}`;
  }
}
