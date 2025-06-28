import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { InvoiceService } from '../../flash-api/services/invoice.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { ACCOUNT_DEFAULT_WALLET_QUERY } from '../../flash-api/graphql/queries';
import { QrCodeService } from './qr-code.service';
import { CommandParserService, CommandType, ParsedCommand } from './command-parser.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { InvoiceTrackerService } from './invoice-tracker.service';
import { validateUsername, getUsernameErrorMessage } from '../utils/username-validation';
import {
  validateMemo,
  validateAmount,
  sanitizeMemo,
  parseAndValidateAmount,
  getInvoiceValidationErrorMessage,
  AMOUNT_MAX_USD,
} from '../utils/invoice-validation';
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
    private readonly invoiceService: InvoiceService,
    private readonly transactionService: TransactionService,
    private readonly geminiAiService: GeminiAiService,
    private readonly qrCodeService: QrCodeService,
    private readonly commandParserService: CommandParserService,
    private readonly balanceTemplate: BalanceTemplate,
    // private readonly whatsAppCloudService: WhatsAppCloudService, // Disabled for prototype branch
    @Inject(forwardRef(() => WhatsAppWebService))
    private readonly whatsappWebService?: WhatsAppWebService,
    @Inject(forwardRef(() => InvoiceTrackerService))
    private readonly invoiceTrackerService?: InvoiceTrackerService,
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
  }): Promise<string | { text: string; media?: Buffer }> {
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
  ): Promise<string | { text: string; media?: Buffer }> {
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

        case CommandType.RECEIVE:
          return this.handleReceiveCommand(command, whatsappId, session);

        case CommandType.HISTORY:
          return this.handleHistoryCommand(whatsappId, session);

        case CommandType.REQUEST:
          return this.handleRequestCommand(command, whatsappId, session);

        case CommandType.CONTACTS:
          return this.handleContactsCommand(command, whatsappId, session);

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
  private async handleUnlinkCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
  private async handleVerifyCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
  private async handleBalanceCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
      const balanceInfo = await this.balanceService.getUserBalance(
        session.flashUserId,
        session.flashAuthToken,
      );

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

            this.logger.log(
              `Conversion: $${balanceInfo.fiatBalance} USD = ${usdCents} cents * ${displayCurrencyPerCent} rate = ${displayCurrencyMinorUnits} ${balanceInfo.fiatCurrency} cents = ${displayBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`,
            );
          } catch (error) {
            this.logger.error(`Currency conversion error: ${error.message}`);
            displayCurrency = 'USD';
          }
        } else {
          this.logger.warn(
            `No exchange rate available for ${balanceInfo.fiatCurrency}, showing USD amount`,
          );
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
  private async handleRefreshCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
      const balanceInfo = await this.balanceService.getUserBalance(
        session.flashUserId,
        session.flashAuthToken,
        true,
      );

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

            this.logger.log(
              `Conversion: $${balanceInfo.fiatBalance} USD = ${usdCents} cents * ${displayCurrencyPerCent} rate = ${displayCurrencyMinorUnits} ${balanceInfo.fiatCurrency} cents = ${displayBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`,
            );
          } catch (error) {
            this.logger.error(`Currency conversion error: ${error.message}`);
            displayCurrency = 'USD';
          }
        } else {
          this.logger.warn(
            `No exchange rate available for ${balanceInfo.fiatCurrency}, showing USD amount`,
          );
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
  private async handleUsernameCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
  private async handlePriceCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
        return (
          this.priceService.formatPriceMessage(priceInfo) +
          '\n\n💡 Tip: Link your account to see prices in your preferred currency!'
        );
      }
    } catch (error) {
      this.logger.error(`Error handling price command: ${error.message}`, error.stack);
      return "We're having trouble fetching the current Bitcoin price. Please try again later.";
    }
  }

  /**
   * Handle consent command
   */
  private async handleConsentCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
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
        return 'Hi There! I would love to chat with you more, but first I need you to give your consent to talking to an AI bot. To use AI-powered support, please provide your consent by typing "consent yes".';
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
    this.logger.warn(
      'sendMessage called in prototype branch - messaging should be handled by WhatsAppWebService',
    );
    throw new Error(
      'Direct messaging not available in prototype branch. Use WhatsAppWebService instead.',
    );
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

    return "Here are the available commands for Flash:\n\n• balance - Check your Bitcoin and fiat balance\n• refresh - Refresh your balance (clear cache)\n• receive [amount] [memo] - Create USD Lightning invoice\n• request [amount] from [target] - Request payment\n• contacts - Manage saved contacts\n• history - View recent transactions\n• price - Check current Bitcoin price\n• username - View or set your username\n• link - Connect your Flash account\n• unlink - Disconnect your Flash account\n• consent [yes/no] - Manage your AI support consent\n• help - Show available commands\n\nYou can also ask me questions about Flash services and I'll do my best to assist you!";
  }

  /**
   * Handle receive command - create Lightning invoice
   */
  private async handleReceiveCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<{ text: string; media?: Buffer }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified) {
        return {
          text: 'Please link your Flash account first to receive payments. Type "link" to get started.',
        };
      }

      // Parse amount and memo from command
      const amountStr = command.args.amount;
      let memo = command.args.memo || undefined;

      let amount: number | undefined;
      const currency: 'USD' | 'BTC' = 'USD'; // Only USD supported

      if (amountStr) {
        // Check if amount contains BTC indicator
        if (amountStr.toLowerCase().includes('btc') || amountStr.includes('₿')) {
          return {
            text: 'BTC invoices are not currently supported. Please specify amount in USD, e.g., "receive 10" for $10',
          };
        }
        
        // Parse and validate USD amount
        const parsedResult = parseAndValidateAmount(amountStr);
        if (parsedResult.error) {
          return { text: parsedResult.error };
        }
        amount = parsedResult.amount;
      }

      // Validate amount
      const amountError = validateAmount(amount);
      if (amountError) {
        return {
          text: getInvoiceValidationErrorMessage(amountError),
        };
      }

      // Validate and sanitize memo
      if (memo) {
        const memoError = validateMemo(memo);
        if (memoError) {
          return {
            text: getInvoiceValidationErrorMessage(memoError),
          };
        }
        // Sanitize memo to prevent issues
        memo = sanitizeMemo(memo);
      }

      // Create the invoice
      const invoice = await this.invoiceService.createInvoice(
        session.flashAuthToken!,
        amount,
        memo,
        currency,
      );

      // Store invoice for tracking
      await this.storeInvoiceForTracking(session.whatsappId, invoice, session.flashAuthToken!);
      
      // Subscribe to Lightning updates for this user (if not already subscribed)
      // Disabled temporarily due to WebSocket connection issues
      // if (this.invoiceTrackerService) {
      //   await this.invoiceTrackerService.subscribeForUser(session.whatsappId);
      // }

      // Generate QR code
      const qrCodeBuffer = await this.qrCodeService.generateLightningQrCode(invoice.paymentRequest);

      // Format the response message
      const message = this.invoiceService.formatInvoiceMessage(invoice);

      return {
        text: message,
        media: qrCodeBuffer,
      };
    } catch (error) {
      this.logger.error(`Error handling receive command: ${error.message}`, error.stack);
      
      // Return the specific error message if it's a BadRequestException
      if (error instanceof BadRequestException) {
        const errorMessage = error.message;
        this.logger.debug(`Returning error message to user: ${errorMessage}`);
        return { text: errorMessage };
      }
      
      // Generic error message for unexpected errors
      return { text: 'Failed to create invoice. Please try again later.' };
    }
  }

  /**
   * Handle history command - show recent transactions
   */
  private async handleHistoryCommand(
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken || !session.flashUserId) {
        return 'Please link your Flash account first to view transaction history. Type "link" to get started.';
      }

      // Get recent transactions
      const transactions = await this.transactionService.getRecentTransactions(
        session.flashAuthToken,
        10, // Show last 10 transactions
      );

      if (!transactions) {
        return '❌ Unable to fetch transaction history. Please try again later.';
      }

      // Get current display currency from user's balance
      const balance = await this.balanceService.getUserBalance(
        session.flashUserId,
        session.flashAuthToken,
      );
      const displayCurrency = balance?.fiatCurrency || 'USD';

      // Format transaction history for WhatsApp
      return this.transactionService.formatTransactionHistory(transactions, displayCurrency);
    } catch (error) {
      this.logger.error(`Error handling history command: ${error.message}`, error.stack);
      return '❌ Failed to fetch transaction history. Please try again later.';
    }
  }

  /**
   * Handle payment request command - request payment from another user
   */
  private async handleRequestCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<{ text: string; media?: Buffer }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return {
          text: 'Please link your Flash account first to request payments. Type "link" to get started.',
        };
      }

      // Parse amount and target (username or phone)
      const amountStr = command.args.amount;
      let targetUsername = command.args.username;
      let targetPhone = command.args.phoneNumber;

      if (!amountStr || (!targetUsername && !targetPhone)) {
        return {
          text: 'Please specify amount and recipient. Usage:\n• request [amount] from [@username]\n• request [amount] from [phone]\n• request [amount] from [@username] [phone]\n• request [amount] from [contact_name]',
        };
      }

      // Check if username might be a saved contact name
      if (targetUsername && !targetUsername.includes('@') && !targetPhone) {
        const contactsKey = `contacts:${whatsappId}`;
        const savedContacts = await this.redisService.get(contactsKey);
        
        if (savedContacts) {
          const contacts = JSON.parse(savedContacts);
          const contactKey = targetUsername.toLowerCase();
          
          if (contacts[contactKey]) {
            // Found a saved contact, use their phone number
            targetPhone = contacts[contactKey].phone;
            this.logger.log(`Using saved contact ${targetUsername}: ${targetPhone}`);
          }
        }
      }

      // Validate amount
      const parsedResult = parseAndValidateAmount(amountStr);
      if (parsedResult.error) {
        return { text: parsedResult.error };
      }
      const amount = parsedResult.amount;

      // Validate target username if provided
      if (targetUsername) {
        try {
          const walletCheck = await this.flashApiService.executeQuery<any>(
            ACCOUNT_DEFAULT_WALLET_QUERY,
            { username: targetUsername },
            session.flashAuthToken,
          );

          if (!walletCheck?.accountDefaultWallet?.id) {
            return {
              text: `❌ Username @${targetUsername} not found. Please check the username and try again.`,
            };
          }
        } catch (error) {
          this.logger.error(`Error checking username: ${error.message}`);
          return {
            text: `❌ Unable to verify username @${targetUsername}. Please try again later.`,
          };
        }
      }

      // Get requester's username
      const requesterUsername = await this.usernameService.getUsername(session.flashAuthToken) || 'Flash user';

      // Create invoice for the requested amount
      const memo = `Payment request from @${requesterUsername}`;
      const invoice = await this.invoiceService.createInvoice(
        session.flashAuthToken,
        amount!,
        memo,
        'USD',
      );

      if (!invoice) {
        return { text: '❌ Failed to create payment request. Please try again later.' };
      }

      // Generate QR code
      const qrBuffer = await this.qrCodeService.generateQrCode(invoice.paymentRequest);

      // Format the request message
      let requestMessage = `💸 *Payment Request*\n\n`;
      requestMessage += `From: @${requesterUsername}\n`;
      requestMessage += `Amount: $${amount!.toFixed(2)} USD\n`;
      requestMessage += `\n📱 *To pay this request:*\n`;
      requestMessage += `1. Open Flash app\n`;
      requestMessage += `2. Tap "Send"\n`;
      requestMessage += `3. Scan this QR code or paste:\n`;
      requestMessage += `\`${invoice.paymentRequest}\`\n`;
      requestMessage += `\n_Request expires in ${Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 60000)} minutes_`;

      // Determine the final phone number to use
      const phoneToUse = targetPhone || (targetUsername ? null : null);
      
      // If we have a phone number, try to send WhatsApp message
      if (targetPhone && this.whatsappWebService) {
        try {
          // Normalize phone number
          const normalizedPhone = targetPhone.replace(/\D/g, '');
          const whatsappNumber = `${normalizedPhone}@c.us`;
          
          // Build recipient identifier for message
          const recipientIdentifier = targetUsername ? `@${targetUsername}` : `the number ${targetPhone}`;
          
          // Send notification to recipient
          const notificationMessage = `💰 *Payment Request*\n\n@${requesterUsername} is requesting $${amount!.toFixed(2)} USD from you.\n\nTo view and pay this request, please check your WhatsApp messages or open the Flash app.`;
          
          await this.whatsappWebService.sendMessage(whatsappNumber, notificationMessage);
          
          // Send the actual payment request with QR
          await this.whatsappWebService.sendImage(whatsappNumber, qrBuffer, requestMessage);
          
          return {
            text: `✅ Payment request sent to ${recipientIdentifier} via WhatsApp!\n\nThey will receive your request for $${amount!.toFixed(2)} USD.`,
          };
        } catch (error) {
          this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
          // Continue to show the QR code to the requester
        }
      }

      // Return the payment request to the requester
      return {
        text: requestMessage,
        media: qrBuffer,
      };
    } catch (error) {
      this.logger.error(`Error handling request command: ${error.message}`, error.stack);
      return { text: '❌ Failed to create payment request. Please try again later.' };
    }
  }

  /**
   * Handle contacts command - manage saved contacts
   */
  private async handleContactsCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified) {
        return 'Please link your Flash account first to manage contacts. Type "link" to get started.';
      }

      const action = command.args.action || 'list';
      const contactName = command.args.name;
      const phoneNumber = command.args.phoneNumber;

      const contactsKey = `contacts:${whatsappId}`;

      switch (action) {
        case 'add':
          if (!contactName || !phoneNumber) {
            return 'Please provide name and phone number. Usage: contacts add [name] [phone]';
          }

          // Get existing contacts
          const existingContacts = await this.redisService.get(contactsKey);
          const contacts = existingContacts ? JSON.parse(existingContacts) : {};

          // Add new contact
          contacts[contactName.toLowerCase()] = {
            name: contactName,
            phone: phoneNumber.replace(/\D/g, ''),
            addedAt: new Date().toISOString(),
          };

          // Save contacts (expire after 1 year)
          await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

          return `✅ Contact saved: ${contactName} (${phoneNumber})\n\nYou can now use: request [amount] from ${contactName}`;

        case 'remove':
          if (!contactName) {
            return 'Please provide contact name. Usage: contacts remove [name]';
          }

          const contactsToUpdate = await this.redisService.get(contactsKey);
          if (!contactsToUpdate) {
            return 'You have no saved contacts.';
          }

          const contactList = JSON.parse(contactsToUpdate);
          const nameKey = contactName.toLowerCase();

          if (!contactList[nameKey]) {
            return `Contact "${contactName}" not found.`;
          }

          delete contactList[nameKey];
          await this.redisService.set(contactsKey, JSON.stringify(contactList), 365 * 24 * 60 * 60);

          return `✅ Contact "${contactName}" removed.`;

        case 'list':
        default:
          const savedContacts = await this.redisService.get(contactsKey);
          if (!savedContacts) {
            return 'You have no saved contacts.\n\nTo add a contact: contacts add [name] [phone]';
          }

          const contactData = JSON.parse(savedContacts);
          const contactEntries = Object.values(contactData) as Array<{
            name: string;
            phone: string;
            addedAt: string;
          }>;

          if (contactEntries.length === 0) {
            return 'You have no saved contacts.\n\nTo add a contact: contacts add [name] [phone]';
          }

          let message = '📇 *Your Saved Contacts*\n\n';
          contactEntries.forEach((contact) => {
            message += `• ${contact.name}: ${contact.phone}\n`;
          });
          message += '\n_Use these names in payment requests!_';

          return message;
      }
    } catch (error) {
      this.logger.error(`Error handling contacts command: ${error.message}`, error.stack);
      return '❌ Failed to manage contacts. Please try again later.';
    }
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

  /**
   * Store invoice for payment tracking
   */
  private async storeInvoiceForTracking(
    whatsappId: string,
    invoice: any,
    authToken: string,
  ): Promise<void> {
    try {
      const invoiceData = {
        paymentHash: invoice.paymentHash,
        paymentRequest: invoice.paymentRequest,
        amount: invoice.amount,
        currency: invoice.currency || 'USD',
        memo: invoice.memo,
        status: 'pending',
        expiresAt: invoice.expiresAt,
        whatsappUserId: whatsappId,
        authToken: authToken, // Store encrypted in production
        createdAt: new Date().toISOString(),
      };

      // Store in Redis with expiration matching invoice expiry
      const expirySeconds = Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 1000);
      const key = `invoice:${invoice.paymentHash}`;
      
      await this.redisService.set(
        key,
        JSON.stringify(invoiceData),
        Math.max(expirySeconds, 3600), // At least 1 hour
      );

      // Also store in a user's invoice list for easy lookup
      await this.redisService.addToSet(
        `user:${whatsappId}:invoices`,
        invoice.paymentHash,
      );

      this.logger.log(`Stored invoice ${invoice.paymentHash} for tracking`);
    } catch (error) {
      this.logger.error('Failed to store invoice for tracking:', error);
      // Don't throw - this is a non-critical feature
    }
  }

  /**
   * Check invoice payment status
   */
  async checkInvoiceStatus(paymentHash: string): Promise<any> {
    try {
      const key = `invoice:${paymentHash}`;
      const invoiceData = await this.redisService.get(key);
      
      if (!invoiceData) {
        return null;
      }

      const invoice = JSON.parse(invoiceData);
      
      // Only check if still pending
      if (invoice.status !== 'pending') {
        return invoice;
      }

      // Query GraphQL for invoice status
      const query = `
        query GetInvoiceStatus($paymentHash: String!) {
          invoice(paymentHash: $paymentHash) {
            status
            settledAt
          }
        }
      `;

      const result = await this.flashApiService.executeQuery<any>(
        query,
        { paymentHash },
        invoice.authToken,
      );

      if (result?.data?.invoice?.status === 'PAID') {
        invoice.status = 'paid';
        invoice.paidAt = result.data.invoice.settledAt;
        
        // Update Redis
        await this.redisService.set(key, JSON.stringify(invoice), 3600); // Keep for 1 hour after payment
        
        // Notify user
        await this.notifyInvoicePaid(invoice);
      }

      return invoice;
    } catch (error) {
      this.logger.error(`Failed to check invoice status: ${error.message}`);
      return null;
    }
  }

  /**
   * Notify user when invoice is paid
   */
  async notifyInvoicePaid(invoice: any): Promise<void> {
    try {
      const message = `✅ Payment Received!\n\nAmount: $${invoice.amount} USD\n${invoice.memo ? `Memo: ${invoice.memo}\n` : ''}Paid at: ${new Date(invoice.paidAt).toLocaleString()}\n\nThank you for your payment!`;

      // Send notification via WhatsApp Web
      if (this.whatsappWebService) {
        await this.whatsappWebService.sendMessage(
          invoice.whatsappUserId,
          message,
        );
      }
    } catch (error) {
      this.logger.error('Failed to send payment notification:', error);
    }
  }
}
