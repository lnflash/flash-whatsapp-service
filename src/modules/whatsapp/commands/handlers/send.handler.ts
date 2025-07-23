import { Injectable } from '@nestjs/common';
import { BaseCommandHandler } from '../base/base-command.handler';
import { CommandCategory } from '../base/command-handler.interface';
import { CommandContext } from '../base/command-context.interface';
import {
  CommandResult,
  CommandResultBuilder,
  CommandErrorCode,
} from '../base/command-result.interface';
// FlashApiService removed - using specific services instead
import { PaymentService } from '../../../flash-api/services/payment.service';
import { UsernameService } from '../../../flash-api/services/username.service';
import { BalanceService, BalanceInfo } from '../../../flash-api/services/balance.service';
import { PriceService } from '../../../flash-api/services/price.service';
import { RequestDeduplicatorService } from '../../../common/services/request-deduplicator.service';
import { ConfigService } from '@nestjs/config';
import { PaymentConfirmationService } from '../../services/payment-confirmation.service';
import { VoiceResponseService } from '../../services/voice-response.service';
import { PaymentTemplatesService } from '../../services/payment-templates.service';
import { CommandType } from '../../services/command-parser.service';

@Injectable()
export class SendCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly usernameService: UsernameService,
    private readonly balanceService: BalanceService,
    private readonly priceService: PriceService,
    private readonly deduplicator: RequestDeduplicatorService,
    private readonly configService: ConfigService,
    private readonly confirmationService: PaymentConfirmationService,
    private readonly voiceResponseService: VoiceResponseService,
    private readonly paymentTemplatesService: PaymentTemplatesService,
  ) {
    super({
      command: 'send',
      aliases: ['s', 'pay'],
      description: 'Send Bitcoin to another user',
      category: CommandCategory.TRANSACTION,
      requiresSession: true,
    });
  }

  protected async handleCommand(context: CommandContext): Promise<CommandResult> {
    const { commandData } = context;

    if (commandData.type !== CommandType.SEND) {
      return this.createValidationError(context);
    }

    try {
      // Check for pending confirmation
      const pendingConfirmation = await this.confirmationService.getPendingPayment(
        context.whatsappId,
      );

      if (pendingConfirmation && commandData.confirmation) {
        return this.handleConfirmation(
          context,
          pendingConfirmation,
          commandData.confirmation === 'yes',
        );
      }

      // Validate send data
      if (!commandData.recipient || commandData.amount === undefined) {
        return CommandResultBuilder.error({
          code: CommandErrorCode.INVALID_ARGUMENTS,
          message: '❌ Invalid command format. Use: /send <amount> <currency> to <recipient>',
        }).build();
      }

      // Resolve recipient
      const recipientId = await this.resolveRecipient(commandData.recipient);
      if (!recipientId) {
        return CommandResultBuilder.error({
          code: CommandErrorCode.USER_NOT_FOUND,
          message: `❌ User @${commandData.recipient} not found.`,
        }).build();
      }

      // Convert currency if needed
      const amount = parseFloat(commandData.amount);
      let amountInBTC = amount;
      if (commandData.currency && commandData.currency.toLowerCase() !== 'btc') {
        const exchangeRate = await this.getExchangeRate(commandData.currency);
        amountInBTC = amount / exchangeRate;
      }

      // Check balance
      const balance = await this.getBalance(context.flashUserId!);
      if (balance.btcBalance < amountInBTC) {
        return CommandResultBuilder.error({
          code: CommandErrorCode.INSUFFICIENT_BALANCE,
          message: `❌ Insufficient balance. You have ${this.formatAmount(balance.btcBalance)} BTC available.`,
        }).build();
      }

      // Create pending transaction
      await this.confirmationService.storePendingPayment(
        context.whatsappId,
        context.phoneNumber,
        {
          type: CommandType.SEND,
          args: {
            amount: amountInBTC.toString(),
            recipient: recipientId,
            recipientUsername: commandData.recipient,
            currency: commandData.currency || 'BTC',
            originalAmount: amount.toString(),
          },
          rawText: context.rawText,
        },
        context.session?.sessionId,
      );

      // Generate confirmation message
      const confirmationMessage =
        `🔐 *Payment Confirmation*\n\n` +
        `Send ${this.formatAmount(amountInBTC)} BTC to @${commandData.recipient}?\n\n` +
        `Reply *yes* to confirm or *no* to cancel.`;

      // Add voice if needed
      if (context.isVoiceCommand) {
        const voiceResponse = await this.voiceResponseService.generateNaturalVoiceResponse(
          CommandType.SEND,
          confirmationMessage,
          { amount: amountInBTC, recipient: commandData.recipient },
          { language: context.language || 'en' },
        );
        const voiceBuffer = Buffer.from(voiceResponse);

        return CommandResultBuilder.success(confirmationMessage)
          .withVoice(voiceBuffer)
          .withButtons([
            { id: 'yes', title: 'Yes, send' },
            { id: 'no', title: 'No, cancel' },
          ])
          .build();
      }

      return CommandResultBuilder.success(confirmationMessage)
        .withButtons([
          { id: 'yes', title: 'Yes, send' },
          { id: 'no', title: 'No, cancel' },
        ])
        .build();
    } catch (error) {
      this.logger.error('Error processing send command:', error);

      return CommandResultBuilder.error({
        code: CommandErrorCode.INTERNAL_ERROR,
        message: '❌ An error occurred processing your payment. Please try again.',
        details: error.message,
      }).build();
    }
  }

  private async handleConfirmation(
    context: CommandContext,
    pendingTx: any,
    confirmation: boolean,
  ): Promise<CommandResult> {
    // Clear pending transaction
    await this.confirmationService.clearPendingPayment(context.whatsappId);

    if (!confirmation) {
      return CommandResultBuilder.success('❌ Payment cancelled.').build();
    }

    try {
      // Execute the transaction
      // Prepare payment input
      const paymentInput = {
        walletId: context.session!.metadata?.defaultWalletId,
        recipientWalletId: pendingTx.recipient,
        amount: Math.round(pendingTx.amount * 100000000), // Convert to sats
        memo: `Payment to @${pendingTx.recipientUsername}`,
      };

      const result = await this.paymentService.sendIntraLedgerPayment(
        paymentInput,
        context.session!.flashAuthToken!,
      );

      if (result.errors && result.errors.length > 0) {
        return CommandResultBuilder.error({
          code: CommandErrorCode.TRANSACTION_FAILED,
          message: `❌ Payment failed: ${result.errors[0].message}`,
        }).build();
      }

      // Generate success message
      const successMessage =
        `✅ *Payment Sent Successfully*\n\n` +
        `Amount: ${this.formatAmount(pendingTx.amount)} BTC\n` +
        `To: @${pendingTx.recipientUsername}\n` +
        `Status: ${result.status || 'Completed'}`;

      // Add voice if needed
      if (context.isVoiceCommand) {
        const voiceResponse = await this.voiceResponseService.generateNaturalVoiceResponse(
          CommandType.SEND,
          successMessage,
          { amount: pendingTx.amount, recipient: pendingTx.recipientUsername },
          { language: context.language || 'en' },
        );
        const voiceBuffer = Buffer.from(voiceResponse);

        return CommandResultBuilder.success(successMessage).withVoice(voiceBuffer, true).build();
      }

      return CommandResultBuilder.success(successMessage).build();
    } catch (error) {
      this.logger.error('Error executing payment:', error);

      return CommandResultBuilder.error({
        code: CommandErrorCode.TRANSACTION_FAILED,
        message: '❌ Payment failed. Please try again later.',
        details: error.message,
      }).build();
    }
  }

  private async resolveRecipient(recipient: string): Promise<string | null> {
    // Remove @ if present
    const username = recipient.startsWith('@') ? recipient.slice(1) : recipient;

    // Use deduplication for username lookup
    // TODO: UsernameService doesn't have getUserByUsername method
    // Need to implement user lookup by username
    return username; // Return username as ID for now
  }

  private async getBalance(flashUserId: string): Promise<BalanceInfo> {
    return this.deduplicator.deduplicate(
      `balance:${flashUserId}`,
      () => this.balanceService.getUserBalance(flashUserId, ''), // TODO: need auth token
      { ttl: this.getBalanceCacheTTL() },
    );
  }

  private async getExchangeRate(currency: string): Promise<number> {
    return this.deduplicator.deduplicate(
      `rate:BTC:${currency.toUpperCase()}`,
      async () => {
        const priceInfo = await this.priceService.getBitcoinPrice(currency);
        return priceInfo.btcPrice;
      },
      { ttl: this.getExchangeRateCacheTTL() },
    );
  }

  private getBalanceCacheTTL(): number {
    return this.configService.get<number>('cache.balanceTtl', 300) * 1000;
  }

  private getUsernameCacheTTL(): number {
    return this.configService.get<number>('cache.usernameTtl', 3600) * 1000;
  }

  private getExchangeRateCacheTTL(): number {
    return this.configService.get<number>('cache.exchangeRateTtl', 1800) * 1000;
  }

  async validate(context: CommandContext): Promise<boolean> {
    const { commandData } = context;

    // For confirmations, no additional validation needed
    if (commandData.confirmation !== undefined) {
      return true;
    }

    // Validate basic send requirements
    return !!(
      commandData.recipient &&
      commandData.amount !== undefined &&
      parseFloat(commandData.amount) > 0
    );
  }
}
