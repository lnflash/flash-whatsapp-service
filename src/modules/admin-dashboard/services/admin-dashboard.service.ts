import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { WhatsappService } from '../../whatsapp/services/whatsapp.service';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { SessionService } from '../../auth/services/session.service';
import { RedisService } from '../../redis/redis.service';
import { EventsService } from '../../events/events.service';
import { ConfigService } from '@nestjs/config';
import { CommandParserService } from '../../whatsapp/services/command-parser.service';
import { AdminFacadeService } from './admin-facade.service';
import { WithCircuitBreaker } from '../decorators/circuit-breaker.decorator';

export interface DashboardStats {
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    whatsappStatus: {
      connected: boolean;
      phoneNumber?: string;
      batteryLevel?: number;
    };
    redisStatus: boolean;
    rabbitMqStatus: boolean;
  };
  users: {
    totalSessions: number;
    activeSessions: number;
    linkedAccounts: number;
  };
  messages: {
    today: number;
    week: number;
    month: number;
  };
  errors: {
    recent: Array<{
      timestamp: Date;
      message: string;
      level: string;
    }>;
  };
}

export interface UserSession {
  whatsappId: string;
  phoneNumber?: string;
  flashUsername?: string;
  linkedAt?: Date;
  lastActivity?: Date;
  metadata?: any;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly whatsappWebService: WhatsAppWebService,
    private readonly sessionService: SessionService,
    private readonly redisService: RedisService,
    private readonly eventsService: EventsService,
    private readonly configService: ConfigService,
    private readonly commandParser: CommandParserService,
  ) {}

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const [userStats, messageStats, whatsappStatus] = await Promise.all([
      this.getUserStats(),
      this.getMessageStats(),
      this.getWhatsAppStatus(),
    ]);

    return {
      system: {
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        memoryUsage: process.memoryUsage(),
        whatsappStatus,
        redisStatus: await this.checkRedisConnection(),
        rabbitMqStatus: await this.checkRabbitMqConnection(),
      },
      users: userStats,
      messages: messageStats,
      errors: {
        recent: await this.getRecentErrors(),
      },
    };
  }

  /**
   * Get all user sessions
   */
  async getUserSessions(
    page = 1,
    limit = 20,
  ): Promise<{
    sessions: UserSession[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const allSessions = await this.sessionService.getAllSessions();

    // Sort by last activity
    const sortedSessions = allSessions.sort((a, b) => {
      const aTime = a.lastActivity
        ? typeof a.lastActivity === 'string'
          ? new Date(a.lastActivity).getTime()
          : a.lastActivity.getTime()
        : 0;
      const bTime = b.lastActivity
        ? typeof b.lastActivity === 'string'
          ? new Date(b.lastActivity).getTime()
          : b.lastActivity.getTime()
        : 0;
      return bTime - aTime;
    });

    const start = (page - 1) * limit;
    const sessions = sortedSessions.slice(start, start + limit);

    return {
      sessions,
      total: allSessions.length,
      page,
      totalPages: Math.ceil(allSessions.length / limit),
    };
  }

  /**
   * Send announcement to all users
   */
  @WithCircuitBreaker({ failureThreshold: 3, resetTimeout: 300000 }) // 5 minutes
  async sendAnnouncement(
    message: string,
    options?: {
      includeUnlinked?: boolean;
      testMode?: boolean;
    },
  ): Promise<{
    sent: number;
    failed: number;
    recipients: string[];
  }> {
    const sessions = await this.sessionService.getAllSessions();
    const results = {
      sent: 0,
      failed: 0,
      recipients: [] as string[],
    };

    this.logger.log(`Sending announcement to ${sessions.length} sessions`);
    sessions.forEach(s => {
      this.logger.log(`Session: ${s.whatsappId}, phoneNumber: ${s.phoneNumber}, flashUserId: ${s.flashUserId}`);
    });

    // Check WhatsApp status first
    const whatsappReady = this.whatsappWebService.isClientReady();
    this.logger.log(`WhatsApp client ready status: ${whatsappReady}`);

    if (!whatsappReady && !options?.testMode) {
      throw new BadRequestException(
        'WhatsApp client is not ready. Please check WhatsApp connection.',
      );
    }

    for (const session of sessions) {
      // Only skip unlinked users if explicitly set to false (default is to include all)
      if (options?.includeUnlinked === false && !session.flashUserId) {
        this.logger.log(`Skipping unlinked user: ${session.whatsappId}`);
        continue;
      }

      try {
        this.logger.log(
          `Attempting to send announcement to ${session.whatsappId} (linked: ${!!session.flashUserId})`,
        );

        if (!options?.testMode) {
          await this.whatsappWebService.sendMessage(
            session.whatsappId,
            `📢 *Admin Announcement*\n\n${message}`,
          );
        }
        results.sent++;
        results.recipients.push(session.whatsappId);
        this.logger.log(`Successfully sent to ${session.whatsappId}`);
      } catch (error) {
        this.logger.error(`Failed to send announcement to ${session.whatsappId}:`, error);
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Clear specific user session
   */
  async clearUserSession(whatsappId: string): Promise<void> {
    await this.sessionService.deleteSession(whatsappId);

    // Send notification to user
    try {
      await this.whatsappWebService.sendMessage(
        whatsappId,
        '🔄 Your session has been cleared by an administrator. Please use `link` to reconnect your Flash account.',
      );
    } catch (error) {
      this.logger.error(`Failed to notify user about session clear:`, error);
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<{ cleared: number }> {
    const sessions = await this.sessionService.getAllSessions();
    let cleared = 0;

    for (const session of sessions) {
      await this.sessionService.deleteSession(session.whatsappId);
      cleared++;
    }

    return { cleared };
  }

  /**
   * Toggle support mode for a user
   */
  async toggleSupportMode(whatsappId: string, enable: boolean): Promise<void> {
    // Get the admin phone from config to properly call the command
    const adminNumbers = this.configService.get<string>('ADMIN_PHONE_NUMBERS', '').split(',')[0];
    const adminWhatsappId = `${adminNumbers.trim()}@c.us`;
    const adminPhoneNumber = adminNumbers.trim();

    const commandText = `support ${enable ? 'on' : 'off'} ${whatsappId}`;
    const parsedCommand = this.commandParser.parseCommand(commandText);

    const result = await this.whatsappService['handleAdminCommand'](
      parsedCommand,
      adminWhatsappId,
      adminPhoneNumber,
    );

    if (!result.includes('enabled') && !result.includes('disabled')) {
      throw new BadRequestException(result);
    }
  }

  /**
   * Disconnect WhatsApp session
   */
  async disconnectWhatsApp(): Promise<void> {
    await this.whatsappWebService.clearSession();
  }

  /**
   * Get WhatsApp QR code
   */
  async getWhatsAppQr(): Promise<string | null> {
    return this.whatsappWebService.getQRCode();
  }

  /**
   * Send test message
   */
  async sendTestMessage(to: string, message: string): Promise<void> {
    // Ensure proper format
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    await this.whatsappWebService.sendMessage(chatId, message);
  }

  /**
   * Get admin command history
   */
  async getCommandHistory(limit = 50): Promise<any[]> {
    const history = await this.redisService.get('admin:command:history');
    if (!history) return [];

    const commands = JSON.parse(history);
    return commands.slice(-limit).reverse();
  }

  /**
   * Execute admin command
   */
  async executeAdminCommand(command: string, executedBy: string): Promise<string> {
    // Log command
    await this.logAdminCommand(command, executedBy);

    // Execute through whatsapp service
    const adminWhatsappId = `${executedBy}@c.us`;
    const parsedCommand = this.commandParser.parseCommand(command);
    const adminPhoneNumber = executedBy;

    return this.whatsappService['handleAdminCommand'](
      parsedCommand,
      adminWhatsappId,
      adminPhoneNumber,
    );
  }

  /**
   * Get system logs
   */
  async getSystemLogs(options: {
    level?: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    // This would integrate with your logging system
    // For now, return recent errors from Redis
    return this.getRecentErrors(options.limit);
  }

  /**
   * Private helper methods
   */
  private async getUserStats() {
    const sessions = await this.sessionService.getAllSessions();
    const activeCutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => {
        if (!s.lastActivity) return false;
        const lastActivityTime =
          typeof s.lastActivity === 'string'
            ? new Date(s.lastActivity).getTime()
            : s.lastActivity.getTime();
        return lastActivityTime > activeCutoff;
      }).length,
      linkedAccounts: sessions.filter((s) => s.flashUserId).length,
    };
  }

  private async getMessageStats() {
    const stats = await this.redisService.get('stats:messages');
    if (!stats) {
      return { today: 0, week: 0, month: 0 };
    }
    return JSON.parse(stats);
  }

  private async getWhatsAppStatus() {
    const status = this.whatsappWebService.getStatus();
    const info = await this.whatsappWebService.getClientInfo();

    return {
      connected: status.connected,
      phoneNumber: info?.wid?.user,
      batteryLevel: info?.battery,
    };
  }

  private async checkRedisConnection(): Promise<boolean> {
    try {
      await this.redisService.get('ping');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRabbitMqConnection(): Promise<boolean> {
    // Check if events service is connected
    return true; // Simplified for now
  }

  private async getRecentErrors(limit = 10): Promise<any[]> {
    const errors = await this.redisService.get('system:errors');
    if (!errors) return [];

    const errorList = JSON.parse(errors);
    return errorList.slice(-limit).reverse();
  }

  private async logAdminCommand(command: string, executedBy: string): Promise<void> {
    const history = (await this.redisService.get('admin:command:history')) || '[]';
    const commands = JSON.parse(history);

    commands.push({
      command,
      executedBy,
      timestamp: new Date(),
    });

    // Keep last 1000 commands
    if (commands.length > 1000) {
      commands.shift();
    }

    await this.redisService.set('admin:command:history', JSON.stringify(commands));
  }
}
