import { Injectable } from '@nestjs/common';
import { BaseCommandHandler } from '../base/base-command.handler';
import { CommandCategory } from '../base/command-handler.interface';
import { CommandContext } from '../base/command-context.interface';
import { CommandType } from '../../services/command-parser.service';
import { CommandResult, CommandResultBuilder, CommandErrorCode } from '../base/command-result.interface';
import { BalanceService } from '../../../flash-api/services/balance.service';
import { BalanceTemplate } from '../../templates/balance-template';
import { RequestDeduplicatorService } from '../../../common/services/request-deduplicator.service';
import { ConfigService } from '@nestjs/config';
import { VoiceResponseService } from '../../services/voice-response.service';

@Injectable()
export class BalanceCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly balanceTemplate: BalanceTemplate,
    private readonly deduplicator: RequestDeduplicatorService,
    private readonly configService: ConfigService,
    private readonly voiceResponseService: VoiceResponseService,
  ) {
    super({
      command: 'balance',
      aliases: ['bal', 'b'],
      description: 'Check your Flash account balance',
      category: CommandCategory.ACCOUNT,
      requiresSession: true,
    });
  }

  protected async handleCommand(context: CommandContext): Promise<CommandResult> {
    try {
      // Get balance with deduplication
      const balance = await this.deduplicator.deduplicate(
        `balance:${context.flashUserId}`,
        () => this.balanceService.getUserBalance(context.flashUserId!, context.session?.flashAuthToken || ''),
        { ttl: this.getBalanceCacheTTL() }
      );

      if (!balance) {
        return CommandResultBuilder.error({
          code: CommandErrorCode.EXTERNAL_API_ERROR,
          message: '❌ Failed to fetch balance. Please try again.',
        }).build();
      }

      // Format balance message
      // Format balance message
      const balanceData: any = {
        btcBalance: balance.btcBalance || 0,
        fiatBalance: balance.fiatBalance || 0,
        fiatCurrency: balance.fiatCurrency || 'USD',
        lastUpdated: new Date(),
        userName: context.username,
      };
      const balanceMessage = this.balanceTemplate.generateBalanceMessage(balanceData);

      // Generate voice response if needed
      if (context.isVoiceCommand) {
        const voiceResponse = await this.voiceResponseService.generateNaturalVoiceResponse(
          CommandType.BALANCE,
          balanceMessage,
          { balance: balance.btcBalance },
          { language: context.language || 'en' },
        );
        // Convert voice response to buffer (this would need TTS service)
        const voiceBuffer = Buffer.from(voiceResponse);

        return CommandResultBuilder.success(balanceMessage)
          .withVoice(voiceBuffer, true)
          .build();
      }

      return CommandResultBuilder.success(balanceMessage).build();

    } catch (error) {
      this.logger.error('Error fetching balance:', error);
      
      return CommandResultBuilder.error({
        code: CommandErrorCode.INTERNAL_ERROR,
        message: '❌ An error occurred while fetching your balance. Please try again later.',
        details: error.message,
      }).build();
    }
  }

  private getBalanceCacheTTL(): number {
    return this.configService.get<number>('cache.balanceTtl', 300) * 1000;
  }
}