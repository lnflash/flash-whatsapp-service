import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { CommandParserService, CommandType, ParsedCommand } from './command-parser.service';
import { validateUsername, getUsernameErrorMessage } from '../utils/username-validation';
import { BalanceTemplate } from '../templates/balance-template';
import { AccountLinkRequestDto } from '../../auth/dto/account-link-request.dto';
import { VerifyOtpDto } from '../../auth/dto/verify-otp.dto';
import { UserSession } from '../../auth/interfaces/user-session.interface';
// import { WhatsAppCloudService } from './whatsapp-cloud.service'; // Disabled for prototype branch

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
    private readonly usernameService: UsernameService,
    private readonly priceService: PriceService,
    private readonly geminiAiService: GeminiAiService,
    private readonly commandParserService: CommandParserService,
    private readonly balanceTemplate: BalanceTemplate,
    // private readonly whatsAppCloudService: WhatsAppCloudService, // Disabled for prototype branch
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
          
        case CommandType.UNLINK:
          return this.handleUnlinkCommand(command, whatsappId, session);
          
        case CommandType.VERIFY:
          return this.handleVerifyCommand(command, whatsappId, session);
          
        case CommandType.BALANCE:
          return this.handleBalanceCommand(whatsappId, session);
          
        case CommandType.REFRESH:
          return this.handleRefreshCommand(whatsappId, session);
          
        case CommandType.USERNAME:
          return this.handleUsernameCommand(command, whatsappId, session);
          
        case CommandType.PRICE:
          return this.handlePriceCommand(whatsappId, session);
          
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
        return 'To link your Flash account, please enter the verification code sent to your WhatsApp. Type "verify" followed by the 6-digit code (e.g., "verify 123456").';
      } else {
        return 'Your Flash account is already linked! You can check your balance or use other commands.';
      }
    } catch (error) {
      this.logger.error(`Error handling link command: ${error.message}`, error.stack);
      
      if (error.message.includes('Please open the Flash mobile app')) {
        return error.message;
      }
      
      if (error.message.includes('No Flash account found')) {
        return "We couldn't find a Flash account with your phone number. Please make sure you're using the same number registered with Flash.";
      }
      
      return "We're having trouble linking your account. Please try again later or contact support.";
    }
  }

  /**
   * Handle account unlinking command
   */
  private async handleUnlinkCommand(command: ParsedCommand, whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      if (!session) {
        return 'No Flash account is linked to this WhatsApp number.';
      }
      
      const confirmed = command.args.confirm === 'confirm';
      
      if (!confirmed) {
        // Ask for confirmation
        return 'Are you sure you want to unlink your Flash account? This will:\n\n• Remove access to your Flash wallet through WhatsApp\n• Delete your session data\n• Require re-linking to use Flash services again\n\nTo confirm, type: unlink confirm';
      }
      
      // User confirmed, proceed with unlinking
      await this.authService.unlinkAccount(whatsappId);
      
      return 'Your Flash account has been successfully unlinked from WhatsApp.\n\nTo use Flash services through WhatsApp again, you\'ll need to type "link" to reconnect your account.\n\nThank you for using Flash!';
    } catch (error) {
      this.logger.error(`Error handling unlink command: ${error.message}`, error.stack);
      return "We're having trouble processing your request. Please try again later.";
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
      
      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        return 'Your account is not fully verified. Please complete the linking process first.';
      }
      
      // Skip MFA for WhatsApp since the user already authenticated
      // The initial WhatsApp verification is sufficient for security
      this.logger.log(`Skipping MFA for balance check - user already authenticated via WhatsApp`);
      
      // Get balance from Flash API using the auth token
      const balanceInfo = await this.balanceService.getUserBalance(session.flashUserId, session.flashAuthToken);
      
      // If display currency is not USD, convert using exchange rate from API
      let displayBalance = balanceInfo.fiatBalance;
      let displayCurrency = balanceInfo.fiatCurrency;
      
      if (balanceInfo.fiatCurrency !== 'USD') {
        if (balanceInfo.exchangeRate) {
          try {
            // Convert USD to display currency using the same logic as mobile app
            const { base, offset } = balanceInfo.exchangeRate.usdCentPrice;
            
            // Log the raw values for debugging
            this.logger.debug(`Exchange rate raw values - base: ${base}, offset: ${offset}`);
            
            // Calculate display currency per USD cent
            // This gives us how much of the display currency's SMALLEST UNIT (e.g., euro cents) per USD cent
            const displayCurrencyPerCent = base / Math.pow(10, offset);
            
            // Convert USD dollars to display currency's major unit
            // 1. Convert USD dollars to cents: fiatBalance * 100
            // 2. Multiply by exchange rate: * displayCurrencyPerCent (gives us display currency's minor unit)
            // 3. Convert back to major unit: / 100
            const usdCents = balanceInfo.fiatBalance * 100;
            const displayCurrencyMinorUnits = usdCents * displayCurrencyPerCent;
            displayBalance = displayCurrencyMinorUnits / 100;
            
            // Round to 2 decimal places for consistent display
            displayBalance = Math.round(displayBalance * 100) / 100;
            
            this.logger.log(`Conversion: $${balanceInfo.fiatBalance} USD = ${usdCents} cents * ${displayCurrencyPerCent} rate = ${displayCurrencyMinorUnits} ${balanceInfo.fiatCurrency} cents = ${displayBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`);
          } catch (error) {
            this.logger.error(`Currency conversion error: ${error.message}`);
            displayCurrency = 'USD';
          }
        } else {
          this.logger.warn(`No exchange rate available for ${balanceInfo.fiatCurrency}, showing USD amount`);
          displayCurrency = 'USD';
        }
      }
      
      // Format and return the balance message using the template
      return this.balanceTemplate.generateBalanceMessage({
        btcBalance: balanceInfo.btcBalance,
        fiatBalance: displayBalance,
        fiatCurrency: displayCurrency,
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
   * Handle refresh command to clear balance cache
   */
  private async handleRefreshCommand(whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      if (!session) {
        return 'Please link your Flash account first by typing "link".';
      }
      
      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        return 'Your account is not fully verified. Please complete the linking process first.';
      }
      
      // Clear the balance cache
      await this.balanceService.clearBalanceCache(session.flashUserId);
      
      // Fetch fresh balance data
      const balanceInfo = await this.balanceService.getUserBalance(session.flashUserId, session.flashAuthToken, true);
      
      // If display currency is not USD, convert using exchange rate from API
      let displayBalance = balanceInfo.fiatBalance;
      let displayCurrency = balanceInfo.fiatCurrency;
      
      if (balanceInfo.fiatCurrency !== 'USD') {
        if (balanceInfo.exchangeRate) {
          try {
            // Convert USD to display currency using the same logic as mobile app
            const { base, offset } = balanceInfo.exchangeRate.usdCentPrice;
            
            // Log the raw values for debugging
            this.logger.debug(`Exchange rate raw values - base: ${base}, offset: ${offset}`);
            
            // Calculate display currency per USD cent
            // This gives us how much of the display currency's SMALLEST UNIT (e.g., euro cents) per USD cent
            const displayCurrencyPerCent = base / Math.pow(10, offset);
            
            // Convert USD dollars to display currency's major unit
            // 1. Convert USD dollars to cents: fiatBalance * 100
            // 2. Multiply by exchange rate: * displayCurrencyPerCent (gives us display currency's minor unit)
            // 3. Convert back to major unit: / 100
            const usdCents = balanceInfo.fiatBalance * 100;
            const displayCurrencyMinorUnits = usdCents * displayCurrencyPerCent;
            displayBalance = displayCurrencyMinorUnits / 100;
            
            // Round to 2 decimal places for consistent display
            displayBalance = Math.round(displayBalance * 100) / 100;
            
            this.logger.log(`Conversion: $${balanceInfo.fiatBalance} USD = ${usdCents} cents * ${displayCurrencyPerCent} rate = ${displayCurrencyMinorUnits} ${balanceInfo.fiatCurrency} cents = ${displayBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`);
          } catch (error) {
            this.logger.error(`Currency conversion error: ${error.message}`);
            displayCurrency = 'USD';
          }
        } else {
          this.logger.warn(`No exchange rate available for ${balanceInfo.fiatCurrency}, showing USD amount`);
          displayCurrency = 'USD';
        }
      }
      
      // Format and return the balance message using the template
      return this.balanceTemplate.generateBalanceMessage({
        btcBalance: balanceInfo.btcBalance,
        fiatBalance: displayBalance,
        fiatCurrency: displayCurrency,
        lastUpdated: balanceInfo.lastUpdated,
        userName: session.profileName,
      });
    } catch (error) {
      this.logger.error(`Error handling refresh command: ${error.message}`, error.stack);
      return "We're having trouble refreshing your balance. Please try again later or contact support.";
    }
  }

  /**
   * Handle username command
   */
  private async handleUsernameCommand(command: ParsedCommand, whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      if (!session) {
        return 'Please link your Flash account first by typing "link".';
      }
      
      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        return 'Your account is not fully verified. Please complete the linking process first.';
      }
      
      const newUsername = command.args.username;
      
      if (!newUsername) {
        // User just typed "username" - show their current username
        const currentUsername = await this.usernameService.getUsername(session.flashAuthToken);
        
        if (currentUsername) {
          return `Your username is: @${currentUsername}`;
        } else {
          return 'You haven\'t set a username yet. To set one, type "username" followed by your desired username.\n\nExample: username johndoe';
        }
      } else {
        // User wants to set a username
        // First check if they already have one
        const currentUsername = await this.usernameService.getUsername(session.flashAuthToken);
        
        if (currentUsername) {
          return `You already have a username: @${currentUsername}\n\nUsernames cannot be changed once set.`;
        }
        
        // Validate the username
        const validationError = validateUsername(newUsername);
        
        if (validationError) {
          return getUsernameErrorMessage(validationError);
        }
        
        // Try to set the username
        try {
          await this.usernameService.setUsername(newUsername, session.flashAuthToken);
          return `Success! Your username has been set to: @${newUsername}\n\nYour Lightning address is now: ${newUsername}@flashapp.me\n\n⚠️ Remember: Usernames cannot be changed once set.`;
        } catch (error) {
          if (error.message.includes('already taken')) {
            return `The username @${newUsername} is already taken. Please choose another one.`;
          }
          throw error;
        }
      }
    } catch (error) {
      this.logger.error(`Error handling username command: ${error.message}`, error.stack);
      return "We're having trouble with your username request. Please try again later.";
    }
  }

  /**
   * Handle price command
   */
  private async handlePriceCommand(whatsappId: string, session: UserSession | null): Promise<string> {
    try {
      // Determine which currency to show
      let currency = 'USD'; // Default currency
      let authToken: string | undefined;
      
      if (session?.isVerified && session.flashAuthToken) {
        // User is authenticated, use their auth token to get their display currency
        authToken = session.flashAuthToken;
        
        // The authenticated query will automatically use the user's display currency
        const priceInfo = await this.priceService.getBitcoinPrice(currency, authToken);
        return this.priceService.formatPriceMessage(priceInfo);
      } else {
        // User not authenticated, show USD price
        const priceInfo = await this.priceService.getBitcoinPrice(currency);
        return this.priceService.formatPriceMessage(priceInfo) + 
               '\n\n💡 Tip: Link your account to see prices in your preferred currency!';
      }
    } catch (error) {
      this.logger.error(`Error handling price command: ${error.message}`, error.stack);
      return "We're having trouble fetching the current Bitcoin price. Please try again later.";
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
    // In prototype branch, messaging is handled by WhatsAppWebService
    this.logger.warn('sendMessage called in prototype branch - messaging should be handled by WhatsAppWebService');
    throw new Error('Direct messaging not available in prototype branch. Use WhatsAppWebService instead.');
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
      return 'Welcome to the Flash WhatsApp service! Here are the available commands:\n\n• price - Check current Bitcoin price\n• link - Connect your Flash account\n• help - Show available commands\n\nTo get started, please link your Flash account by typing "link".';
    }
    
    if (!session.isVerified) {
      return 'Here are the available commands:\n\n• price - Check current Bitcoin price\n• link - Connect your Flash account\n• verify [code] - Enter verification code\n• help - Show available commands\n\nPlease complete the account linking process to access more features.';
    }
    
    return 'Here are the available commands for Flash:\n\n• balance - Check your Bitcoin and fiat balance\n• refresh - Refresh your balance (clear cache)\n• price - Check current Bitcoin price\n• username - View or set your username\n• link - Connect your Flash account\n• unlink - Disconnect your Flash account\n• consent [yes/no] - Manage your AI support consent\n• help - Show available commands\n\nYou can also ask me questions about Flash services and I\'ll do my best to assist you!';
  }

  /**
   * Get unknown command message based on session status
   */
  private getUnknownCommandMessage(session: UserSession | null): string {
    if (!session || !session.isVerified) {
      return "Welcome to Flash Connect! To get started, type 'link' to connect your Flash account. Type 'help' to see available commands.";
    }
    
    return "I'm not sure what you're asking. You can type 'help' to see available commands, or ask me questions about Flash services.";
  }
}