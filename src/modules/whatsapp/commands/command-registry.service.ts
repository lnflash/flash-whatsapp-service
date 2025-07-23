import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CommandHandler, CommandCategory } from './base/command-handler.interface';
import { CommandType } from '../services/command-parser.service';

@Injectable()
export class CommandRegistry implements OnModuleInit {
  private readonly logger = new Logger(CommandRegistry.name);
  private readonly commands = new Map<string, CommandHandler>();
  private readonly aliases = new Map<string, string>();
  private readonly categories = new Map<CommandCategory, CommandHandler[]>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    await this.registerCommands();
  }

  private async registerCommands() {
    // This will be populated with actual command handlers
    const handlerTokens = [
      // We'll add these as we create the handlers
      'BalanceCommandHandler',
      'SendCommandHandler',
      'ReceiveCommandHandler',
      'HelpCommandHandler',
      'LinkCommandHandler',
      'PriceCommandHandler',
      'TransactionsCommandHandler',
      'SettingsCommandHandler',
    ];

    for (const token of handlerTokens) {
      try {
        const handler = await this.moduleRef.get<CommandHandler>(token, { strict: false });
        if (handler) {
          this.registerHandler(handler);
        }
      } catch (error) {
        // Handler not found, skip
        this.logger.debug(`Handler ${token} not found, skipping`);
      }
    }

    this.logger.log(`Registered ${this.commands.size} commands with ${this.aliases.size} aliases`);
  }

  registerHandler(handler: CommandHandler): void {
    // Register main command
    this.commands.set(handler.command.toLowerCase(), handler);

    // Register aliases
    if (handler.aliases) {
      for (const alias of handler.aliases) {
        this.aliases.set(alias.toLowerCase(), handler.command.toLowerCase());
      }
    }

    // Register by category
    if (!this.categories.has(handler.category)) {
      this.categories.set(handler.category, []);
    }
    this.categories.get(handler.category)!.push(handler);

    this.logger.debug(
      `Registered command: ${handler.command} with ${handler.aliases?.length || 0} aliases`,
    );
  }

  getHandler(command: string): CommandHandler | undefined {
    const normalizedCommand = command.toLowerCase();

    // Check direct command
    if (this.commands.has(normalizedCommand)) {
      return this.commands.get(normalizedCommand);
    }

    // Check aliases
    if (this.aliases.has(normalizedCommand)) {
      const mainCommand = this.aliases.get(normalizedCommand)!;
      return this.commands.get(mainCommand);
    }

    return undefined;
  }

  getHandlerByCommandType(commandType: CommandType): CommandHandler | undefined {
    // Map CommandType enum to command strings
    const commandMap: Partial<Record<CommandType, string>> = {
      [CommandType.BALANCE]: 'balance',
      [CommandType.SEND]: 'send',
      [CommandType.RECEIVE]: 'receive',
      [CommandType.HELP]: 'help',
      [CommandType.LINK]: 'link',
      [CommandType.PRICE]: 'price',
      [CommandType.HISTORY]: 'transactions',
      [CommandType.SETTINGS]: 'settings',
      [CommandType.ADMIN]: 'admin',
      [CommandType.UNKNOWN]: 'unknown',
      [CommandType.UNLINK]: 'unlink',
      [CommandType.VERIFY]: 'verify',
      [CommandType.CONSENT]: 'consent',
      [CommandType.REFRESH]: 'refresh',
      [CommandType.USERNAME]: 'username',
      [CommandType.REQUEST]: 'request',
      [CommandType.CONTACTS]: 'contacts',
      [CommandType.PAY]: 'pay',
      [CommandType.VYBZ]: 'vybz',
      [CommandType.PENDING]: 'pending',
      [CommandType.VOICE]: 'voice',
      [CommandType.UNDO]: 'undo',
      [CommandType.TEMPLATE]: 'template',
      [CommandType.SKIP]: 'skip',
      [CommandType.LEARN]: 'learn',
    };

    const commandString = commandMap[commandType];
    return commandString ? this.getHandler(commandString) : undefined;
  }

  getAllHandlers(): CommandHandler[] {
    return Array.from(this.commands.values());
  }

  getHandlersByCategory(category: CommandCategory): CommandHandler[] {
    return this.categories.get(category) || [];
  }

  getCategories(): CommandCategory[] {
    return Array.from(this.categories.keys());
  }

  getCommandList(): {
    command: string;
    aliases: string[];
    description: string;
    category: CommandCategory;
  }[] {
    return this.getAllHandlers().map((handler) => ({
      command: handler.command,
      aliases: handler.aliases || [],
      description: handler.description,
      category: handler.category,
    }));
  }

  hasCommand(command: string): boolean {
    return this.commands.has(command.toLowerCase()) || this.aliases.has(command.toLowerCase());
  }

  getAliases(command: string): string[] {
    const handler = this.getHandler(command);
    return handler?.aliases || [];
  }

  getCommandsForHelp(includeAdmin = false): Map<CommandCategory, CommandHandler[]> {
    const helpCommands = new Map<CommandCategory, CommandHandler[]>();

    for (const [category, handlers] of this.categories) {
      const filteredHandlers = handlers.filter((h) => includeAdmin || !h.adminOnly);
      if (filteredHandlers.length > 0) {
        helpCommands.set(category, filteredHandlers);
      }
    }

    return helpCommands;
  }
}
