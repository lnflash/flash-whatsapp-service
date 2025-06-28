import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { NotificationService } from '../services/notification.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { SessionService } from '../../auth/services/session.service';
import { RedisService } from '../../redis/redis.service';
import {
  NotificationDto,
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  PaymentData,
  SendNotificationDto,
} from '../dto/notification.dto';

@Injectable()
export class PaymentEventListener implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventListener.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly notificationService: NotificationService,
    private readonly balanceService: BalanceService,
    private readonly sessionService: SessionService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    // Subscribe to payment events
    await this.setupSubscriptions();
    this.logger.log('Payment event listener initialized');
  }

  /**
   * Set up event subscriptions
   */
  private async setupSubscriptions(): Promise<void> {
    try {
      await this.eventsService.subscribeToEvents(async (eventType, data) => {
        switch (eventType) {
          case 'payment_received':
            await this.handlePaymentReceived(data);
            break;

          case 'payment_sent':
            await this.handlePaymentSent(data);
            break;

          case 'balance_updated':
            await this.handleBalanceUpdated(data);
            break;
        }
      });

      this.logger.log('Subscribed to payment events');
    } catch (error) {
      this.logger.error(
        `Error setting up payment event subscriptions: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle payment received event
   */
  private async handlePaymentReceived(data: any): Promise<void> {
    try {
      this.logger.log(`Handling payment_received event: ${JSON.stringify(data)}`);
      
      const { userId, transactionId, amount, senderName, memo, timestamp, whatsappId, paymentHash } = data;
      
      // Log all data fields to see what's available
      this.logger.log(`Payment data fields: ${Object.keys(data).join(', ')}`);
      
      // Check for various payment identifiers
      const possiblePaymentHash = paymentHash || data.payment_hash || data.paymentIdentifier || data.hash;
      
      if (possiblePaymentHash) {
        this.logger.log(`Found payment identifier: ${possiblePaymentHash}`);
        await this.handleInvoicePayment(possiblePaymentHash, data);
        return;
      } else {
        // Try to match by memo if it contains the payment hash
        if (memo && memo.length === 64) { // Payment hashes are 64 characters
          this.logger.log(`Checking if memo is payment hash: ${memo}`);
          await this.handleInvoicePayment(memo, data);
          return;
        }
      }

      // Get auth token from session
      let authToken: string | null = null;
      if (whatsappId) {
        const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
        authToken = session?.flashAuthToken || null;
      }

      if (!authToken) {
        this.logger.warn(
          `No auth token found for user ${userId}, skipping balance update notification`,
        );
        return;
      }

      // Construct payment data
      const paymentData: PaymentData = {
        transactionId,
        amount,
        senderName,
        memo,
        timestamp: timestamp || new Date().toISOString(),
        currency: 'BTC',
      };

      // Get updated balance
      const balanceInfo = await this.balanceService.getUserBalance(userId, authToken);

      // Create notification
      const notification: NotificationDto = {
        type: NotificationType.PAYMENT_RECEIVED,
        userId,
        title: 'Bitcoin Received',
        message: `You've received ${amount} BTC. Your new balance is ${balanceInfo.btcBalance} BTC.`,
        priority: NotificationPriority.HIGH,
        channels: [NotificationChannel.WHATSAPP],
        requiresAction: false,
        paymentData,
      };

      // Send notification
      await this.notificationService.sendNotification({ notification });

      this.logger.log(`Payment received notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Error handling payment received event: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle payment sent event
   */
  private async handlePaymentSent(data: any): Promise<void> {
    try {
      const { userId, transactionId, amount, receiverName, memo, timestamp, whatsappId } = data;

      // Get auth token from session
      let authToken: string | null = null;
      if (whatsappId) {
        const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
        authToken = session?.flashAuthToken || null;
      }

      if (!authToken) {
        this.logger.warn(
          `No auth token found for user ${userId}, skipping balance update notification`,
        );
        return;
      }

      // Construct payment data
      const paymentData: PaymentData = {
        transactionId,
        amount,
        receiverName,
        memo,
        timestamp: timestamp || new Date().toISOString(),
        currency: 'BTC',
      };

      // Get updated balance
      const balanceInfo = await this.balanceService.getUserBalance(userId, authToken);

      // Create notification
      const notification: NotificationDto = {
        type: NotificationType.PAYMENT_SENT,
        userId,
        title: 'Bitcoin Sent',
        message: `You've sent ${amount} BTC. Your new balance is ${balanceInfo.btcBalance} BTC.`,
        priority: NotificationPriority.MEDIUM,
        channels: [NotificationChannel.WHATSAPP],
        requiresAction: false,
        paymentData,
      };

      // Send notification
      await this.notificationService.sendNotification({ notification });

      this.logger.log(`Payment sent notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Error handling payment sent event: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle balance updated event
   */
  private async handleBalanceUpdated(data: any): Promise<void> {
    try {
      const { userId, oldBalance, newBalance, reason, whatsappId } = data;

      // Skip if no significant change
      if (Math.abs(newBalance - oldBalance) < 0.00000001) {
        return;
      }

      // Create notification
      const notification: NotificationDto = {
        type: NotificationType.ACCOUNT_ACTIVITY,
        userId,
        title: 'Balance Updated',
        message: `Your balance has been updated to ${newBalance} BTC.`,
        priority: NotificationPriority.LOW,
        channels: [NotificationChannel.WHATSAPP],
        requiresAction: false,
      };

      // Add reason if provided
      if (reason) {
        notification.message += ` Reason: ${reason}`;
      }

      // Send notification
      await this.notificationService.sendNotification({ notification });

      this.logger.log(`Balance updated notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Error handling balance updated event: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle Lightning invoice payment
   * This is the primary method for tracking Lightning invoice payments.
   * It replaces the WebSocket subscription approach that was experiencing connection issues.
   * 
   * Requirements for this to work:
   * 1. Invoice must be stored in Redis with key `invoice:{paymentHash}`
   * 2. RabbitMQ payment event must include a payment hash field
   * 3. Payment hash can be in fields: paymentHash, payment_hash, paymentIdentifier, or hash
   */
  private async handleInvoicePayment(paymentHash: string, data: any): Promise<void> {
    try {
      // Look up the invoice in Redis
      const key = `invoice:${paymentHash}`;
      const invoiceData = await this.redisService.get(key);
      
      if (!invoiceData) {
        this.logger.debug(`No tracked invoice found for payment hash: ${paymentHash}`);
        return;
      }

      const invoice = JSON.parse(invoiceData);
      
      // Update invoice status
      invoice.status = 'paid';
      invoice.paidAt = data.timestamp || new Date().toISOString();
      
      // Save updated invoice
      await this.redisService.set(key, JSON.stringify(invoice), 3600); // Keep for 1 hour
      
      // Format payment notification
      const amount = data.amount || invoice.amount;
      const currency = invoice.currency || 'USD';
      const memo = invoice.memo || data.memo;
      
      const message = `✅ Payment Received!\n\nAmount: ${currency === 'USD' ? '$' : ''}${amount} ${currency}\n${memo ? `Memo: ${memo}\n` : ''}Paid at: ${new Date(invoice.paidAt).toLocaleString()}\n\nThank you for your payment!`;

      // Send notification through the notification service
      const notification: NotificationDto = {
        type: NotificationType.PAYMENT_RECEIVED,
        userId: invoice.whatsappUserId,
        title: 'Lightning Invoice Paid',
        message: message,
        priority: NotificationPriority.HIGH,
        channels: [NotificationChannel.WHATSAPP],
        requiresAction: false,
        paymentData: {
          transactionId: data.transactionId || paymentHash,
          amount: amount,
          senderName: data.senderName,
          memo: memo,
          timestamp: invoice.paidAt,
          currency: currency,
        },
      };

      await this.notificationService.sendNotification({ notification });
      
      this.logger.log(`Lightning invoice payment notification sent for hash: ${paymentHash}`);
    } catch (error) {
      this.logger.error(`Error handling invoice payment: ${error.message}`, error.stack);
    }
  }
}
