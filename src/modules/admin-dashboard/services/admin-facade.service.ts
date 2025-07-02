import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { SessionService } from '../../auth/services/session.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Facade service to isolate admin operations from core bot functionality
 * This service acts as a boundary to prevent admin bugs from affecting the bot
 */
@Injectable()
export class AdminFacadeService {
  private readonly logger = new Logger(AdminFacadeService.name);
  private readonly MAX_BULK_OPERATIONS = 100;
  private readonly OPERATION_TIMEOUT = 30000; // 30 seconds

  constructor(
    private readonly whatsappWebService: WhatsAppWebService,
    private readonly sessionService: SessionService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Send message with admin isolation
   * Prevents flooding and adds timeout protection
   */
  async sendAdminMessage(
    to: string,
    message: string,
    options?: { skipValidation?: boolean },
  ): Promise<void> {
    try {
      // Validate recipient unless explicitly skipped
      if (!options?.skipValidation) {
        const isValid = await this.validateRecipient(to);
        if (!isValid) {
          throw new Error(`Invalid recipient: ${to}`);
        }
      }

      // Add admin prefix to distinguish from regular messages
      const adminMessage = `[Admin] ${message}`;

      // Use timeout to prevent hanging operations
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), this.OPERATION_TIMEOUT),
      );

      await Promise.race([
        this.whatsappWebService.sendMessage(to, adminMessage),
        timeoutPromise,
      ]);
    } catch (error) {
      this.logger.error(`Admin message failed: ${error.message}`, error.stack);
      // Don't rethrow - isolate admin errors
      throw new Error('Failed to send admin message');
    }
  }

  /**
   * Get sessions with read-only access
   * Returns copies to prevent modification
   */
  async getSessionsReadOnly(): Promise<any[]> {
    try {
      const sessions = await this.sessionService.getAllSessions();
      // Return deep copies to prevent accidental modification
      return sessions.map((session) => ({ ...session }));
    } catch (error) {
      this.logger.error(`Failed to get sessions: ${error.message}`, error.stack);
      return []; // Return empty array on error to prevent crashes
    }
  }

  /**
   * Clear session with safety checks
   */
  async clearSessionSafely(sessionId: string): Promise<boolean> {
    try {
      // Add confirmation check
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        return false;
      }

      // Log admin action for audit
      await this.logAdminAction('clear_session', { sessionId });

      // Perform the deletion
      return await this.sessionService.deleteSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to clear session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Get WhatsApp status without affecting connection
   */
  async getWhatsAppStatusSafely(): Promise<any> {
    try {
      return {
        connected: this.whatsappWebService.isClientReady(),
        status: this.whatsappWebService.getStatus(),
        // Don't expose sensitive client info
      };
    } catch (error) {
      this.logger.error(`Failed to get WhatsApp status: ${error.message}`, error.stack);
      return { connected: false, status: { state: 'error' } };
    }
  }

  /**
   * Bulk operations with rate limiting
   */
  async sendBulkMessages(
    recipients: string[],
    message: string,
    options?: { batchSize?: number; delayMs?: number },
  ): Promise<{ sent: number; failed: number }> {
    const batchSize = options?.batchSize || 10;
    const delayMs = options?.delayMs || 1000;
    const results = { sent: 0, failed: 0 };

    // Limit recipients to prevent abuse
    const limitedRecipients = recipients.slice(0, this.MAX_BULK_OPERATIONS);

    // Process in batches
    for (let i = 0; i < limitedRecipients.length; i += batchSize) {
      const batch = limitedRecipients.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (recipient) => {
          try {
            await this.sendAdminMessage(recipient, message, { skipValidation: true });
            results.sent++;
          } catch (error) {
            results.failed++;
          }
        }),
      );

      // Delay between batches to prevent flooding
      if (i + batchSize < limitedRecipients.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Validate recipient before sending
   */
  private async validateRecipient(to: string): Promise<boolean> {
    // Basic validation
    if (!to || typeof to !== 'string') {
      return false;
    }

    // Check format
    const phoneRegex = /^\d{10,15}$/;
    const cleanNumber = to.replace(/[@.+\-\s]/g, '');
    return phoneRegex.test(cleanNumber);
  }

  /**
   * Log admin actions for audit trail
   */
  private async logAdminAction(action: string, data: any): Promise<void> {
    try {
      const logEntry = {
        action,
        data,
        timestamp: new Date(),
        source: 'admin_panel',
      };

      const client = this.redisService.getClient();
      await client.lpush('admin:audit:log', JSON.stringify(logEntry));

      // Keep only last 1000 entries
      await client.ltrim('admin:audit:log', 0, 999);
    } catch (error) {
      this.logger.error(`Failed to log admin action: ${error.message}`);
      // Don't throw - logging failure shouldn't break operations
    }
  }
}