import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (limit: number, windowMs: number) =>
  Reflect.metadata(RATE_LIMIT_KEY, { limit, windowMs });

/**
 * Rate limiting guard for admin operations
 * Prevents abuse and protects bot from admin panel overload
 */
@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdminRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitConfig = this.reflector.get<{ limit: number; windowMs: number }>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no rate limit configured, allow the request
    if (!rateLimitConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const identifier = this.getIdentifier(request);
    const key = `admin:ratelimit:${identifier}:${context.getHandler().name}`;

    try {
      const current = await this.redisService.incr(key);

      if (current === 1) {
        // First request, set expiry
        await this.redisService.expire(key, Math.ceil(rateLimitConfig.windowMs / 1000));
      }

      if (current > rateLimitConfig.limit) {
        const ttl = await this.redisService.ttl(key);

        this.logger.warn(`Rate limit exceeded for ${identifier} on ${context.getHandler().name}`);

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests',
            retryAfter: ttl,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Add rate limit headers
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', rateLimitConfig.limit);
      response.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimitConfig.limit - current));
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + rateLimitConfig.windowMs).toISOString(),
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // On Redis error, log but allow request (fail open)
      this.logger.error(`Rate limit check failed: ${error.message}`, error.stack);
      return true;
    }
  }

  private getIdentifier(request: any): string {
    // Use authenticated user's phone number if available
    if (request.user?.phoneNumber) {
      return request.user.phoneNumber;
    }

    // Fallback to IP address
    return request.ip || request.connection.remoteAddress || 'unknown';
  }
}
