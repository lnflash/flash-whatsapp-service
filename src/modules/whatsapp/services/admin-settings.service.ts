import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

export interface AdminSettings {
  lockdown: boolean;
  groupsEnabled: boolean;
  paymentsEnabled: boolean;
  requestsEnabled: boolean;
  supportNumbers: string[];
  adminNumbers: string[];
  lastUpdated: Date;
  updatedBy: string;
}

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);
  private readonly SETTINGS_KEY = 'admin:settings';
  private readonly LOCKDOWN_KEY = 'admin:lockdown';
  private readonly GROUPS_ENABLED_KEY = 'admin:groups_enabled';

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get current admin settings
   */
  async getSettings(): Promise<AdminSettings> {
    try {
      const savedSettings = await this.redisService.get(this.SETTINGS_KEY);
      if (savedSettings) {
        return JSON.parse(savedSettings);
      }

      // Return default settings
      return this.getDefaultSettings();
    } catch (error) {
      this.logger.error(`Error getting admin settings: ${error.message}`);
      return this.getDefaultSettings();
    }
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(): AdminSettings {
    const adminNumbers = this.configService.get<string>('ADMIN_PHONE_NUMBERS')?.split(',') || [
      '13059244435',
    ];
    const supportNumbers = this.configService.get<string>('SUPPORT_PHONE_NUMBERS')?.split(',') || [
      '18762909250',
    ];

    return {
      lockdown: false,
      groupsEnabled: false, // Groups disabled by default
      paymentsEnabled: true,
      requestsEnabled: true,
      supportNumbers,
      adminNumbers,
      lastUpdated: new Date(),
      updatedBy: 'system',
    };
  }

  /**
   * Update settings
   */
  async updateSettings(updates: Partial<AdminSettings>, updatedBy: string): Promise<AdminSettings> {
    try {
      const currentSettings = await this.getSettings();
      const newSettings: AdminSettings = {
        ...currentSettings,
        ...updates,
        lastUpdated: new Date(),
        updatedBy,
      };

      await this.redisService.set(this.SETTINGS_KEY, JSON.stringify(newSettings));

      // Update individual keys for quick access
      if (updates.lockdown !== undefined) {
        await this.redisService.set(this.LOCKDOWN_KEY, updates.lockdown ? '1' : '0');
      }
      if (updates.groupsEnabled !== undefined) {
        await this.redisService.set(this.GROUPS_ENABLED_KEY, updates.groupsEnabled ? '1' : '0');
      }

      this.logger.log(`Admin settings updated by ${updatedBy}: ${JSON.stringify(updates)}`);
      return newSettings;
    } catch (error) {
      this.logger.error(`Error updating admin settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if system is in lockdown
   */
  async isLockdown(): Promise<boolean> {
    try {
      const lockdown = await this.redisService.get(this.LOCKDOWN_KEY);
      return lockdown === '1';
    } catch (error) {
      this.logger.error(`Error checking lockdown status: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if groups are enabled
   */
  async areGroupsEnabled(): Promise<boolean> {
    try {
      const enabled = await this.redisService.get(this.GROUPS_ENABLED_KEY);
      return enabled === '1';
    } catch (error) {
      this.logger.error(`Error checking groups enabled: ${error.message}`);
      return false;
    }
  }

  /**
   * Add admin number
   */
  async addAdmin(phoneNumber: string, addedBy: string): Promise<AdminSettings> {
    const settings = await this.getSettings();
    if (!settings.adminNumbers.includes(phoneNumber)) {
      settings.adminNumbers.push(phoneNumber);
      return this.updateSettings({ adminNumbers: settings.adminNumbers }, addedBy);
    }
    return settings;
  }

  /**
   * Add support number
   */
  async addSupport(phoneNumber: string, addedBy: string): Promise<AdminSettings> {
    const settings = await this.getSettings();
    if (!settings.supportNumbers.includes(phoneNumber)) {
      settings.supportNumbers.push(phoneNumber);
      return this.updateSettings({ supportNumbers: settings.supportNumbers }, addedBy);
    }
    return settings;
  }

  /**
   * Check if a number is admin
   */
  async isAdmin(phoneNumber: string): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.adminNumbers.includes(phoneNumber);
  }

  /**
   * Check if a number is support
   */
  async isSupport(phoneNumber: string): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.supportNumbers.includes(phoneNumber);
  }
}
