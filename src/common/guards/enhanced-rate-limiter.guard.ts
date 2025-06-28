import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../modules/redis/redis.service';
import { Request } from 'express';

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  skipIf?: (req: Request) => boolean;
  message?: string;
}

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Decorator to set custom rate limits for specific endpoints
 */
export function RateLimit(options: RateLimitOptions) {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    if (descriptor) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, target);
    return target;
  };
}

@Injectable()
export class EnhancedRateLimiterGuard implements CanActivate {
  private readonly defaultWindowMs: number;
  private readonly defaultMax: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.defaultWindowMs = this.configService.get<number>('RATE_LIMIT_WINDOW_MS') || 60000;
    this.defaultMax = this.configService.get<number>('RATE_LIMIT_MAX_REQUESTS') || 100;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Get rate limit options from decorator or use defaults
    const options =
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getHandler()) || {};

    const {
      windowMs = this.defaultWindowMs,
      max = this.defaultMax,
      keyGenerator = this.defaultKeyGenerator.bind(this),
      skipIf,
      message = 'Too many requests, please try again later.',
    } = options;

    // Check if should skip rate limiting
    if (skipIf && skipIf(request)) {
      return true;
    }

    // Generate unique key for this client
    const key = `rate-limit:${keyGenerator(request)}`;

    // Get current request count
    const current = await this.redisService.get(key);
    const requestCount = current ? parseInt(current, 10) : 0;

    if (requestCount >= max) {
      // Calculate retry after
      const ttl = await this.redisService.ttl(key);
      const retryAfter = ttl > 0 ? ttl : Math.ceil(windowMs / 1000);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    if (requestCount === 0) {
      await this.redisService.set(key, '1', Math.ceil(windowMs / 1000));
    } else {
      await this.redisService.incr(key);
    }

    // Add rate limit headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', max);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, max - requestCount - 1));
    response.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

    return true;
  }

  private defaultKeyGenerator(req: Request): string {
    // Use IP address as default key
    const ip =
      req.ip ||
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress ||
      'unknown';

    // Include endpoint in key to have per-endpoint limits
    const endpoint = `${req.method}:${req.path}`;

    return `${ip}:${endpoint}`;
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export class RateLimiters {
  static readonly AUTH = RateLimit({
    windowMs: 300000, // 5 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later.',
  });

  static readonly PAYMENT = RateLimit({
    windowMs: 60000, // 1 minute
    max: 5,
    message: 'Too many payment requests, please try again later.',
  });

  static readonly API = RateLimit({
    windowMs: 60000, // 1 minute
    max: 100,
  });

  static readonly WEBHOOK = RateLimit({
    windowMs: 1000, // 1 second
    max: 10,
    keyGenerator: (req) => `webhook:${req.headers['x-webhook-id'] || 'unknown'}`,
  });

  static readonly WHATSAPP = RateLimit({
    windowMs: 60000, // 1 minute
    max: 20,
    keyGenerator: (req) => {
      // Use WhatsApp ID if available
      const whatsappId = req.body?.from || req.query?.from || 'unknown';
      return `whatsapp:${whatsappId}`;
    },
  });
}
