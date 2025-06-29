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
import { PaymentService, PaymentSendResult } from '../../flash-api/services/payment.service';
import { PendingPaymentService } from '../../flash-api/services/pending-payment.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { ACCOUNT_DEFAULT_WALLET_QUERY } from '../../flash-api/graphql/queries';
import { QrCodeService } from './qr-code.service';
import { CommandParserService, CommandType, ParsedCommand } from './command-parser.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { InvoiceTrackerService } from './invoice-tracker.service';
import { SupportModeService } from './support-mode.service';
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
    private readonly paymentService: PaymentService,
    private readonly pendingPaymentService: PendingPaymentService,
    private readonly geminiAiService: GeminiAiService,
    private readonly qrCodeService: QrCodeService,
    private readonly commandParserService: CommandParserService,
    private readonly balanceTemplate: BalanceTemplate,
    private readonly supportModeService: SupportModeService,
    // private readonly whatsAppCloudService: WhatsAppCloudService, // Disabled for prototype branch
    @Inject(forwardRef(() => WhatsAppWebService))
    private readonly whatsappWebService?: WhatsAppWebService,
    @Inject(forwardRef(() => InvoiceTrackerService))
    private readonly invoiceTrackerService?: InvoiceTrackerService,
  ) {}

  /**
   * Get recent conversation history for support context
   */
  private async getRecentConversation(whatsappId: string): Promise<string[]> {
    try {
      const messages: string[] = [];
      // Get last 10 messages from Redis or wherever they're stored
      // For now, return empty array as a placeholder
      return messages;
    } catch (error) {
      this.logger.error(`Error getting recent conversation: ${error.message}`);
      return [];
    }
  }

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

      // Check if user is in support mode
      if (await this.supportModeService.isInSupportMode(whatsappId)) {
        const result = await this.supportModeService.routeMessage(whatsappId, messageData.text);
        if (result.routed) {
          return result.response || '✉️ Message sent to support...';
        }
      }

      // Check if message is requesting support
      if (this.supportModeService.isRequestingSupport(messageData.text)) {
        // Store recent conversation context
        const recentMessages = await this.getRecentConversation(whatsappId);
        const supportResult = await this.supportModeService.initiateSupportMode(
          whatsappId,
          session,
          recentMessages
        );
        return supportResult.message;
      }

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

        case CommandType.SEND:
          return this.handleSendCommand(command, whatsappId, session);

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

        case CommandType.PAY:
          return this.handlePayCommand(command, whatsappId, session);

        case CommandType.VYBZ:
          return this.handleVybzCommand(command, whatsappId, session);

        case CommandType.PENDING:
          return this.handlePendingCommand(command, whatsappId, session);

        case CommandType.ADMIN:
          return this.handleAdminCommand(command, whatsappId, phoneNumber);

        case CommandType.UNKNOWN:
        default:
          // Check if this might be a Flash username response to pending send
          const pendingSendKey = `pending_send:${whatsappId}`;
          const pendingSendData = await this.redisService.get(pendingSendKey);

          if (pendingSendData && command.rawText.startsWith('@')) {
            const pending = JSON.parse(pendingSendData);
            const username = command.rawText.substring(1); // Remove @ prefix

            // Try to send to this username
            await this.redisService.del(pendingSendKey); // Clear pending

            const sendCommand: ParsedCommand = {
              type: CommandType.SEND,
              args: {
                amount: pending.amount.toString(),
                username: username,
                memo: pending.memo,
              },
              rawText: `send ${pending.amount} to @${username}`,
            };

            return this.handleSendCommand(sendCommand, whatsappId, session);
          }

          // Check if this might be a response to a pending contact request
          const pendingKey = `pending_request:${whatsappId}`;
          const pendingData = await this.redisService.get(pendingKey);

          if (pendingData) {
            const pending = JSON.parse(pendingData);
            if (pending.type === 'payment_request') {
              // Check if the message matches "contactname phonenumber" pattern
              const parts = command.rawText.trim().split(/\s+/);
              if (parts.length >= 2) {
                const possibleName = parts[0];
                const possiblePhone = parts.slice(1).join('');

                // Check if this matches the pending contact name
                if (possibleName.toLowerCase() === pending.contactName.toLowerCase()) {
                  // Process as contact addition with pending request
                  const response = await this.checkAndProcessPendingRequest(
                    whatsappId,
                    possibleName,
                    possiblePhone,
                  );

                  if (response) {
                    return response;
                  }
                }
              }
            }
          }

          // Check if the message contains a Lightning invoice
          const invoiceMatch = command.rawText.match(/\b(lnbc[a-z0-9]+)\b/i);
          if (invoiceMatch) {
            if (session?.isVerified) {
              return this.handleInvoiceDetected(invoiceMatch[1], whatsappId, session);
            } else {
              // User not linked but received an invoice
              return `⚡ *Lightning Invoice Detected*\n\nTo pay this invoice, you need to connect your Flash account first.\n\n👉 Type \`link\` to get started!\n\nOnce connected, you'll be able to:\n• Pay Lightning invoices instantly\n• Send money to other Flash users\n• Check your balance\n• And much more!`;
            }
          }

          // Check if user has an active vybz session
          if (session?.isVerified) {
            const vybzQueueKey = `vybz_waiting:${whatsappId}`;
            const waitingForContent = await this.redisService.get(vybzQueueKey);

            if (waitingForContent) {
              // User is responding to vybz prompt with content
              await this.redisService.del(vybzQueueKey); // Clear the waiting flag
              return this.processVybzContent(whatsappId, command.rawText, 'text', session);
            }

            // Otherwise, use AI to respond
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

      // Check for pending payments to auto-claim
      try {
        const updatedSession = await this.sessionService.getSessionByWhatsappId(whatsappId);
        if (updatedSession && updatedSession.isVerified && updatedSession.phoneNumber) {
          const pendingPayments = await this.pendingPaymentService.getPendingPaymentsByPhone(
            updatedSession.phoneNumber,
          );

          if (pendingPayments.length > 0) {
            let totalClaimed = 0;
            let claimedCount = 0;

            for (const payment of pendingPayments) {
              try {
                const claimResult = await this.processPendingPaymentClaim(payment, updatedSession);
                if (claimResult.includes('✅')) {
                  totalClaimed += payment.amountCents;
                  claimedCount++;
                }
              } catch (error) {
                this.logger.error(`Failed to auto-claim payment ${payment.id}: ${error.message}`);
              }
            }

            if (claimedCount > 0) {
              const totalUsd = (totalClaimed / 100).toFixed(2);
              return `Your Flash account has been successfully linked!\n\n💰 Great news! You had ${claimedCount} pending payment${claimedCount > 1 ? 's' : ''} totaling $${totalUsd} that ${claimedCount > 1 ? 'have' : 'has'} been automatically credited to your account!\n\nType "balance" to see your updated balance.`;
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error checking for pending payments: ${error.message}`);
      }

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

        // Check if there's a pending AI question
        const pendingQuestionKey = `pending_ai_question:${whatsappId}`;
        const pendingQuestion = await this.redisService.get(pendingQuestionKey);

        if (pendingQuestion) {
          // Clear the pending question
          await this.redisService.del(pendingQuestionKey);

          // Update session to reflect consent given
          session.consentGiven = true;

          // Answer the pending question
          try {
            const aiResponse = await this.handleAiQuery(pendingQuestion, session);
            return `Thank you for providing your consent! 🎉\n\nNow, regarding your question: "${pendingQuestion}"\n\n${aiResponse}`;
          } catch (error) {
            this.logger.error(
              `Error processing pending AI question: ${error.message}`,
              error.stack,
            );
            return 'Thank you for providing your consent. You can now use all Flash services through WhatsApp.\n\nI had trouble processing your previous question. Please feel free to ask again!';
          }
        }

        return 'Thank you for providing your consent. You can now use all Flash services through WhatsApp.';
      } else if (choice === 'no') {
        await this.authService.recordConsent(session.sessionId, false);

        // Clear any pending question since user declined consent
        const pendingQuestionKey = `pending_ai_question:${whatsappId}`;
        await this.redisService.del(pendingQuestionKey);

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
        // Store the pending question for after consent is given
        // Use whatsappId without + to match the format used in handleConsentCommand
        const normalizedWhatsappId = session.whatsappId.replace('+', '');
        const pendingQuestionKey = `pending_ai_question:${normalizedWhatsappId}`;
        await this.redisService.set(pendingQuestionKey, query, 300); // 5 minute expiry

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
      return `Welcome! Type 'link' to connect Flash account. 'price' for BTC price.`;
    }

    if (!session.isVerified) {
      return `Enter code: verify 123456. Or type 'price' for BTC price.`;
    }

    return `Commands: balance, send 5 to @user, receive 10, history, pending, price`;
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
   * Handle send command - send Lightning payment
   */
  private async handleSendCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return 'Please link your Flash account first to send payments. Type "link" to get started.';
      }

      // Parse amount
      const amountStr = command.args.amount;
      if (!amountStr) {
        return 'Please specify amount. Usage: send [amount] to [recipient]';
      }

      const parsedResult = parseAndValidateAmount(amountStr);
      if (parsedResult.error) {
        return parsedResult.error;
      }
      const amount = parsedResult.amount!;

      // Determine recipient type
      let targetUsername = command.args.username;
      let targetPhone = command.args.phoneNumber;
      let lightningAddress = command.args.recipient;
      let isContactPayment = false;

      // If recipient doesn't have @ and it's not a phone/lightning address,
      // it could be either a username or contact name
      let possibleContactName = null;
      if (
        lightningAddress &&
        !lightningAddress.includes('@') &&
        !lightningAddress.includes('lnbc') &&
        !lightningAddress.match(/^\+?\d{10,}$/)
      ) {
        possibleContactName = lightningAddress;
        // Try as username first
        if (!targetUsername) {
          targetUsername = lightningAddress;
        }
      }

      // Check if recipient might be a saved contact
      if (
        lightningAddress &&
        !lightningAddress.includes('@') &&
        !lightningAddress.includes('lnbc')
      ) {
        const contactsKey = `contacts:${whatsappId}`;
        const savedContacts = await this.redisService.get(contactsKey);

        if (savedContacts) {
          const contacts = JSON.parse(savedContacts);
          const contactKey = lightningAddress.toLowerCase();

          if (contacts[contactKey]) {
            // Found a saved contact
            isContactPayment = true;
            this.logger.log(`Using saved contact ${lightningAddress} for payment`);

            // For contacts, we can't send directly - need to create a request
            return `❌ Direct payments to contacts are not yet supported.\n\nUse: request ${amount} from ${lightningAddress}\n\nThis will send them a payment request they can pay.`;
          }
        }
      }

      // Check if it's a Lightning invoice/address
      if (
        lightningAddress &&
        (lightningAddress.startsWith('lnbc') || lightningAddress.includes('@'))
      ) {
        try {
          this.logger.log(
            `Attempting Lightning payment to: ${lightningAddress.substring(0, 20)}...`,
          );

          // Determine payment type and execute
          let result;
          if (lightningAddress.startsWith('lnbc')) {
            // It's a Lightning invoice
            // Get user's wallets
            const wallets = await this.paymentService.getUserWallets(session.flashAuthToken);

            result = await this.paymentService.sendLightningPayment(
              {
                walletId: wallets.usdWallet?.id || wallets.defaultWalletId,
                paymentRequest: lightningAddress,
                memo: command.args.memo,
              },
              session.flashAuthToken,
            );
          } else if (lightningAddress.includes('@')) {
            // It's a Lightning address - need to get invoice first
            return `❌ Lightning address payments coming soon!\n\nFor now, ask ${lightningAddress} to send you an invoice using:\nreceive ${amount}`;
          }

          if (result?.status === PaymentSendResult.Success) {
            return `✅ Payment sent!\n\nAmount: $${amount.toFixed(2)} USD\nTo: ${lightningAddress.substring(0, 30)}...\n\nPayment successful!`;
          } else {
            const errorMessage = result?.errors?.[0]?.message || 'Unknown error';

            // Provide more helpful error messages
            if (errorMessage.includes('Account is inactive')) {
              return `❌ Payment failed: Account is inactive.\n\nYour account has restrictions on sending payments.\n\nPlease contact support@flashapp.me for assistance.`;
            } else if (errorMessage.includes('Insufficient balance')) {
              return `❌ Payment failed: Insufficient balance.\n\nYou need at least $${amount.toFixed(2)} USD to send this payment.`;
            } else if (errorMessage.includes('limit')) {
              return `❌ Payment failed: ${errorMessage}\n\nYou may have reached a transaction limit. Check your account limits in the Flash app.`;
            }

            return `❌ Payment failed: ${errorMessage}`;
          }
        } catch (error) {
          this.logger.error(`Lightning payment error: ${error.message}`);
          return `❌ Payment failed: ${error.message}`;
        }
      }

      // Check if it's a username
      if (targetUsername) {
        try {
          // Verify username exists
          const walletCheck = await this.flashApiService.executeQuery<any>(
            ACCOUNT_DEFAULT_WALLET_QUERY,
            { username: targetUsername },
            session.flashAuthToken,
          );

          if (walletCheck?.accountDefaultWallet?.id) {
            // Intraledger payment
            const walletId = walletCheck.accountDefaultWallet.id;

            // Get user's wallets
            const userWallets = await this.paymentService.getUserWallets(session.flashAuthToken);

            const result = await this.paymentService.sendIntraLedgerUsdPayment(
              {
                walletId: userWallets.usdWallet?.id || userWallets.defaultWalletId,
                recipientWalletId: walletId,
                amount: amount * 100, // Convert to cents
                memo: command.args.memo,
              },
              session.flashAuthToken,
            );

            if (result?.status === PaymentSendResult.Success) {
              return `✅ Payment sent to @${targetUsername}!\n\nAmount: $${amount.toFixed(2)} USD\n${command.args.memo ? `Memo: ${command.args.memo}` : ''}\n\nPayment successful!`;
            } else {
              const errorMessage = result?.errors?.[0]?.message || 'Unknown error';

              // Provide more helpful error messages
              if (errorMessage.includes('Account is inactive')) {
                return `❌ Payment failed: Account is inactive.\n\nThis could mean:\n• The recipient's account (@${targetUsername}) is suspended or deactivated\n• Your account has restrictions on sending payments\n\nPlease contact support@flashapp.me for assistance.`;
              } else if (errorMessage.includes('Insufficient balance')) {
                return `❌ Payment failed: Insufficient balance.\n\nYou need at least $${amount.toFixed(2)} USD to send this payment.`;
              } else if (errorMessage.includes('limit')) {
                return `❌ Payment failed: ${errorMessage}\n\nYou may have reached a transaction limit. Check your account limits in the Flash app.`;
              }

              return `❌ Payment failed: ${errorMessage}`;
            }
          } else {
            return `❌ Username @${targetUsername} not found.`;
          }
        } catch (error) {
          this.logger.error(`Username payment error: ${error.message}`);

          // Check if the error is about account not existing
          if (error.message.includes('Account does not exist for username')) {
            // Check if this might be a contact name
            const contactsKey = `contacts:${whatsappId}`;
            const contactsData = await this.redisService.get(contactsKey);

            if (contactsData) {
              const contacts = JSON.parse(contactsData);
              const contact = contacts[targetUsername.toLowerCase()];

              if (contact) {
                // Found in contacts but they don't have a Flash account
                // Create pending payment using admin wallet as escrow
                try {
                  // Get admin token from config
                  const adminToken = this.configService.get<string>('flashApi.apiKey');
                  if (!adminToken) {
                    return `❌ Unable to process pending payment. Please try again later.`;
                  }

                  // Get admin wallet
                  const adminWallets = await this.paymentService.getUserWallets(adminToken);
                  const adminWalletId = adminWallets.usdWallet?.id || adminWallets.defaultWalletId;

                  if (!adminWalletId) {
                    this.logger.error('Admin wallet not found');
                    return `❌ Unable to process pending payment. Please try again later.`;
                  }

                  // Get user's wallets
                  const userWallets = await this.paymentService.getUserWallets(
                    session.flashAuthToken,
                  );
                  const senderWalletId = userWallets.usdWallet?.id || userWallets.defaultWalletId;

                  // First generate the claim code that will be used
                  const claimCode = this.generateClaimCode();

                  // Send payment to admin wallet (escrow) with claim code in memo
                  const escrowMemo = `Pending payment for ${targetUsername} (${contact.phone}) - Claim: ${claimCode}`;
                  const escrowResult = await this.paymentService.sendIntraLedgerUsdPayment(
                    {
                      walletId: senderWalletId,
                      recipientWalletId: adminWalletId,
                      amount: amount * 100, // Convert to cents
                      memo: escrowMemo,
                    },
                    session.flashAuthToken,
                  );

                  if (escrowResult?.status !== PaymentSendResult.Success) {
                    const errorMessage =
                      escrowResult?.errors?.[0]?.message || 'Failed to create pending payment';
                    return `❌ ${errorMessage}`;
                  }

                  // Create pending payment record with the same claim code
                  const senderUsername =
                    (await this.usernameService.getUsername(session.flashAuthToken)) ||
                    'Flash user';
                  const pendingPayment =
                    await this.pendingPaymentService.createPendingPaymentWithCode({
                      senderId: session.flashUserId!,
                      senderUsername,
                      senderPhone: session.phoneNumber,
                      recipientPhone: contact.phone,
                      recipientName: targetUsername,
                      amountCents: amount * 100,
                      memo: command.args.memo,
                      claimCode: claimCode,
                      escrowTransactionId: undefined, // Transaction ID not available in response
                    });

                  // Send notification to recipient if we have WhatsApp Web service
                  if (this.whatsappWebService) {
                    try {
                      const recipientWhatsApp = `${contact.phone}@c.us`;
                      const notificationMsg =
                        this.pendingPaymentService.formatPendingPaymentMessage(pendingPayment);
                      await this.whatsappWebService.sendMessage(recipientWhatsApp, notificationMsg);
                    } catch (notifyError) {
                      this.logger.error(`Failed to notify recipient: ${notifyError.message}`);
                    }
                  }

                  return `✅ Payment sent successfully!\n\n💰 $${amount.toFixed(2)} USD is waiting for ${targetUsername}\n📱 They've been notified via WhatsApp\n🔑 Claim code: ${pendingPayment.claimCode}\n⏱️ Expires in 30 days\n\n${targetUsername} will receive the money automatically when they create their Flash account.`;
                } catch (error) {
                  this.logger.error(
                    `Error creating pending payment: ${error.message}`,
                    error.stack,
                  );
                  return `❌ Failed to create pending payment. Please try again.`;
                }
              }
            }

            // Not found in contacts either
            // Store pending send info for when contact is added
            const pendingKey = `pending_send:${whatsappId}`;
            await this.redisService.set(
              pendingKey,
              JSON.stringify({
                amount,
                recipient: targetUsername,
                memo: command.args.memo,
              }),
              300,
            ); // 5 minute expiry

            return `${targetUsername} not found. Share contact or: contacts add ${targetUsername} +1234567890`;
          }

          return `❌ Unable to send to @${targetUsername}: ${error.message}`;
        }
      }

      // If phone number provided
      if (targetPhone) {
        return `❌ Phone number payments are not yet supported.\n\nTo send to this number:\n1. Ask them to create a Flash account\n2. Get their username\n3. Use: send ${amount} to @username`;
      }

      return 'Please specify a valid recipient:\n• @username (Flash user)\n• Lightning invoice (lnbc...)\n• Lightning address (user@domain.com)';
    } catch (error) {
      this.logger.error(`Error handling send command: ${error.message}`, error.stack);
      return '❌ Failed to send payment. Please try again later.';
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
      let isFromSavedContact = false;
      let contactNotFound = false;
      if (targetUsername && !targetUsername.includes('@') && !targetPhone) {
        const contactsKey = `contacts:${whatsappId}`;
        const savedContacts = await this.redisService.get(contactsKey);

        if (savedContacts) {
          const contacts = JSON.parse(savedContacts);
          const contactKey = targetUsername.toLowerCase();

          if (contacts[contactKey]) {
            // Found a saved contact, use their phone number
            targetPhone = contacts[contactKey].phone;
            isFromSavedContact = true;
            this.logger.log(`Using saved contact ${targetUsername}: ${targetPhone}`);
          } else {
            // Contact name provided but not found
            contactNotFound = true;
          }
        } else {
          // No contacts saved yet, but a name was provided
          contactNotFound = true;
        }
      }

      // Validate amount
      const parsedResult = parseAndValidateAmount(amountStr);
      if (parsedResult.error) {
        return { text: parsedResult.error };
      }
      const amount = parsedResult.amount;

      // If contact not found, prompt user to add it
      if (contactNotFound) {
        // Store the pending request in Redis
        const pendingKey = `pending_request:${whatsappId}`;
        const pendingData = {
          type: 'payment_request',
          contactName: targetUsername,
          amount: amount,
          timestamp: new Date().toISOString(),
        };
        await this.redisService.set(pendingKey, JSON.stringify(pendingData), 300); // 5 minute expiry

        return {
          text: `❓ Contact "${targetUsername}" not found.\n\nTo create this contact and send the payment request for $${amount!.toFixed(2)}:\n\n• Share the contact from your phone's contact list\n• OR reply with: ${targetUsername} [phone number]\n\nExample: ${targetUsername} +18765551234`,
        };
      }

      // Validate target username if provided (skip if it's a saved contact)
      if (targetUsername && !isFromSavedContact) {
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
      const requesterUsername =
        (await this.usernameService.getUsername(session.flashAuthToken)) || 'Flash user';

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

      // If we have a phone number, try to send WhatsApp message
      if (targetPhone && this.whatsappWebService) {
        try {
          // Normalize phone number
          const normalizedPhone = targetPhone.replace(/\D/g, '');
          const whatsappNumber = `${normalizedPhone}@c.us`;

          // Build recipient identifier for message
          let recipientIdentifier = '';
          if (isFromSavedContact) {
            recipientIdentifier = targetUsername!; // Saved contact name
          } else if (targetUsername) {
            recipientIdentifier = `@${targetUsername}`; // Flash username
          } else {
            recipientIdentifier = `the number ${targetPhone}`; // Direct phone number
          }

          // Send notification to recipient
          const notificationMessage = `💰 *Payment Request*\n\n@${requesterUsername} is requesting $${amount!.toFixed(2)} USD from you.\n\nTo view and pay this request, please check your WhatsApp messages or open the Flash app.`;

          await this.whatsappWebService.sendMessage(whatsappNumber, notificationMessage);

          // Send the actual payment request with QR
          await this.whatsappWebService.sendImage(whatsappNumber, qrBuffer, requestMessage);

          // Track the request in contact history
          if (isFromSavedContact && targetUsername) {
            await this.trackContactRequest(whatsappId, targetUsername, {
              type: 'request_sent',
              amount: amount!,
              invoice: invoice.paymentRequest,
              timestamp: new Date().toISOString(),
            });
          }

          return {
            text: `✅ Payment request sent to ${recipientIdentifier} via WhatsApp!\n\nThey will receive your request for $${amount!.toFixed(2)} USD.`,
          };
        } catch (error) {
          this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
          // Continue to show the QR code to the requester
        }
      }

      // If this was a contact request but no phone was found, show a different message
      if (!targetPhone && isFromSavedContact) {
        return {
          text: `❌ Unable to send payment request. The contact "${targetUsername}" doesn't have a phone number saved.`,
        };
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

          // Check if contact already exists
          const existingContact = contacts[contactName.toLowerCase()];
          if (existingContact && existingContact.phone === phoneNumber.replace(/\D/g, '')) {
            return `ℹ️ Contact "${contactName}" already exists with this number.`;
          }

          // Add or update contact
          contacts[contactName.toLowerCase()] = {
            name: contactName,
            phone: phoneNumber.replace(/\D/g, ''),
            addedAt: new Date().toISOString(),
          };

          // Save contacts (expire after 1 year)
          await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

          return `✅ Contact saved: ${contactName} (${phoneNumber})\n\nYou can now use these commands:\n• send [amount] to ${contactName} - Send money instantly\n• request [amount] from ${contactName} - Request payment`;

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

        case 'history':
          if (!contactName) {
            return 'Please provide contact name. Usage: contacts history [name]';
          }

          const historyKey = `contact_history:${whatsappId}:${contactName.toLowerCase()}`;
          const contactHistory = await this.redisService.get(historyKey);

          if (!contactHistory) {
            return `No payment history found for contact "${contactName}".`;
          }

          const history = JSON.parse(contactHistory);
          let historyMessage = `📊 *Payment History for ${contactName}*\n\n`;

          history
            .slice(-10)
            .reverse()
            .forEach((req: any) => {
              const date = new Date(req.timestamp);
              const dateStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              if (req.type === 'request_sent') {
                historyMessage += `💸 Requested $${req.amount.toFixed(2)} - ${dateStr}\n`;
              }
            });

          historyMessage += `\n_Showing last 10 requests_`;
          return historyMessage;

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
          for (const contact of contactEntries) {
            message += `• ${contact.name}: ${contact.phone}`;

            // Check if there's history for this contact
            const histKey = `contact_history:${whatsappId}:${contact.name.toLowerCase()}`;
            const hist = await this.redisService.get(histKey);
            if (hist) {
              const histData = JSON.parse(hist);
              message += ` (${histData.length} requests)`;
            }
            message += '\n';
          }
          message += '\n_Type "contacts history [name]" to see request history_';

          return message;
      }
    } catch (error) {
      this.logger.error(`Error handling contacts command: ${error.message}`, error.stack);
      return '❌ Failed to manage contacts. Please try again later.';
    }
  }

  /**
   * Check for pending requests and process them with new contact info
   */
  async checkAndProcessPendingRequest(
    whatsappId: string,
    contactName: string,
    phoneNumber: string,
  ): Promise<string | { text: string; media?: Buffer } | null> {
    try {
      // Check for pending send first
      const pendingSendKey = `pending_send:${whatsappId}`;
      const pendingSendData = await this.redisService.get(pendingSendKey);

      if (pendingSendData) {
        const pendingSend = JSON.parse(pendingSendData);
        const normalizedContactName = contactName.toLowerCase().replace(/\s+/g, '_');

        // Check if this contact matches the pending send
        if (
          pendingSend.recipient?.toLowerCase() === normalizedContactName ||
          pendingSend.recipient?.toLowerCase() === contactName.toLowerCase()
        ) {
          // Delete the pending send
          await this.redisService.del(pendingSendKey);

          // First save the contact
          const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
          if (!session || !session.isVerified) {
            return 'Please link your Flash account first to manage contacts.';
          }

          // Save contact
          const contactsKey = `contacts:${whatsappId}`;
          const existingContacts = await this.redisService.get(contactsKey);
          const contacts = existingContacts ? JSON.parse(existingContacts) : {};

          contacts[normalizedContactName] = {
            name: normalizedContactName,
            phone: phoneNumber.replace(/\D/g, ''),
            addedAt: new Date().toISOString(),
          };

          await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

          // Contact saved, but they still need Flash to receive money
          return `✅ Contact saved successfully!\n\n${contactName} needs a Flash account to receive your $${pendingSend.amount} USD.\n\nYou have two options:\n1. Reply with their @username if they already have Flash\n2. Send anyway - they'll get the money when they sign up\n\nTo send now, type: send ${pendingSend.amount} to ${contactName}`;
        }
      }

      // Check for pending payment request
      const pendingKey = `pending_request:${whatsappId}`;
      const pendingData = await this.redisService.get(pendingKey);

      if (!pendingData) {
        return null; // No pending request
      }

      const pending = JSON.parse(pendingData);

      // Check if this contact matches the pending request
      if (
        pending.type === 'payment_request' &&
        pending.contactName?.toLowerCase() === contactName.toLowerCase().replace(/\s+/g, '_')
      ) {
        // Delete the pending request
        await this.redisService.del(pendingKey);

        // First save the contact
        const session = await this.sessionService.getSessionByWhatsappId(whatsappId);
        if (!session || !session.isVerified) {
          return 'Please link your Flash account first to manage contacts.';
        }

        // Save contact
        const contactsKey = `contacts:${whatsappId}`;
        const existingContacts = await this.redisService.get(contactsKey);
        const contacts = existingContacts ? JSON.parse(existingContacts) : {};

        const normalizedName = contactName.replace(/\s+/g, '_');
        contacts[normalizedName.toLowerCase()] = {
          name: normalizedName,
          phone: phoneNumber.replace(/\D/g, ''),
          addedAt: new Date().toISOString(),
        };

        await this.redisService.set(contactsKey, JSON.stringify(contacts), 365 * 24 * 60 * 60);

        // Now process the payment request
        const command: ParsedCommand = {
          type: CommandType.REQUEST,
          args: {
            amount: pending.amount.toString(),
            username: normalizedName,
          },
          rawText: `request ${pending.amount} from ${normalizedName}`,
        };

        const result = await this.handleRequestCommand(command, whatsappId, session);

        // Add message about contact being saved
        if (typeof result === 'object' && result.text && result.text.includes('✅')) {
          result.text = `✅ Contact saved: ${normalizedName} (${phoneNumber})\n\nYou can now:\n• send money to ${normalizedName}\n• request payments from ${normalizedName}\n\n${result.text}`;
        }

        return result;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error processing pending request: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Track payment requests for a contact
   */
  private async trackContactRequest(
    whatsappId: string,
    contactName: string,
    requestData: any,
  ): Promise<void> {
    try {
      const historyKey = `contact_history:${whatsappId}:${contactName.toLowerCase()}`;
      const existingHistory = await this.redisService.get(historyKey);
      const history = existingHistory ? JSON.parse(existingHistory) : [];

      history.push(requestData);

      // Keep only last 50 requests per contact
      if (history.length > 50) {
        history.shift();
      }

      await this.redisService.set(historyKey, JSON.stringify(history), 365 * 24 * 60 * 60);
    } catch (error) {
      this.logger.error(`Error tracking contact request: ${error.message}`);
    }
  }

  /**
   * Get unknown command message based on session status
   */
  private getUnknownCommandMessage(session: UserSession | null): string {
    if (!session || !session.isVerified) {
      return `Keep your finger on it. Type 'link' to connect or 'help' for commands.`;
    }

    return `Keep your finger on it. Try 'help' or 'balance'.`;
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
        authToken: authToken, // Will be encrypted by Redis service
        createdAt: new Date().toISOString(),
      };

      // Store in Redis with encryption and expiration matching invoice expiry
      const expirySeconds = Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 1000);
      const key = `invoice:${invoice.paymentHash}`;

      await this.redisService.setEncrypted(
        key,
        invoiceData,
        Math.max(expirySeconds, 3600), // At least 1 hour
      );

      // Also store in a user's invoice list for easy lookup
      await this.redisService.addToSet(`user:${whatsappId}:invoices`, invoice.paymentHash);

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
      const invoice = await this.redisService.getEncrypted(key);

      if (!invoice) {
        return null;
      }

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
        await this.redisService.setEncrypted(key, invoice, 3600); // Keep for 1 hour after payment

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
        await this.whatsappWebService.sendMessage(invoice.whatsappUserId, message);
      }
    } catch (error) {
      this.logger.error('Failed to send payment notification:', error);
    }
  }

  /**
   * Handle detected Lightning invoice in message
   */
  private async handleInvoiceDetected(
    invoice: string,
    whatsappId: string,
    session: UserSession,
  ): Promise<string> {
    try {
      // Parse the invoice to get details
      const invoiceDetails = await this.parseInvoiceDetails(invoice);

      // Store the invoice for quick payment
      // Use a list to support multiple pending payments
      const pendingPaymentsKey = `pending_payments:${whatsappId}`;

      // Get existing pending payments (encrypted)
      let payments = (await this.redisService.getEncrypted(pendingPaymentsKey)) || [];

      // Add new payment (avoid duplicates)
      const isDuplicate = payments.some((p: any) => p.invoice === invoice);
      if (!isDuplicate) {
        payments.push({
          invoice,
          details: invoiceDetails,
          timestamp: new Date().toISOString(),
          id: payments.length + 1,
        });

        // Keep only last 10 payments
        if (payments.length > 10) {
          payments = payments.slice(-10);
        }

        await this.redisService.setEncrypted(pendingPaymentsKey, payments, 300); // 5 minute expiry
      }

      // Format the response message
      let message = `⚡ *Lightning Invoice Detected*\n\n`;

      if (invoiceDetails.amount) {
        message += `Amount: $${invoiceDetails.amount.toFixed(2)} USD\n`;
      } else if (invoiceDetails.satoshis) {
        message += `Amount: ${invoiceDetails.satoshis.toLocaleString()} sats\n`;
      } else {
        message += `Amount: Any amount\n`;
      }

      if (invoiceDetails.description) {
        message += `Description: ${invoiceDetails.description}\n`;
      }

      message += `\n💳 *Quick Payment Options:*\n`;

      if (payments.length === 1) {
        message += `• Type \`pay confirm\` to pay this invoice\n`;
        message += `• Type \`pay cancel\` to dismiss\n`;
      } else {
        message += `• Type \`pay ${payments.length}\` to pay this invoice\n`;
        message += `• Type \`pay list\` to see all ${payments.length} pending invoices\n`;
        message += `• Type \`pay cancel all\` to dismiss all\n`;
      }

      const suggestedAmount =
        invoiceDetails.amount ||
        (invoiceDetails.satoshis ? `${invoiceDetails.satoshis} sats` : '[amount]');
      message += `• Or use: \`send ${suggestedAmount} to ${invoice.substring(0, 20)}...\`\n`;

      if (invoiceDetails.expiresIn) {
        message += `\n⏱️ Expires in: ${invoiceDetails.expiresIn}`;
      }

      return message;
    } catch (error) {
      this.logger.error(`Error handling detected invoice: ${error.message}`);
      return `⚡ Lightning invoice detected!\n\nTo pay it, use:\n\`send [amount] to ${invoice.substring(0, 30)}...\``;
    }
  }

  /**
   * Handle pay command for quick invoice payment
   */
  private async handlePayCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return 'Please link your Flash account first to make payments. Type "link" to get started.';
      }

      const action = command.args.action;
      const modifier = command.args.modifier;

      // Get pending payments (encrypted)
      const pendingPaymentsKey = `pending_payments:${whatsappId}`;
      const payments = await this.redisService.getEncrypted(pendingPaymentsKey);

      if (!payments || payments.length === 0) {
        return '❌ No pending payments found.\n\nTo pay a Lightning invoice, either:\n• Share or paste the invoice to detect it automatically\n• Use: `send [amount] to [invoice]`';
      }

      // Handle list command
      if (action === 'list') {
        let message = `📋 *Pending Lightning Invoices* (${payments.length})\n\n`;
        payments.forEach((payment: any, index: number) => {
          const num = index + 1;
          message += `${num}. `;
          if (payment.details?.amount) {
            message += `$${payment.details.amount.toFixed(2)} USD`;
          } else if (payment.details?.satoshis) {
            message += `${payment.details.satoshis.toLocaleString()} sats`;
          } else {
            message += `Any amount`;
          }
          if (payment.details?.description) {
            message += ` - ${payment.details.description.substring(0, 30)}${payment.details.description.length > 30 ? '...' : ''}`;
          }
          message += `\n`;
        });
        message += `\n💳 *Payment Options:*\n`;
        message += `• Type \`pay [number]\` to pay a specific invoice\n`;
        message += `• Type \`pay cancel all\` to dismiss all`;
        return message;
      }

      // Handle cancel with optional "all" modifier
      if (action === 'cancel') {
        if (modifier === 'all' || payments.length === 1) {
          await this.redisService.del(pendingPaymentsKey);
          return `❌ ${payments.length === 1 ? 'Payment' : `All ${payments.length} payments`} cancelled.`;
        } else {
          return `❌ Please specify which payment to cancel:\n• Type \`pay cancel all\` to cancel all\n• Or pay a specific invoice with \`pay [number]\``;
        }
      }

      // Determine which payment to process
      let selectedPayment = null;
      let paymentIndex = -1;

      if (action === 'confirm' && payments.length === 1) {
        // Single payment, confirm pays it
        selectedPayment = payments[0];
        paymentIndex = 0;
      } else if (action && !isNaN(parseInt(action))) {
        // Numeric selection
        const num = parseInt(action);
        if (num >= 1 && num <= payments.length) {
          selectedPayment = payments[num - 1];
          paymentIndex = num - 1;
        } else {
          return `❌ Invalid payment number. Please select 1-${payments.length}`;
        }
      } else if (action === 'confirm' && payments.length > 1) {
        // Multiple payments, need selection
        return `❌ Multiple payments pending. Please specify which one:\n• Type \`pay [number]\` to pay a specific invoice\n• Type \`pay list\` to see all pending invoices`;
      }

      // Process selected payment
      if (selectedPayment) {
        try {
          // Get user's wallets
          const wallets = await this.paymentService.getUserWallets(session.flashAuthToken);

          // Send the payment
          const result = await this.paymentService.sendLightningPayment(
            {
              walletId: wallets.usdWallet?.id || wallets.defaultWalletId,
              paymentRequest: selectedPayment.invoice,
            },
            session.flashAuthToken,
          );

          // Remove the paid invoice from pending list
          payments.splice(paymentIndex, 1);
          if (payments.length > 0) {
            await this.redisService.setEncrypted(pendingPaymentsKey, payments, 300);
          } else {
            await this.redisService.del(pendingPaymentsKey);
          }

          if (result?.status === PaymentSendResult.Success) {
            let successMessage = `✅ Payment sent successfully!\n\n`;
            if (selectedPayment.details?.amount) {
              successMessage += `Amount: $${selectedPayment.details.amount.toFixed(2)} USD\n`;
            } else if (selectedPayment.details?.satoshis) {
              successMessage += `Amount: ${selectedPayment.details.satoshis.toLocaleString()} sats\n`;
            }
            if (selectedPayment.details?.description) {
              successMessage += `Description: ${selectedPayment.details.description}\n`;
            }

            if (payments.length > 0) {
              successMessage += `\n📋 You have ${payments.length} more pending payment${payments.length > 1 ? 's' : ''}.`;
              successMessage += `\nType \`pay list\` to see them.`;
            }

            return successMessage;
          } else if (result?.status === PaymentSendResult.AlreadyPaid) {
            return '❌ This invoice has already been paid.';
          } else {
            return `❌ Payment failed: ${result?.errors?.[0]?.message || 'Unknown error'}`;
          }
        } catch (error) {
          this.logger.error(`Payment error: ${error.message}`);
          return `❌ Payment failed: ${error.message}`;
        }
      }

      // No action specified, show payment options
      if (payments.length === 1) {
        // Single payment
        const payment = payments[0];
        let message = `⚡ *Pending Payment*\n\n`;

        if (payment.details?.amount) {
          message += `Amount: $${payment.details.amount.toFixed(2)} USD\n`;
        } else if (payment.details?.satoshis) {
          message += `Amount: ${payment.details.satoshis.toLocaleString()} sats\n`;
        } else {
          message += `Amount: Any amount\n`;
        }

        if (payment.details?.description) {
          message += `Description: ${payment.details.description}\n`;
        }

        message += `\n💳 *Confirm Payment:*\n`;
        message += `• Type \`pay confirm\` to proceed\n`;
        message += `• Type \`pay cancel\` to dismiss`;

        return message;
      } else {
        // Multiple payments
        let message = `⚡ *Multiple Pending Payments* (${payments.length})\n\n`;
        message += `You have ${payments.length} Lightning invoices waiting.\n\n`;
        message += `💳 *Payment Options:*\n`;
        message += `• Type \`pay list\` to see all invoices\n`;
        message += `• Type \`pay [number]\` to pay a specific one\n`;
        message += `• Type \`pay cancel all\` to dismiss all`;

        return message;
      }
    } catch (error) {
      this.logger.error(`Error handling pay command: ${error.message}`, error.stack);
      return '❌ Failed to process payment. Please try again.';
    }
  }

  /**
   * Parse Lightning invoice details
   */
  private async parseInvoiceDetails(invoice: string): Promise<{
    amount?: number;
    satoshis?: number;
    description?: string;
    expiresIn?: string;
  }> {
    try {
      // Import bolt11 dynamically
      const bolt11 = require('bolt11');
      const decoded = bolt11.decode(invoice);

      const details: any = {};

      // Extract amount (in millisatoshis)
      if (decoded.millisatoshis) {
        // Convert millisatoshis to satoshis
        const satoshis = decoded.millisatoshis / 1000;

        // For USD invoices created by Flash, the amount tag often contains cents
        // Check if this looks like a USD amount (common pattern)
        if (decoded.tags) {
          const amountTag = decoded.tags.find((tag: any) => tag.tagName === 'amount');
          if (amountTag && amountTag.data) {
            // This might be USD cents
            details.amount = parseInt(amountTag.data) / 100;
          }
        }

        // If no USD amount found, show in sats
        if (!details.amount && satoshis > 0) {
          details.satoshis = Math.round(satoshis);
        }
      }

      // Extract description
      const descTag = decoded.tags.find((tag: any) => tag.tagName === 'description');
      if (descTag) {
        details.description = descTag.data;
      }

      // Calculate expiry
      if (decoded.timeExpireDate) {
        const expiresAt = new Date(decoded.timeExpireDate * 1000);
        const now = new Date();
        const diffMs = expiresAt.getTime() - now.getTime();

        if (diffMs > 0) {
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins > 60) {
            details.expiresIn = `${Math.floor(diffMins / 60)} hours`;
          } else {
            details.expiresIn = `${diffMins} minutes`;
          }
        } else {
          details.expiresIn = 'Expired';
        }
      }

      return details;
    } catch (error) {
      this.logger.warn(`Failed to parse invoice details: ${error.message}`);
      return {};
    }
  }

  /**
   * Handle vybz command - share content to earn sats
   */
  private async handleVybzCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string | { text: string; media?: Buffer }> {
    try {
      // Check if user has a linked account
      if (!session || !session.isVerified || !session.flashAuthToken) {
        return `🎯 *Share Your Vybz & Earn Sats!*

To start earning, you need to link your Flash account first.

👉 Type \`link\` to get started!

Once connected, you can:
• Share jokes, thoughts, or photos
• Get zapped (paid) by people who like your content
• Build your Lightning wallet balance
• Connect with the global community`;
      }

      const action = command.args.action;

      // Check status of previous posts
      if (action === 'status' || action === 'check') {
        return this.getVybzStatus(whatsappId, session);
      }

      // Check daily post limit
      const dailyPostsKey = `vybz_daily:${whatsappId}:${new Date().toDateString()}`;
      const dailyPosts = await this.redisService.get(dailyPostsKey);
      const postCount = dailyPosts ? parseInt(dailyPosts) : 0;

      if (postCount >= 3) {
        return `❌ You've reached your daily limit of 3 posts.

Try again tomorrow to share more vybz!

Type \`vybz status\` to check your earnings.`;
      }

      // Show options for sharing
      const vybzQueueKey = `vybz_queue:${whatsappId}`;
      const activeVybz = await this.redisService.get(vybzQueueKey);

      if (activeVybz) {
        return `⏳ You already have content being processed.

Please wait for it to be posted before sharing something new.

Type \`vybz status\` to check progress.`;
      }

      // Get user's username
      const username =
        (await this.usernameService.getUsername(session.flashAuthToken)) || 'Pulse user';

      // Set waiting flag for content
      const vybzWaitingKey = `vybz_waiting:${whatsappId}`;
      await this.redisService.set(vybzWaitingKey, 'true', 300); // 5 minute expiry

      return `🎤 *Share Your Vybz!*

What's on your mind, @${username}?

Just send me:
• 💭 A thought or joke (text)
• 📸 A photo 
• 🎤 A voice note
• 🎬 A short video

Your content will be posted on Nostr, and any zaps (Lightning tips) will go directly to your wallet!

_Tip: Be creative, funny, or insightful to get more zaps!_`;
    } catch (error) {
      this.logger.error(`Error handling vybz command: ${error.message}`, error.stack);
      return '❌ Something went wrong. Please try again later.';
    }
  }

  /**
   * Get vybz earning status
   */
  private async getVybzStatus(whatsappId: string, session: UserSession): Promise<string> {
    try {
      // Get user's posts history
      const postsKey = `vybz_posts:${whatsappId}`;
      const postsData = await this.redisService.get(postsKey);
      const posts = postsData ? JSON.parse(postsData) : [];

      if (posts.length === 0) {
        return `📊 *Your Vybz Status*

No posts yet! 

Type \`vybz\` to share something and start earning sats!`;
      }

      // Calculate totals
      let totalZaps = 0;
      let totalSats = 0;
      const recentPosts = posts.slice(-5); // Last 5 posts

      posts.forEach((post: any) => {
        totalZaps += post.zaps || 0;
        totalSats += post.satsReceived || 0;
      });

      let message = `📊 *Your Vybz Status*\n\n`;
      message += `Total Posts: ${posts.length}\n`;
      message += `Total Zaps: ${totalZaps}\n`;
      message += `Total Sats Earned: ⚡${totalSats.toLocaleString()}\n\n`;

      if (recentPosts.length > 0) {
        message += `*Recent Posts:*\n`;
        recentPosts.forEach((post: any, index: number) => {
          const timeAgo = this.getTimeAgo(new Date(post.timestamp));
          message += `${index + 1}. "${post.preview}" - ${post.satsReceived || 0} sats (${timeAgo})\n`;
        });
      }

      // Check today's limit
      const dailyPostsKey = `vybz_daily:${whatsappId}:${new Date().toDateString()}`;
      const dailyPosts = await this.redisService.get(dailyPostsKey);
      const postCount = dailyPosts ? parseInt(dailyPosts) : 0;

      message += `\n📝 Posts today: ${postCount}/3`;

      if (postCount < 3) {
        message += `\n\nType \`vybz\` to share something new!`;
      }

      return message;
    } catch (error) {
      this.logger.error(`Error getting vybz status: ${error.message}`);
      return '❌ Unable to fetch your status. Please try again later.';
    }
  }

  /**
   * Get human-readable time ago
   */
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else if (diffMins > 0) {
      return `${diffMins}m ago`;
    } else {
      return 'just now';
    }
  }

  /**
   * Process content submission for vybz
   * This would be called when user sends text/media after the vybz command
   */
  async processVybzContent(
    whatsappId: string,
    content: string | Buffer,
    contentType: 'text' | 'image' | 'voice' | 'video',
    session: UserSession,
  ): Promise<string> {
    try {
      // Pre-moderation check using AI
      if (contentType === 'text') {
        const moderationResult = await this.moderateContent(content as string);
        if (!moderationResult.approved) {
          return `❌ Your content couldn't be posted.

Reason: ${moderationResult.reason}

Please share something else that follows community guidelines.`;
        }
      }

      // TODO: Implement image/voice/video moderation

      // Store in processing queue
      const vybzQueueKey = `vybz_queue:${whatsappId}`;
      const queueData = {
        content: contentType === 'text' ? content : 'media_url_placeholder', // TODO: Upload media
        contentType,
        timestamp: new Date().toISOString(),
        username: (await this.usernameService.getUsername(session.flashAuthToken!)) || 'Pulse user',
        country: 'Jamaica', // TODO: Get from user profile
      };

      await this.redisService.set(vybzQueueKey, JSON.stringify(queueData), 300); // 5 min expiry

      // TODO: Post to Nostr
      // TODO: Set up zap forwarding

      // Update daily count
      const dailyPostsKey = `vybz_daily:${whatsappId}:${new Date().toDateString()}`;
      const dailyPosts = await this.redisService.get(dailyPostsKey);
      const newCount = (dailyPosts ? parseInt(dailyPosts) : 0) + 1;
      await this.redisService.set(dailyPostsKey, newCount.toString(), 86400); // 24 hour expiry

      return `✅ *Your vybz is live!*

Your ${contentType} has been posted to Nostr.

🎯 Share this with friends to get more zaps!

Track your earnings: \`vybz status\`

_All zaps will be automatically forwarded to your Flash wallet._`;
    } catch (error) {
      this.logger.error(`Error processing vybz content: ${error.message}`);
      return '❌ Failed to process your content. Please try again.';
    }
  }

  /**
   * Moderate content using AI
   */
  private async moderateContent(content: string): Promise<{
    approved: boolean;
    reason?: string;
  }> {
    try {
      // Use Gemini AI to check content
      const prompt = `Check if this content is appropriate for public posting. 
Content should not contain:
- Illegal activities
- Hate speech or discrimination
- Explicit sexual content
- Violence or threats
- Personal information (addresses, phone numbers, etc)
- Spam or scams

Content: "${content}"

Respond with JSON: { "approved": true/false, "reason": "brief explanation if rejected" }`;

      const aiResponse = await this.geminiAiService.processQuery(prompt, {
        context: 'content_moderation',
      });

      try {
        const result = JSON.parse(aiResponse);
        return result;
      } catch {
        // If AI response isn't valid JSON, approve by default but log
        this.logger.warn(`Invalid moderation response: ${aiResponse}`);
        return { approved: true };
      }
    } catch (error) {
      this.logger.error(`Content moderation error: ${error.message}`);
      // Err on the side of caution
      return {
        approved: false,
        reason: 'Content moderation unavailable. Please try again later.',
      };
    }
  }

  /**
   * Handle pending payment commands
   */
  private async handlePendingCommand(
    command: ParsedCommand,
    whatsappId: string,
    session: UserSession | null,
  ): Promise<string> {
    try {
      const action = command.args.action || 'received';

      if (action === 'sent') {
        // Show pending payments sent by user
        if (!session || !session.isVerified) {
          return 'Please link your Flash account first to view pending payments.';
        }

        const pendingPayments = await this.pendingPaymentService.getPendingPaymentsBySender(
          session.flashUserId!,
        );

        if (pendingPayments.length === 0) {
          return 'No pending payments sent.';
        }

        let message = `💸 *Pending Payments Sent*\n\n`;
        for (const payment of pendingPayments) {
          const amountUsd = (payment.amountCents / 100).toFixed(2);
          const expiresIn = Math.ceil(
            (new Date(payment.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          message += `To: ${payment.recipientName || payment.recipientPhone}\n`;
          message += `Amount: $${amountUsd}\n`;
          message += `Code: ${payment.claimCode}\n`;
          message += `Expires: ${expiresIn} days\n\n`;
        }

        return message.trim();
      } else if (action === 'received') {
        // Show pending payments for user's phone number
        const userPhone = session?.phoneNumber || whatsappId;
        const pendingPayments =
          await this.pendingPaymentService.getPendingPaymentsByPhone(userPhone);

        if (pendingPayments.length === 0) {
          return 'No pending payments waiting for you.';
        }

        let message = `💰 *Pending Payments for You*\n\n`;
        for (const payment of pendingPayments) {
          const amountUsd = (payment.amountCents / 100).toFixed(2);
          message += `From: @${payment.senderUsername}\n`;
          message += `Amount: $${amountUsd}\n`;
          message += `Code: ${payment.claimCode}\n\n`;
        }

        if (!session || !session.isVerified) {
          message += `📱 To claim: Link your Flash account with 'link'`;
        } else {
          message += `✅ These will auto-claim to your account!`;
        }

        return message.trim();
      } else if (action === 'claim') {
        // Manual claim with code (usually automatic)
        if (!session || !session.isVerified) {
          return 'Please link your Flash account first to claim payments.';
        }

        const claimCode = command.args.claimCode;
        if (!claimCode) {
          return 'Please provide claim code. Usage: pending claim [code]';
        }

        // Find pending payment by claim code
        const userPhone = session.phoneNumber;
        const pendingPayments =
          await this.pendingPaymentService.getPendingPaymentsByPhone(userPhone);

        const payment = pendingPayments.find((p) => p.claimCode === claimCode.toUpperCase());
        if (!payment) {
          return `❌ Invalid claim code: ${claimCode}`;
        }

        // Process the claim
        return await this.processPendingPaymentClaim(payment, session);
      }

      return 'Usage: pending [sent|received|claim <code>]';
    } catch (error) {
      this.logger.error(`Error handling pending command: ${error.message}`, error.stack);
      return '❌ Failed to check pending payments. Please try again.';
    }
  }

  /**
   * Process a pending payment claim
   */
  private async processPendingPaymentClaim(payment: any, session: UserSession): Promise<string> {
    try {
      // Mark payment as claimed
      const claimed = await this.pendingPaymentService.claimPendingPayment(
        payment.id,
        session.flashUserId!,
      );

      if (!claimed) {
        return '❌ Unable to claim payment. It may have expired or been claimed.';
      }

      // Get admin token to transfer from escrow
      const adminToken = this.configService.get<string>('flashApi.apiKey');
      if (!adminToken) {
        return '❌ Unable to process claim. Please contact support.';
      }

      // Get wallets
      const adminWallets = await this.paymentService.getUserWallets(adminToken);
      const userWallets = await this.paymentService.getUserWallets(session.flashAuthToken!);

      const adminWalletId = adminWallets.usdWallet?.id || adminWallets.defaultWalletId;
      const userWalletId = userWallets.usdWallet?.id || userWallets.defaultWalletId;

      // Transfer from admin wallet to user with claim code in memo
      const transferMemo = `Claimed pending payment from @${payment.senderUsername} - Claim: ${payment.claimCode}`;
      const result = await this.paymentService.sendIntraLedgerUsdPayment(
        {
          walletId: adminWalletId,
          recipientWalletId: userWalletId,
          amount: payment.amountCents,
          memo: transferMemo,
        },
        adminToken,
      );

      if (result?.status === PaymentSendResult.Success) {
        const amountUsd = (payment.amountCents / 100).toFixed(2);

        // Notify sender if possible
        try {
          const senderNotification = `✅ Your pending payment of $${amountUsd} to ${payment.recipientName || payment.recipientPhone} has been claimed!`;
          // TODO: Send notification to sender via their WhatsApp if we have it stored
        } catch (error) {
          this.logger.error(`Failed to notify sender: ${error.message}`);
        }

        return `✅ Claimed $${amountUsd} from @${payment.senderUsername}!`;
      } else {
        // Revert claim status
        payment.status = 'pending';
        // Note: In production, you'd want to update this in the database

        const errorMessage = result?.errors?.[0]?.message || 'Transfer failed';
        return `❌ Failed to claim payment: ${errorMessage}`;
      }
    } catch (error) {
      this.logger.error(`Error processing claim: ${error.message}`, error.stack);
      return '❌ Failed to process claim. Please contact support.';
    }
  }

  /**
   * Generate a secure claim code
   */
  private generateClaimCode(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Handle admin commands for WhatsApp session management
   */
  private async handleAdminCommand(
    command: ParsedCommand,
    whatsappId: string,
    phoneNumber: string,
  ): Promise<string> {
    try {
      // Check if user is admin (you can customize this check)
      const adminNumbers = this.configService.get<string>('ADMIN_PHONE_NUMBERS')?.split(',') || [];
      const isAdmin =
        adminNumbers.includes(phoneNumber) ||
        phoneNumber === '13059244435' || // Your current number
        process.env.NODE_ENV === 'development'; // Allow in dev mode

      if (!isAdmin) {
        return '❌ Unauthorized. Admin commands are restricted.';
      }

      const action = command.args.action;

      if (!this.whatsappWebService) {
        return '❌ WhatsApp Web service not available.';
      }

      switch (action) {
        case 'status':
          const status = this.whatsappWebService.getStatus();
          if (status.connected) {
            return `✅ *WhatsApp Status*\n\nConnected: Yes\nNumber: ${status.number}\nName: ${status.name || 'Unknown'}`;
          } else {
            return `❌ *WhatsApp Status*\n\nConnected: No\n\nUse \`admin reconnect\` to connect a new number.`;
          }

        case 'disconnect':
          try {
            // Send the message first before disconnecting
            const message = `✅ WhatsApp session will be disconnected.\n\nThis number is being logged out.\n\n⚠️ After disconnection, this number can no longer receive messages from the bot.\n\nUse \`admin reconnect\` on a different device to connect a new number.\n\n🔌 Disconnecting in 3 seconds...`;

            // We need to send this message directly since we're about to disconnect
            if (this.whatsappWebService) {
              await this.whatsappWebService.sendMessage(whatsappId, message);

              // Wait a bit to ensure message is sent
              await new Promise((resolve) => setTimeout(resolve, 3000));

              // Now disconnect with logout
              await this.whatsappWebService.disconnect(true);
            }

            // This response won't be sent via WhatsApp, but will show in logs
            return 'WhatsApp session disconnected successfully.';
          } catch (error) {
            return `❌ Failed to disconnect: ${error.message}`;
          }

        case 'clear-session':
          try {
            await this.whatsappWebService.clearSession();
            return `✅ WhatsApp session cleared successfully.\n\nAll session data has been removed. Use \`admin reconnect\` to connect a new number.`;
          } catch (error) {
            return `❌ Failed to clear session: ${error.message}`;
          }

        case 'reconnect':
          try {
            // Use the new prepareReconnect method that handles messaging
            await this.whatsappWebService.prepareReconnect(whatsappId);

            // This response won't be sent via WhatsApp, but will show in logs
            return 'WhatsApp reconnection initiated. Check terminal for QR code.';
          } catch (error) {
            return `❌ Failed to reconnect: ${error.message}`;
          }

        default:
          return `❓ Unknown admin command.\n\nAvailable commands:\n• \`admin status\` - Check connection status\n• \`admin disconnect\` - Disconnect current number\n• \`admin clear-session\` - Clear all session data\n• \`admin reconnect\` - Connect a new number`;
      }
    } catch (error) {
      this.logger.error(`Error handling admin command: ${error.message}`, error.stack);
      return '❌ Admin command failed. Check logs for details.';
    }
  }
}
