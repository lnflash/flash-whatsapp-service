import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface Voice {
  name: string;
  voiceId: string;
  addedBy?: string;
  addedAt: Date;
}

export interface VoiceList {
  [name: string]: string; // name -> voiceId mapping for quick lookup
}

@Injectable()
export class VoiceManagementService {
  private readonly logger = new Logger(VoiceManagementService.name);
  private readonly VOICES_KEY = 'elevenlabs:voices';
  private readonly VOICES_DETAILS_PREFIX = 'elevenlabs:voice:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Add a new voice to the system
   */
  async addVoice(
    name: string,
    voiceId: string,
    addedBy?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Normalize name to lowercase for consistency
      const normalizedName = name.toLowerCase().trim();

      // Validate inputs
      if (!normalizedName || normalizedName.length < 2) {
        return { success: false, message: 'Voice name must be at least 2 characters long' };
      }

      if (!voiceId || voiceId.length < 10) {
        return { success: false, message: 'Invalid voice ID format' };
      }

      // Check for reserved names
      const reservedNames = [
        'add',
        'remove',
        'delete',
        'list',
        'status',
        'help',
        'on',
        'off',
        'only',
      ];
      if (reservedNames.includes(normalizedName)) {
        return {
          success: false,
          message: `"${name}" is a reserved word. Please choose a different name.`,
        };
      }

      // Get current voice list
      const voiceList = await this.getVoiceList();

      // Check for duplicate name
      if (voiceList[normalizedName]) {
        return {
          success: false,
          message: `Voice named "${name}" already exists. Please choose a different name.`,
        };
      }

      // Check for duplicate voice ID
      const existingName = Object.keys(voiceList).find((key) => voiceList[key] === voiceId);
      if (existingName) {
        return {
          success: false,
          message: `This voice ID is already registered as "${existingName}".`,
        };
      }

      // Add to voice list
      voiceList[normalizedName] = voiceId;
      await this.redisService.set(this.VOICES_KEY, JSON.stringify(voiceList), 0); // Persistent

      // Store voice details
      const voiceDetails: Voice = {
        name: normalizedName,
        voiceId,
        addedBy,
        addedAt: new Date(),
      };
      await this.redisService.set(
        `${this.VOICES_DETAILS_PREFIX}${normalizedName}`,
        JSON.stringify(voiceDetails),
        0, // Persistent
      );

      this.logger.log(`Voice "${name}" (${voiceId}) added successfully`);
      return { success: true, message: `✅ Voice "${name}" added successfully!` };
    } catch (error) {
      this.logger.error(`Error adding voice: ${error.message}`);
      return { success: false, message: 'Failed to add voice. Please try again.' };
    }
  }

  /**
   * Remove a voice from the system
   */
  async removeVoice(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const normalizedName = name.toLowerCase().trim();

      // Get current voice list
      const voiceList = await this.getVoiceList();

      if (!voiceList[normalizedName]) {
        return { success: false, message: `Voice "${name}" not found.` };
      }

      // Remove from list
      delete voiceList[normalizedName];
      await this.redisService.set(this.VOICES_KEY, JSON.stringify(voiceList), 0);

      // Remove details
      await this.redisService.del(`${this.VOICES_DETAILS_PREFIX}${normalizedName}`);

      this.logger.log(`Voice "${name}" removed successfully`);
      return { success: true, message: `✅ Voice "${name}" removed successfully.` };
    } catch (error) {
      this.logger.error(`Error removing voice: ${error.message}`);
      return { success: false, message: 'Failed to remove voice. Please try again.' };
    }
  }

  /**
   * Get list of all available voices
   */
  async getVoiceList(): Promise<VoiceList> {
    try {
      const data = await this.redisService.get(this.VOICES_KEY);
      if (!data) {
        // Initialize with default voices if none exist
        const defaultVoices: VoiceList = {};
        await this.redisService.set(this.VOICES_KEY, JSON.stringify(defaultVoices), 0);
        return defaultVoices;
      }
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Error getting voice list: ${error.message}`);
      return {};
    }
  }

  /**
   * Get voice ID by name
   */
  async getVoiceId(name: string): Promise<string | null> {
    try {
      const normalizedName = name.toLowerCase().trim();
      const voiceList = await this.getVoiceList();
      return voiceList[normalizedName] || null;
    } catch (error) {
      this.logger.error(`Error getting voice ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Get voice details
   */
  async getVoiceDetails(name: string): Promise<Voice | null> {
    try {
      const normalizedName = name.toLowerCase().trim();
      const data = await this.redisService.get(`${this.VOICES_DETAILS_PREFIX}${normalizedName}`);
      if (!data) return null;

      const details = JSON.parse(data);
      return {
        ...details,
        addedAt: new Date(details.addedAt),
      };
    } catch (error) {
      this.logger.error(`Error getting voice details: ${error.message}`);
      return null;
    }
  }

  /**
   * Format voice list for display
   */
  async formatVoiceList(): Promise<string> {
    try {
      const voiceList = await this.getVoiceList();
      const voiceNames = Object.keys(voiceList);

      if (voiceNames.length === 0) {
        return '📢 No voices available.\n\nAdd a voice with:\n`voice add [name] [voiceId]`';
      }

      let message = '🎙️ *Available Voices*\n\n';

      for (const name of voiceNames.sort()) {
        const details = await this.getVoiceDetails(name);
        message += `• *${name}*`;
        if (details?.addedBy) {
          message += ` (added by ${details.addedBy})`;
        }
        message += '\n';
      }

      message += '\n📝 *Commands:*\n';
      message += '• `voice [name]` - Select a voice\n';
      message += '• `voice add [name] [id]` - Add new voice\n';
      message += '• `voice remove [name]` - Remove voice';

      return message;
    } catch (error) {
      this.logger.error(`Error formatting voice list: ${error.message}`);
      return '❌ Failed to retrieve voice list.';
    }
  }

  /**
   * Check if a voice exists
   */
  async voiceExists(name: string): Promise<boolean> {
    const normalizedName = name.toLowerCase().trim();
    const voiceList = await this.getVoiceList();
    return !!voiceList[normalizedName];
  }
}
