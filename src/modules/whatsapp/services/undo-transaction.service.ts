import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PaymentService } from '../../flash-api/services/payment.service';
import { SessionService } from '../../auth/services/session.service';
import { UsernameService } from '../../flash-api/services/username.service';

export interface UndoableTransaction {
  transactionId: string;
  type: 'send' | 'receive';
  amount: number;
  currency: string;
  recipient?: string;
  sender?: string;
  timestamp: Date;
  memo?: string;
  canUndo: boolean;
  expiresAt: Date;
}

@Injectable()
export class UndoTransactionService {
  private readonly logger = new Logger(UndoTransactionService.name);
  private readonly UNDO_KEY_PREFIX = 'undo_tx:';
  private readonly UNDO_WINDOW_SECONDS = 30; // 30-second undo window
  private readonly UNDO_TTL = 60; // Keep record for 60 seconds

  constructor(
    private readonly redisService: RedisService,
    private readonly paymentService: PaymentService,
    private readonly sessionService: SessionService,
    private readonly usernameService: UsernameService,
  ) {}

  /**
   * Store transaction for potential undo
   */
  async storeUndoableTransaction(
    whatsappId: string,
    transaction: Omit<UndoableTransaction, 'expiresAt'>,
  ): Promise<void> {
    const key = `${this.UNDO_KEY_PREFIX}${whatsappId}`;
    const expiresAt = new Date(Date.now() + this.UNDO_WINDOW_SECONDS * 1000);

    const undoableTransaction: UndoableTransaction = {
      ...transaction,
      expiresAt,
    };

    await this.redisService.set(key, JSON.stringify(undoableTransaction), this.UNDO_TTL);
    this.logger.log(`Stored undoable transaction ${transaction.transactionId} for ${whatsappId}`);
  }

  /**
   * Get the last undoable transaction for a user
   */
  async getLastUndoableTransaction(whatsappId: string): Promise<UndoableTransaction | null> {
    const key = `${this.UNDO_KEY_PREFIX}${whatsappId}`;
    const data = await this.redisService.get(key);

    if (!data) return null;

    const transaction: UndoableTransaction = JSON.parse(data);
    transaction.timestamp = new Date(transaction.timestamp);
    transaction.expiresAt = new Date(transaction.expiresAt);

    // Check if still within undo window
    if (Date.now() > transaction.expiresAt.getTime()) {
      await this.redisService.del(key);
      return null;
    }

    return transaction;
  }

  /**
   * Attempt to undo a transaction
   */
  async undoTransaction(whatsappId: string): Promise<{
    success: boolean;
    message: string;
    reversalTransaction?: any;
  }> {
    try {
      const transaction = await this.getLastUndoableTransaction(whatsappId);

      if (!transaction) {
        return {
          success: false,
          message: 'No recent transaction to undo. The undo window is 30 seconds.',
        };
      }

      if (!transaction.canUndo) {
        return {
          success: false,
          message: 'This transaction cannot be undone. Lightning payments are irreversible.',
        };
      }

      // Get user session
      const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
      if (!session || !session.flashAuthToken) {
        return {
          success: false,
          message: 'Please link your account first.',
        };
      }

      // Only intraledger (Flash-to-Flash) payments can potentially be undone
      // by creating a reversal transaction
      if (transaction.type === 'send' && transaction.recipient) {
        // Create a reversal payment from recipient back to sender
        const reversalMemo = `Undo: ${transaction.memo || 'payment reversal'}`;
        
        try {
          // Note: This would require recipient's consent in a real implementation
          // For now, we'll return a message about the limitation
          return {
            success: false,
            message: `⚠️ Payment reversals require recipient consent.

To request a refund:
1. Contact ${transaction.recipient}
2. Ask them to send back $${transaction.amount.toFixed(2)}
3. Reference: ${transaction.transactionId.slice(0, 8)}

Lightning payments are designed to be final for security.`,
          };
        } catch (error) {
          this.logger.error(`Failed to create reversal transaction: ${error.message}`);
          return {
            success: false,
            message: 'Unable to process reversal. Please contact support.',
          };
        }
      }

      return {
        success: false,
        message: 'This type of transaction cannot be undone.',
      };
    } catch (error) {
      this.logger.error(`Error undoing transaction: ${error.message}`);
      return {
        success: false,
        message: 'An error occurred while processing the undo request.',
      };
    } finally {
      // Clear the undo record
      const key = `${this.UNDO_KEY_PREFIX}${whatsappId}`;
      await this.redisService.del(key);
    }
  }

  /**
   * Check if user has an undoable transaction
   */
  async hasUndoableTransaction(whatsappId: string): Promise<boolean> {
    const transaction = await this.getLastUndoableTransaction(whatsappId);
    return transaction !== null;
  }

  /**
   * Get time remaining for undo
   */
  async getUndoTimeRemaining(whatsappId: string): Promise<number> {
    const transaction = await this.getLastUndoableTransaction(whatsappId);
    if (!transaction) return 0;

    const remaining = Math.max(0, transaction.expiresAt.getTime() - Date.now());
    return Math.ceil(remaining / 1000); // Return seconds
  }

  /**
   * Format undo availability message
   */
  async getUndoHint(whatsappId: string): Promise<string | null> {
    const transaction = await this.getLastUndoableTransaction(whatsappId);
    if (!transaction) return null;

    const timeRemaining = await this.getUndoTimeRemaining(whatsappId);
    if (timeRemaining <= 0) return null;

    // Only show undo hint for intraledger transactions
    if (transaction.canUndo) {
      return `\n\n_Changed your mind? Type \`undo\` within ${timeRemaining} seconds_`;
    }

    return null;
  }
}