import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from './session.service';
import { randomBytes } from 'crypto';

interface GroupLinkCode {
  code: string;
  phoneNumber: string;
  whatsappId: string;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class GroupAuthService {
  private readonly logger = new Logger(GroupAuthService.name);
  private readonly CODE_PREFIX = 'group_link_code:';
  private readonly MAPPING_PREFIX = 'lid_mapping:';
  private readonly CODE_TTL = 300; // 5 minutes
  private readonly MAPPING_TTL = 86400 * 30; // 30 days

  constructor(
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Generate a unique code for group linking
   */
  async generateGroupLinkCode(phoneNumber: string, whatsappId: string): Promise<string> {
    try {
      // Generate a 6-character alphanumeric code
      const code = this.generateCode();
      
      const linkCode: GroupLinkCode = {
        code,
        phoneNumber,
        whatsappId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.CODE_TTL * 1000),
      };

      // Store the code
      const key = `${this.CODE_PREFIX}${code}`;
      await this.redisService.setEncrypted(key, linkCode, this.CODE_TTL);

      this.logger.log(`Generated group link code for ${phoneNumber}`);
      return code;
    } catch (error) {
      this.logger.error(`Error generating group link code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify a group link code and create mapping
   */
  async verifyGroupLinkCode(code: string, lidId: string): Promise<{ success: boolean; message: string }> {
    try {
      const key = `${this.CODE_PREFIX}${code.toUpperCase()}`;
      const linkCode = await this.redisService.getEncrypted(key) as GroupLinkCode;

      if (!linkCode) {
        return {
          success: false,
          message: 'Invalid or expired code. Please generate a new one.',
        };
      }

      // Create mapping from @lid to actual phone number
      const mappingKey = `${this.MAPPING_PREFIX}${lidId}`;
      await this.redisService.set(mappingKey, linkCode.whatsappId, this.MAPPING_TTL);

      // Delete the used code
      await this.redisService.del(key);

      this.logger.log(`Successfully mapped ${lidId} to account`);

      return {
        success: true,
        message: 'Your account is now linked in this group! You can use all features while maintaining your privacy.',
      };
    } catch (error) {
      this.logger.error(`Error verifying group link code: ${error.message}`);
      return {
        success: false,
        message: 'Failed to verify code. Please try again.',
      };
    }
  }

  /**
   * Get the real WhatsApp ID for a @lid user
   */
  async getRealIdForLid(lidId: string): Promise<string | null> {
    try {
      const mappingKey = `${this.MAPPING_PREFIX}${lidId}`;
      const realId = await this.redisService.get(mappingKey);
      
      if (realId) {
        // Refresh the TTL
        await this.redisService.expire(mappingKey, this.MAPPING_TTL);
      }
      
      return realId;
    } catch (error) {
      this.logger.error(`Error getting real ID for lid: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a @lid user is linked
   */
  async isLidLinked(lidId: string): Promise<boolean> {
    const realId = await this.getRealIdForLid(lidId);
    if (!realId) return false;

    const session = await this.sessionService.getSessionByWhatsappId(realId);
    return session !== null && session.isVerified;
  }

  /**
   * Generate a random 6-character code
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < 6; i++) {
      const randomIndex = randomBytes(1)[0] % chars.length;
      code += chars[randomIndex];
    }
    
    return code;
  }

  /**
   * Get help text for group linking
   */
  getGroupLinkHelp(): string {
    return `🔐 *Privacy-Preserving Group Link*

To use Pulse in groups without revealing your phone number:

1️⃣ Message me directly first
2️⃣ Type \`link group\` to get a code
3️⃣ In the group, type \`link [code]\`

Your phone number stays private! 🛡️`;
  }
}