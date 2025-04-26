import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { NotificationService } from '../services/notification.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { 
  NotificationDto, 
  NotificationType, 
  NotificationPriority, 
  NotificationChannel, 
  PaymentData, 
  SendNotificationDto 
} from '../dto/notification.dto';

@Injectable()
export class PaymentEventListener implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventListener.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly notificationService: NotificationService,
    private readonly balanceService: BalanceService,
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
      this.logger.error(`Error setting up payment event subscriptions: ${error.message}`, error.stack);
    }
  }

  /**
   * Handle payment received event
   */
  private async handlePaymentReceived(data: any): Promise<void> {
    try {
      const { userId, transactionId, amount, senderName, memo, timestamp } = data;
      
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
      const balanceInfo = await this.balanceService.getUserBalance(userId);
      
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
      const { userId, transactionId, amount, receiverName, memo, timestamp } = data;
      
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
      const balanceInfo = await this.balanceService.getUserBalance(userId);
      
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
      const { userId, oldBalance, newBalance, reason } = data;
      
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
}