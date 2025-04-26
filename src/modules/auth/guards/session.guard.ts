import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { Request } from 'express';

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { session?: any }>();
    const sessionId = this.extractSessionId(request);

    if (!sessionId) {
      this.logger.warn('No session ID found in request');
      throw new UnauthorizedException('Session ID is required');
    }

    const isValid = await this.sessionService.isSessionValid(sessionId);
    
    if (!isValid) {
      this.logger.warn(`Invalid or expired session: ${sessionId}`);
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Attach session to request for later use
    const session = await this.sessionService.getSession(sessionId);
    request.session = session;

    return true;
  }

  private extractSessionId(request: Request): string | undefined {
    // Try to extract from authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try to extract from query params
    if (request.query.sessionId) {
      return request.query.sessionId as string;
    }

    // Try to extract from body
    if (request.body && request.body.sessionId) {
      return request.body.sessionId;
    }

    return undefined;
  }
}