import { Logger } from '@nestjs/common';
import { CommandHandler, CommandCategory, CommandMetadata } from './command-handler.interface';
import { CommandContext } from './command-context.interface';
import {
  CommandResult,
  CommandResultBuilder,
  CommandError,
  CommandErrorCode,
} from './command-result.interface';

export abstract class BaseCommandHandler implements CommandHandler {
  protected readonly logger: Logger;

  readonly command: string;
  readonly aliases?: string[];
  readonly description: string;
  readonly category: CommandCategory;
  readonly adminOnly?: boolean;
  readonly requiresAuth?: boolean;
  readonly requiresSession?: boolean;

  constructor(metadata: CommandMetadata) {
    this.command = metadata.command;
    this.aliases = metadata.aliases;
    this.description = metadata.description;
    this.category = metadata.category;
    this.adminOnly = metadata.adminOnly;
    this.requiresAuth = metadata.requiresAuth;
    this.requiresSession = metadata.requiresSession;

    this.logger = new Logger(`${this.constructor.name}`);
  }

  async execute(context: CommandContext): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // Pre-execution validation
      if (this.requiresAuth && !context.session) {
        return this.createAuthRequiredError();
      }

      if (this.requiresSession && !context.flashUserId) {
        return this.createSessionRequiredError();
      }

      if (this.adminOnly && !context.isAdmin) {
        return this.createInsufficientPermissionsError();
      }

      // Custom validation
      if (this.validate) {
        const isValid = await this.validate(context);
        if (!isValid) {
          return this.createValidationError(context);
        }
      }

      // Execute command
      const result = await this.handleCommand(context);

      // Add execution metrics
      result.executionTime = Date.now() - startTime;

      return result;
    } catch (error) {
      this.logger.error(`Error executing command ${this.command}:`, error);

      return CommandResultBuilder.error({
        code: CommandErrorCode.INTERNAL_ERROR,
        message: 'An error occurred processing your command. Please try again.',
        details: error.message,
      }).build();
    }
  }

  protected abstract handleCommand(context: CommandContext): Promise<CommandResult>;

  async validate?(context: CommandContext): Promise<boolean>;

  protected createAuthRequiredError(): CommandResult {
    return CommandResultBuilder.error({
      code: CommandErrorCode.NOT_AUTHENTICATED,
      message: '🔐 Please link your account first using */link <username>*',
    }).build();
  }

  protected createSessionRequiredError(): CommandResult {
    return CommandResultBuilder.error({
      code: CommandErrorCode.SESSION_EXPIRED,
      message:
        '🔐 Your session has expired. Please link your account again using */link <username>*',
    }).build();
  }

  protected createInsufficientPermissionsError(): CommandResult {
    return CommandResultBuilder.error({
      code: CommandErrorCode.INSUFFICIENT_PERMISSIONS,
      message: '❌ You do not have permission to use this command.',
    }).build();
  }

  protected createValidationError(context: CommandContext): CommandResult {
    return CommandResultBuilder.error({
      code: CommandErrorCode.INVALID_ARGUMENTS,
      message: '❌ Invalid command format. Please check your input and try again.',
      details: context.commandData,
    }).build();
  }

  protected formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    }).format(amount);
  }

  protected formatCurrency(amount: number, currency: string): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return formatter.format(amount);
  }
}
