import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { ParsedCommand } from './command-parser.service';

export interface PendingPayment {
  command: ParsedCommand;
  whatsappId: string;
  phoneNumber: string;
  sessionId?: string;
  timestamp: number;
  expiresAt: number;
}

@Injectable()
export class PaymentConfirmationService {
  private readonly logger = new Logger(PaymentConfirmationService.name);
  private readonly CONFIRMATION_PREFIX = 'payment_confirmation:';
  private readonly CONFIRMATION_TTL = 300; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  /**
   * Store a pending payment confirmation
   */
  async storePendingPayment(
    whatsappId: string,
    phoneNumber: string,
    command: ParsedCommand,
    sessionId?: string,
  ): Promise<void> {
    const key = `${this.CONFIRMATION_PREFIX}${whatsappId}`;
    const pendingPayment: PendingPayment = {
      command,
      whatsappId,
      phoneNumber,
      sessionId,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.CONFIRMATION_TTL * 1000,
    };

    await this.redisService.set(key, JSON.stringify(pendingPayment), this.CONFIRMATION_TTL);
  }

  /**
   * Get pending payment confirmation
   */
  async getPendingPayment(whatsappId: string): Promise<PendingPayment | null> {
    const key = `${this.CONFIRMATION_PREFIX}${whatsappId}`;
    const data = await this.redisService.get(key);

    if (!data) {
      return null;
    }

    try {
      const pendingPayment = JSON.parse(data) as PendingPayment;

      // Check if expired
      if (Date.now() > pendingPayment.expiresAt) {
        await this.clearPendingPayment(whatsappId);
        return null;
      }

      return pendingPayment;
    } catch (error) {
      this.logger.error(`Error parsing pending payment: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear pending payment confirmation
   */
  async clearPendingPayment(whatsappId: string): Promise<void> {
    const key = `${this.CONFIRMATION_PREFIX}${whatsappId}`;
    await this.redisService.del(key);
  }

  /**
   * Check if user has pending payment confirmation
   */
  async hasPendingPayment(whatsappId: string): Promise<boolean> {
    const pendingPayment = await this.getPendingPayment(whatsappId);
    return pendingPayment !== null;
  }

  /**
   * Format payment details for confirmation message
   */
  formatPaymentDetails(command: ParsedCommand): string {
    const { args } = command;

    if (command.type === 'send') {
      const recipient = args.recipient || args.username || args.phoneNumber || 'unknown';
      return `Send $${args.amount} to ${recipient}${args.memo ? ` with memo: "${args.memo}"` : ''}`;
    } else if (command.type === 'request') {
      const from = args.username || args.phoneNumber || 'unknown';
      return `Request $${args.amount} from ${from}`;
    }

    return 'Unknown payment';
  }

  /**
   * Format payment success for voice output
   */
  formatPaymentSuccessForVoice(amount: number, recipient: string, newBalance?: string): string {
    const amountStr = amount.toFixed(2);
    let message = `Payment sent successfully! You sent ${amountStr} dollars to ${recipient}.`;

    if (newBalance) {
      message += ` Your new balance is ${newBalance}.`;
    }

    return message;
  }

  /**
   * Format payment error for voice output
   */
  formatPaymentErrorForVoice(error: string): string {
    if (error.includes('balance') || error.includes('Insufficient')) {
      return "Payment failed. You don't have enough balance. Try adding funds to your account.";
    } else if (error.includes('not found') || error.includes('Username')) {
      return 'Payment failed. The recipient was not found. Please check the username and try again.';
    } else if (error.includes('limit')) {
      return "Payment failed. You've reached your transaction limit. Please wait or contact support.";
    } else if (error.includes('inactive') || error.includes('restricted')) {
      return "Payment failed. There's an account restriction. Please contact support for help.";
    }

    return 'Payment failed. Something went wrong. Please try again later.';
  }
}
