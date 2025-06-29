import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PaymentService } from '../../flash-api/services/payment.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { PaymentSendResult } from '../../flash-api/services/payment.service';
import { v4 as uuidv4 } from 'uuid';

export interface AnonymousTipRequest {
  groupId: string;
  groupName: string;
  senderWhatsappId: string;
  recipientUsername: string;
  amount: number;
  memo?: string;
  senderAuthToken: string;
}

export interface AnonymousTipResult {
  success: boolean;
  tipId?: string;
  message: string;
  recipientMessage?: string;
  errorCode?: string;
}

@Injectable()
export class AnonymousPaymentService {
  private readonly logger = new Logger(AnonymousPaymentService.name);
  private readonly TIP_TRACKING_PREFIX = 'anon_tip:';
  private readonly TIP_STATS_PREFIX = 'tip_stats:';
  private readonly TIP_TTL = 86400; // 24 hours

  constructor(
    private readonly redisService: RedisService,
    private readonly paymentService: PaymentService,
    private readonly flashApiService: FlashApiService,
  ) {}

  /**
   * Process an anonymous tip in a group
   */
  async processAnonymousTip(request: AnonymousTipRequest): Promise<AnonymousTipResult> {
    try {
      const tipId = uuidv4();
      this.logger.log(`Processing anonymous tip ${tipId} in group ${request.groupId}`);

      // Validate recipient exists
      const recipientWallet = await this.validateRecipient(
        request.recipientUsername,
        request.senderAuthToken,
      );

      if (!recipientWallet) {
        return {
          success: false,
          message: `❌ User @${request.recipientUsername} not found or doesn't have a Flash account.`,
          errorCode: 'RECIPIENT_NOT_FOUND',
        };
      }

      // Get sender's wallets
      const senderWallets = await this.paymentService.getUserWallets(request.senderAuthToken);
      if (!senderWallets.usdWallet && !senderWallets.defaultWalletId) {
        return {
          success: false,
          message: '❌ Unable to access your wallet. Please try again.',
          errorCode: 'WALLET_ERROR',
        };
      }

      // Process the payment
      const paymentResult = await this.paymentService.sendIntraLedgerUsdPayment(
        {
          walletId: senderWallets.usdWallet?.id || senderWallets.defaultWalletId,
          recipientWalletId: recipientWallet.id,
          amount: request.amount * 100, // Convert to cents
          memo: request.memo || `Anonymous tip from ${request.groupName}`,
        },
        request.senderAuthToken,
      );

      if (paymentResult?.status === PaymentSendResult.Success) {
        // Track the tip
        await this.trackTip(tipId, request);

        // Update stats
        await this.updateTipStats(request.groupId, request.recipientUsername, request.amount);

        return {
          success: true,
          tipId,
          message: `💸 Anonymous tip sent to @${request.recipientUsername}!`,
          recipientMessage: this.formatRecipientMessage(
            request.amount,
            request.groupName,
            request.memo,
          ),
        };
      } else {
        const errorMessage = paymentResult?.errors?.[0]?.message || 'Unknown error';
        this.logger.error(`Anonymous tip failed: ${errorMessage}`);

        // Handle specific error cases
        if (errorMessage.includes('Insufficient balance')) {
          return {
            success: false,
            message: `❌ Insufficient balance. You need at least $${request.amount.toFixed(2)} USD.`,
            errorCode: 'INSUFFICIENT_BALANCE',
          };
        } else if (errorMessage.includes('limit')) {
          return {
            success: false,
            message: '❌ Transaction limit reached. Check your account limits.',
            errorCode: 'LIMIT_EXCEEDED',
          };
        }

        return {
          success: false,
          message: `❌ Tip failed: ${errorMessage}`,
          errorCode: 'PAYMENT_FAILED',
        };
      }
    } catch (error) {
      this.logger.error(`Error processing anonymous tip: ${error.message}`, error.stack);
      return {
        success: false,
        message: '❌ An error occurred. Please try again.',
        errorCode: 'SYSTEM_ERROR',
      };
    }
  }

