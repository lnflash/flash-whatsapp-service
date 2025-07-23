import { UserSession } from '../../../auth/interfaces/user-session.interface';
import { CommandType, CommandData } from '../../services/command-parser.service';

export interface CommandContext {
  // Message context
  messageId: string;
  whatsappId: string;
  phoneNumber: string;
  instancePhone?: string;
  timestamp: Date;

  // Command data
  command: CommandType;
  commandData: CommandData;
  rawText: string;

  // Group context
  isGroup: boolean;
  groupId?: string;
  groupName?: string;

  // User context
  session?: UserSession;
  flashUserId?: string;
  username?: string;
  isAdmin?: boolean;

  // Platform context
  platform: 'whatsapp';
  isVoiceCommand?: boolean;
  language?: string;

  // Additional metadata
  metadata?: Record<string, any>;
}

export interface CommandContextBuilder {
  withMessage(messageId: string, whatsappId: string, phoneNumber: string): CommandContextBuilder;
  withCommand(command: CommandType, data: CommandData, rawText: string): CommandContextBuilder;
  withGroup(groupId: string, groupName?: string): CommandContextBuilder;
  withSession(session: UserSession): CommandContextBuilder;
  withMetadata(metadata: Record<string, any>): CommandContextBuilder;
  build(): CommandContext;
}
