import {
  CommandContext,
  CommandContextBuilder as ICommandContextBuilder,
} from './command-context.interface';
import { CommandType, CommandData } from '../../services/command-parser.service';
import { UserSession } from '../../../auth/interfaces/user-session.interface';

export class CommandContextBuilder implements ICommandContextBuilder {
  private context: Partial<CommandContext> = {
    platform: 'whatsapp',
    timestamp: new Date(),
    isGroup: false,
    metadata: {},
  };

  static create(): CommandContextBuilder {
    return new CommandContextBuilder();
  }

  withMessage(messageId: string, whatsappId: string, phoneNumber: string): CommandContextBuilder {
    this.context.messageId = messageId;
    this.context.whatsappId = whatsappId;
    this.context.phoneNumber = phoneNumber;
    return this;
  }

  withCommand(command: CommandType, data: CommandData, rawText: string): CommandContextBuilder {
    this.context.command = command;
    this.context.commandData = data;
    this.context.rawText = rawText;
    return this;
  }

  withGroup(groupId: string, groupName?: string): CommandContextBuilder {
    this.context.isGroup = true;
    this.context.groupId = groupId;
    this.context.groupName = groupName;
    return this;
  }

  withSession(session: UserSession): CommandContextBuilder {
    this.context.session = session;
    this.context.flashUserId = session.flashUserId;
    // Username might be in metadata or we need to fetch it separately
    this.context.username = session.metadata?.username;
    return this;
  }

  withAdmin(isAdmin: boolean): CommandContextBuilder {
    this.context.isAdmin = isAdmin;
    return this;
  }

  withVoiceCommand(isVoice: boolean): CommandContextBuilder {
    this.context.isVoiceCommand = isVoice;
    return this;
  }

  withLanguage(language: string): CommandContextBuilder {
    this.context.language = language;
    return this;
  }

  withInstancePhone(instancePhone: string): CommandContextBuilder {
    this.context.instancePhone = instancePhone;
    return this;
  }

  withMetadata(metadata: Record<string, any>): CommandContextBuilder {
    this.context.metadata = { ...this.context.metadata, ...metadata };
    return this;
  }

  build(): CommandContext {
    // Validate required fields
    if (!this.context.messageId || !this.context.whatsappId || !this.context.phoneNumber) {
      throw new Error('CommandContext missing required message fields');
    }

    if (!this.context.command || !this.context.commandData || !this.context.rawText) {
      throw new Error('CommandContext missing required command fields');
    }

    return this.context as CommandContext;
  }
}
