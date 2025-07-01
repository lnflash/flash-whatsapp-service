import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { Request } from 'express';
import { UserSession } from '../interfaces/user-session.interface';

@Injectable()
export class MfaGuard implements CanActivate {
  private readonly logger = new Logger(MfaGuard.name);

  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { session?: UserSession }>();

    // First, make sure the session is valid
    if (!request.session) {
      // Try to get the sessionId and validate it
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
      if (session) {
        request.session = session;
      } else {
        this.logger.warn(`Session not found for ID: ${sessionId}`);
        throw new UnauthorizedException('Session not found');
      }
    }

    // Now check MFA
    if (!request.session) {
      this.logger.warn('No session found in request');
      throw new UnauthorizedException('Session not found');
    }

    const sessionId = request.session.sessionId;
    const isMfaValid = await this.sessionService.isMfaValidated(sessionId);

    if (!isMfaValid) {
      this.logger.warn(`MFA not validated for session: ${sessionId}`);
      throw new UnauthorizedException('Multi-factor authentication required');
    }

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
