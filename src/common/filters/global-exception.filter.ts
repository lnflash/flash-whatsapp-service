import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isDevelopment: boolean;

  constructor(private configService: ConfigService) {
    this.isDevelopment = this.configService.get('NODE_ENV') !== 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let details: any = undefined;

    // Check if this is a common browser request that should be ignored
    const ignoredPaths = [
      '/favicon.ico',
      '/.well-known/chrome',
      '/chrome-variations-config.json',
      '/manifest.json',
      '/robots.txt',
      '/sitemap.xml',
    ];

    const isIgnoredPath = ignoredPaths.some(
      (path) => request.url === path || request.url.startsWith(path),
    );
    const is404Error =
      exception instanceof HttpException && exception.getStatus() === HttpStatus.NOT_FOUND;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (typeof errorResponse === 'object' && errorResponse !== null) {
        message = (errorResponse as any).message || message;
        error = (errorResponse as any).error || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;

      // Log the full error in production
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack, {
        path: request.url,
        method: request.method,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      });
    }

    // In development, include more details
    if (this.isDevelopment && exception instanceof Error) {
      details = {
        stack: exception.stack,
        name: exception.name,
      };
    }

    // Sanitize error messages in production
    if (!this.isDevelopment) {
      // Don't expose internal error details in production
      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        message = 'An error occurred while processing your request';
      }

      // Remove sensitive information from validation errors
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(message)) {
        message = message.map((msg) => this.sanitizeErrorMessage(msg));
      }
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      ...(details && { details }),
    };

    // Log errors in production (except 4xx errors and ignored paths)
    const shouldLog =
      status >= 500 ||
      (status >= 400 && status < 500 && !this.isDevelopment && !(is404Error && isIgnoredPath));

    if (shouldLog) {
      this.logger.error(
        `HTTP ${status} Error`,
        JSON.stringify({
          ...errorResponse,
          headers: this.sanitizeHeaders(request.headers),
          body: this.sanitizeBody(request.body),
        }),
      );
    }

    response.status(status).json(errorResponse);
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove potential sensitive information from error messages
    const patterns = [
      /api[_-]?key[s]?[:=]\s*['"]?[\w-]+['"]?/gi,
      /password[s]?[:=]\s*['"]?[\w-]+['"]?/gi,
      /token[s]?[:=]\s*['"]?[\w-]+['"]?/gi,
      /secret[s]?[:=]\s*['"]?[\w-]+['"]?/gi,
      /phone\s*[:=]?\s*[+]?\d{10,}/gi,
    ];

    let sanitized = message;
    patterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  private sanitizeHeaders(headers: any): any {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const sanitized = { ...headers };

    sensitiveHeaders.forEach((header) => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'phoneNumber'];
    const sanitized = { ...body };

    const sanitizeObject = (obj: any) => {
      Object.keys(obj).forEach((key) => {
        if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      });
    };

    sanitizeObject(sanitized);
    return sanitized;
  }
}
