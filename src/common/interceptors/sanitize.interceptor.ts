import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SanitizeInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Sanitize request body
    if (request.body && typeof request.body === 'object') {
      request.body = this.sanitizeObject(request.body);
    }
    
    // Sanitize query parameters
    if (request.query && typeof request.query === 'object') {
      request.query = this.sanitizeObject(request.query);
    }
    
    // Sanitize params
    if (request.params && typeof request.params === 'object') {
      request.params = this.sanitizeObject(request.params);
    }
    
    return next.handle();
  }

  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize the key
        const sanitizedKey = this.sanitizeString(key);
        
        // Skip if key contains suspicious patterns
        if (this.isSuspiciousKey(sanitizedKey)) {
          this.logger.warn(`Suspicious key detected and removed: ${key}`);
          continue;
        }
        
        // Sanitize the value
        if (typeof value === 'string') {
          sanitized[sanitizedKey] = this.sanitizeString(value);
        } else if (typeof value === 'object') {
          sanitized[sanitizedKey] = this.sanitizeObject(value);
        } else {
          sanitized[sanitizedKey] = value;
        }
      }
      return sanitized;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    return obj;
  }

  private sanitizeString(str: string): string {
    if (typeof str !== 'string') return str;
    
    // Remove null bytes
    let sanitized = str.replace(/\0/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Remove or encode dangerous characters for different contexts
    // This is a basic sanitization - adjust based on your needs
    
    // Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Remove javascript: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');
    
    // Remove SQL comment indicators
    sanitized = sanitized.replace(/--/g, '');
    
    // Limit string length to prevent DoS
    const maxLength = 10000;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
      this.logger.warn('String truncated due to excessive length');
    }
    
    return sanitized;
  }

  private isSuspiciousKey(key: string): boolean {
    const suspiciousPatterns = [
      '__proto__',
      'constructor',
      'prototype',
      '$where',
      '$regex',
      '$ne',
      '$gt',
      '$gte',
      '$lt',
      '$lte',
      '$in',
      '$nin',
      '$exists',
      '$type',
      '$mod',
      '$text',
      '$where',
      'mapReduce',
      'aggregate',
      'save',
      'insert',
      'update',
      'remove',
      'delete',
      'findAndModify',
      'findAndRemove',
      'findOneAndDelete',
      'findOneAndRemove',
      'findOneAndUpdate',
      'drop',
      'create',
      'rename'
    ];
    
    return suspiciousPatterns.some(pattern => key.includes(pattern));
  }
}