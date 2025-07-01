import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // Log the exception
    this.logger.error(
      `HTTP Exception: ${exception.message}`,
      exception.stack,
      `${request.method} ${request.url}`,
    );

    // For Twilio webhook responses, we need to return a valid TwiML response
    const isTwilioWebhook = request.path.includes('/whatsapp/webhook');

    if (isTwilioWebhook) {
      // For Twilio, return a 200 status with a TwiML error message
      response
        .status(HttpStatus.OK)
        .type('text/xml')
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>We're sorry, but we encountered an issue processing your request. Please try again later.</Message>
        </Response>`,
        );
    } else {
      // Standard error response
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        message: exception.message || 'Internal server error',
      });
    }
  }
}
