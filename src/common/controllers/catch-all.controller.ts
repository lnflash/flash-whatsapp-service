import { Controller, All, HttpException, HttpStatus, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class CatchAllController {
  private readonly logger = new Logger(CatchAllController.name);
  private readonly honeypotPaths = [
    '/admin',
    '/administrator',
    '/wp-admin',
    '/phpmyadmin',
    '/.env',
    '/.git',
    '/backup',
    '/api/users',
    '/api/export',
  ];

  @All('*')
  handleCatchAll(@Req() request: Request) {
    const path = request.path.toLowerCase();
    const method = request.method;
    const ip = request.ip || request.get('x-forwarded-for') || 'unknown';
    const userAgent = request.get('user-agent') || 'unknown';

    // Log the 404 request
    this.logger.warn(`404 Not Found: ${method} ${path} from ${ip} - User-Agent: ${userAgent}`);

    // Check if this is a honeypot path (potential attacker)
    if (this.honeypotPaths.some((honeypot) => path.startsWith(honeypot))) {
      this.logger.warn(`Honeypot triggered: ${path} from ${ip}`);
      // Return a delayed response to slow down attackers
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            statusCode: 404,
            message: 'Not Found',
            timestamp: new Date().toISOString(),
          });
        }, 3000); // 3 second delay
      });
    }

    // Standard 404 response
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Resource not found',
        error: 'Not Found',
        path: request.url,
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
