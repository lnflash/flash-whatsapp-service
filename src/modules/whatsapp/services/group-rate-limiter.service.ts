import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface GroupRateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxPerUser: number; // Max requests per user in the window
  maxPerGroup: number; // Max total requests per group in the window
  blockDuration?: number; // How long to block after hitting limit (ms)
}

export interface RateLimitResult {
  allowed: boolean;
  remainingUserLimit?: number;
  remainingGroupLimit?: number;
  resetAt?: Date;
  reason?: string;
}

@Injectable()
export class GroupRateLimiterService {
  private readonly logger = new Logger(GroupRateLimiterService.name);
  
  // Default configurations for different command types
  private readonly configs: Record<string, GroupRateLimitConfig> = {
    default: {
      windowMs: 60000, // 1 minute
      maxPerUser: 10,
      maxPerGroup: 30,
    },
    price: {
      windowMs: 60000, // 1 minute
      maxPerUser: 5,
      maxPerGroup: 20,
    },
    link: {
      windowMs: 300000, // 5 minutes
      maxPerUser: 3,
      maxPerGroup: 10,
    },
    help: {
      windowMs: 60000, // 1 minute
      maxPerUser: 5,
      maxPerGroup: 15,
    },
    // Future payment commands will have stricter limits
    payment: {
      windowMs: 60000, // 1 minute
      maxPerUser: 3,
      maxPerGroup: 10,
      blockDuration: 300000, // 5 minute block after limit
    },
  };

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if a user's command in a group should be rate limited
   */
  async checkRateLimit(
    groupId: string,
    userId: string,
    commandType: string = 'default'
  ): Promise<RateLimitResult> {
    try {
      const config = this.configs[commandType] || this.configs.default;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Keys for tracking
      const userKey = `group-rate:${groupId}:${userId}:${commandType}`;
      const groupKey = `group-rate:${groupId}:all:${commandType}`;
      const blockKey = `group-rate:block:${groupId}:${userId}`;

      // Check if user is blocked
      const isBlocked = await this.redisService.get(blockKey);
      if (isBlocked) {
        return {
          allowed: false,
          reason: 'You are temporarily blocked from using commands in this group.',
          resetAt: new Date(parseInt(isBlocked)),
        };
      }

      // Get current counts
      const userCount = await this.getRecentCount(userKey, windowStart);
      const groupCount = await this.getRecentCount(groupKey, windowStart);

      // Check limits
      if (userCount >= config.maxPerUser) {
        // Block user if configured
        if (config.blockDuration) {
          const blockUntil = now + config.blockDuration;
          await this.redisService.set(
            blockKey,
            blockUntil.toString(),
            Math.ceil(config.blockDuration / 1000)
          );
        }

        return {
          allowed: false,
          remainingUserLimit: 0,
          remainingGroupLimit: Math.max(0, config.maxPerGroup - groupCount),
          reason: `You've sent too many commands. Please wait before trying again.`,
          resetAt: new Date(now + config.windowMs),
        };
      }

      if (groupCount >= config.maxPerGroup) {
        return {
          allowed: false,
          remainingUserLimit: Math.max(0, config.maxPerUser - userCount),
          remainingGroupLimit: 0,
          reason: 'This group has reached its command limit. Please try again later.',
          resetAt: new Date(now + config.windowMs),
        };
      }

      // Record this request
      await this.recordRequest(userKey, now, config.windowMs);
      await this.recordRequest(groupKey, now, config.windowMs);

      return {
        allowed: true,
        remainingUserLimit: Math.max(0, config.maxPerUser - userCount - 1),
        remainingGroupLimit: Math.max(0, config.maxPerGroup - groupCount - 1),
      };
    } catch (error) {
      this.logger.error(`Error checking rate limit: ${error.message}`, error.stack);
      // Allow on error to avoid blocking users due to Redis issues
      return { allowed: true };
    }
  }

  /**
   * Get count of recent requests within the time window
   */
  private async getRecentCount(key: string, windowStart: number): Promise<number> {
    try {
      const timestamps = await this.redisService.get(key);
      if (!timestamps) return 0;

      const parsedTimestamps: number[] = JSON.parse(timestamps);
      const recentTimestamps = parsedTimestamps.filter(ts => ts > windowStart);
      
      // Update Redis with only recent timestamps if some were filtered out
      if (recentTimestamps.length !== parsedTimestamps.length) {
        await this.redisService.set(
          key,
          JSON.stringify(recentTimestamps),
          3600 // 1 hour TTL
        );
      }

      return recentTimestamps.length;
    } catch (error) {
      this.logger.error(`Error getting recent count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Record a new request
   */
  private async recordRequest(key: string, timestamp: number, windowMs: number): Promise<void> {
    try {
      const existing = await this.redisService.get(key);
      const timestamps: number[] = existing ? JSON.parse(existing) : [];
      
      // Add new timestamp and keep only recent ones
      timestamps.push(timestamp);
      const windowStart = timestamp - windowMs;
      const recentTimestamps = timestamps.filter(ts => ts > windowStart);

      await this.redisService.set(
        key,
        JSON.stringify(recentTimestamps),
        Math.ceil(windowMs / 1000) + 60 // TTL slightly longer than window
      );
    } catch (error) {
      this.logger.error(`Error recording request: ${error.message}`);
    }
  }

  /**
   * Clear rate limit for a specific user in a group
   */
  async clearUserLimit(groupId: string, userId: string): Promise<void> {
    try {
      const patterns = [
        `group-rate:${groupId}:${userId}:*`,
        `group-rate:block:${groupId}:${userId}`,
      ];

      for (const pattern of patterns) {
        await this.redisService.del(pattern);
      }
    } catch (error) {
      this.logger.error(`Error clearing user limit: ${error.message}`);
    }
  }

  /**
   * Get rate limit status for a user
   */
  async getRateLimitStatus(
    groupId: string,
    userId: string,
    commandType: string = 'default'
  ): Promise<{
    userCount: number;
    groupCount: number;
    config: GroupRateLimitConfig;
    isBlocked: boolean;
  }> {
    const config = this.configs[commandType] || this.configs.default;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const userKey = `group-rate:${groupId}:${userId}:${commandType}`;
    const groupKey = `group-rate:${groupId}:all:${commandType}`;
    const blockKey = `group-rate:block:${groupId}:${userId}`;

    const userCount = await this.getRecentCount(userKey, windowStart);
    const groupCount = await this.getRecentCount(groupKey, windowStart);
    const isBlocked = !!(await this.redisService.get(blockKey));

    return {
      userCount,
      groupCount,
      config,
      isBlocked,
    };
  }
}