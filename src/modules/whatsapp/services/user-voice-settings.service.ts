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
  voiceName?: string; // Selected voice: 'terri-ann', 'patience', or 'dean'
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
    try {
      const key = `${this.SETTINGS_PREFIX}${whatsappId}`;
      let data = await this.redisService.get(key);

      // If no data found and this is an @lid format, we can't look it up
      // @lid IDs are anonymized and don't correspond to phone numbers
      if (!data && whatsappId.includes('@lid')) {
        this.logger.debug(`No voice settings for @lid format: ${whatsappId} - this is an anonymized ID`);
      }

      if (!data) {
        return null;
      }

      const settings = JSON.parse(data);
      return {
        ...settings,
        updatedAt: new Date(settings.updatedAt),
      };
    } catch (error) {
      this.logger.error(`Error getting user voice settings: ${error.message}`);
      return null;
    }
  }

  /**
   * Set user voice mode
   */
  async setUserVoiceMode(whatsappId: string, mode: UserVoiceMode): Promise<void> {
    try {
      const key = `${this.SETTINGS_PREFIX}${whatsappId}`;
      const existingSettings = await this.getUserVoiceSettings(whatsappId);
      const settings: UserVoiceSettings = {
        whatsappId,
        mode,
        voiceName: existingSettings?.voiceName, // Preserve existing voice selection
        updatedAt: new Date(),
      };

      await this.redisService.set(key, JSON.stringify(settings), this.SETTINGS_TTL);
    } catch (error) {
      this.logger.error(`Error setting user voice mode: ${error.message}`);
      // Swallow the error to maintain backwards compatibility
    }
  }

  /**
   * Set user voice selection
   */
  async setUserVoice(whatsappId: string, voiceName: string): Promise<void> {
    try {
      const key = `${this.SETTINGS_PREFIX}${whatsappId}`;
      const existingSettings = await this.getUserVoiceSettings(whatsappId);
      const settings: UserVoiceSettings = {
        whatsappId,
        mode: existingSettings?.mode || UserVoiceMode.ON, // Default to ON if not set
        voiceName,
        updatedAt: new Date(),
      };

      await this.redisService.set(key, JSON.stringify(settings), this.SETTINGS_TTL);
    } catch (error) {
      this.logger.error(`Error setting user voice: ${error.message}`);
      // Swallow the error to maintain backwards compatibility
    }
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
   * Get user's selected voice name
   */
  async getUserVoice(whatsappId: string): Promise<string | null> {
    const settings = await this.getUserVoiceSettings(whatsappId);
    return settings?.voiceName || null;
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

*Voice Modes:*
\`voice on\` - Enable voice for AI responses
\`voice off\` - Disable all voice responses
\`voice only\` - Voice responses only (no text)
\`voice status\` - Check your current settings

*Voice Selection:*
\`voice 1\` - Terri-Ann (warm, friendly female voice)
\`voice 2\` - Patience (calm, professional female voice)
\`voice 3\` - Dean (confident male voice)

Examples:
• \`voice on\` - You'll hear voice for AI answers
• \`voice only\` - You'll only hear voice (hands-free mode)
• \`voice 2\` - Switch to Patience's voice
• \`voice off\` - Disable all voice responses

💡 Your settings only affect your messages, not other users.`;
  }
}
