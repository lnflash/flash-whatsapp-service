import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';
import { SubscriptionService } from '../../flash-api/services/subscription.service';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { EventsService } from '../../events/events.service';

interface PaymentNotification {
  paymentHash: string;
  userId: string;
  whatsappId: string;
  amount: number;
  currency: string;
  senderName?: string;
  memo?: string;
  timestamp: string;
  type: 'received' | 'sent';
}

@Injectable()
export class PaymentNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentNotificationService.name);
  private activeSubscriptions = new Map<string, string>(); // whatsappId -> subscriptionId
  private notificationDedupePrefix = 'payment_notif_sent:';
  private readonly dedupeTimeout = 300; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
    private readonly subscriptionService: SubscriptionService,
    private readonly whatsappWebService: WhatsAppWebService,
    private readonly transactionService: TransactionService,
    private readonly balanceService: BalanceService,
    private readonly usernameService: UsernameService,
    private readonly priceService: PriceService,
    private readonly eventsService: EventsService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  /**
   * Initialize the payment notification service
   */
  private async initialize() {
    try {
      // Subscribe to RabbitMQ events as backup
      await this.subscribeToRabbitMQEvents();

      // Try to enable WebSocket subscriptions but don't fail if they don't work
      try {
        await this.enableWebSocketSubscriptions();
      } catch (wsError) {
        this.logger.warn('WebSocket subscriptions failed, relying on RabbitMQ events:', wsError);
      }

      this.logger.log('Payment notification service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize payment notification service:', error);
    }
  }

  /**
   * Subscribe to RabbitMQ payment events as fallback
   */
  private async subscribeToRabbitMQEvents() {
    await this.eventsService.subscribeToEvents(async (eventType, data) => {
      switch (eventType) {
        case 'payment_received':
          await this.handleRabbitMQPayment(data);
          break;
        case 'user_verified':
          await this.handleUserVerified(data);
          break;
        case 'user_unlinked':
          await this.handleUserUnlinked(data);
          break;
      }
    });
    this.logger.log('Subscribed to RabbitMQ payment events');
  }

  /**
   * Handle user unlinked event
   */
  private async handleUserUnlinked(data: { whatsappId: string }) {
    try {
      if (data.whatsappId) {
        await this.unsubscribeUserFromPayments(data.whatsappId);
      }
    } catch (error) {
      this.logger.error('Error handling user unlinked event:', error);
    }
  }

  /**
   * Handle user verification event
   */
  private async handleUserVerified(data: { whatsappId: string; authToken: string }) {
    try {
      if (data.whatsappId && data.authToken) {
        await this.subscribeUserToPayments(data.whatsappId, data.authToken);
      }
    } catch (error) {
      this.logger.error('Error handling user verified event:', error);
    }
  }

  /**
   * Enable WebSocket subscriptions for all active users
   */
  private async enableWebSocketSubscriptions() {
    try {
      // Get all active sessions
      const sessions = await this.sessionService.getAllActiveSessions();

      for (const session of sessions) {
        if (session.flashAuthToken && session.whatsappId) {
          await this.subscribeUserToPayments(session.whatsappId, session.flashAuthToken);
        }
      }

      this.logger.log(`Enabled WebSocket subscriptions for ${sessions.length} active users`);
    } catch (error) {
      this.logger.error('Failed to enable WebSocket subscriptions:', error);
    }
  }

  /**
   * Subscribe a user to real-time payment updates
   */
  async subscribeUserToPayments(whatsappId: string, authToken: string): Promise<void> {
    try {
      // Check if already subscribed
      if (this.activeSubscriptions.has(whatsappId)) {
        return;
      }

      // Subscribe to Lightning updates
      const subscriptionId = await this.subscriptionService.subscribeLnUpdates(
        whatsappId,
        authToken,
        async (paymentHash, status) => {
          if (status === 'PAID') {
            await this.handleWebSocketPayment(paymentHash, whatsappId, authToken);
          }
        },
      );

      this.activeSubscriptions.set(whatsappId, subscriptionId);
      this.logger.log(`User ${whatsappId} subscribed to real-time payment updates`);
    } catch (error) {
      this.logger.error(`Failed to subscribe user ${whatsappId} to payments:`, error);
    }
  }

  /**
   * Unsubscribe a user from payment updates
   */
  async unsubscribeUserFromPayments(whatsappId: string): Promise<void> {
    const subscriptionId = this.activeSubscriptions.get(whatsappId);
    if (subscriptionId) {
      this.subscriptionService.unsubscribe(subscriptionId);
      this.activeSubscriptions.delete(whatsappId);
      this.logger.log(`User ${whatsappId} unsubscribed from payment updates`);
    }
  }

  /**
   * Handle payment notification from WebSocket
   */
  private async handleWebSocketPayment(
    paymentHash: string,
    whatsappId: string,
    authToken: string,
  ): Promise<void> {
    try {
      // Check if we've already sent this notification
      if (await this.isNotificationSent(paymentHash)) {
        return;
      }

      // Get transaction details
      const transaction = await this.transactionService.getTransactionByPaymentHash(
        paymentHash,
        authToken,
      );

      if (!transaction || transaction.direction !== 'RECEIVE') {
        return;
      }

      // Get sender information
      const senderName = transaction.senderUsername || 'Someone';

      // Format amount
      const btcAmount = this.formatBtcAmount(transaction.amount);
      const { fiatAmount, fiatCurrency } = await this.getFiatEquivalent(
        transaction.amount,
        whatsappId,
        authToken,
      );

      // Create notification
      const notification: PaymentNotification = {
        paymentHash,
        userId: transaction.userId,
        whatsappId,
        amount: transaction.amount,
        currency: 'BTC',
        senderName,
        memo: transaction.memo,
        timestamp: transaction.createdAt,
        type: 'received',
      };

      // Send WhatsApp notification
      await this.sendPaymentNotification(notification, btcAmount, fiatAmount, fiatCurrency);

      // Mark as sent
      await this.markNotificationSent(paymentHash);

      this.logger.log(`WebSocket payment notification sent for ${paymentHash}`);
    } catch (error) {
      this.logger.error('Error handling WebSocket payment:', error);
    }
  }

  /**
   * Handle payment notification from RabbitMQ
   */
  private async handleRabbitMQPayment(data: any): Promise<void> {
    try {
      const paymentHash = data.paymentHash || data.payment_hash || data.hash;

      if (!paymentHash || (await this.isNotificationSent(paymentHash))) {
        return;
      }

      // Extract notification data
      const notification: PaymentNotification = {
        paymentHash,
        userId: data.userId,
        whatsappId: data.whatsappId,
        amount: data.amount,
        currency: data.currency || 'BTC',
        senderName: data.senderName,
        memo: data.memo,
        timestamp: data.timestamp || new Date().toISOString(),
        type: 'received',
      };

      // Get session for auth token
      const session = await this.sessionService.getSessionByWhatsappId(notification.whatsappId);
      if (!session?.flashAuthToken) {
        return;
      }

      // Format amounts
      const btcAmount = this.formatBtcAmount(notification.amount);
      const { fiatAmount, fiatCurrency } = await this.getFiatEquivalent(
        notification.amount,
        notification.whatsappId,
        session.flashAuthToken,
      );

      // Send notification
      await this.sendPaymentNotification(notification, btcAmount, fiatAmount, fiatCurrency);

      // Mark as sent
      await this.markNotificationSent(paymentHash);

      this.logger.log(`RabbitMQ payment notification sent for ${paymentHash}`);
    } catch (error) {
      this.logger.error('Error handling RabbitMQ payment:', error);
    }
  }

  /**
   * Send payment notification via WhatsApp
   */
  private async sendPaymentNotification(
    notification: PaymentNotification,
    btcAmount: string,
    fiatAmount: string,
    fiatCurrency: string,
  ): Promise<void> {
    try {
      // Format notification message
      let message = `💰 *Payment Received!*\n\n`;
      message += `You've received *${btcAmount} BTC* (~${fiatAmount} ${fiatCurrency})\n`;

      if (notification.senderName) {
        message += `From: *${notification.senderName}*\n`;
      }

      if (notification.memo) {
        message += `Memo: _${notification.memo}_\n`;
      }

      message += `\n⚡ Payment confirmed instantly via Lightning Network`;

      // Get current balance
      const session = await this.sessionService.getSessionByWhatsappId(notification.whatsappId);
      if (session?.flashAuthToken) {
        try {
          if (session.flashUserId) {
            const balance = await this.balanceService.getUserBalance(
              session.flashUserId,
              session.flashAuthToken,
            );
            message += `\n💼 New balance: *${this.formatBtcAmount(balance.btcBalance)} BTC*`;
          }
        } catch (error) {
          // Balance fetch failed, skip it
        }
      }

      // Send WhatsApp message
      await this.whatsappWebService.sendMessage(notification.whatsappId, message);

      this.logger.log(`Payment notification sent to ${notification.whatsappId}`);
    } catch (error) {
      this.logger.error('Error sending payment notification:', error);
      throw error;
    }
  }

  /**
   * Check if notification was already sent
   */
  private async isNotificationSent(paymentHash: string): Promise<boolean> {
    const key = `${this.notificationDedupePrefix}${paymentHash}`;
    const exists = await this.redisService.get(key);
    return !!exists;
  }

  /**
   * Mark notification as sent
   */
  private async markNotificationSent(paymentHash: string): Promise<void> {
    const key = `${this.notificationDedupePrefix}${paymentHash}`;
    await this.redisService.set(key, '1', this.dedupeTimeout);
  }

  /**
   * Format BTC amount for display
   */
  private formatBtcAmount(sats: number): string {
    const btc = sats / 100000000;
    return btc.toFixed(8).replace(/\.?0+$/, '');
  }

  /**
   * Get fiat equivalent of BTC amount
   */
  private async getFiatEquivalent(
    sats: number,
    whatsappId: string,
    authToken: string,
  ): Promise<{ fiatAmount: string; fiatCurrency: string }> {
    try {
      // Get user's display currency
      const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
      const displayCurrency = session?.metadata?.displayCurrency || 'USD';

      // Get current price
      const priceInfo = await this.priceService.getBitcoinPrice(displayCurrency, authToken);
      const btcPrice = priceInfo.btcPrice;

      // Calculate fiat amount
      const btcAmount = sats / 100000000;
      const fiatValue = btcAmount * btcPrice;

      return {
        fiatAmount: fiatValue.toFixed(2),
        fiatCurrency: displayCurrency,
      };
    } catch (error) {
      this.logger.error('Error calculating fiat equivalent:', error);
      return { fiatAmount: '?', fiatCurrency: 'USD' };
    }
  }

  /**
   * Cleanup subscriptions
   */
  private async cleanup() {
    // Unsubscribe all users
    for (const [whatsappId, subscriptionId] of this.activeSubscriptions) {
      this.subscriptionService.unsubscribe(subscriptionId);
    }
    this.activeSubscriptions.clear();
    this.logger.log('Payment notification service cleaned up');
  }
}