  /**
   * Validate recipient and get their wallet
   */
  private async validateRecipient(
    username: string,
    authToken: string,
  ): Promise<{ id: string } | null> {
    try {
      const accountDefaultWalletQuery = `
        query accountDefaultWallet($username: Username!) {
          accountDefaultWallet(username: $username) {
            id
            walletCurrency
          }
        }
      `;

      const walletCheck = await this.flashApiService.executeQuery<any>(
        accountDefaultWalletQuery,
        { username },
        authToken,
      );

      return walletCheck?.accountDefaultWallet || null;
    } catch (error) {
      this.logger.error(`Error validating recipient: ${error.message}`);
      return null;
    }
  }

  /**
   * Track anonymous tip for audit/stats
   */
  private async trackTip(tipId: string, request: AnonymousTipRequest): Promise<void> {
    const tipData = {
      tipId,
      groupId: request.groupId,
      groupName: request.groupName,
      recipientUsername: request.recipientUsername,
      amount: request.amount,
      timestamp: new Date().toISOString(),
      // Don't store sender info for true anonymity
    };

    await this.redisService.set(
      `${this.TIP_TRACKING_PREFIX}${tipId}`,
      JSON.stringify(tipData),
      this.TIP_TTL,
    );
  }

  /**
   * Update tip statistics for the group
   */
  private async updateTipStats(
    groupId: string,
    recipientUsername: string,
    amount: number,
  ): Promise<void> {
    try {
      // Update group stats
      const groupStatsKey = `${this.TIP_STATS_PREFIX}group:${groupId}`;
      const groupStats = await this.redisService.get(groupStatsKey);

      let stats = groupStats
        ? JSON.parse(groupStats)
        : {
            totalTips: 0,
            totalAmount: 0,
            lastTipDate: null,
          };

      stats.totalTips += 1;
      stats.totalAmount += amount;
      stats.lastTipDate = new Date().toISOString();

      await this.redisService.set(groupStatsKey, JSON.stringify(stats));

      // Update recipient stats
      const recipientStatsKey = `${this.TIP_STATS_PREFIX}user:${recipientUsername}`;
      const recipientStats = await this.redisService.get(recipientStatsKey);

      let userStats = recipientStats
        ? JSON.parse(recipientStats)
        : {
            totalTipsReceived: 0,
            totalAmountReceived: 0,
            groups: {},
          };

      userStats.totalTipsReceived += 1;
      userStats.totalAmountReceived += amount;
      userStats.groups[groupId] = (userStats.groups[groupId] || 0) + 1;

      await this.redisService.set(recipientStatsKey, JSON.stringify(userStats));
    } catch (error) {
      this.logger.error(`Error updating tip stats: ${error.message}`);
      // Don't fail the tip if stats update fails
    }
  }

  /**
   * Format the message that will be sent privately to the recipient
   */
  private formatRecipientMessage(amount: number, groupName: string, memo?: string): string {
    const isFromDM = groupName === 'Direct Message';
    return (
      `🎁 *Anonymous Tip Received!*\n\n` +
      `You received a $${amount.toFixed(2)} USD tip${isFromDM ? '' : ` from someone in *${groupName}*`}!\n\n` +
      `${memo ? `💬 Message: "${memo}"\n\n` : ''}` +
      `The sender chose to remain anonymous. 🤫\n\n` +
      `_Your balance has been updated._`
    );
  }

  /**
   * Get tip statistics for a group
   */
  async getGroupTipStats(groupId: string): Promise<any> {
    try {
      const statsKey = `${this.TIP_STATS_PREFIX}group:${groupId}`;
      const stats = await this.redisService.get(statsKey);
      return stats ? JSON.parse(stats) : null;
    } catch (error) {
      this.logger.error(`Error getting group tip stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Get tip statistics for a user
   */
  async getUserTipStats(username: string): Promise<any> {
    try {
      const statsKey = `${this.TIP_STATS_PREFIX}user:${username}`;
      const stats = await this.redisService.get(statsKey);
      return stats ? JSON.parse(stats) : null;
    } catch (error) {
      this.logger.error(`Error getting user tip stats: ${error.message}`);
      return null;
    }
  }
}
