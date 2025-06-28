import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
// import { RedisService } from '../../redis/redis.service'; // Not used with WebSocket disabled
// import { SubscriptionService } from '../../flash-api/services/subscription.service'; // WebSocket subscriptions disabled
// import { SessionService } from '../../auth/services/session.service'; // Not used with WebSocket disabled

@Injectable()
export class InvoiceTrackerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoiceTrackerService.name);
  // private activeSubscriptions = new Map<string, string>(); // whatsappId -> subscriptionId // WebSocket subscriptions disabled

  constructor(
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    // private readonly redisService: RedisService, // Not used with WebSocket disabled
    // private readonly subscriptionService: SubscriptionService, // WebSocket subscriptions disabled
    // private readonly sessionService: SessionService, // Not used with WebSocket disabled
  ) {}

  onModuleInit() {
    this.startTracking();
  }

  onModuleDestroy() {
    this.stopTracking();
  }

  private async startTracking() {
    this.logger.log('Invoice payment tracking service initialized (using RabbitMQ events)');

    // WebSocket subscriptions are disabled - invoice tracking is now handled by RabbitMQ payment events
    // See PaymentEventListener for the current implementation
  }

  /**
   * Subscribe to Lightning updates for existing sessions
   * @deprecated WebSocket subscriptions disabled - using RabbitMQ events instead
   */
  /*
  private async subscribeToExistingSessions() {
    try {
      // Get all invoice keys
      const invoiceKeys = await this.redisService.keys('invoice:*');
      const userIds = new Set<string>();

      // Extract unique user IDs from pending invoices
      for (const key of invoiceKeys) {
        const invoiceData = await this.redisService.get(key);
        if (invoiceData) {
          const invoice = JSON.parse(invoiceData);
          if (invoice.status === 'pending' && invoice.whatsappUserId) {
            userIds.add(invoice.whatsappUserId);
          }
        }
      }

      // Subscribe for each user
      for (const whatsappId of userIds) {
        await this.subscribeForUser(whatsappId);
      }
    } catch (error) {
      this.logger.error('Error subscribing to existing sessions:', error);
    }
  }
  */

  /**
   * Subscribe to Lightning updates for a specific user
   * @deprecated WebSocket subscriptions disabled - using RabbitMQ events instead
   */
  /*
  async subscribeForUser(whatsappId: string): Promise<void> {
    try {
      // Check if already subscribed
      if (this.activeSubscriptions.has(whatsappId)) {
        return;
      }

      // Get user session
      const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
      if (!session?.flashAuthToken) {
        this.logger.warn(`No auth token found for WhatsApp user ${whatsappId}`);
        return;
      }

      // Subscribe to Lightning updates
      const subscriptionId = await this.subscriptionService.subscribeLnUpdates(
        whatsappId,
        session.flashAuthToken,
        async (paymentHash, status) => {
          await this.handlePaymentUpdate(paymentHash, status, whatsappId);
        },
      );

      this.activeSubscriptions.set(whatsappId, subscriptionId);
      this.logger.log(`Subscribed to Lightning updates for user ${whatsappId}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe for user ${whatsappId}:`, error);
    }
  }
  */

  /**
   * Handle payment status update from subscription
   * @deprecated WebSocket subscriptions disabled - payment updates now handled by PaymentEventListener
   */
  /*
  private async handlePaymentUpdate(
    paymentHash: string,
    status: string,
    whatsappId: string,
  ): Promise<void> {
    try {
      this.logger.log(`Payment update received: ${paymentHash} - ${status}`);

      // Only process PAID status
      if (status !== 'PAID') {
        return;
      }

      // Look up the invoice
      const key = `invoice:${paymentHash}`;
      const invoiceData = await this.redisService.get(key);

      if (!invoiceData) {
        this.logger.debug(`No tracked invoice found for payment hash: ${paymentHash}`);
        return;
      }

      const invoice = JSON.parse(invoiceData);

      // Skip if already paid
      if (invoice.status === 'paid') {
        return;
      }

      // Update invoice status
      invoice.status = 'paid';
      invoice.paidAt = new Date().toISOString();

      // Save updated invoice
      await this.redisService.set(key, JSON.stringify(invoice), 3600); // Keep for 1 hour

      // Send notification
      await this.whatsappService.notifyInvoicePaid(invoice);

      this.logger.log(`Invoice ${paymentHash} marked as paid and user notified`);
    } catch (error) {
      this.logger.error(`Error handling payment update: ${error.message}`, error.stack);
    }
  }
  */

  /**
   * Unsubscribe a user from Lightning updates
   * @deprecated WebSocket subscriptions disabled
   */
  /*
  async unsubscribeUser(whatsappId: string): Promise<void> {
    const subscriptionId = this.activeSubscriptions.get(whatsappId);
    if (subscriptionId) {
      this.subscriptionService.unsubscribe(subscriptionId);
      this.activeSubscriptions.delete(whatsappId);
      this.logger.log(`Unsubscribed user ${whatsappId} from Lightning updates`);
    }
  }
  */

  private stopTracking() {
    // WebSocket subscriptions disabled - nothing to stop
    this.logger.log('Invoice tracker service stopped');
  }

  /**
   * Manually check a specific invoice (for testing)
   */
  async checkInvoice(paymentHash: string): Promise<any> {
    return this.whatsappService.checkInvoiceStatus(paymentHash);
  }
}
