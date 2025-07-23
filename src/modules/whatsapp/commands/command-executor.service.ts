import { Injectable, Logger } from '@nestjs/common';
import { CommandRegistry } from './command-registry.service';
import { CommandContextBuilder } from './base/command-context.builder';
import { CommandContext } from './base/command-context.interface';
import { CommandResult, CommandResultBuilder, CommandErrorCode } from './base/command-result.interface';
import { CommandType, CommandData } from '../services/command-parser.service';
import { UserSession } from '../../auth/interfaces/user-session.interface';
import { AdminSettingsService } from '../services/admin-settings.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class CommandExecutorService {
  private readonly logger = new Logger(CommandExecutorService.name);

  constructor(
    private readonly commandRegistry: CommandRegistry,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async executeCommand(params: {
    messageId: string;
    whatsappId: string;
    phoneNumber: string;
    command: CommandType;
    commandData: CommandData;
    rawText: string;
    session?: UserSession;
    isGroup?: boolean;
    groupId?: string;
    groupName?: string;
    isVoiceCommand?: boolean;
    language?: string;
    instancePhone?: string;
    metadata?: Record<string, any>;
  }): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // Build command context
      const contextBuilder = CommandContextBuilder.create()
        .withMessage(params.messageId, params.whatsappId, params.phoneNumber)
        .withCommand(params.command, params.commandData, params.rawText)
        .withVoiceCommand(params.isVoiceCommand || false)
        .withLanguage(params.language || 'en')
        .withMetadata(params.metadata || {});

      if (params.session) {
        contextBuilder.withSession(params.session);
      }

      if (params.isGroup && params.groupId) {
        contextBuilder.withGroup(params.groupId, params.groupName);
      }

      if (params.instancePhone) {
        contextBuilder.withInstancePhone(params.instancePhone);
      }

      // Check if user is admin
      const isAdmin = await this.adminSettingsService.isAdmin(params.whatsappId);
      contextBuilder.withAdmin(isAdmin);

      const context = contextBuilder.build();

      // Find handler
      const handler = this.commandRegistry.getHandlerByCommandType(params.command);
      
      if (!handler) {
        this.logger.warn(`No handler found for command: ${params.command}`);
        return this.createUnknownCommandResult(context);
      }

      // Emit pre-execution event
      await this.eventEmitter.emitAsync('command.pre-execute', {
        command: params.command,
        context,
        handler: handler.command,
      });

      // Execute command
      const result = await handler.execute(context);

      // Add metrics
      result.executionTime = Date.now() - startTime;

      // Emit post-execution event
      await this.eventEmitter.emitAsync('command.post-execute', {
        command: params.command,
        context,
        handler: handler.command,
        result,
        executionTime: result.executionTime,
      });

      return result;

    } catch (error) {
      this.logger.error(`Error executing command ${params.command}:`, error);

      // Emit error event
      await this.eventEmitter.emitAsync('command.error', {
        command: params.command,
        error,
        executionTime: Date.now() - startTime,
      });

      return CommandResultBuilder.error({
        code: CommandErrorCode.INTERNAL_ERROR,
        message: '❌ An error occurred processing your command. Please try again.',
        details: error.message,
      }).build();
    }
  }

  private createUnknownCommandResult(context: CommandContext): CommandResult {
    // For voice commands, suggest using help
    if (context.isVoiceCommand) {
      return CommandResultBuilder.error({
        code: CommandErrorCode.INVALID_ARGUMENTS,
        message: 'I didn\'t understand that command. Try saying "help" to see available commands.',
      }).build();
    }

    // For text commands, provide more detailed help
    const availableCommands = this.commandRegistry.getAllHandlers()
      .filter(h => !h.adminOnly || context.isAdmin)
      .map(h => `/${h.command}`)
      .slice(0, 5)
      .join(', ');

    return CommandResultBuilder.error({
      code: CommandErrorCode.INVALID_ARGUMENTS,
      message: `❌ Unknown command. Try one of these: ${availableCommands}\n\nUse /help to see all available commands.`,
    }).build();
  }

  /**
   * Get command suggestions based on partial input
   */
  getCommandSuggestions(partialCommand: string, isAdmin = false): string[] {
    const handlers = this.commandRegistry.getAllHandlers()
      .filter(h => !h.adminOnly || isAdmin);

    const suggestions: string[] = [];
    const partial = partialCommand.toLowerCase();

    for (const handler of handlers) {
      // Check main command
      if (handler.command.toLowerCase().startsWith(partial)) {
        suggestions.push(handler.command);
      }

      // Check aliases
      if (handler.aliases) {
        for (const alias of handler.aliases) {
          if (alias.toLowerCase().startsWith(partial)) {
            suggestions.push(alias);
          }
        }
      }
    }

    // Remove duplicates and limit results
    return [...new Set(suggestions)].slice(0, 5);
  }

  /**
   * Validate if a command exists
   */
  isValidCommand(command: string, isAdmin = false): boolean {
    const handler = this.commandRegistry.getHandler(command);
    
    if (!handler) {
      return false;
    }

    // Check admin permission
    if (handler.adminOnly && !isAdmin) {
      return false;
    }

    return true;
  }

  /**
   * Get metrics for command execution
   */
  async getCommandMetrics(): Promise<{
    totalCommands: number;
    commandsByType: Record<string, number>;
    averageExecutionTime: number;
    errorRate: number;
  }> {
    // This would typically fetch from a metrics service
    // For now, return placeholder data
    return {
      totalCommands: 0,
      commandsByType: {},
      averageExecutionTime: 0,
      errorRate: 0,
    };
  }
}