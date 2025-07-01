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
  private readonly dedupeTimeout = 24 * 60 * 60; // 24 hours
  private pollingIntervals = new Map<string, NodeJS.Timeout>(); // whatsappId -> interval
  private readonly lastTxPrefix = 'last_tx_id:'; // Redis key prefix for last transaction IDs
  private connectionErrorLogged = new Set<string>(); // Track which users we've logged connection errors for

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
    // Skip initialization in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }
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

      // Delay WebSocket subscriptions to give WhatsApp time to initialize
      setTimeout(async () => {
        // Check if WhatsApp is ready before enabling subscriptions
        if (!this.whatsappWebService.isClientReady()) {
          this.logger.info('WhatsApp not ready yet, will retry payment subscriptions later');
          // Retry again in 30 seconds
          setTimeout(() => this.initialize(), 30000);
          return;
        }

        // Check if WebSocket subscriptions are enabled
        const wsEnabled = this.configService.get<boolean>('notifications.enableWebSocket', true);

        if (wsEnabled) {
          // Try to enable WebSocket subscriptions but don't fail if they don't work
          try {
            await this.enableWebSocketSubscriptions();
          } catch {
            this.logger.warn('WebSocket subscriptions failed, relying on RabbitMQ events');
          }
        }
      }, 5000); // Wait 5 seconds before trying to subscribe
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
    } catch (error) {
      this.logger.error('Failed to enable WebSocket subscriptions:', error);
    }
  }

  /**
   * Subscribe a user to real-time payment updates
   */
  async subscribeUserToPayments(whatsappId: string, authToken: string): Promise<void> {
    try {
      // Don't subscribe if WhatsApp is not ready
      if (!this.whatsappWebService.isClientReady()) {
        this.logger.debug(`Skipping payment subscription for ${whatsappId} - WhatsApp not ready`);
        return;
      }

      // Check if already subscribed
      if (this.activeSubscriptions.has(whatsappId)) {
        return;
      }

      // Subscribe to Lightning updates (only works for Lightning payments)
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

      // Start polling for intraledger transfers (Flash-to-Flash payments)
      this.startPollingForIntraledgerPayments(whatsappId, authToken);
    } catch (error) {
      this.logger.error(`Failed to subscribe user ${whatsappId} to payments:`, error);
    }
  }

  /**
   * Unsubscribe a user from payment updates
   */
  async unsubscribeUserFromPayments(whatsappId: string): Promise<void> {
    // Unsubscribe from WebSocket
    const subscriptionId = this.activeSubscriptions.get(whatsappId);
    if (subscriptionId) {
      this.subscriptionService.unsubscribe(subscriptionId);
      this.activeSubscriptions.delete(whatsappId);
    }

    // Stop polling
    const interval = this.pollingIntervals.get(whatsappId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(whatsappId);
    }

    // Clear last transaction ID from Redis
    await this.clearLastTransactionId(whatsappId);
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

      if (!transaction) {
        // WebSocket subscription only works for Lightning payments
        // IntraLedger transfers don't have payment hashes, so they won't be found
        this.logger.warn(
          `Transaction not found for payment hash. This might be an intraledger transfer which is not supported by the Lightning subscription.`,
        );
        return;
      }

      if (transaction.direction !== 'RECEIVE') {
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

      if (!paymentHash) {
        this.logger.warn(`No payment hash in RabbitMQ event`);
        return;
      }

      if (await this.isNotificationSent(paymentHash)) {
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

      // Check if this is a USD payment (notification.currency would be 'USD')
      if (notification.currency === 'USD') {
        const currencySymbol = fiatCurrency === 'USD' ? '$' : '';
        message += `Amount: *${currencySymbol}${fiatAmount} ${fiatCurrency}*`;
        if (btcAmount && btcAmount !== '?') {
          message += ` _(~${btcAmount} BTC)_`;
        }
        message += '\n';
      } else {
        // BTC payment
        message += `Amount: *${btcAmount} BTC*`;
        const fiatSymbol = fiatCurrency === 'USD' ? '$' : '';
        message += ` _(~${fiatSymbol}${fiatAmount} ${fiatCurrency})_\n`;
      }

      if (notification.senderName && notification.senderName !== 'Someone') {
        message += `From: *${notification.senderName}*\n`;
      }

      if (notification.memo) {
        message += `Memo: _${notification.memo}_\n`;
      }

      message += `\n✅ Payment confirmed instantly`;

      // Get current balance
      const session = await this.sessionService.getSessionByWhatsappId(notification.whatsappId);
      if (session?.flashAuthToken) {
        try {
          if (session.flashUserId) {
            // Clear balance cache to ensure we get the latest balance
            await this.balanceService.clearBalanceCache(session.flashUserId);

            const balance = await this.balanceService.getUserBalance(
              session.flashUserId,
              session.flashAuthToken,
            );

            // Show the appropriate balance based on what the user has
            if (balance.fiatBalance > 0 || balance.btcBalance === 0) {
              // User has USD balance or only USD wallet
              // Note: fiatBalance is already in dollars from BalanceService, not cents
              const balanceAmount = balance.fiatBalance.toFixed(2);

              // For display currency (e.g., JMD), we need to show the USD amount
              if (balance.fiatCurrency !== 'USD') {
                message += `\n💼 New balance: *$${balanceAmount} USD*`;
              } else {
                message += `\n💼 New balance: *$${balanceAmount} USD*`;
              }
            } else if (balance.btcBalance > 0) {
              // User has BTC balance
              message += `\n💼 New balance: *${this.formatBtcAmount(balance.btcBalance)} BTC*`;
            }
          }
        } catch {
          // Balance fetch failed, skip it
        }
      }

      // Check if WhatsApp client is ready before sending
      if (!this.whatsappWebService.isClientReady()) {
        this.logger.warn(`WhatsApp client not ready, skipping notification for ${notification.whatsappId}`);
        return;
      }

      // Send WhatsApp message
      await this.whatsappWebService.sendMessage(notification.whatsappId, message);
    } catch (error) {
      // Don't throw if WhatsApp is not ready - just log and continue
      if (error.message && error.message.includes('WhatsApp Web client is not ready')) {
        this.logger.debug(`WhatsApp not ready, payment notification queued for ${notification.whatsappId}`);
        return;
      }
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
   * Start polling for intraledger payments
   */
  private startPollingForIntraledgerPayments(whatsappId: string, authToken: string): void {
    // Check if intraledger polling is enabled
    const pollingEnabled = this.configService.get<boolean>('notifications.enableIntraledgerPolling', true);
    if (!pollingEnabled) {
      this.logger.debug(`Intraledger polling is disabled for ${whatsappId}`);
      return;
    }

    // Clear any existing interval
    const existingInterval = this.pollingIntervals.get(whatsappId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const pollingInterval = this.configService.get<number>('notifications.pollingInterval', 10000);

    // Poll for new transactions
    const interval = setInterval(async () => {
      try {
        await this.checkForNewIntraledgerPayments(whatsappId, authToken);
      } catch (error) {
        this.logger.error(`Error polling for payments for ${whatsappId}:`, error);
      }
    }, pollingInterval);

    this.pollingIntervals.set(whatsappId, interval);

    // Do an immediate check
    this.checkForNewIntraledgerPayments(whatsappId, authToken).catch((error) => {
      this.logger.error(`Error in initial payment check for ${whatsappId}:`, error);
    });
  }

  /**
   * Check for new intraledger payments
   */
  private async checkForNewIntraledgerPayments(
    whatsappId: string,
    authToken: string,
  ): Promise<void> {
    try {
      // Skip if WhatsApp client is not ready
      if (!this.whatsappWebService.isClientReady()) {
        return;
      }

      // Get recent transactions
      const transactions = await this.transactionService.getRecentTransactions(authToken, 10);

      if (!transactions?.edges || transactions.edges.length === 0) {
        return;
      }

      // Get the last processed transaction ID from Redis
      const lastProcessedId = await this.getLastTransactionId(whatsappId);

      // Find new receive transactions
      const newReceiveTransactions = [];
      for (const edge of transactions.edges) {
        const tx = edge.node;

        // Stop if we've reached a transaction we've already processed
        if (lastProcessedId && tx.id === lastProcessedId) {
          break;
        }

        // Only process successful receive transactions
        if (tx.status === 'SUCCESS' && tx.direction === 'RECEIVE') {
          newReceiveTransactions.push(tx);
        }
      }

      // Process new transactions (in reverse order to process oldest first)
      for (const tx of newReceiveTransactions.reverse()) {
        // Skip if we've already sent a notification for this transaction
        const notificationKey = `tx_${tx.id}`;
        if (await this.isNotificationSent(notificationKey)) {
          continue;
        }

        // Get sender information
        const senderName =
          tx.initiationVia?.counterPartyUsername ||
          tx.settlementVia?.counterPartyUsername ||
          'Someone';

        // Format amounts based on currency
        let btcAmount: string;
        let fiatAmount: string;
        let fiatCurrency: string;

        if (tx.settlementCurrency === 'USD') {
          // USD transaction
          fiatAmount = tx.settlementAmount.toString();
          fiatCurrency = 'USD';
          // Calculate BTC equivalent if available
          if (tx.settlementPrice) {
            const btcValue = this.calculateBtcFromUsd(
              parseFloat(tx.settlementAmount.toString()),
              tx.settlementPrice,
            );
            btcAmount = btcValue || '?';
          } else {
            btcAmount = '?';
          }
        } else {
          // BTC transaction
          btcAmount = this.formatBtcAmount(tx.settlementAmount);
          const fiatEquiv = await this.getFiatEquivalent(
            tx.settlementAmount,
            whatsappId,
            authToken,
          );
          fiatAmount = fiatEquiv.fiatAmount;
          fiatCurrency = fiatEquiv.fiatCurrency;
        }

        // Create notification
        const notification: PaymentNotification = {
          paymentHash: notificationKey, // Use transaction ID as unique key
          userId: tx.id,
          whatsappId,
          amount: tx.settlementAmount,
          currency: tx.settlementCurrency,
          senderName,
          memo: tx.memo,
          timestamp: tx.createdAt,
          type: 'received',
        };

        // Send notification
        await this.sendPaymentNotification(notification, btcAmount, fiatAmount, fiatCurrency);

        // Mark as sent
        await this.markNotificationSent(notificationKey);
      }

      // Update last processed transaction ID in Redis
      if (transactions.edges.length > 0) {
        await this.setLastTransactionId(whatsappId, transactions.edges[0].node.id);
      }
    } catch (error) {
      // Don't log errors for WhatsApp not being ready
      if (error.message && error.message.includes('WhatsApp Web client is not ready')) {
        return;
      }
      
      // Only log connection errors once, not the full stack trace
      if (error.message?.includes('fetch failed') || error.message?.includes('Connect Timeout')) {
        // Suppress repetitive connection errors
        if (!this.connectionErrorLogged.has(whatsappId)) {
          this.logger.warn(`Flash API connection issue for ${whatsappId}. Payment polling temporarily unavailable.`);
          this.connectionErrorLogged.add(whatsappId);
          // Clear the flag after 5 minutes
          setTimeout(() => this.connectionErrorLogged.delete(whatsappId), 300000);
        }
      } else {
        this.logger.error(`Error checking for new intraledger payments:`, error);
      }
    }
  }

  /**
   * Calculate BTC amount from USD and price
   */
  private calculateBtcFromUsd(usdAmount: number, price: any): string | null {
    if (!price || !price.base || price.offset === undefined) {
      return null;
    }

    try {
      // Calculate BTC amount using price
      const priceValue = price.base / Math.pow(10, price.offset);
      const btcAmount = usdAmount / priceValue;

      // Format based on amount size
      if (btcAmount < 0.00001) {
        const sats = Math.round(btcAmount * 100000000);
        return `${sats} sats`;
      } else {
        return btcAmount.toFixed(8).replace(/\.?0+$/, '');
      }
    } catch (error) {
      this.logger.error('Error calculating BTC amount from USD:', error);
      return null;
    }
  }

  /**
   * Get last processed transaction ID from Redis
   */
  private async getLastTransactionId(whatsappId: string): Promise<string | null> {
    try {
      const key = `${this.lastTxPrefix}${whatsappId}`;
      return await this.redisService.get(key);
    } catch (error) {
      this.logger.error(`Error getting last transaction ID for ${whatsappId}:`, error);
      return null;
    }
  }

  /**
   * Set last processed transaction ID in Redis
   */
  private async setLastTransactionId(whatsappId: string, transactionId: string): Promise<void> {
    try {
      const key = `${this.lastTxPrefix}${whatsappId}`;
      // Store for 30 days
      await this.redisService.set(key, transactionId, 30 * 24 * 60 * 60);
    } catch (error) {
      this.logger.error(`Error setting last transaction ID for ${whatsappId}:`, error);
    }
  }

  /**
   * Clear last processed transaction ID from Redis
   */
  private async clearLastTransactionId(whatsappId: string): Promise<void> {
    try {
      const key = `${this.lastTxPrefix}${whatsappId}`;
      await this.redisService.del(key);
    } catch (error) {
      this.logger.error(`Error clearing last transaction ID for ${whatsappId}:`, error);
    }
  }

  /**
   * Cleanup subscriptions
   */
  private async cleanup() {
    // Unsubscribe all users
    for (const [_whatsappId, subscriptionId] of this.activeSubscriptions) {
      this.subscriptionService.unsubscribe(subscriptionId);
    }
    this.activeSubscriptions.clear();

    // Clear all polling intervals
    for (const [_whatsappId, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Note: Last transaction IDs are persisted in Redis, no need to clear here
  }
}
