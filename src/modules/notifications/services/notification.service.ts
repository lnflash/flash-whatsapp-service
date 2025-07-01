import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { WhatsappService } from '../../whatsapp/services/whatsapp.service';
import { EventsService } from '../../events/events.service';
import { SessionService } from '../../auth/services/session.service';
import {
  NotificationDto,
  NotificationType,
  NotificationChannel,
  NotificationPreferencesDto,
  SendNotificationDto,
} from '../dto/notification.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly whatsappService: WhatsappService,
    private readonly eventsService: EventsService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Send a notification to a user
   */
  async sendNotification(sendDto: SendNotificationDto): Promise<boolean> {
    try {
      const { notification, skipPreferences } = sendDto;
      const { userId, type, channels } = notification;

      // Skip preference check if specified
      if (!skipPreferences) {
        // Check if user has enabled this notification type
        const userPreferences = await this.getUserPreferences(userId);
        if (!this.isNotificationEnabled(type, userPreferences)) {
          return false;
        }
      }

      // Get the user's WhatsApp ID from their active session
      let whatsappId: string | null = null;
      const session = await this.findSessionByUserId(userId);

      if (session) {
        whatsappId = session.whatsappId;
      }

      // Track if the notification was sent through any channel
      let notificationSent = false;

      // Send through specified channels
      for (const channel of channels || [NotificationChannel.WHATSAPP]) {
        if (channel === NotificationChannel.WHATSAPP && whatsappId) {
          await this.sendWhatsAppNotification(whatsappId, notification);
          notificationSent = true;
        }
        // Add other channels (email, SMS, push) here when implemented
      }

      // Record the notification in the event system for audit/analytics
      await this.recordNotificationEvent(notification, notificationSent);

      return notificationSent;
    } catch (error) {
      this.logger.error(`Error sending notification: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Send a notification via WhatsApp
   */
  private async sendWhatsAppNotification(
    whatsappId: string,
    notification: NotificationDto,
  ): Promise<void> {
    try {
      const formattedMessage = this.formatNotificationMessage(notification);
      await this.whatsappService.sendMessage(whatsappId, formattedMessage);
    } catch (error) {
      this.logger.error(`Error sending WhatsApp notification: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Format a notification into a human-readable message
   */
  private formatNotificationMessage(notification: NotificationDto): string {
    const { type, title, message } = notification;

    // Format based on notification type
    switch (type) {
      case NotificationType.PAYMENT_RECEIVED:
        return this.formatPaymentNotification(notification, 'received');

      case NotificationType.PAYMENT_SENT:
        return this.formatPaymentNotification(notification, 'sent');

      default:
        // Generic format for other notification types
        return title ? `*${title}*\n\n${message}` : message;
    }
  }

  /**
   * Format a payment notification
   */
  private formatPaymentNotification(
    notification: NotificationDto,
    direction: 'sent' | 'received',
  ): string {
    const { title, message, paymentData } = notification;

    if (!paymentData) {
      return title ? `*${title}*\n\n${message}` : message;
    }

    const { amount, currency, timestamp, memo, senderName, receiverName } = paymentData;
    const formattedAmount = this.formatAmount(amount, currency);
    const formattedDate = new Date(timestamp).toLocaleString();
    const emoji = direction === 'received' ? '🔵' : '🟠';

    let formattedMessage = `${emoji} *${title || (direction === 'received' ? 'Payment Received' : 'Payment Sent')}*\n\n`;
    formattedMessage += `Amount: ${formattedAmount}\n`;
    formattedMessage += `Date: ${formattedDate}\n`;

    if (direction === 'received' && senderName) {
      formattedMessage += `From: ${senderName}\n`;
    } else if (direction === 'sent' && receiverName) {
      formattedMessage += `To: ${receiverName}\n`;
    }

    if (memo) {
      formattedMessage += `Memo: ${memo}\n`;
    }

    if (message) {
      formattedMessage += `\n${message}`;
    }

    return formattedMessage;
  }

  /**
   * Format an amount with currency
   */
  private formatAmount(amount: number, currency = 'BTC'): string {
    if (currency === 'BTC') {
      return `${amount.toFixed(8)} BTC`;
    }

    // For fiat currencies
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Record notification event for analytics
   */
  private async recordNotificationEvent(
    notification: NotificationDto,
    success: boolean,
  ): Promise<void> {
    try {
      const eventData = {
        ...notification,
        timestamp: new Date().toISOString(),
        success,
      };

      await this.eventsService.publishEvent('notification_sent', eventData);
    } catch (error) {
      this.logger.error(`Error recording notification event: ${error.message}`, error.stack);
      // Don't throw, as this is non-critical
    }
  }

  /**
   * Find a user's session by their Flash user ID
   */
  private async findSessionByUserId(userId: string): Promise<any | null> {
    try {
      // Search for all sessions
      const sessionPattern = 'session:*';
      const sessionKeys = await this.redisService.keys(sessionPattern);

      // Check each session to find a match
      for (const key of sessionKeys) {
        const session = await this.redisService.getEncrypted(key);
        if (!session) continue;

        if (session.flashUserId === userId) {
          return session;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Error finding session by user ID: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferencesDto> {
    try {
      const preferencesKey = `notification:preferences:${userId}`;
      const preferencesData = await this.redisService.getEncrypted(preferencesKey);

      if (preferencesData) {
        return preferencesData as NotificationPreferencesDto;
      }

      // Return default preferences if none set
      return {
        userId,
        paymentReceived: true,
        paymentSent: true,
        accountActivity: true,
        securityAlert: true,
        systemAnnouncement: true,
        preferredChannels: [NotificationChannel.WHATSAPP],
      };
    } catch (error) {
      this.logger.error(`Error getting user preferences: ${error.message}`, error.stack);
      // Return default preferences on error
      return {
        userId,
        paymentReceived: true,
        paymentSent: true,
        accountActivity: true,
        securityAlert: true,
        systemAnnouncement: true,
        preferredChannels: [NotificationChannel.WHATSAPP],
      };
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(preferences: NotificationPreferencesDto): Promise<boolean> {
    try {
      const preferencesKey = `notification:preferences:${preferences.userId}`;
      await this.redisService.setEncrypted(preferencesKey, preferences);
      return true;
    } catch (error) {
      this.logger.error(`Error updating user preferences: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if a notification type is enabled for the user
   */
  private isNotificationEnabled(
    type: NotificationType,
    preferences: NotificationPreferencesDto,
  ): boolean {
    switch (type) {
      case NotificationType.PAYMENT_RECEIVED:
        return preferences.paymentReceived ?? true;
      case NotificationType.PAYMENT_SENT:
        return preferences.paymentSent ?? true;
      case NotificationType.ACCOUNT_ACTIVITY:
        return preferences.accountActivity ?? true;
      case NotificationType.SECURITY_ALERT:
        return preferences.securityAlert ?? true;
      case NotificationType.SYSTEM_ANNOUNCEMENT:
        return preferences.systemAnnouncement ?? true;
      default:
        return true; // Enable by default for unknown types
    }
  }
}
