import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { CommandParserService, CommandType, ParsedCommand } from './command-parser.service';
import { BalanceTemplate } from '../templates/balance-template';
import { AccountLinkRequestDto } from '../../auth/dto/account-link-request.dto';
import { VerifyOtpDto } from '../../auth/dto/verify-otp.dto';
import { UserSession } from '../../auth/interfaces/user-session.interface';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly flashApiService: FlashApiService,
    private readonly balanceService: BalanceService,
    private readonly geminiAiService: GeminiAiService,
    private readonly commandParserService: CommandParserService,
    private readonly balanceTemplate: BalanceTemplate,
  ) {}

  /**
   * Process incoming message from WhatsApp Cloud API
   */
  async processCloudMessage(messageData: {
    from: string;
    text: string;
    messageId: string;
    timestamp: string;
    name?: string;
  }): Promise<string> {
    try {
      const whatsappId = this.extractWhatsappId(messageData.from);
      const phoneNumber = this.normalizePhoneNumber(messageData.from);
      
      this.logger.log(`Processing Cloud API message from ${whatsappId}: ${messageData.text}`);
      
      // Store the incoming message for traceability
      await this.storeCloudMessage(messageData);
      
      // Parse command from message
      const command = this.commandParserService.parseCommand(messageData.text);
      
      // Get session if it exists
      let session = await this.sessionService.getSessionByWhatsappId(whatsappId);
      
      // Handle the command
      return this.handleCommand(command, whatsappId, phoneNumber, session);
    } catch (error) {
      this.logger.error(`Error processing cloud message: ${error.message}`, error.stack);
      return "I'm sorry, something went wrong. Please try again later.";
    }
  }

  /**
   * Handle parsed command
   */
  private async handleCommand(
    command: ParsedCommand, 
    whatsappId: string, 
    phoneNumber: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      switch (command.type) {
        case CommandType.HELP:
          return this.getHelpMessage(session);
          
        case CommandType.LINK:
          return this.handleLinkCommand(whatsappId, phoneNumber);
          
        case CommandType.VERIFY:
          return this.handleVerifyCommand(command, whatsappId, session);
          
        case CommandType.BALANCE:
          return this.handleBalanceCommand(whatsappId, session);
          
        case CommandType.CONSENT:
          return this.handleConsentCommand(command, whatsappId, session);
          
        case CommandType.UNKNOWN:
        default:
          // If user has a linked account, try to use AI to respond
          if (session?.isVerified) {
            return this.handleAiQuery(command.rawText, session);
          } else {
            return this.getUnknownCommandMessage(session);
          }
      }
    } catch (error) {
      this.logger.error(`Error handling command: ${error.message}`, error.stack);
      return "I'm sorry, something went wrong. Please try again later.";
    }
  }

  /**
   * Handle account linking command
   */
  private async handleLinkCommand(whatsappId: string, phoneNumber: string): Promise<string> {
    try {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId,
        phoneNumber,
      };
      
      const result = await this.authService.initiateAccountLinking(linkRequest);
      
      if (result.otpSent) {
        return 'To link your Flash account, please enter the verification code sent to your Flash app. Type "verify" followed by the 6-digit code (e.g., "verify 123456").';
      } else {
        return 'Your Flash account is already linked! You can check your balance or use other commands.';
      }
    } catch (error) {
      this.logger.error(`Error handling link command: ${error.message}`, error.stack);
      
      if (error.message.includes('No Flash account found')) {
        return "We couldn't find a Flash account with your phone number. Please make sure you're using the same number registered with Flash.";
      }
      
      return "We're having trouble linking your account. Please try again later or contact support.";
    }
  }

  /**
   * Handle OTP verification command
   */
  private async handleVerifyCommand(command: ParsedCommand, whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      // Check if we have an OTP in the command
      const otpCode = command.args.otp;
      
      if (!otpCode) {
        return 'Please provide your 6-digit verification code. For example: "verify 123456".';
      }
      
      if (!session) {
        return 'Please start the account linking process first by typing "link".';
      }
      
      const verifyDto: VerifyOtpDto = {
        sessionId: session.sessionId,
        otpCode,
      };
      
      await this.authService.verifyAccountLinking(verifyDto);
      
      return 'Your Flash account has been successfully linked! You can now check your balance and use other Flash services through WhatsApp.';
    } catch (error) {
      this.logger.error(`Error handling verify command: ${error.message}`, error.stack);
      
      if (error.message.includes('Invalid or expired OTP')) {
        return 'The verification code is invalid or has expired. Please try linking your account again by typing "link".';
      }
      
      return "We're having trouble verifying your account. Please try again later or contact support.";
    }
  }

  /**
   * Handle balance check command
   */
  private async handleBalanceCommand(whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      if (!session) {
        return 'Please link your Flash account first by typing "link".';
      }
      
      if (!session.isVerified || !session.flashUserId) {
        return 'Your account is not fully verified. Please complete the linking process first.';
      }
      
      // Check if MFA is required
      const mfaValidated = await this.sessionService.isMfaValidated(session.sessionId);
      
      if (!mfaValidated) {
        // Request MFA verification
        await this.authService.requestMfaVerification(session.sessionId);
        
        return 'For security, we need to verify your identity. Please check your Flash app for a verification code and enter it by typing "verify" followed by the code (e.g., "verify 123456").';
      }
      
      // Get balance from Flash API
      const balanceInfo = await this.balanceService.getUserBalance(session.flashUserId);
      
      // Format and return the balance message using the template
      return this.balanceTemplate.generateBalanceMessage({
        btcBalance: balanceInfo.btcBalance,
        fiatBalance: balanceInfo.fiatBalance,
        fiatCurrency: balanceInfo.fiatCurrency,
        lastUpdated: balanceInfo.lastUpdated,
        userName: session.profileName,
      });
    } catch (error) {
      this.logger.error(`Error handling balance command: ${error.message}`, error.stack);
      
      if (error.message.includes('Multi-factor authentication required')) {
        return 'For security, we need to verify your identity. Please check your Flash app for a verification code and enter it by typing "verify" followed by the code (e.g., "verify 123456").';
      }
      
      return "We're having trouble retrieving your balance. Please try again later or contact support.";
    }
  }

  /**
   * Handle consent command
   */
  private async handleConsentCommand(command: ParsedCommand, whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      if (!session) {
        return 'Please link your Flash account first by typing "link".';
      }
      
      const choice = command.args.choice;
      
      if (choice === 'yes') {
        await this.authService.recordConsent(session.sessionId, true);
        return 'Thank you for providing your consent. You can now use all Flash services through WhatsApp.';
      } else if (choice === 'no') {
        await this.authService.recordConsent(session.sessionId, false);
        return 'You have declined to provide consent. Some services will be limited. You can change this at any time by typing "consent yes".';
      } else {
        return 'Please specify your consent choice by typing "consent yes" or "consent no".';
      }
    } catch (error) {
      this.logger.error(`Error handling consent command: ${error.message}`, error.stack);
      return "We're having trouble processing your consent. Please try again later or contact support.";
    }
  }

  /**
   * Handle AI query using Maple AI
   */
  private async handleAiQuery(query: string, session: UserSession): Promise<string> {
    try {
      if (!session.consentGiven) {
        return 'To use AI-powered support, please provide your consent by typing "consent yes".';
      }
      
      // Create context with user info, but remove sensitive data
      const context = {
        userId: session.flashUserId,
        whatsappId: session.whatsappId,
        isVerified: session.isVerified,
        consentGiven: session.consentGiven,
      };
      
      const response = await this.geminiAiService.processQuery(query, context);
      return response;
    } catch (error) {
      this.logger.error(`Error handling AI query: ${error.message}`, error.stack);
      return "I'm sorry, I couldn't process your question. Please try again later or contact Flash support for assistance.";
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(to: string, body: string): Promise<any> {
    try {
      if (!this.twilioClient) {
        throw new Error('Twilio client not initialized');
      }
      
      const from = this.configService.get<string>('twilio.whatsappNumber');
      
      if (!from) {
        throw new Error('WhatsApp number not configured');
      }
      
      // Ensure 'to' has whatsapp: prefix if not already present
      const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      const formattedFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
      
      const result = await this.twilioClient.messages.create({
        from: formattedFrom,
        to: formattedTo,
        body,
      });
      
      this.logger.log(`Message sent to ${to}, SID: ${result.sid}`);
      return result;
    } catch (error) {
      this.logger.error(`Error sending WhatsApp message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Store incoming message in Redis for traceability
   */
  private async storeCloudMessage(messageData: {
    from: string;
    text: string;
    messageId: string;
    timestamp: string;
    name?: string;
  }): Promise<void> {
    const key = `whatsapp:message:${messageData.messageId}`;
    const value = JSON.stringify({
      ...messageData,
      storedAt: new Date().toISOString(),
    });
    const expiryInSeconds = 60 * 60 * 24 * 7; // 7 days
    
    await this.redisService.set(key, value, expiryInSeconds);
  }

  /**
   * Extract WhatsApp ID from the From field
   */
  private extractWhatsappId(from: string): string {
    // Remove 'whatsapp:' prefix and any '+' sign
    return from.replace('whatsapp:', '').replace('+', '');
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(from: string): string {
    // Remove 'whatsapp:' prefix
    const number = from.replace('whatsapp:', '');
    
    // Already has + sign, return as is
    if (number.startsWith('+')) {
      return number;
    }
    
    // Add + sign
    return `+${number}`;
  }

  /**
   * Get help message based on session status
   */
  private getHelpMessage(session: UserSession | null): string {
    if (!session) {
      return 'Welcome to the Flash WhatsApp service! Here are the available commands:\n\n• link - Connect your Flash account\n• help - Show available commands\n\nTo get started, please link your Flash account by typing "link".';
    }
    
    if (!session.isVerified) {
      return 'Here are the available commands:\n\n• link - Connect your Flash account\n• verify [code] - Enter verification code\n• help - Show available commands\n\nPlease complete the account linking process to access more features.';
    }
    
    return 'Here are the available commands for Flash:\n\n• balance - Check your Bitcoin and fiat balance\n• link - Manage your account connection\n• consent [yes/no] - Manage your AI support consent\n• help - Show available commands\n\nYou can also ask me questions about Flash services and I\'ll do my best to assist you!';
  }

  /**
   * Get unknown command message based on session status
   */
  private getUnknownCommandMessage(session: UserSession | null): string {
    if (!session || !session.isVerified) {
      return "I don't understand that command. Type 'help' to see available commands. Please link your Flash account to access all features.";
    }
    
    return "I'm not sure what you're asking. You can type 'help' to see available commands, or ask me questions about Flash services.";
  }
}