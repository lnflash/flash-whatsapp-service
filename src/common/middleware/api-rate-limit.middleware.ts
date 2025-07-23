import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class ApiRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiRateLimitMiddleware.name);
  private readonly rateLimits = new Map<string, RateLimitEntry>();
  
  // Different rate limits for different endpoint types
  private readonly limits = {
    auth: { requests: 5, window: 300000 }, // 5 requests per 5 minutes
    admin: { requests: 100, window: 60000 }, // 100 requests per minute
    public: { requests: 100, window: 60000 }, // 100 requests per minute
    webhook: { requests: 1000, window: 60000 }, // 1000 requests per minute (for WhatsApp)
    default: { requests: 60, window: 60000 } // 60 requests per minute
  };

  constructor(private configService: ConfigService) {
    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const clientIP = this.getClientIP(req);
    const path = req.path.toLowerCase();
    const endpoint = this.getEndpointType(path);
    const limit = this.limits[endpoint];
    
    const key = `${clientIP}:${endpoint}`;
    const now = Date.now();
    
    let entry = this.rateLimits.get(key);
    
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + limit.window
      };
    }
    
    entry.count++;
    this.rateLimits.set(key, entry);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.requests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit.requests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
    
    if (entry.count > limit.requests) {
      this.logger.warn(`Rate limit exceeded for ${clientIP} on ${endpoint} endpoints`);
      res.status(429).json({
        statusCode: 429,
        message: 'Too Many Requests',
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
      });
      return;
    }
    
    next();
  }

  private getClientIP(req: Request): string {
    const forwarded = req.get('x-forwarded-for');
    const realIP = req.get('x-real-ip');
    const cfIP = req.get('cf-connecting-ip');
    
    return cfIP || realIP || forwarded?.split(',')[0] || req.ip || 'unknown';
  }

  private getEndpointType(path: string): keyof typeof ApiRateLimitMiddleware.prototype.limits {
    if (path.includes('/auth') || path.includes('/login') || path.includes('/register')) {
      return 'auth';
    }
    if (path.includes('/admin')) {
      return 'admin';
    }
    if (path.includes('/webhook') || path.includes('/whatsapp')) {
      return 'webhook';
    }
    if (path.includes('/health') || path.includes('/api/docs')) {
      return 'public';
    }
    return 'default';
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.rateLimits.entries()) {
      if (now > entry.resetTime + 60000) { // Keep for 1 minute after expiry
        this.rateLimits.delete(key);
      }
    }
  }
}