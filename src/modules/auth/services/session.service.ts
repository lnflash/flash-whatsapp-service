import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { UserSession } from '../interfaces/user-session.interface';
import * as crypto from 'crypto';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionExpiry: number;
  private readonly mfaExpiry: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.sessionExpiry = this.configService.get<number>('security.sessionExpiry') || 86400; // Default 24 hours
    this.mfaExpiry = this.configService.get<number>('security.mfaExpiry') || 300; // Default 5 minutes
  }

  /**
   * Create a new user session
   */
  async createSession(whatsappId: string, phoneNumber: string, flashUserId?: string): Promise<UserSession> {
    try {
      const sessionId = this.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.sessionExpiry * 1000);
      
      const session: UserSession = {
        sessionId,
        whatsappId,
        phoneNumber,
        flashUserId,
        isVerified: !!flashUserId, // Verified if flashUserId is provided
        createdAt: now,
        expiresAt,
        lastActivity: now,
        mfaVerified: false,
        consentGiven: false,
      };
      
      // Store in Redis
      const sessionKey = `session:${sessionId}`;
      await this.redisService.set(sessionKey, JSON.stringify(session), this.sessionExpiry);
      
      // Create secondary index for whatsappId to sessionId mapping
      const whatsappKey = `whatsapp:${whatsappId}`;
      await this.redisService.set(whatsappKey, sessionId, this.sessionExpiry);
      
      this.logger.log(`Created new session ${sessionId} for WhatsApp ID ${whatsappId}`);
      
      return session;
    } catch (error) {
      this.logger.error(`Error creating session: ${error.message}`, error.stack);
      throw new Error('Failed to create user session');
    }
  }

  /**
   * Get a session by session ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.redisService.get(sessionKey);
      
      if (!sessionData) {
        return null;
      }
      
      return JSON.parse(sessionData) as UserSession;
    } catch (error) {
      this.logger.error(`Error getting session: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get session by WhatsApp ID
   */
  async getSessionByWhatsappId(whatsappId: string): Promise<UserSession | null> {
    try {
      const whatsappKey = `whatsapp:${whatsappId}`;
      const sessionId = await this.redisService.get(whatsappKey);
      
      if (!sessionId) {
        return null;
      }
      
      return this.getSession(sessionId);
    } catch (error) {
      this.logger.error(`Error getting session by WhatsApp ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return null;
      }
      
      const updatedSession = {
        ...session,
        ...updates,
        lastActivity: new Date(),
      };
      
      const sessionKey = `session:${sessionId}`;
      await this.redisService.set(sessionKey, JSON.stringify(updatedSession), this.sessionExpiry);
      
      this.logger.log(`Updated session ${sessionId}`);
      
      return updatedSession;
    } catch (error) {
      this.logger.error(`Error updating session: ${error.message}`, error.stack);
      throw new Error('Failed to update session');
    }
  }

  /**
   * Set MFA verification status for a session
   */
  async setMfaVerified(sessionId: string, isVerified: boolean): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return null;
      }
      
      const now = new Date();
      const mfaExpiresAt = isVerified ? new Date(now.getTime() + this.mfaExpiry * 1000) : undefined;
      
      return this.updateSession(sessionId, {
        mfaVerified: isVerified,
        mfaExpiresAt,
      });
    } catch (error) {
      this.logger.error(`Error setting MFA status: ${error.message}`, error.stack);
      throw new Error('Failed to update MFA status');
    }
  }

  /**
   * Set consent status for a session
   */
  async setConsent(sessionId: string, consentGiven: boolean): Promise<UserSession | null> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return null;
      }
      
      const consentTimestamp = consentGiven ? new Date() : undefined;
      
      return this.updateSession(sessionId, {
        consentGiven,
        consentTimestamp,
      });
    } catch (error) {
      this.logger.error(`Error setting consent: ${error.message}`, error.stack);
      throw new Error('Failed to update consent status');
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return false;
      }
      
      const sessionKey = `session:${sessionId}`;
      const whatsappKey = `whatsapp:${session.whatsappId}`;
      
      await this.redisService.del(sessionKey);
      await this.redisService.del(whatsappKey);
      
      this.logger.log(`Deleted session ${sessionId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if MFA is validated for a session
   */
  async isMfaValidated(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return false;
      }
      
      if (!session.mfaVerified || !session.mfaExpiresAt) {
        return false;
      }
      
      const now = new Date();
      const expiryDate = new Date(session.mfaExpiresAt);
      
      return now < expiryDate;
    } catch (error) {
      this.logger.error(`Error checking MFA status: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if a session is valid and not expired
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return false;
      }
      
      const now = new Date();
      const expiryDate = new Date(session.expiresAt);
      
      if (now > expiryDate) {
        // Clean up expired session
        await this.deleteSession(sessionId);
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error validating session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}