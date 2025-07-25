import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { ParsedCommand } from './command-parser.service';
import { ResponseLengthUtil } from '../utils/response-length.util';

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
   * Check if a message is a confirmation
   */
  isConfirmation(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const confirmWords = ['yes', 'y', 'ok', 'okay', 'confirm', 'pay', 'send'];
    return confirmWords.includes(lowerMessage);
  }

  /**
   * Check if a message is a cancellation
   */
  isCancellation(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const cancelWords = ['no', 'n', 'cancel', 'stop', 'abort'];
    return cancelWords.includes(lowerMessage);
  }

  /**
   * Format payment details for confirmation message
   */
  formatPaymentDetails(command: ParsedCommand): string {
    const { args } = command;

    if (command.type === 'send') {
      let details = '';

      // Add recipient info with validation status
      if (args.recipientValidated === 'true' && args.recipientDisplay) {
        details += `📤 *To*: ${args.recipientDisplay}`;
        if (args.recipientType === 'username') {
          details += ' ✅';
        }
        details += '\n';
      } else if (args.username) {
        details += `📤 *To*: @${args.username}\n`;
      } else if (args.phoneNumber) {
        details += `📤 *To*: ${args.phoneNumber}\n`;
      } else if (args.recipient) {
        details += `📤 *To*: ${args.recipient}\n`;
      }

      // Add amount
      details += `💵 *Amount*: $${args.amount} USD\n`;

      // Add memo if present
      if (args.memo) {
        details += `📝 *Memo*: "${args.memo}"\n`;
      }

      // Add type-specific info
      if (args.recipientType === 'phone') {
        details += `\n📱 *Type*: Phone number (will create pending payment)`;
      } else if (args.recipientType === 'contact') {
        details += `\n👤 *Type*: Saved contact`;
      } else if (args.recipientType === 'lightning_invoice') {
        details += `\n⚡ *Type*: Lightning invoice`;
      } else if (args.recipientType === 'lightning_address') {
        details += `\n⚡ *Type*: Lightning address`;
      } else {
        details += `\n⚡ *Network*: Lightning (instant, no fees)`;
      }

      return details;
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
      return ResponseLengthUtil.getConciseResponse('insufficient_balance');
    } else if (error.includes('not found') || error.includes('Username')) {
      return ResponseLengthUtil.getConciseResponse('user_not_found');
    } else if (error.includes('limit')) {
      return 'Payment failed. Transaction limit reached.';
    } else if (error.includes('inactive') || error.includes('restricted')) {
      return 'Payment failed. Account restricted.';
    }

    return ResponseLengthUtil.getConciseResponse('error');
  }
}
