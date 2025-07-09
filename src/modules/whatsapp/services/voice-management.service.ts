import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';
import { UsernameService } from '../../flash-api/services/username.service';

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
  private readonly DEFAULT_VOICE_KEY = 'elevenlabs:default_voice';

  constructor(
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
    private readonly usernameService: UsernameService,
  ) {}

  // Voice name pool for random generation
  private readonly VOICE_NAME_POOL = [
    'aurora',
    'blaze',
    'cascade',
    'delta',
    'echo',
    'flux',
    'galaxy',
    'horizon',
    'iris',
    'jazz',
    'koda',
    'luna',
    'matrix',
    'nova',
    'orbit',
    'phoenix',
    'quantum',
    'ripple',
    'spark',
    'tide',
    'ultra',
    'vortex',
    'wave',
    'xenon',
    'yonder',
    'zephyr',
    'cosmo',
    'dusk',
    'ember',
    'frost',
    'glimmer',
    'halo',
    'indigo',
    'jade',
    'karma',
    'lumen',
    'mystic',
    'nebula',
    'opal',
    'prism',
    'quartz',
    'radiant',
    'storm',
    'twilight',
    'umbra',
    'velvet',
    'whisper',
    'zion',
  ];

  /**
   * Generate a random voice name
   */
  private async generateRandomVoiceName(): Promise<string> {
    const voiceList = await this.getVoiceList();

    // Try to find an unused name from the pool
    const unusedName = await this.findUnusedNameFromPool(voiceList);
    if (unusedName) {
      return unusedName;
    }

    // If all names are taken, generate a numbered name
    return this.generateNumberedVoiceName(voiceList);
  }

  /**
   * Find an unused name from the voice name pool
   */
  private async findUnusedNameFromPool(voiceList: VoiceList): Promise<string | null> {
    // Shuffle the names for randomness
    const shuffled = [...this.VOICE_NAME_POOL].sort(() => Math.random() - 0.5);

    // Find the first unused name
    for (const name of shuffled) {
      if (!voiceList[name]) {
        return name;
      }
    }

    return null;
  }

  /**
   * Generate a numbered voice name (voice1, voice2, etc.)
   */
  private generateNumberedVoiceName(voiceList: VoiceList): string {
    let counter = 1;
    while (voiceList[`voice${counter}`]) {
      counter++;
    }
    return `voice${counter}`;
  }

  /**
   * Add a new voice to the system
   */
  async addVoice(
    name: string | null,
    voiceId: string,
    addedBy?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Generate random name if not provided
      const voiceName = name || (await this.generateRandomVoiceName());

      // Normalize name to lowercase for consistency
      const normalizedName = voiceName.toLowerCase().trim();

      // Validate voice name
      if (normalizedName.length < 2) {
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
          message: `"${voiceName}" is a reserved word. Please choose a different name.`,
        };
      }

      // Get current voice list
      const voiceList = await this.getVoiceList();

      // Check for duplicate name
      if (voiceList[normalizedName]) {
        return {
          success: false,
          message: `Voice named "${voiceName}" already exists. Please choose a different name.`,
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

      this.logger.log(`Voice "${voiceName}" (${voiceId}) added successfully`);
      return { success: true, message: `✅ Voice "${voiceName}" added successfully!` };
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
          // Try to get username for the whatsappId
          let displayName = 'unknown';
          try {
            // Get session by whatsappId
            const session = await this.sessionService.getSessionByWhatsappId(details.addedBy);
            if (session?.flashAuthToken) {
              const username = await this.usernameService.getUsername(session.flashAuthToken);
              if (username) {
                displayName = username;
              }
            }
          } catch (error) {
            this.logger.debug(`Could not fetch username for ${details.addedBy}`);
          }
          message += ` (added by ${displayName})`;
        }
        message += '\n';
      }

      message += '\n📝 *Commands:*\n';
      message += '• `voice [name]` - Select a voice\n';
      message += '• `voice add [id]` - Add voice (auto-names)\n';
      message += '• `voice add [name] [id]` - Add custom voice\n';
      message += '• `voice remove [name]` - Remove voice\n\n';
      message += '💡 *Natural Language:*\n';
      message += '• "Switch voice to mary"\n';
      message += '• "Change your voice to john"\n';
      message += '• "Let me speak to sarah"';

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

  /**
   * Get voice list with details for natural language formatting
   */
  async getVoiceListWithDetails(): Promise<Record<string, any>> {
    try {
      const voiceList = await this.getVoiceList();
      const voiceDetails: Record<string, any> = {};

      for (const name of Object.keys(voiceList)) {
        const details = await this.getVoiceDetails(name);
        let addedBy = 'unknown';

        if (details?.addedBy) {
          try {
            // Get session by whatsappId
            const session = await this.sessionService.getSessionByWhatsappId(details.addedBy);
            if (session?.flashAuthToken) {
              const username = await this.usernameService.getUsername(session.flashAuthToken);
              if (username) {
                addedBy = username;
              }
            }
          } catch (error) {
            this.logger.debug(`Could not fetch username for ${details.addedBy}`);
          }
        }

        voiceDetails[name] = {
          voiceId: voiceList[name],
          addedBy: addedBy,
          addedAt: details?.addedAt,
        };
      }

      return voiceDetails;
    } catch (error) {
      this.logger.error(`Error getting voice list with details: ${error.message}`);
      return {};
    }
  }

  /**
   * Set the default voice for all users
   */
  async setDefaultVoice(voiceName: string): Promise<void> {
    try {
      const normalizedName = voiceName.toLowerCase().trim();

      // Verify voice exists
      const voiceList = await this.getVoiceList();
      if (!voiceList[normalizedName]) {
        throw new Error(`Voice "${voiceName}" does not exist`);
      }

      // Store default voice setting
      await this.redisService.set(this.DEFAULT_VOICE_KEY, normalizedName, 0); // Persistent
      this.logger.log(`Default voice set to: ${normalizedName}`);
    } catch (error) {
      this.logger.error(`Error setting default voice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the default voice name
   */
  async getDefaultVoice(): Promise<string | null> {
    try {
      const defaultVoice = await this.redisService.get(this.DEFAULT_VOICE_KEY);
      return defaultVoice;
    } catch (error) {
      this.logger.error(`Error getting default voice: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear the default voice setting
   */
  async clearDefaultVoice(): Promise<void> {
    try {
      await this.redisService.del(this.DEFAULT_VOICE_KEY);
      this.logger.log('Default voice cleared');
    } catch (error) {
      this.logger.error(`Error clearing default voice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get voice ID with fallback to default
   */
  async getVoiceIdWithDefault(
    userVoiceName?: string,
  ): Promise<{ voiceId: string | null; voiceName: string }> {
    try {
      // First, try user's selected voice
      if (userVoiceName) {
        const voiceId = await this.getVoiceId(userVoiceName);
        if (voiceId) {
          return { voiceId, voiceName: userVoiceName };
        }
      }

      // Second, try default voice
      const defaultVoiceName = await this.getDefaultVoice();
      if (defaultVoiceName) {
        const defaultVoiceId = await this.getVoiceId(defaultVoiceName);
        if (defaultVoiceId) {
          return { voiceId: defaultVoiceId, voiceName: defaultVoiceName };
        }
      }

      // Third, use first available voice
      const voiceList = await this.getVoiceList();
      const voiceNames = Object.keys(voiceList);
      if (voiceNames.length > 0) {
        const firstVoiceName = voiceNames[0];
        return { voiceId: voiceList[firstVoiceName], voiceName: firstVoiceName };
      }

      // No voices available
      return { voiceId: null, voiceName: 'default' };
    } catch (error) {
      this.logger.error(`Error getting voice ID with default: ${error.message}`);
      return { voiceId: null, voiceName: 'default' };
    }
  }
}
