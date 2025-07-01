import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export enum UserVoiceMode {
  ON = 'on', // Functions like admin 'on' - AI responses use voice
  OFF = 'off', // TTS disabled for this user
  ONLY = 'only', // TTS always on, no text responses
}

export interface UserVoiceSettings {
  whatsappId: string;
  mode: UserVoiceMode;
  updatedAt: Date;
}

@Injectable()
export class UserVoiceSettingsService {
  private readonly logger = new Logger(UserVoiceSettingsService.name);
  private readonly SETTINGS_PREFIX = 'user_voice_settings:';
  private readonly SETTINGS_TTL = 0; // Persistent

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get user voice settings
   */
  async getUserVoiceSettings(whatsappId: string): Promise<UserVoiceSettings | null> {
    const key = `${this.SETTINGS_PREFIX}${whatsappId}`;
    const data = await this.redisService.get(key);

    if (!data) {
      return null;
    }

    try {
      const settings = JSON.parse(data);
      return {
        ...settings,
        updatedAt: new Date(settings.updatedAt),
      };
    } catch (error) {
      this.logger.error(`Error parsing user voice settings: ${error.message}`);
      return null;
    }
  }

  /**
   * Set user voice mode
   */
  async setUserVoiceMode(whatsappId: string, mode: UserVoiceMode): Promise<void> {
    const key = `${this.SETTINGS_PREFIX}${whatsappId}`;
    const settings: UserVoiceSettings = {
      whatsappId,
      mode,
      updatedAt: new Date(),
    };

    await this.redisService.set(key, JSON.stringify(settings), this.SETTINGS_TTL);
  }

  /**
   * Clear user voice settings (revert to default)
   */
  async clearUserVoiceSettings(whatsappId: string): Promise<void> {
    const key = `${this.SETTINGS_PREFIX}${whatsappId}`;
    await this.redisService.del(key);
  }

  /**
   * Get user voice mode or null if not set
   */
  async getUserVoiceMode(whatsappId: string): Promise<UserVoiceMode | null> {
    const settings = await this.getUserVoiceSettings(whatsappId);
    return settings?.mode || null;
  }

  /**
   * Check if user has voice settings
   */
  async hasUserVoiceSettings(whatsappId: string): Promise<boolean> {
    const settings = await this.getUserVoiceSettings(whatsappId);
    return settings !== null;
  }

  /**
   * Format voice mode for display
   */
  formatVoiceMode(mode: UserVoiceMode): string {
    switch (mode) {
      case UserVoiceMode.ON:
        return '🔊 ON - Voice for AI responses';
      case UserVoiceMode.OFF:
        return '🔇 OFF - No voice responses';
      case UserVoiceMode.ONLY:
        return '🎤 ONLY - Voice responses only (no text)';
      default:
        return '❓ Unknown';
    }
  }

  /**
   * Get help text for voice command
   */
  getVoiceHelp(): string {
    return `🔊 *Voice Settings*

Control how Pulse responds to you:

\`voice on\` - Enable voice for AI responses
\`voice off\` - Disable all voice responses
\`voice only\` - Voice responses only (no text)
\`voice status\` - Check your current setting

Examples:
• \`voice on\` - You'll hear voice for AI answers
• \`voice off\` - You'll only see text responses
• \`voice only\` - You'll only hear voice (great for hands-free)

💡 Your setting only affects your messages, not other users.`;
  }
}
