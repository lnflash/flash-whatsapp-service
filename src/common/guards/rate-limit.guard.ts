import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../modules/redis/redis.service';
import { Request } from 'express';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (limit: number, window: number) =>
  Reflect.metadata(RATE_LIMIT_KEY, { limit, window });

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly defaultLimit: number;
  private readonly defaultWindow: number;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.defaultLimit = this.configService.get<number>('RATE_LIMIT_MAX_REQUESTS') || 100;
    this.defaultWindow = this.configService.get<number>('RATE_LIMIT_WINDOW_MS') || 60000;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const classRef = context.getClass();

    // Get rate limit configuration from decorator or use defaults
    const rateLimitConfig = this.reflector.get<{ limit: number; window: number }>(
      RATE_LIMIT_KEY,
      handler,
    ) ||
      this.reflector.get<{ limit: number; window: number }>(RATE_LIMIT_KEY, classRef) || {
        limit: this.defaultLimit,
        window: this.defaultWindow,
      };

    // Generate rate limit key based on IP and endpoint
    const key = this.generateKey(request);

    try {
      // Get current count
      const count = await this.redisService.incr(key);

      // Set expiration on first request
      if (count === 1) {
        await this.redisService.expire(key, Math.ceil(rateLimitConfig.window / 1000));
      }

      // Check if limit exceeded
      if (count > rateLimitConfig.limit) {
        // Get remaining time
        const ttl = await this.redisService.ttl(key);

        this.logger.warn(
          `Rate limit exceeded for ${key}. Count: ${count}, Limit: ${rateLimitConfig.limit}`,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests',
            error: 'Rate Limit Exceeded',
            retryAfter: ttl > 0 ? ttl : Math.ceil(rateLimitConfig.window / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Add rate limit headers
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', rateLimitConfig.limit);
      response.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimitConfig.limit - count));
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + rateLimitConfig.window).toISOString(),
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // If Redis is down, allow the request but log the error
      this.logger.error('Rate limiting error, allowing request', error);
      return true;
    }
  }

  private generateKey(request: Request): string {
    // Use IP address and endpoint for rate limiting
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const endpoint = `${request.method}:${request.path}`;

    // For WhatsApp webhook, use phone number if available
    if (
      request.path.includes('webhook') &&
      request.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
    ) {
      const phoneNumber = request.body.entry[0].changes[0].value.messages[0].from;
      return `rate_limit:whatsapp:${phoneNumber}`;
    }

    return `rate_limit:${ip}:${endpoint}`;
  }
}
