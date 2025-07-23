import { Injectable } from '@nestjs/common';
import { BaseCommandHandler } from '../base/base-command.handler';
import { CommandCategory } from '../base/command-handler.interface';
import { CommandContext } from '../base/command-context.interface';
import {
  CommandResult,
  CommandResultBuilder,
  CommandErrorCode,
} from '../base/command-result.interface';
import { AuthService } from '../../../auth/services/auth.service';
import { UsernameService } from '../../../flash-api/services/username.service';
import { VoiceResponseService } from '../../services/voice-response.service';
import { OnboardingService } from '../../services/onboarding.service';
import { CommandType } from '../../services/command-parser.service';

@Injectable()
export class LinkCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly authService: AuthService,
    private readonly usernameService: UsernameService,
    private readonly voiceResponseService: VoiceResponseService,
    private readonly onboardingService: OnboardingService,
  ) {
    super({
      command: 'link',
      aliases: ['login', 'connect'],
      description: 'Link your Flash account to WhatsApp',
      category: CommandCategory.ACCOUNT,
      requiresAuth: false,
    });
  }

  protected async handleCommand(context: CommandContext): Promise<CommandResult> {
    const { commandData } = context;

    if (commandData.type !== CommandType.LINK) {
      return this.createValidationError(context);
    }

    // Check if already linked
    if (context.session) {
      return CommandResultBuilder.success(
        `✅ Your WhatsApp is already linked to @${context.username || 'your account'}\n\n` +
          `To link a different account, first use /unlink`,
      ).build();
    }

    // Validate username
    if (!commandData.username) {
      return CommandResultBuilder.error({
        code: CommandErrorCode.MISSING_REQUIRED_FIELD,
        message: '❌ Please provide your Flash username.\n\nExample: /link myusername',
      }).build();
    }

    try {
      // Verify username exists
      // TODO: UsernameService doesn't have getUserByUsername method
      const user = { id: commandData.username }; // Mock user for now
      if (!user) {
        return CommandResultBuilder.error({
          code: CommandErrorCode.USER_NOT_FOUND,
          message:
            `❌ Username @${commandData.username} not found.\n\n` +
            `Please check your username and try again.`,
        }).build();
      }

      // Create or update session
      // TODO: This needs to be refactored to use the proper auth flow
      const session = {
        whatsappId: context.whatsappId,
        phoneNumber: context.phoneNumber,
        flashUserId: user.id,
        metadata: { username: commandData.username },
      };

      // Get welcome message
      const welcomeMessage =
        `✅ *Account Linked Successfully!*\n\n` +
        `Your WhatsApp is now connected to Flash account @${commandData.username}\n\n` +
        `You can now:\n` +
        `• Check balance: /balance\n` +
        `• Send Bitcoin: /send <amount> to <username>\n` +
        `• Receive Bitcoin: /receive <amount>\n\n` +
        `Type /help for all commands`;

      // Get initial balance to show
      // Balance will be fetched separately if needed
      const balance = null; // TODO: inject BalanceService if needed
      const balanceInfo = ''; // Balance info removed since balance is null

      const fullMessage = welcomeMessage + balanceInfo;

      // Generate voice response if needed
      if (context.isVoiceCommand) {
        const voiceResponse = await this.voiceResponseService.generateNaturalVoiceResponse(
          CommandType.LINK,
          fullMessage,
          { username: commandData.username },
          { language: context.language || 'en' },
        );
        const voiceBuffer = Buffer.from(voiceResponse);

        return CommandResultBuilder.success(fullMessage)
          .withVoice(voiceBuffer)
          .withData({ session })
          .build();
      }

      return CommandResultBuilder.success(fullMessage).withData({ session }).build();
    } catch (error) {
      this.logger.error('Error linking account:', error);

      return CommandResultBuilder.error({
        code: CommandErrorCode.INTERNAL_ERROR,
        message: '❌ Failed to link your account. Please try again later.',
        details: error.message,
      }).build();
    }
  }

  async validate(context: CommandContext): Promise<boolean> {
    const { commandData } = context;

    // Username is required
    if (!commandData.username || commandData.username.trim().length === 0) {
      return false;
    }

    // Basic username validation
    const username = commandData.username.trim();
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

    return usernameRegex.test(username);
  }
}
