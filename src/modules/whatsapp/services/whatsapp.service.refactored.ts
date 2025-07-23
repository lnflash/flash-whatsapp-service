import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { GroupAuthService } from '../../auth/services/group-auth.service';
import { CommandParserService, CommandType } from './command-parser.service';
import { CommandExecutorService } from '../commands/command-executor.service';
import { CommandResult } from '../commands/base/command-result.interface';
import { WhatsAppWebService } from './whatsapp-web.service';
import { VoiceResponseService } from './voice-response.service';
import { OnboardingService } from './onboarding.service';
import { UserKnowledgeBaseService } from './user-knowledge-base.service';
import { RandomQuestionService } from './random-question.service';
import { AdminSettingsService } from './admin-settings.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RequestDeduplicatorService } from '../../common/services/request-deduplicator.service';

@Injectable()
export class WhatsappServiceRefactored {
  private readonly logger = new Logger(WhatsappServiceRefactored.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => GroupAuthService))
    private readonly groupAuthService: GroupAuthService,
    private readonly commandParser: CommandParserService,
    private readonly commandExecutor: CommandExecutorService,
    private readonly whatsappWeb: WhatsAppWebService,
    private readonly voiceResponseService: VoiceResponseService,
    private readonly onboardingService: OnboardingService,
    private readonly knowledgeBaseService: UserKnowledgeBaseService,
    private readonly randomQuestionService: RandomQuestionService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly deduplicator: RequestDeduplicatorService,
  ) {}

  /**
   * Process incoming WhatsApp message
   */
  async processCloudMessage(data: {
    from: string;
    text?: string;
    messageId: string;
    timestamp: string;
    name?: string;
    isVoiceCommand?: boolean;
    whatsappId: string;
    isGroup?: boolean;
    groupId?: string;
    groupName?: string;
    instancePhone?: string;
  }): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean } | null> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Processing message from ${data.from}: ${data.text?.substring(0, 50)}...`);

      // Extract phone number
      const phoneNumber = data.from.replace('@c.us', '').replace('@g.us', '');

      // Check if it's a group message
      const isGroup = data.isGroup || data.from.includes('@g.us');
      const groupId = isGroup ? (data.groupId || data.from) : undefined;

      // Handle voice commands
      let messageText = data.text || '';
      let isVoiceCommand = data.isVoiceCommand || false;

      if (isVoiceCommand && !messageText) {
        // Transcribe voice message if needed
        // This would be handled by the voice processing pipeline
        return null;
      }

      // Get or create session
      const session = await this.getOrCreateSession(data.whatsappId, phoneNumber, isGroup, groupId);

      // Check for AI questions first
      if (await this.isAIQuestion(messageText, data.whatsappId, isGroup)) {
        return this.handleAIQuestion(messageText, data.whatsappId, session?.username, isGroup);
      }

      // Parse command
      const parsedCommand = this.commandParser.parseCommand(messageText);

      // If no valid command found, check for contextual responses
      if (parsedCommand.type === CommandType.UNKNOWN) {
        return this.handleUnknownInput(messageText, data.whatsappId, session, isGroup);
      }

      // Execute command through the new command architecture
      const result = await this.commandExecutor.executeCommand({
        messageId: data.messageId,
        whatsappId: data.whatsappId,
        phoneNumber,
        command: parsedCommand.type,
        commandData: parsedCommand.args,
        rawText: messageText,
        session,
        isGroup,
        groupId,
        groupName: data.groupName,
        isVoiceCommand,
        language: session?.language || 'en',
        instancePhone: data.instancePhone,
        metadata: {
          timestamp: data.timestamp,
          name: data.name,
        },
      });

      // Convert CommandResult to response format
      return this.formatCommandResult(result, isVoiceCommand);

    } catch (error) {
      this.logger.error('Error processing message:', error);
      
      // Emit error event
      await this.eventEmitter.emitAsync('message.error', {
        error,
        data,
        executionTime: Date.now() - startTime,
      });

      return '❌ An error occurred processing your message. Please try again.';
    }
  }

  /**
   * Get or create session for user
   */
  private async getOrCreateSession(
    whatsappId: string,
    phoneNumber: string,
    isGroup: boolean,
    groupId?: string,
  ) {
    try {
      if (isGroup && groupId) {
        // Check for group authentication
        const groupAuth = await this.groupAuthService.getAuthenticatedUser(groupId, whatsappId);
        if (groupAuth?.session) {
          return groupAuth.session;
        }
      }

      // Get individual session
      return await this.sessionService.getActiveSession(whatsappId);
    } catch (error) {
      this.logger.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Check if message is an AI question
   */
  private async isAIQuestion(text: string, whatsappId: string, isGroup: boolean): Promise<boolean> {
    // Don't process commands as AI questions
    if (text.startsWith('/')) {
      return false;
    }

    // Check for question indicators
    const questionIndicators = ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'which'];
    const hasQuestionIndicator = questionIndicators.some(indicator => 
      text.toLowerCase().includes(indicator)
    );

    if (!hasQuestionIndicator) {
      return false;
    }

    // In groups, only respond to direct questions or if AI is enabled
    if (isGroup) {
      const groupAIEnabled = await this.adminSettingsService.isGroupAIEnabled();
      return groupAIEnabled;
    }

    // For individual chats, check if user has AI consent
    return this.knowledgeBaseService.hasAIConsent(whatsappId);
  }

  /**
   * Handle AI questions
   */
  private async handleAIQuestion(
    question: string,
    whatsappId: string,
    username?: string,
    isGroup?: boolean,
  ): Promise<string> {
    try {
      // Check for AI consent
      const hasConsent = await this.knowledgeBaseService.hasAIConsent(whatsappId);
      
      if (!hasConsent && !isGroup) {
        // Ask for consent
        return await this.knowledgeBaseService.requestAIConsent(whatsappId);
      }

      // Process the question
      const response = await this.knowledgeBaseService.processQuestion(
        question,
        whatsappId,
        username,
      );

      return response;
    } catch (error) {
      this.logger.error('Error handling AI question:', error);
      return '❌ Sorry, I couldn\'t process your question. Please try again.';
    }
  }

  /**
   * Handle unknown input (not a command)
   */
  private async handleUnknownInput(
    text: string,
    whatsappId: string,
    session: any,
    isGroup: boolean,
  ): Promise<string | null> {
    // In groups, ignore non-commands unless it's a question
    if (isGroup) {
      return null;
    }

    // Check for common greetings
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
    if (greetings.some(g => text.toLowerCase().includes(g))) {
      if (!session) {
        return this.onboardingService.getWelcomeMessage();
      }
      return `Hello ${session.username}! 👋\n\nHow can I help you today? Type /help to see available commands.`;
    }

    // Check for thank you messages
    const thankYous = ['thank', 'thanks', 'thx', 'ty'];
    if (thankYous.some(t => text.toLowerCase().includes(t))) {
      return '😊 You\'re welcome! Let me know if you need anything else.';
    }

    // For other unknown input, suggest help
    return 'I didn\'t understand that. Try /help to see available commands.';
  }

  /**
   * Format CommandResult to response format
   */
  private formatCommandResult(
    result: CommandResult,
    isVoiceCommand: boolean,
  ): string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean } {
    // Handle errors
    if (!result.success && result.error) {
      return result.error.message || '❌ An error occurred.';
    }

    // Build response object
    const response: any = {
      text: result.message || '',
    };

    // Add media if present
    if (result.media) {
      response.media = result.media;
      if (result.mediaCaption) {
        response.text = result.mediaCaption;
      }
    }

    // Add voice if present
    if (result.voice) {
      response.voice = result.voice;
      response.voiceOnly = result.voiceOnly || false;
    }

    // If only text, return string
    if (!response.media && !response.voice) {
      return response.text;
    }

    return response;
  }

  /**
   * Send a message to a WhatsApp number
   */
  async sendMessage(
    to: string,
    message: string | { text: string; media?: Buffer; voice?: Buffer },
    instancePhone?: string,
  ): Promise<void> {
    try {
      if (typeof message === 'string') {
        await this.whatsappWeb.sendMessage(to, message, undefined, instancePhone);
      } else {
        if (message.voice) {
          await this.whatsappWeb.sendVoiceMessage(to, message.voice, instancePhone);
        } else if (message.media) {
          await this.whatsappWeb.sendImage(to, message.media, message.text, instancePhone);
        } else {
          await this.whatsappWeb.sendMessage(to, message.text, undefined, instancePhone);
        }
      }
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw error;
    }
  }
}