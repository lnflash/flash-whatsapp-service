import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../modules/redis/redis.service';
import { Request } from 'express';

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RateLimiterGuard.name);
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const rateLimitConfig = this.configService.get('rateLimit');
    this.windowMs = rateLimitConfig?.windowMs || 60000; // Default: 1 minute
    this.maxRequests = rateLimitConfig?.max || 10; // Default: 10 requests per window
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Get client identifier (IP address, WhatsApp ID, etc.)
    const clientId = this.getClientIdentifier(request);

    // Create Redis rate limit key
    const key = `rate-limit:${clientId}`;

    // Check current count
    const currentCount = await this.getCurrentCount(key);

    if (currentCount >= this.maxRequests) {
      this.logger.warn(`Rate limit exceeded for client ${clientId}`);
      // Return 429 Too Many Requests
      const response = context.switchToHttp().getResponse();
      response.status(429).json({
        statusCode: 429,
        message: 'Too many requests, please try again later.',
      });
      return false;
    }

    // Increment count
    await this.incrementCount(key);

    return true;
  }

  /**
   * Get client identifier from request
   */
  private getClientIdentifier(request: Request): string {
    // Try to get WhatsApp ID from body for Twilio webhooks
    if (request.body?.From) {
      return request.body.From.replace('whatsapp:', '');
    }

    // Fallback to IP address
    return request.ip || 'unknown';
  }

  /**
   * Get current request count for the client
   */
  private async getCurrentCount(key: string): Promise<number> {
    const count = await this.redisService.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Increment request count and set expiry if needed
   */
  private async incrementCount(key: string): Promise<void> {
    const exists = await this.redisService.exists(key);

    if (exists) {
      await this.redisService.incr(key);
    } else {
      // Set initial count and expiry
      await this.redisService.set(key, '1', Math.floor(this.windowMs / 1000));
    }
  }
}
