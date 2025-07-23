import { CommandContext } from './command-context.interface';
import { CommandResult } from './command-result.interface';

export interface CommandHandler {
  readonly command: string;
  readonly aliases?: string[];
  readonly description: string;
  readonly category: CommandCategory;
  readonly adminOnly?: boolean;
  readonly requiresAuth?: boolean;
  readonly requiresSession?: boolean;

  execute(context: CommandContext): Promise<CommandResult>;
  validate?(context: CommandContext): Promise<boolean>;
}

export enum CommandCategory {
  TRANSACTION = 'transaction',
  ACCOUNT = 'account',
  ADMIN = 'admin',
  HELP = 'help',
  UTILITY = 'utility',
  GROUP = 'group',
}

export interface CommandMetadata {
  command: string;
  aliases?: string[];
  description: string;
  category: CommandCategory;
  usage?: string;
  examples?: string[];
  adminOnly?: boolean;
  requiresAuth?: boolean;
  requiresSession?: boolean;
}