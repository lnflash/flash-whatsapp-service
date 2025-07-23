import { Injectable } from '@nestjs/common';
import { BaseCommandHandler } from '../base/base-command.handler';
import { CommandCategory } from '../base/command-handler.interface';
import { CommandContext } from '../base/command-context.interface';
import { CommandResult, CommandResultBuilder, CommandErrorCode } from '../base/command-result.interface';
import { CommandType } from '../../services/command-parser.service';
import { CommandRegistry } from '../command-registry.service';
import { VoiceResponseService } from '../../services/voice-response.service';
import { OnboardingService } from '../../services/onboarding.service';
import { ContextualHelpService } from '../../services/contextual-help.service';

@Injectable()
export class HelpCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly commandRegistry: CommandRegistry,
    private readonly voiceResponseService: VoiceResponseService,
    private readonly onboardingService: OnboardingService,
    private readonly contextualHelpService: ContextualHelpService,
  ) {
    super({
      command: 'help',
      aliases: ['h', '?', 'commands'],
      description: 'Show available commands and help information',
      category: CommandCategory.HELP,
      requiresAuth: false,
    });
  }

  protected async handleCommand(context: CommandContext): Promise<CommandResult> {
    const { commandData } = context;

    // Check for specific command help
    if (commandData.specificCommand) {
      return this.getCommandHelp(context, commandData.specificCommand);
    }

    // Check for category help
    if (commandData.category) {
      return this.getCategoryHelp(context, commandData.category);
    }

    // Check if user needs onboarding
    if (!context.session && !context.isGroup) {
      return await this.getOnboardingHelp(context);
    }

    // Get contextual help based on user state
    if (context.session) {
      return this.getContextualHelp(context);
    }

    // Default help
    return await this.getGeneralHelp(context);
  }

  private async getGeneralHelp(context: CommandContext): Promise<CommandResult> {
    const commands = this.commandRegistry.getCommandsForHelp(context.isAdmin);
    
    let helpMessage = '*📱 Flash Bitcoin Wallet - Available Commands*\n\n';

    // Group commands by category
    for (const [category, handlers] of commands) {
      helpMessage += `*${this.formatCategoryName(category)}*\n`;
      
      for (const handler of handlers) {
        const aliases = handler.aliases?.length ? ` (${handler.aliases.join(', ')})` : '';
        helpMessage += `• /${handler.command}${aliases} - ${handler.description}\n`;
      }
      
      helpMessage += '\n';
    }

    helpMessage += '_Use /help <command> for detailed information about a specific command._\n';
    helpMessage += '_For example: /help send_';

    if (context.isVoiceCommand) {
      const voiceResponse = await this.voiceResponseService.generateNaturalVoiceResponse(
        CommandType.HELP,
        helpMessage,
        {},
        { language: context.language || 'en' },
      );
      const voiceBuffer = Buffer.from(voiceResponse);

      return CommandResultBuilder.success(helpMessage)
        .withVoice(voiceBuffer)
        .build();
    }

    return CommandResultBuilder.success(helpMessage).build();
  }

  private getCommandHelp(context: CommandContext, commandName: string): CommandResult {
    const handler = this.commandRegistry.getHandler(commandName);
    
    if (!handler) {
      return CommandResultBuilder.error({
        code: CommandErrorCode.INVALID_ARGUMENTS,
        message: `❌ Command "${commandName}" not found. Use /help to see available commands.`,
      }).build();
    }

    // Don't show admin commands to non-admin users
    if (handler.adminOnly && !context.isAdmin) {
      return CommandResultBuilder.error({
        code: CommandErrorCode.INVALID_ARGUMENTS,
        message: `❌ Command "${commandName}" not found. Use /help to see available commands.`,
      }).build();
    }

    let helpMessage = `*📖 Command: /${handler.command}*\n\n`;
    helpMessage += `${handler.description}\n\n`;

    if (handler.aliases?.length) {
      helpMessage += `*Aliases:* ${handler.aliases.map(a => `/${a}`).join(', ')}\n\n`;
    }

    // Add usage examples based on command
    const examples = this.getCommandExamples(handler.command);
    if (examples.length > 0) {
      helpMessage += '*Examples:*\n';
      examples.forEach(example => {
        helpMessage += `• ${example}\n`;
      });
    }

    return CommandResultBuilder.success(helpMessage).build();
  }

  private getCategoryHelp(context: CommandContext, categoryName: string): CommandResult {
    const category = this.parseCategoryName(categoryName);
    if (!category) {
      return CommandResultBuilder.error({
        code: CommandErrorCode.INVALID_ARGUMENTS,
        message: `❌ Category "${categoryName}" not found.`,
      }).build();
    }

    const handlers = this.commandRegistry.getHandlersByCategory(category);
    const filteredHandlers = handlers.filter(h => !h.adminOnly || context.isAdmin);

    if (filteredHandlers.length === 0) {
      return CommandResultBuilder.error({
        code: CommandErrorCode.INVALID_ARGUMENTS,
        message: `❌ No commands available in category "${categoryName}".`,
      }).build();
    }

    let helpMessage = `*📂 ${this.formatCategoryName(category)} Commands*\n\n`;

    for (const handler of filteredHandlers) {
      const aliases = handler.aliases?.length ? ` (${handler.aliases.join(', ')})` : '';
      helpMessage += `• /${handler.command}${aliases} - ${handler.description}\n`;
    }

    return CommandResultBuilder.success(helpMessage).build();
  }

  private async getOnboardingHelp(context: CommandContext): Promise<CommandResult> {
    const onboardingMessage = await this.onboardingService.getWelcomeMessage(context.whatsappId);
    
    if (context.isVoiceCommand) {
      const voiceResponse = await this.voiceResponseService.generateNaturalVoiceResponse(
        CommandType.HELP,
        onboardingMessage,
        {},
        { language: context.language || 'en' },
      );
      const voiceBuffer = Buffer.from(voiceResponse);

      return CommandResultBuilder.success(onboardingMessage)
        .withVoice(voiceBuffer)
        .build();
    }

    return CommandResultBuilder.success(onboardingMessage).build();
  }

  private getContextualHelp(context: CommandContext): CommandResult {
    // TODO: Implement contextual help based on user activity
    const helpMessage = `*💡 Quick Tips*\n\n` +
      `• Check your balance: /balance\n` +
      `• Send Bitcoin: /send <amount> to <username>\n` +
      `• Request payment: /receive <amount> from <username>\n` +
      `• View transactions: /transactions\n\n` +
      `Need more help? Type /help`;

    return CommandResultBuilder.success(helpMessage).build();
  }

  private formatCategoryName(category: CommandCategory): string {
    const names: Record<CommandCategory, string> = {
      [CommandCategory.TRANSACTION]: '💸 Transactions',
      [CommandCategory.ACCOUNT]: '👤 Account',
      [CommandCategory.ADMIN]: '👨‍💼 Admin',
      [CommandCategory.HELP]: '❓ Help & Info',
      [CommandCategory.UTILITY]: '🛠️ Utilities',
      [CommandCategory.GROUP]: '👥 Group',
    };

    return names[category] || category;
  }

  private parseCategoryName(name: string): CommandCategory | null {
    const normalized = name.toLowerCase();
    
    for (const category of Object.values(CommandCategory)) {
      if (category.toLowerCase() === normalized) {
        return category;
      }
    }

    // Check common aliases
    const aliases: Record<string, CommandCategory> = {
      'tx': CommandCategory.TRANSACTION,
      'payment': CommandCategory.TRANSACTION,
      'payments': CommandCategory.TRANSACTION,
      'account': CommandCategory.ACCOUNT,
      'profile': CommandCategory.ACCOUNT,
      'admin': CommandCategory.ADMIN,
      'management': CommandCategory.ADMIN,
      'help': CommandCategory.HELP,
      'info': CommandCategory.HELP,
      'util': CommandCategory.UTILITY,
      'utils': CommandCategory.UTILITY,
      'tools': CommandCategory.UTILITY,
      'group': CommandCategory.GROUP,
      'groups': CommandCategory.GROUP,
    };

    return aliases[normalized] || null;
  }

  private getCommandExamples(command: string): string[] {
    const examples: Record<string, string[]> = {
      'send': [
        '/send 0.001 btc to @alice',
        '/send 50 usd to @bob',
        '/send 100 eur to alice',
      ],
      'receive': [
        '/receive 0.001 btc',
        '/receive 20 usd',
        '/receive 50 eur from @alice',
      ],
      'balance': [
        '/balance',
        '/bal',
      ],
      'link': [
        '/link myusername',
        '/link alice123',
      ],
      'price': [
        '/price',
        '/price usd',
        '/price eur',
      ],
      'transactions': [
        '/transactions',
        '/transactions 10',
        '/tx 5',
      ],
    };

    return examples[command] || [];
  }
}