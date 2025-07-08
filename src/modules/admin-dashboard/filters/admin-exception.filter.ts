import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Admin-specific exception filter that isolates admin errors
 * from affecting the core bot functionality
 */
@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AdminExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Only handle admin routes
    if (!request.url.includes('/admin/')) {
      // Pass to next exception filter
      throw exception;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Admin operation failed';
    let details: any = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || message;
      details = (exceptionResponse as any).details || {};
    } else if (exception instanceof Error) {
      message = exception.message;

      // Log full error for debugging but don't expose to client
      this.logger.error(`Admin error: ${exception.message}`, exception.stack, {
        url: request.url,
        method: request.method,
        body: request.body,
        user: (request as any).user?.phoneNumber,
      });
    }

    // Sanitize error message for client
    const sanitizedMessage = this.sanitizeErrorMessage(message);

    // Log admin errors separately for monitoring
    this.logAdminError(request, exception);

    response.status(status).json({
      statusCode: status,
      message: sanitizedMessage,
      error: 'Admin Error',
      timestamp: new Date().toISOString(),
      path: request.url,
      // Only include details in development
      ...(process.env.NODE_ENV === 'development' && { details }),
    });
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove sensitive information from error messages
    const sensitivePatterns = [/auth.*token/i, /password/i, /secret/i, /key/i, /credential/i];

    let sanitized = message;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(sanitized)) {
        return 'An error occurred processing your request';
      }
    }

    // Truncate long messages
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200) + '...';
    }

    return sanitized;
  }

  private logAdminError(request: Request, exception: unknown): void {
    try {
      const errorLog = {
        timestamp: new Date(),
        url: request.url,
        method: request.method,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        error: exception instanceof Error ? exception.message : 'Unknown error',
        stack: exception instanceof Error ? exception.stack : undefined,
      };

      // In production, you might want to send this to a monitoring service
      this.logger.error('Admin operation failed', errorLog);
    } catch (logError) {
      // Prevent logging errors from breaking the response
      this.logger.error('Failed to log admin error', logError);
    }
  }
}
