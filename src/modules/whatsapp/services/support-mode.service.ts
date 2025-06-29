import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { UserSession } from '../../auth/interfaces/user-session.interface';
import { FlashApiService } from '../../flash-api/flash-api.service';

export interface SupportSession {
  userId: string;
  userWhatsappId: string;
  supportAgentId: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'ended';
  conversationSummary: string;
  userInfo: {
    username?: string;
    phoneNumber: string;
    email?: string;
    npub?: string;
    balance?: {
      btc: string;
      usd: string;
    };
    deviceInfo?: string;
    appVersion?: string;
  };
}

@Injectable()
export class SupportModeService {
  private readonly logger = new Logger(SupportModeService.name);
  private readonly SUPPORT_PHONE: string;
  private readonly SUPPORT_SESSION_PREFIX = 'support_session:';
  private readonly SUPPORT_MODE_PREFIX = 'support_mode:';
  private readonly SESSION_TTL = 7200; // 2 hours

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
    private readonly balanceService: BalanceService,
    private readonly usernameService: UsernameService,
    private readonly flashApiService: FlashApiService,
    @Inject(forwardRef(() => WhatsAppWebService))
    private readonly whatsappWebService?: WhatsAppWebService,
  ) {
    // Get support phone from environment or use default
    const supportPhone = this.configService.get<string>('SUPPORT_PHONE_NUMBER') || '18762909250';
    // Ensure it has the + prefix for internal use
    this.SUPPORT_PHONE = supportPhone.startsWith('+') ? supportPhone : `+${supportPhone}`;
    this.logger.log(`Support phone configured as: ${this.SUPPORT_PHONE}`);
  }

  /**
   * Initiate support mode for a user
   */
  async initiateSupportMode(
    userWhatsappId: string,
    userSession: UserSession | null,
    recentConversation: string[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Check if already in support mode
      if (await this.isInSupportMode(userWhatsappId)) {
        return {
          success: false,
          message: 'You are already connected to a support agent. Type "exit support" to end the session.',
        };
      }

      // Gather user information
      const userInfo = await this.gatherUserInfo(userWhatsappId, userSession);
      
      // Create conversation summary
      const conversationSummary = this.createConversationSummary(recentConversation);

      // Create support session
      const supportSession: SupportSession = {
        userId: userSession?.flashUserId || 'unlinked',
        userWhatsappId,
        supportAgentId: this.SUPPORT_PHONE,
        startTime: new Date(),
        status: 'active',
        conversationSummary,
        userInfo,
      };

      // Store session
      await this.storeSupportSession(userWhatsappId, supportSession);

      // Send notification to support agent
      const supportMessage = this.formatSupportHandoffMessage(supportSession);
      await this.sendToSupport(supportMessage);

      // Send initial message from support to establish connection
      await this.sendToSupport(
        `📱 New support session started with ${userInfo.phoneNumber}\n` +
        `Reply here to communicate with the user. Type "exit support" to end session.`
      );

      return {
        success: true,
        message: '🎧 *Support Mode Activated*\n\n' +
                'You are now connected to Flash support.\n' +
                'A support agent will assist you shortly.\n\n' +
                '⚠️ *Important*: All your messages will be sent to support until you exit.\n\n' +
                '📝 *To exit support mode*: Type "exit support"\n' +
                '📝 *To continue with support*: Just type your message',
      };
    } catch (error) {
      this.logger.error(`Error initiating support mode: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to connect to support. Please try again or contact support directly.',
      };
    }
  }

  /**
   * Check if user is in support mode
   */
  async isInSupportMode(userWhatsappId: string): Promise<boolean> {
    const sessionKey = `${this.SUPPORT_MODE_PREFIX}${userWhatsappId}`;
    const session = await this.redisService.get(sessionKey);
    return !!session;
  }

  /**
   * Get active support session
   */
  async getSupportSession(userWhatsappId: string): Promise<SupportSession | null> {
    const sessionKey = `${this.SUPPORT_MODE_PREFIX}${userWhatsappId}`;
    const sessionData = await this.redisService.get(sessionKey);
    
    if (!sessionData) {
      return null;
    }

    return JSON.parse(sessionData);
  }

  /**
   * Route message between user and support
   */
  async routeMessage(
    fromWhatsappId: string,
    message: string,
    isFromSupport: boolean = false
  ): Promise<{ routed: boolean; response?: string }> {
    try {
      if (isFromSupport) {
        // Message from support to user
        // For prototype, we'll track the last active support session
        const lastSessionKey = 'last_active_support_session';
        const lastSessionData = await this.redisService.get(lastSessionKey);
        
        if (!lastSessionData) {
          this.logger.warn('No active support session found for incoming support message');
          return { routed: false };
        }
        
        const userWhatsappId = lastSessionData;
        const session = await this.getSupportSession(userWhatsappId);
        
        if (!session || session.status !== 'active') {
          return { routed: false };
        }
        
        // Check for exit command from support
        if (message.toLowerCase() === 'exit support') {
          return await this.endSupportSession(userWhatsappId);
        }
        
        // Route message to user
        await this.whatsappWebService?.sendMessage(
          userWhatsappId,
          `👨‍💼 *Support Agent*: ${message}`
        );
        
        // Log the message
        await this.logSupportMessage(userWhatsappId, message, true);
        
        return { routed: true };
      } else {
        // Message from user to support
        const session = await this.getSupportSession(fromWhatsappId);
        
        if (!session) {
          return { routed: false };
        }

        // Check for exit command
        if (message.toLowerCase() === 'exit support') {
          return await this.endSupportSession(fromWhatsappId);
        }

        // Route message to support
        await this.sendToSupport(
          `📱 From ${session.userInfo.phoneNumber}:\n${message}`
        );

        // Log the message
        await this.logSupportMessage(fromWhatsappId, message, false);

        return { 
          routed: true,
          response: '✉️ Message sent to support agent...\n\n_Still in support mode. Type "exit support" to return to normal bot functions._'
        };
      }
    } catch (error) {
      this.logger.error(`Error routing message: ${error.message}`, error.stack);
      return { routed: false };
    }
  }

  /**
   * End support session
   */
  async endSupportSession(userWhatsappId: string): Promise<{ routed: boolean; response: string }> {
    try {
      const session = await this.getSupportSession(userWhatsappId);
      
      if (!session) {
        return {
          routed: false,
          response: 'No active support session found.',
        };
      }

      // Update session status
      session.status = 'ended';
      session.endTime = new Date();

      // Clear active session
      const sessionKey = `${this.SUPPORT_MODE_PREFIX}${userWhatsappId}`;
      await this.redisService.del(sessionKey);

      // Archive session for records
      const archiveKey = `${this.SUPPORT_SESSION_PREFIX}${userWhatsappId}:${Date.now()}`;
      await this.redisService.set(archiveKey, JSON.stringify(session), 30 * 24 * 60 * 60); // 30 days

      // Notify support
      await this.sendToSupport(
        `🔚 Support session ended with ${session.userInfo.phoneNumber}\n` +
        `Duration: ${this.calculateDuration(session.startTime, session.endTime)}`
      );

      return {
        routed: true,
        response: '✅ *Support Session Ended*\n\n' +
                 'Thank you for contacting Flash support.\n' +
                 'You can continue using Flash services normally.\n\n' +
                 '_How can I help you today?_',
      };
    } catch (error) {
      this.logger.error(`Error ending support session: ${error.message}`, error.stack);
      return {
        routed: false,
        response: 'Error ending support session.',
      };
    }
  }

  /**
   * Gather comprehensive user information
   */
  private async gatherUserInfo(
    userWhatsappId: string,
    userSession: UserSession | null
  ): Promise<SupportSession['userInfo']> {
    const userInfo: SupportSession['userInfo'] = {
      phoneNumber: userWhatsappId.replace('@c.us', ''),
    };

    if (userSession && userSession.isVerified) {
      try {
        // Get username
        if (userSession.flashAuthToken) {
          const username = await this.usernameService.getUsername(userSession.flashAuthToken);
          if (username) {
            userInfo.username = username;
          }
        }

        // Get balance
        if (userSession.flashUserId && userSession.flashAuthToken) {
          const balance = await this.balanceService.getUserBalance(
            userSession.flashUserId,
            userSession.flashAuthToken
          );
          userInfo.balance = {
            btc: `${balance.btcBalance} BTC`,
            usd: `$${balance.fiatBalance.toFixed(2)} USD`,
          };
        }

        // Get email if available
        userInfo.email = userSession.metadata?.email;

        // Get device info
        userInfo.deviceInfo = userSession.metadata?.deviceInfo || 'WhatsApp Web/Mobile';
        
        // Get app version if available
        userInfo.appVersion = userSession.metadata?.appVersion || 'Unknown';

        // Get npub from Flash API
        if (userSession.flashAuthToken) {
          try {
            const profileQuery = `
              query userProfile {
                me {
                  id
                  username
                  npub
                  language
                  defaultAccount {
                    id
                    displayCurrency
                  }
                }
              }
            `;
            
            const profileData = await this.flashApiService.executeQuery<any>(
              profileQuery,
              {},
              userSession.flashAuthToken
            );
            
            if (profileData?.me?.npub) {
              userInfo.npub = profileData.me.npub;
            }
          } catch (error) {
            this.logger.debug(`Could not fetch npub: ${error.message}`);
          }
        }
      } catch (error) {
        this.logger.error(`Error gathering user info: ${error.message}`);
      }
    }

    return userInfo;
  }

  /**
   * Create a summary of recent conversation
   */
  private createConversationSummary(recentMessages: string[]): string {
    if (!recentMessages || recentMessages.length === 0) {
      return 'No recent conversation history available.';
    }

    // Take last 10 messages
    const relevantMessages = recentMessages.slice(-10);
    
    return `Recent conversation (last ${relevantMessages.length} messages):\n` +
           relevantMessages.map((msg, idx) => `${idx + 1}. ${msg}`).join('\n');
  }

  /**
   * Format support handoff message
   */
  private formatSupportHandoffMessage(session: SupportSession): string {
    const { userInfo, conversationSummary } = session;
    
    let message = `🆘 *New Support Request*\n\n`;
    message += `📱 *User Information:*\n`;
    message += `• Phone: ${userInfo.phoneNumber}\n`;
    
    if (userInfo.username) {
      message += `• Username: @${userInfo.username}\n`;
    }
    
    if (userInfo.email) {
      message += `• Email: ${userInfo.email}\n`;
    }
    
    if (userInfo.npub) {
      message += `• Nostr: ${userInfo.npub}\n`;
    }
    
    if (userInfo.balance) {
      message += `• Balance: ${userInfo.balance.btc} / ${userInfo.balance.usd}\n`;
    }
    
    message += `• Device: ${userInfo.deviceInfo || 'Unknown'}\n`;
    message += `• App Version: ${userInfo.appVersion || 'Unknown'}\n`;
    message += `• Time: ${new Date().toLocaleString()}\n\n`;
    
    message += `💬 *Conversation Context:*\n${conversationSummary}\n\n`;
    message += `⚡ *Instructions:*\n`;
    message += `• Reply to this chat to communicate with the user\n`;
    message += `• Type "exit support" to end the session\n`;
    message += `• User sees your messages prefixed with "Support Agent:"`;
    
    return message;
  }

  /**
   * Send message to support
   */
  private async sendToSupport(message: string): Promise<void> {
    if (!this.whatsappWebService) {
      throw new Error('WhatsApp service not available');
    }

    // Remove + from phone number for WhatsApp Web format
    const supportNumber = this.SUPPORT_PHONE.replace('+', '');
    
    await this.whatsappWebService.sendMessage(
      `${supportNumber}@c.us`,
      message
    );
  }

  /**
   * Store support session
   */
  private async storeSupportSession(
    userWhatsappId: string,
    session: SupportSession
  ): Promise<void> {
    const sessionKey = `${this.SUPPORT_MODE_PREFIX}${userWhatsappId}`;
    await this.redisService.set(
      sessionKey,
      JSON.stringify(session),
      this.SESSION_TTL
    );
    
    // Track last active session for routing support messages
    await this.redisService.set(
      'last_active_support_session',
      userWhatsappId,
      this.SESSION_TTL
    );
  }

  /**
   * Find active support sessions
   */
  private async findActiveSupportSessions(): Promise<SupportSession[]> {
    try {
      // Get all active support sessions
      // Note: In production, use SCAN instead of getting all keys
      const sessions: SupportSession[] = [];
      
      // For now, we'll check recent support sessions by iterating through known patterns
      // This is a simplified implementation
      const supportNumber = this.SUPPORT_PHONE.replace('+', '');
      
      // Check last 100 possible user sessions (this is not ideal, but works for prototype)
      for (let i = 0; i < 100; i++) {
        try {
          const testKey = `${this.SUPPORT_MODE_PREFIX}*`;
          // In a real implementation, you would use Redis SCAN here
          // For now, we'll just return empty and rely on proper key management
          break;
        } catch (error) {
          // Continue
        }
      }
      
      return sessions;
    } catch (error) {
      this.logger.error(`Error finding active sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * Log support messages for audit
   */
  private async logSupportMessage(
    userWhatsappId: string,
    message: string,
    fromSupport: boolean
  ): Promise<void> {
    const logKey = `support_log:${userWhatsappId}:${Date.now()}`;
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      fromSupport,
    };
    
    await this.redisService.set(
      logKey,
      JSON.stringify(logEntry),
      30 * 24 * 60 * 60 // 30 days
    );
  }

  /**
   * Calculate session duration
   */
  private calculateDuration(startTime: Date, endTime?: Date): string {
    const end = endTime || new Date();
    const durationMs = end.getTime() - new Date(startTime).getTime();
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Check if message requests human support
   */
  isRequestingSupport(message: string): boolean {
    const supportKeywords = [
      'human',
      'agent',
      'support',
      'help me',
      'customer service',
      'customer support',
      'representative',
      'speak to someone',
      'talk to someone',
      'real person',
      'flash support',
      'contact support',
      'operator',
    ];

    const lowerMessage = message.toLowerCase();
    return supportKeywords.some(keyword => lowerMessage.includes(keyword));
  }
}