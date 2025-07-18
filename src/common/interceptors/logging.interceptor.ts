import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method: _method, url: _url, body } = req;
    const _userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Sanitize request body before logging (remove sensitive data)
    const _sanitizedBody = this.sanitizeBody(body);

    return next.handle().pipe(
      tap((data) => {
        const endTime = Date.now();
        const _responseTime = endTime - startTime;

        // Sanitize response data before logging
        const _sanitizedResponse = this.sanitizeResponse(data);
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return {};

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'pin',
      'mfa',
      'otp',
      'ssn',
      'socialSecurity',
      'creditCard',
      'cardNumber',
      'cvv',
      'accountNumber',
      'balance',
    ];

    const sanitized = { ...body };

    // Remove sensitive fields
    for (const field of sensitiveFields) {
      this.recursivelyRedact(sanitized, field);
    }

    return sanitized;
  }

  private sanitizeResponse(data: any): any {
    if (!data) return {};

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'pin',
      'mfa',
      'otp',
      'ssn',
      'socialSecurity',
      'creditCard',
      'cardNumber',
      'cvv',
      'accountNumber',
      'balance',
    ];

    const sanitized = typeof data === 'object' ? { ...data } : data;

    if (typeof sanitized === 'object') {
      // Remove sensitive fields
      for (const field of sensitiveFields) {
        this.recursivelyRedact(sanitized, field);
      }
    }

    return sanitized;
  }

  private recursivelyRedact(obj: any, sensitiveField: string): void {
    if (!obj || typeof obj !== 'object') return;

    // Check if it's an array
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.recursivelyRedact(item, sensitiveField));
      return;
    }

    // Process object properties
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        this.recursivelyRedact(obj[key], sensitiveField);
      } else if (key.toLowerCase().includes(sensitiveField.toLowerCase())) {
        obj[key] = '[REDACTED]';
      }
    }
  }
}
