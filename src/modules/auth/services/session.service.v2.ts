import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { UserCacheService } from './user-cache.service';
import { StatsService } from '../../notifications/services/stats.service';
import { SettingsService } from '../../settings/settings.service';

export interface SessionData {
  userId: string;
  username: string;
  flashId: string;
  whatsappId: string;
  hashedWhatsappId: string;
  authToken: string;
  linkedAt: Date;
  lastActive: Date;
  userInfo?: any;
}

/**
 * Session Service V2 - More resilient session storage
 * - Uses plain JSON storage (no encryption of session data)
 * - WhatsApp IDs are still hashed for privacy
 * - Handles migration from encrypted sessions
 */
@Injectable()
export class SessionServiceV2 {
  private readonly logger = new Logger(SessionServiceV2.name);
  private readonly SESSION_EXPIRY = 90 * 24 * 60 * 60; // 90 days in seconds

  constructor(
    private readonly redisService: RedisService,
    private readonly cryptoService: CryptoService,
    private readonly userCacheService: UserCacheService,
    private readonly statsService: StatsService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Create or update a session
   */
  async createSession(
    whatsappId: string,
    authTokens: AuthTokensDto,
    userInfo: any,
  ): Promise<SessionData> {
    const hashedWhatsappId = this.cryptoService.hash(whatsappId);
    const sessionData: SessionData = {
      userId: authTokens.userId,
      username: authTokens.username,
      flashId: authTokens.flashId,
      whatsappId,
      hashedWhatsappId,
      authToken: authTokens.authToken,
      linkedAt: new Date(),
      lastActive: new Date(),
      userInfo,
    };

    // Store session data as plain JSON
    const sessionKey = `session:${hashedWhatsappId}`;
    await this.redisService.set(
      sessionKey,
      JSON.stringify(sessionData),
      this.SESSION_EXPIRY,
    );

    // Store WhatsApp ID mapping
    const whatsappKey = `whatsapp:${hashedWhatsappId}`;
    await this.redisService.set(whatsappKey, whatsappId, this.SESSION_EXPIRY);

    // Update user cache
    await this.userCacheService.cacheUser(authTokens.userId, {
      id: authTokens.userId,
      username: authTokens.username,
      ...userInfo,
    });

    this.logger.log(`Session created for ${authTokens.username}`);
    return sessionData;
  }

  /**
   * Get session by WhatsApp ID
   */
  async getSession(whatsappId: string): Promise<SessionData | null> {
    const hashedWhatsappId = this.cryptoService.hash(whatsappId);
    const sessionKey = `session:${hashedWhatsappId}`;

    try {
      // First try to get as plain JSON (new format)
      const sessionJson = await this.redisService.get(sessionKey);
      if (sessionJson) {
        const session = JSON.parse(sessionJson);
        
        // Update last active
        session.lastActive = new Date();
        await this.redisService.set(
          sessionKey,
          JSON.stringify(session),
          this.SESSION_EXPIRY,
        );
        
        return session;
      }

      // If not found, try encrypted format (legacy)
      const encryptedSession = await this.redisService.getEncrypted(sessionKey);
      if (encryptedSession) {
        // Migrate to new format
        this.logger.log(`Migrating session for ${whatsappId} to new format`);
        
        const session = {
          ...encryptedSession,
          lastActive: new Date(),
        };
        
        // Store in new format
        await this.redisService.set(
          sessionKey,
          JSON.stringify(session),
          this.SESSION_EXPIRY,
        );
        
        return session;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting session for ${whatsappId}:`, error);
      return null;
    }
  }

  /**
   * Get all active sessions
   */
  async getAllActiveSessions(): Promise<SessionData[]> {
    const sessions: SessionData[] = [];
    const sessionKeys = await this.redisService.keys('session:*');

    for (const key of sessionKeys) {
      try {
        // Try plain JSON first
        const sessionJson = await this.redisService.get(key);
        if (sessionJson) {
          sessions.push(JSON.parse(sessionJson));
          continue;
        }

        // Try encrypted format
        const encryptedSession = await this.redisService.getEncrypted(key);
        if (encryptedSession) {
          sessions.push(encryptedSession);
        }
      } catch (error) {
        this.logger.warn(`Skipping corrupted session ${key}`);
      }
    }

    return sessions;
  }

  /**
   * Delete session
   */
  async deleteSession(whatsappId: string): Promise<void> {
    const hashedWhatsappId = this.cryptoService.hash(whatsappId);
    
    await this.redisService.del(
      `session:${hashedWhatsappId}`,
      `whatsapp:${hashedWhatsappId}`,
    );

    // Also try to delete any settings
    await this.settingsService.deleteUserSettings(whatsappId);
    
    this.logger.log(`Session deleted for ${whatsappId}`);
  }

  /**
   * Check if user has active session
   */
  async hasActiveSession(whatsappId: string): Promise<boolean> {
    const session = await this.getSession(whatsappId);
    return !!session;
  }

  /**
   * Get session stats
   */
  async getSessionStats(): Promise<any> {
    const sessions = await this.getAllActiveSessions();
    const now = new Date();
    
    const stats = {
      total: sessions.length,
      active24h: 0,
      active7d: 0,
      active30d: 0,
    };

    for (const session of sessions) {
      const lastActive = new Date(session.lastActive);
      const daysSinceActive = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceActive <= 1) stats.active24h++;
      if (daysSinceActive <= 7) stats.active7d++;
      if (daysSinceActive <= 30) stats.active30d++;
    }

    return stats;
  }

  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(): Promise<number> {
    const sessions = await this.getAllActiveSessions();
    const now = new Date();
    let cleaned = 0;

    for (const session of sessions) {
      const lastActive = new Date(session.lastActive);
      const daysSinceActive = (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
      
      // Clean sessions inactive for more than 90 days
      if (daysSinceActive > 90) {
        await this.deleteSession(session.whatsappId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old sessions`);
    }

    return cleaned;
  }
}