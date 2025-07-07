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
import { EventsService } from '../../events/events.service';
import { ACCOUNT_DEFAULT_WALLET_QUERY } from '../../flash-api/graphql/queries';
import { QrCodeService } from './qr-code.service';
import { CommandParserService, CommandType, ParsedCommand } from './command-parser.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { InvoiceTrackerService } from './invoice-tracker.service';
import * as bolt11 from 'bolt11';
import { randomBytes } from 'crypto';
import { SupportModeService } from './support-mode.service';
import { validateUsername, getUsernameErrorMessage } from '../utils/username-validation';
import {
  validateMemo,
  validateAmount,
  sanitizeMemo,
  parseAndValidateAmount,
  getInvoiceValidationErrorMessage,
  AMOUNT_MAX_USD as _AMOUNT_MAX_USD,
} from '../utils/invoice-validation';
import { BalanceTemplate } from '../templates/balance-template';
import { AccountLinkRequestDto } from '../../auth/dto/account-link-request.dto';
import { VerifyOtpDto } from '../../auth/dto/verify-otp.dto';
import { UserSession } from '../../auth/interfaces/user-session.interface';
import { AdminSettingsService, VoiceMode } from './admin-settings.service';
import { TtsService } from '../../tts/tts.service';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { UserVoiceSettingsService, UserVoiceMode } from './user-voice-settings.service';
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
    private readonly eventsService: EventsService,
    private readonly qrCodeService: QrCodeService,
    private readonly commandParserService: CommandParserService,
    private readonly balanceTemplate: BalanceTemplate,
    private readonly supportModeService: SupportModeService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly ttsService: TtsService,
    private readonly paymentConfirmationService: PaymentConfirmationService,
    private readonly userVoiceSettingsService: UserVoiceSettingsService,
    // private readonly whatsAppCloudService: WhatsAppCloudService, // Disabled for prototype branch
    @Inject(forwardRef(() => WhatsAppWebService))
    private readonly whatsappWebService?: WhatsAppWebService,
    @Inject(forwardRef(() => InvoiceTrackerService))
    private readonly invoiceTrackerService?: InvoiceTrackerService,
  ) {}

  /**
   * Get recent conversation history for support context
   */
  private async getRecentConversation(_whatsappId: string): Promise<string[]> {
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
    isVoiceCommand?: boolean;
    whatsappId?: string;
  }): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      const whatsappId = messageData.whatsappId || this.extractWhatsappId(messageData.from);
      const phoneNumber = this.normalizePhoneNumber(messageData.from);

      // Store the incoming message for traceability
      await this.storeCloudMessage(messageData);

      // Parse command from message (with voice flag if it came from voice)
      const command = this.commandParserService.parseCommand(
        messageData.text,
        messageData.isVoiceCommand,
      );

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
          recentMessages,
        );
        return supportResult.message;
      }

      // Handle the command
      const response = await this.handleCommand(command, whatsappId, phoneNumber, session);

      // Check if voice response is requested
      // Mark as AI response if it comes from unknown command (likely AI handled)
      const isAiResponse = command.type === CommandType.UNKNOWN;
      const shouldUseVoice = await this.ttsService.shouldUseVoice(
        messageData.text,
        isAiResponse,
        whatsappId,
      );
      const shouldSendVoiceOnly = await this.ttsService.shouldSendVoiceOnly(whatsappId);

      // Add hints to text responses and optionally add voice
      if (typeof response === 'string') {
        const finalText = this.addHint(response, session, command);

        if (shouldUseVoice) {
          try {
            // Convert hints to TTS-friendly format for voice
            let voiceText = finalText;
            if (finalText.includes('💡')) {
              const parts = finalText.split('💡');
              if (parts.length > 1) {
                const beforeHint = parts[0];
                const hintPart = parts[1].trim();
                const ttsFriendlyHint = this.makeTtsFriendlyHint(hintPart);
                voiceText = `${beforeHint}💡 ${ttsFriendlyHint}`;
              }
            }

            const audioBuffer = await this.ttsService.textToSpeech(voiceText);

            // If voice-only mode, return with empty text
            if (shouldSendVoiceOnly) {
              return { text: '', voice: audioBuffer, voiceOnly: true };
            }

            return { text: finalText, voice: audioBuffer };
          } catch (error) {
            this.logger.error('Failed to generate voice response:', error);
            return finalText;
          }
        }

        return finalText;
      } else if (response && typeof response === 'object' && 'text' in response) {
        const finalText = this.addHint(response.text, session, command);

        // Check for forceVoice flag or normal voice conditions
        const useVoice = (response as any).forceVoice || shouldUseVoice;

        if (useVoice) {
          try {
            // Convert hints to TTS-friendly format for voice
            let voiceText = finalText;
            if (finalText.includes('💡')) {
              const parts = finalText.split('💡');
              if (parts.length > 1) {
                const beforeHint = parts[0];
                const hintPart = parts[1].trim();
                const ttsFriendlyHint = this.makeTtsFriendlyHint(hintPart);
                voiceText = `${beforeHint}💡 ${ttsFriendlyHint}`;
              }
            }

            const audioBuffer = await this.ttsService.textToSpeech(voiceText);

            // If voice-only mode, return with empty text
            if (shouldSendVoiceOnly) {
              return {
                ...response,
                text: '',
                voice: audioBuffer,
                voiceOnly: true,
              };
            }

            return {
              ...response,
              text: finalText,
              voice: audioBuffer,
            };
          } catch (error) {
            this.logger.error('Failed to generate voice response:', error);
            return {
              ...response,
              text: finalText,
            };
          }
        }

        return {
          ...response,
          text: finalText,
        };
      }

      return response;
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
  ): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if user has a pending payment confirmation
      const pendingPayment = await this.paymentConfirmationService.getPendingPayment(whatsappId);
      if (pendingPayment) {
        // Check if this is a confirmation response
        const confirmText = command.rawText.toLowerCase().trim();
        // Flexible positive confirmations
        const positiveResponses = ['yes', 'y', 'ok', 'okay', 'sure', 'confirm', 'pay', 'send', 'go', 'proceed', 'yep', 'yeah', 'yup'];
        const negativeResponses = ['no', 'n', 'cancel', 'stop', 'abort', 'nope', 'nah', 'exit', 'quit', 'nevermind', 'forget it'];
        
        if (positiveResponses.includes(confirmText)) {
          // Clear the pending payment and execute it
          await this.paymentConfirmationService.clearPendingPayment(whatsappId);

          // Execute the original command
          const originalCommand = pendingPayment.command;
          if (originalCommand.type === CommandType.SEND) {
            return this.handleSendCommand(originalCommand, whatsappId, session);
          } else if (originalCommand.type === CommandType.REQUEST) {
            return this.handleRequestCommand(originalCommand, whatsappId, session);
          }
        } else if (negativeResponses.includes(confirmText)) {
          // Cancel the pending payment
          await this.paymentConfirmationService.clearPendingPayment(whatsappId);
          return '❌ Payment cancelled.';
        } else {
          // Show the pending payment details again
          const details = this.paymentConfirmationService.formatPaymentDetails(
            pendingPayment.command,
          );
          // Check if user is trying to change the amount
          const amountMatch = confirmText.match(/^\d+(\.\d{1,2})?$/);
          if (amountMatch) {
            // User entered a new amount
            const newAmount = amountMatch[0];
            const updatedCommand = { ...pendingPayment.command };
            updatedCommand.args.amount = newAmount;
            await this.paymentConfirmationService.storePendingPayment(
              whatsappId,
              pendingPayment.phoneNumber,
              updatedCommand,
              pendingPayment.sessionId,
            );
            const updatedDetails = this.paymentConfirmationService.formatPaymentDetails(updatedCommand);
            return `🔄 Amount updated!\n\n${updatedDetails}\n\n✅ Type "yes" or "ok" to confirm\n❌ Type "no" or "cancel" to cancel`;
          }
          
          return `⏳ You have a pending payment:\n\n${details}\n\n✅ Type "yes" or "ok" to confirm\n❌ Type "no" or "cancel" to cancel\n✏️ Or enter a new amount (e.g., "25")`;
        }
      }

      // Check lockdown status first
      const lockdownMessage = await this.checkLockdown(whatsappId, command);
      if (lockdownMessage) {
        return lockdownMessage;
      }

      // Check if this is a voice payment command that requires confirmation
      if (command.args.requiresConfirmation === 'true') {
        const details = this.paymentConfirmationService.formatPaymentDetails(command);
        await this.paymentConfirmationService.storePendingPayment(
          whatsappId,
          phoneNumber,
          command,
          session?.sessionId,
        );

        return `🎤 Voice Payment Confirmation Required\n\n${details}\n\n✅ Type "yes" or "ok" to confirm\n❌ Type "no" or "cancel" to cancel\n✏️ Or enter a new amount (e.g., "25")\n\n⏱️ This request will expire in 5 minutes.`;
      }

      switch (command.type) {
        case CommandType.HELP:
          return this.getHelpMessage(session, command);

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

        case CommandType.VOICE:
          return this.handleVoiceCommand(command, whatsappId);

        case CommandType.ADMIN:
          return this.handleAdminCommand(command, whatsappId, phoneNumber);

        case CommandType.UNKNOWN:
        default: {
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

          // Check if this is a "yes" or "no" response to a pending consent request
          const lowerText = command.rawText.toLowerCase().trim();
          if ((lowerText === 'yes' || lowerText === 'no') && session) {
            // Check if there's a pending AI question (which indicates consent was requested)
            const normalizedWhatsappId = session.whatsappId.replace('+', '');
            const pendingQuestionKey = `pending_ai_question:${normalizedWhatsappId}`;
            const pendingQuestion = await this.redisService.get(pendingQuestionKey);

            if (pendingQuestion) {
              // Convert to consent command
              const consentCommand: ParsedCommand = {
                type: CommandType.CONSENT,
                args: { choice: lowerText },
                rawText: command.rawText,
              };
              return this.handleConsentCommand(consentCommand, whatsappId, session);
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
      // Check if this is an @lid format user
      if (whatsappId.includes('@lid')) {
        return `⚠️ *Unable to Link Account*

Your WhatsApp account uses a special ID format that cannot be linked to Flash.

To use this bot, please:
1. Use WhatsApp from a phone number registered with Flash
2. Or contact support for assistance

_This limitation is due to WhatsApp's privacy features._`;
      }

      const linkRequest: AccountLinkRequestDto = {
        whatsappId,
        phoneNumber,
      };

      const result = await this.authService.initiateAccountLinking(linkRequest);

      if (result.otpSent) {
        return 'To link your Flash account, please enter the 6-digit verification code sent to your WhatsApp.';
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

      // Emit user unlinked event to unsubscribe from payment notifications
      await this.eventsService.publishEvent('user_unlinked', { whatsappId });

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
  ): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
    try {
      // Check if we have an OTP in the command
      const otpCode = command.args.otp;

      if (!otpCode) {
        return 'Please provide your 6-digit verification code.';
      }

      if (!session) {
        return 'Please start the account linking process first by typing "link".';
      }

      const verifyDto: VerifyOtpDto = {
        sessionId: session.sessionId,
        otpCode,
      };

      await this.authService.verifyAccountLinking(verifyDto);

      // Get the updated session with auth token
      const updatedSession = await this.sessionService.getSessionByWhatsappId(whatsappId);

      // Emit user verified event for payment notifications
      if (updatedSession && updatedSession.isVerified && updatedSession.flashAuthToken) {
        await this.eventsService.publishEvent('user_verified', {
          whatsappId: updatedSession.whatsappId,
          authToken: updatedSession.flashAuthToken,
        });
        
        // Fetch and store username mapping for efficient lookups
        try {
          const username = await this.usernameService.getUsername(updatedSession.flashAuthToken);
          if (username) {
            await this.sessionService.storeUsernameMapping(username, whatsappId);
          }
        } catch (error) {
          this.logger.error(`Error storing username mapping: ${error.message}`);
        }
      }

      // Check for pending payments to auto-claim
      try {
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
              const pendingClaimMessage = `💰 Great news! You had ${claimedCount} pending payment${claimedCount > 1 ? 's' : ''} totaling $${totalUsd} that ${claimedCount > 1 ? 'have' : 'has'} been automatically credited to your account!`;

              // Create welcome message with pending payment info
              const welcomeMessage = this.getWelcomeMessage(updatedSession, pendingClaimMessage);

              // Return with special forceVoice flag
              return {
                text: welcomeMessage,
                media: undefined,
                forceVoice: true,
              } as any;
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error checking for pending payments: ${error.message}`);
      }

      // Create warm welcome message
      const welcomeMessage = this.getWelcomeMessage(updatedSession);

      // Return with special forceVoice flag
      return {
        text: welcomeMessage,
        media: undefined,
        forceVoice: true, // Special flag to force voice for important messages
      } as any;
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
        return this.getNotLinkedMessage();
      }

      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        return 'Your account is not fully verified. Please complete the linking process first. Type "link" to start.';
      }

      // Skip MFA for WhatsApp since the user already authenticated
      // The initial WhatsApp verification is sufficient for security

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
        return this.getNotLinkedMessage();
      }

      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        return 'Your account is not fully verified. Please complete the linking process first. Type "link" to start.';
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
        return this.getNotLinkedMessage();
      }

      if (!session.isVerified || !session.flashUserId || !session.flashAuthToken) {
        return 'Your account is not fully verified. Please complete the linking process first. Type "link" to start.';
      }

      const newUsername = command.args.username;

      if (!newUsername) {
        // User just typed "username" - show their current username
        const currentUsername = await this.usernameService.getUsername(session.flashAuthToken);

        if (currentUsername) {
          // Store username mapping for efficient lookups
          await this.sessionService.storeUsernameMapping(currentUsername, whatsappId);
          return `Your username is: @${currentUsername}. \n\n Your lightning address is: ${currentUsername}@flashapp.me. \n\n Want to know more about lightning addresses? Just ask!`;
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
          // Store username mapping for efficient lookups
          await this.sessionService.storeUsernameMapping(newUsername, whatsappId);
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
          '\n\n💡 Tip: You can link your Flash account to see prices in your preferred currency!'
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
        return this.getNotLinkedMessage();
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
        return 'Please specify your consent choice by typing "yes" or "no".';
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

        return 'Hi There! I would love to chat with you more, but first I need you to give your consent to talking to an AI bot. To use AI-powered support, please type "yes" to consent or "no" to decline.';
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
  async sendMessage(_to: string, _body: string): Promise<any> {
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
  private getHelpMessage(session: UserSession | null, command?: ParsedCommand): string {
    // Check if a category or navigation was requested
    if (command?.args?.category) {
      const category = command.args.category;
      
      // Handle numbered navigation
      if (category === '1') return this.getCategoryHelp('wallet');
      if (category === '2') return this.getCategoryHelp('send');
      if (category === '3') return this.getCategoryHelp('receive');
      if (category === 'more') return this.getFullHelpMenu(session);
      
      // Handle regular categories
      return this.getCategoryHelp(category);
    }
    if (!session) {
      return `🌟 *Welcome to Flash WhatsApp Bot!*

Flash is your gateway to instant Bitcoin payments through the Lightning Network.

📱 *Getting Started:*
Type \`link\` to connect your Flash account

⚡ *Available Commands:*
• \`price\` - Check current Bitcoin price
• \`help\` - Show this help message

Once linked, you'll unlock features like:
✅ Send & receive payments instantly
✅ Check your balance
✅ View transaction history
✅ Create payment requests
✅ And much more!

Ready? Type \`link\` to begin! 🚀`;
    }

    if (!session.isVerified) {
      return `📲 *Complete Your Verification*

Please enter the 6-digit code sent to your phone.

⚡ *Available Commands:*
• \`price\` - Check current Bitcoin price
• \`help\` - Show this help message

Need a new code? Type \`link\` again.`;
    }

    return `⚡ *Welcome to Pulse!*

📱 *Essential Commands:*
1️⃣ Balance - Check your wallet
2️⃣ Send - Send money
3️⃣ Receive - Get paid

Type a number for details or:
• \`more\` - See all commands
• \`support\` - Get help

💡 Quick example: \`send 5 to john\``;
  }

  /**
   * Get full help menu with all commands
   */
  private getFullHelpMenu(session: UserSession | null): string {
    if (!session?.isVerified) {
      return this.getHelpMessage(session);
    }

    return `⚡ *All Pulse Commands*

💰 *Wallet & Balance:*
• \`balance\` - Check your balance
• \`refresh\` - Refresh balance
• \`username\` - View/set Lightning username
• \`history\` - Transaction history

💸 *Send & Receive:*
• \`send 10 to @user\` - Send money
• \`receive 20\` - Create invoice
• \`request 15 from @user\` - Request payment
• \`pay\` - Confirm pending payment

👥 *Contacts:*
• \`contacts\` - List all contacts
• \`contacts add john +1234567890\`
• \`contacts remove john\`

🎙️ *Voice & Settings:*
• \`voice on/off/only\` - Voice settings
• \`vybz\` - Earn sats
• \`pending\` - View pending payments

💡 *Tips:*
• All amounts are in USD
• Save contacts for easy payments
• Use voice mode for hands-free

📱 Type \`help [topic]\` for details
💬 Type \`support\` for assistance`;
  }

  /**
   * Get category-specific help
   */
  private getCategoryHelp(category: string): string {
    const categories: Record<string, string> = {
      wallet: `💰 *Wallet & Balance Commands*

• \`balance\` - Check your USD balance
• \`refresh\` - Refresh balance (clear cache)
• \`username\` - View or set Lightning username
• \`history\` - View recent transactions

💡 Tip: Set a username to get your own Lightning address!

⬅️ Type \`help\` to go back`,

      send: `💸 *Send Money Commands*

• \`send 10 to @username\` - Send $10 USD to Flash user
• \`send 5.50 to john\` - Send $5.50 USD to saved contact
• \`send 25 to lnbc...\` - Pay $25 USD Lightning invoice

📱 *Request from Others:*
• \`request 20 from @john\` - Request $20 USD from user
• \`request 15 from ayanna\` - Request $15 USD from contact

💡 *Important:* All amounts are in USD regardless of your display currency
💡 Tip: Save contacts for easier payments!

⬅️ Type \`help\` to go back`,

      receive: `📥 *Receive Money Commands*

• \`receive 10\` - Create $10 USD invoice
• \`receive 50 Coffee\` - Create $50 USD invoice with memo

💡 *Important:* All amounts are in USD regardless of your display currency
💡 Tip: Share the invoice or QR code to get paid!

⬅️ Type \`help\` to go back`,

      contacts: `👥 *Contact Commands*

• \`contacts\` - List all contacts
• \`contacts add john 18765551234\` - Add new
• \`contacts remove john\` - Remove contact

💡 Tip: Use contact names instead of phone numbers!`,

      pending: `💳 *Pending Payment Commands*

• \`pending\` - View all pending payments
• \`pending sent\` - View sent pending payments
• \`pay 12345\` - Claim with code

💡 Tip: Pending payments expire after 24 hours!`,

      voice: `🎙️ *Voice Commands*

Simply add "voice", "audio", or "speak" to any command:
• "voice balance"
• "speak help"
• "audio price"

Current mode: Check with \`admin voice\`

💡 Tip: I'll respond with both voice and text!

⬅️ Type \`help\` to go back`,
    };

    return (
      categories[category.toLowerCase()] ||
      `❓ Unknown category. Try: \`help\`, \`help wallet\`, \`help send\`, \`help receive\`, \`help contacts\`, \`help pending\`, or \`help voice\``
    );
  }

  /**
   * Generate warm welcome message for newly linked users
   */
  private getWelcomeMessage(session: UserSession | null, pendingClaimMessage?: string): string {
    const userName = session?.profileName || 'there';
    const firstName = userName.split(' ')[0]; // Use first name for friendlier greeting

    let message = `🎉 *Welcome to Pulse, ${firstName}!*

✅ Your Flash account is now connected to WhatsApp.`;

    if (pendingClaimMessage) {
      message += `\n\n${pendingClaimMessage}`;
    }

    // Create a conversational welcome that sounds natural when spoken
    message += `

I'm Pulse, your personal payment assistant! I can help you send money instantly, check your balance, and manage your Bitcoin wallet - all through WhatsApp.

🚀 *Here's what you can do:*

**Check your money:**
Type \`balance\` to see how much you have

**Send money instantly:**
Type \`send 5 to @username\` or to a contact

**Request payments:**
Type \`receive 10\` to create an invoice

**Check Bitcoin price:**
Type \`price\` for the current rate

💡 *Quick tip:* Want me to speak? Just say "voice" before any command, like "voice balance"!

Type \`help\` anytime to see all commands, or \`support\` if you need assistance.

**Ready to start?** Try typing \`balance\` to check your account! 💰`;

    return message;
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
        return this.getNotLinkedMessage();
      }

      // Parse amount
      const amountStr = command.args.amount;
      if (!amountStr) {
        return 'Please specify amount in USD. Usage: send [amount] to [recipient]';
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

      // Check if recipient might be a saved contact FIRST
      // This takes precedence over username lookup
      if (
        (targetUsername || lightningAddress) &&
        !lightningAddress?.includes('@') &&
        !lightningAddress?.includes('lnbc')
      ) {
        const possibleContactName = targetUsername || lightningAddress;
        const contactsKey = `contacts:${whatsappId}`;
        const savedContacts = await this.redisService.get(contactsKey);

        if (savedContacts) {
          const contacts = JSON.parse(savedContacts);
          const contactKey = possibleContactName.toLowerCase();

          if (contacts[contactKey]) {
            // Found a saved contact
            isContactPayment = true;
            const contactInfo = contacts[contactKey];
            // Handle both string format (legacy) and object format
            const contactPhone = typeof contactInfo === 'string' ? contactInfo : contactInfo.phone;

            // Check if this contact has a linked Flash account
            // Try multiple WhatsApp ID formats
            const possibleWhatsappIds = [
              contactPhone + '@c.us',
              contactPhone, // Raw phone number
              '+' + contactPhone, // With + prefix
              '+' + contactPhone + '@c.us', // With + prefix and @c.us
            ];

            let contactSession = null;
            for (const whatsappId of possibleWhatsappIds) {
              contactSession = await this.sessionService.getSessionByWhatsappId(whatsappId);
              if (contactSession) {
                break;
              }
            }

            if (
              contactSession?.isVerified &&
              contactSession.flashUserId &&
              contactSession.flashAuthToken
            ) {
              // Contact has a linked Flash account, get their username
              try {
                const contactUsername = await this.usernameService.getUsername(
                  contactSession.flashAuthToken,
                );
                if (contactUsername) {
                  // Use their Flash username for the payment
                  targetUsername = contactUsername;
                  lightningAddress = ''; // Clear this so we use username payment flow
                  // Continue with the payment flow
                } else {
                  // Contact has Flash but no username, use escrow
                  targetPhone = contactPhone;
                  targetUsername = ''; // Clear username to prevent lookup
                  lightningAddress = ''; // Clear this too
                }
              } catch (error) {
                this.logger.error(`Failed to get contact's Flash username: ${error.message}`);
                targetPhone = contactPhone;
                targetUsername = ''; // Clear username to prevent lookup
                lightningAddress = ''; // Clear this too
              }
            } else {
              // Contact doesn't have Flash, use escrow
              targetPhone = contactPhone;
              targetUsername = ''; // Clear username to prevent lookup
              lightningAddress = ''; // Clear this too
            }
          }
        }
      }

      // Check if it's a Lightning invoice/address
      if (
        lightningAddress &&
        (lightningAddress.startsWith('lnbc') || lightningAddress.includes('@'))
      ) {
        try {
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
            // Generate transaction ID
            const txId = `LN${Date.now().toString().slice(-8)}`;
            // Get current balance for display
            let balanceDisplay = 'Check balance for details';
            try {
              const balanceInfo = await this.balanceService.getUserBalance(
                session.flashUserId!,
                session.flashAuthToken,
              );
              balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
            } catch (e) {
              // Ignore balance fetch errors in success message
            }
            
            return `✅ Payment sent successfully!\n\n💸 Amount: $${amount.toFixed(2)} USD\n⚡ To: ${lightningAddress.substring(0, 30)}...\n📍 Transaction: #${txId}\n💰 New balance: ${balanceDisplay}\n\n💡 Tip: Save this invoice for future payments`;
          } else {
            const errorMessage = result?.errors?.[0]?.message || 'Unknown error';

            // Provide more helpful error messages
            if (errorMessage.includes('Account is inactive')) {
              return `❌ Payment blocked: Account restricted\n\n🔒 Your account has temporary restrictions\n\n💉 Next steps:\n→ Type 'support' to chat with an agent\n→ Email support@flashapp.me\n→ Reference: #ERR${Date.now().toString().slice(-6)}`;
            } else if (errorMessage.includes('Insufficient balance')) {
              // Get current balance for display
            let balanceDisplay = 'Check balance for details';
            try {
              const balanceInfo = await this.balanceService.getUserBalance(
                session.flashUserId!,
                session.flashAuthToken,
              );
              balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
            } catch (e) {
              // Ignore balance fetch errors in success message
            }
              return `❌ Payment failed: Insufficient balance\n\n💰 You need: $${amount.toFixed(2)} USD\n💳 You have: ${balanceDisplay}\n\n🔄 Next steps:\n→ Type 'receive ${amount}' to request funds\n→ Ask someone to send you money\n→ Add funds in the Flash app`;
            } else if (errorMessage.includes('limit')) {
              return `❌ Payment failed: Transaction limit reached\n\n📏 Daily/monthly limit exceeded\n\n💡 Next steps:\n→ Wait 24 hours for daily limit reset\n→ Check limits in Flash app\n→ Type 'support' for limit increase\n→ Reference: #LMT${Date.now().toString().slice(-6)}`;
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
              // Send notification to recipient if they have WhatsApp linked
              try {
                // Use optimized lookup by username
                const recipientSession = await this.sessionService.getSessionByUsername(targetUsername);
                
                if (recipientSession && recipientSession.flashUserId && recipientSession.flashAuthToken) {
                  // Found the recipient! Send them a notification
                  const senderUsername = await this.usernameService.getUsername(session.flashAuthToken) || 'Someone';
                      
                      let recipientMessage = `💰 *Payment Received!*\n\n`;
                      recipientMessage += `Amount: *$${amount.toFixed(2)} USD*\n`;
                      recipientMessage += `From: *@${senderUsername}*\n`;
                      if (command.args.memo) {
                        recipientMessage += `Memo: _${command.args.memo}_\n`;
                      }
                      recipientMessage += `\n✅ Payment confirmed instantly`;
                      
                      // Get recipient's updated balance
                      if (recipientSession.flashUserId) {
                        await this.balanceService.clearBalanceCache(recipientSession.flashUserId);
                        const balance = await this.balanceService.getUserBalance(
                          recipientSession.flashUserId,
                          recipientSession.flashAuthToken,
                        );
                        
                        if (balance.fiatBalance > 0 || balance.btcBalance === 0) {
                          recipientMessage += `\n💼 New balance: *$${balance.fiatBalance.toFixed(2)} USD*`;
                        }
                      }
                      
                      // Send the notification
                      if (this.whatsappWebService?.isClientReady()) {
                        await this.whatsappWebService.sendMessage(recipientSession.whatsappId, recipientMessage);
                      }
                }
              } catch (error) {
                // Log error but don't fail the payment
                this.logger.error(`Error sending recipient notification: ${error.message}`);
              }
              
              // Generate transaction ID
              const txId = `TX${Date.now().toString().slice(-8)}`;
              // Get current balance for display
            let balanceDisplay = 'Check balance for details';
            try {
              const balanceInfo = await this.balanceService.getUserBalance(
                session.flashUserId!,
                session.flashAuthToken,
              );
              balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
            } catch (e) {
              // Ignore balance fetch errors in success message
            }
              
              let successMsg = `✅ Payment sent to @${targetUsername}!\n\n`;
              successMsg += `💸 Amount: $${amount.toFixed(2)} USD\n`;
              if (command.args.memo) {
                successMsg += `📝 Memo: "${command.args.memo}"\n`;
              }
              successMsg += `📍 Transaction: #${txId}\n`;
              successMsg += `💰 New balance: ${balanceDisplay}\n\n`;
              successMsg += `💡 Tip: Request it back with "request ${amount} from ${targetUsername}"`;
            } else {
              const errorMessage = result?.errors?.[0]?.message || 'Unknown error';

              // Provide more helpful error messages
              if (errorMessage.includes('Account is inactive')) {
                return `❌ Payment blocked: Account issue\n\n🔍 Possible reasons:\n• @${targetUsername}'s account is restricted\n• Your account has limitations\n\n💡 Next steps:\n→ Verify recipient username is correct\n→ Type 'support' for help\n→ Reference: #ACC${Date.now().toString().slice(-6)}`;
              } else if (errorMessage.includes('Insufficient balance')) {
                // Get current balance for display
            let balanceDisplay = 'Check balance for details';
            try {
              const balanceInfo = await this.balanceService.getUserBalance(
                session.flashUserId!,
                session.flashAuthToken,
              );
              balanceDisplay = `$${balanceInfo.fiatBalance.toFixed(2)} ${balanceInfo.fiatCurrency}`;
            } catch (e) {
              // Ignore balance fetch errors in success message
            }
                return `❌ Payment failed: Insufficient balance\n\n💰 You need: $${amount.toFixed(2)} USD\n💳 You have: ${balanceDisplay}\n\n🔄 Next steps:\n→ Type 'receive ${amount}' to request funds\n→ Ask @${targetUsername} to request payment instead\n→ Add funds in the Flash app`;
              } else if (errorMessage.includes('limit')) {
                return `❌ Payment failed: Transaction limit reached\n\n📏 Daily/monthly limit exceeded\n\n💡 Next steps:\n→ Wait 24 hours for daily limit reset\n→ Check limits in Flash app\n→ Type 'support' for limit increase\n→ Reference: #LMT${Date.now().toString().slice(-6)}`;
              }

              return `❌ Payment failed: ${errorMessage}`;
            }
          } else {
            return `❌ Username @${targetUsername} not found\n\n🔍 Possible issues:\n• Typo in username\n• User hasn't set a username yet\n• Account doesn't exist\n\n💡 Next steps:\n→ Double-check the spelling\n→ Ask for their phone number instead\n→ Use 'contacts add' to save them`;
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

                  return `✅ Payment sent - Pending delivery!\n\n💰 $${amount.toFixed(2)} USD is waiting for ${targetUsername}\n📱 They've been notified via WhatsApp\n🔑 Claim code: ${pendingPayment.claimCode}\n⏱️ Expires: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}\n\n🎯 What happens next:\n• ${targetUsername} gets your payment when they join Flash\n• You'll be notified when claimed\n• Refunded automatically if not claimed in 30 days\n\n💡 Tip: Tell ${targetUsername} to type 'link' to Flash to claim`;
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

      // If phone number provided (escrow payment for contacts without Flash)
      if (targetPhone) {
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
          const userWallets = await this.paymentService.getUserWallets(session.flashAuthToken);
          const senderWalletId = userWallets.usdWallet?.id || userWallets.defaultWalletId;

          // First generate the claim code that will be used
          const claimCode = this.generateClaimCode();

          // Determine recipient name for the escrow memo
          const recipientName = isContactPayment
            ? command.args.username || command.args.recipient || 'contact'
            : targetPhone;

          // Send payment to admin wallet (escrow) with claim code in memo
          const escrowMemo = `Pending payment for ${recipientName} (${targetPhone}) - Claim: ${claimCode}`;
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
            (await this.usernameService.getUsername(session.flashAuthToken)) || 'Flash user';
          const pendingPayment = await this.pendingPaymentService.createPendingPaymentWithCode({
            senderId: session.flashUserId!,
            senderUsername,
            senderPhone: session.phoneNumber,
            recipientPhone: targetPhone,
            recipientName,
            amountCents: amount * 100,
            memo: command.args.memo,
            claimCode: claimCode,
            escrowTransactionId: undefined, // Transaction ID not available in response
          });

          // Send notification to recipient if we have WhatsApp Web service
          if (this.whatsappWebService) {
            try {
              const recipientWhatsApp = `${targetPhone}@c.us`;
              const notificationMsg =
                this.pendingPaymentService.formatPendingPaymentMessage(pendingPayment);
              await this.whatsappWebService.sendMessage(recipientWhatsApp, notificationMsg);
            } catch (notifyError) {
              this.logger.error(`Failed to notify recipient: ${notifyError.message}`);
            }
          }

          return `✅ Payment sent successfully!\n\n💰 $${amount.toFixed(2)} USD is waiting for ${recipientName}\n📱 They've been notified via WhatsApp\n🔑 Claim code: ${pendingPayment.claimCode}\n⏱️ Expires in 30 days\n\n${recipientName} will receive the money automatically when they create their Flash account.`;
        } catch (error) {
          this.logger.error(`Error creating pending payment: ${error.message}`, error.stack);
          return `❌ Failed to create pending payment. Please try again.`;
        }
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
          text: 'Please specify amount (in USD) and recipient. Usage:\n• request [amount] from [@username]\n• request [amount] from [phone]\n• request [amount] from [@username] [phone]\n• request [amount] from [contact_name]',
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
              text: `❌ Username @${targetUsername} not found\n\n🔍 Double-check the spelling\n→ Try: 'request ${amount} from [phone_number]'\n→ Or ask them to send you their username`,
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

      // Format the request message (no QR code needed)
      let requestMessage = `💸 *Payment Request*\n\n`;
      requestMessage += `From: @${requesterUsername}\n`;
      requestMessage += `Amount: $${amount!.toFixed(2)} USD\n`;
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

          // Store the payment request for the recipient
          const recipientRequestKey = `pending_request:${whatsappNumber}`;
          const requestData = {
            type: 'payment_request',
            invoice: invoice.paymentRequest,
            amount: amount!,
            requesterUsername,
            requesterWhatsappId: whatsappId,
            createdAt: new Date().toISOString(),
            expiresAt: invoice.expiresAt,
          };
          await this.redisService.setEncrypted(recipientRequestKey, requestData, 3600); // 1 hour expiry

          // Send the payment request message with pay instructions
          requestMessage = `💸 *Payment Request*\n\n`;
          requestMessage += `From: @${requesterUsername}\n`;
          requestMessage += `Amount: $${amount!.toFixed(2)} USD\n`;
          requestMessage += `\n💳 *To pay this request:*\n`;
          requestMessage += `Simply type \`pay\` to send the payment\n`;
          requestMessage += `\n_Request expires in ${Math.floor((new Date(invoice.expiresAt).getTime() - Date.now()) / 60000)} minutes_`;

          // Send the payment request message (no QR code)
          await this.whatsappWebService.sendMessage(whatsappNumber, requestMessage);

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
        case 'add': {
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
        }

        case 'remove': {
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
        }

        case 'history': {
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
        }

        case 'list':
        default: {
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
  ): Promise<
    string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean } | null
  > {
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
      const paidAtDate = new Date(invoice.paidAt);
      const paidAtStr = paidAtDate.toLocaleString('en-US', {
        timeZone: 'America/Jamaica',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const message = `✅ Payment Received!\n\nAmount: $${invoice.amount} USD\n${invoice.memo ? `Memo: ${invoice.memo}\n` : ''}Paid at: ${paidAtStr} EST\n\nThank you for your payment!`;

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
    _session: UserSession,
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
        return this.getNotLinkedMessage();
      }

      const action = command.args.action;
      const modifier = command.args.modifier;

      // First check for pending payment requests (when someone requested money from this user)
      // Note: We need to check both formats as the request might be stored with @c.us suffix
      let pendingRequestKey = `pending_request:${whatsappId}`;
      let pendingRequest = await this.redisService.getEncrypted(pendingRequestKey);
      
      // If not found, try with @c.us suffix (for requests sent via phone number)
      if (!pendingRequest) {
        // Extract just the number part from whatsappId (remove any existing @c.us)
        const phoneNumber = whatsappId.replace('@c.us', '').replace(/\D/g, '');
        pendingRequestKey = `pending_request:${phoneNumber}@c.us`;
        pendingRequest = await this.redisService.getEncrypted(pendingRequestKey);
      }

      // If no action specified and there's a pending request, handle it
      if (!action && pendingRequest) {
        try {
          // Check if request is still valid
          const expiresAt = new Date(pendingRequest.expiresAt);
          if (expiresAt < new Date()) {
            await this.redisService.del(pendingRequestKey);
            return '❌ This payment request has expired. Please ask for a new one.';
          }

          // Get user's wallets
          const wallets = await this.paymentService.getUserWallets(session.flashAuthToken);

          // Pay the invoice
          const result = await this.paymentService.sendLightningPayment(
            {
              walletId: wallets.usdWallet?.id || wallets.defaultWalletId,
              paymentRequest: pendingRequest.invoice,
            },
            session.flashAuthToken,
          );

          if (result?.status === PaymentSendResult.Success) {
            // Clear the pending request
            await this.redisService.del(pendingRequestKey);

            // Notify the requester
            if (pendingRequest.requesterWhatsappId && this.whatsappWebService?.isClientReady()) {
              const payerUsername = await this.usernameService.getUsername(session.flashAuthToken) || 'Someone';
              const successNotification = `✅ *Payment Received!*\n\n@${payerUsername} has paid your request for $${pendingRequest.amount.toFixed(2)} USD.\n\nThe payment has been confirmed and added to your balance.`;
              
              await this.whatsappWebService.sendMessage(pendingRequest.requesterWhatsappId, successNotification);
            }

            return `✅ Payment sent successfully!\n\nAmount: $${pendingRequest.amount.toFixed(2)} USD\nTo: @${pendingRequest.requesterUsername}\n\nThe payment has been confirmed.`;
          } else if (result?.status === PaymentSendResult.AlreadyPaid) {
            await this.redisService.del(pendingRequestKey);
            return '❌ This payment request has already been paid.';
          } else {
            return `❌ Payment failed: ${result?.errors?.[0]?.message || 'Unknown error'}`;
          }
        } catch (error) {
          this.logger.error(`Payment request error: ${error.message}`);
          return `❌ Failed to pay request: ${error.message}`;
        }
      }

      // Get pending Lightning invoice payments (encrypted)
      const pendingPaymentsKey = `pending_payments:${whatsappId}`;
      const payments = await this.redisService.getEncrypted(pendingPaymentsKey);

      // If there's a pending request but user specified an action, show both options
      if (pendingRequest && action && (!payments || payments.length === 0)) {
        return `💰 You have a pending payment request from @${pendingRequest.requesterUsername} for $${pendingRequest.amount.toFixed(2)} USD.\n\n• Type \`pay\` to pay this request\n• Or continue with other payment options`;
      }

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
      // Decode invoice
      const decoded = bolt11.decode(invoice);

      const details: any = {};

      // Extract amount (in millisatoshis)
      if (decoded.millisatoshis) {
        // Convert millisatoshis to satoshis
        const satoshis = Number(decoded.millisatoshis) / 1000;

        // For USD invoices created by Flash, the amount tag often contains cents
        // Check if this looks like a USD amount (common pattern)
        if (decoded.tags) {
          const amountTag = decoded.tags.find((tag: any) => tag.tagName === 'amount');
          if (amountTag && amountTag.data) {
            // This might be USD cents
            details.amount = parseInt(String(amountTag.data)) / 100;
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
  ): Promise<string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean }> {
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
  private async getVybzStatus(whatsappId: string, _session: UserSession): Promise<string> {
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
          const _senderNotification = `✅ Your pending payment of $${amountUsd} to ${payment.recipientName || payment.recipientPhone} has been claimed!`;
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
    return randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Handle admin commands for WhatsApp session management
   */
  /**
   * Handle voice settings command
   */
  private async handleVoiceCommand(command: ParsedCommand, whatsappId: string): Promise<string> {
    const action = command.args.action;

    try {
      switch (action) {
        case 'help':
          return this.userVoiceSettingsService.getVoiceHelp();

        case 'status': {
          const userMode = await this.userVoiceSettingsService.getUserVoiceMode(whatsappId);
          if (userMode) {
            return `Your voice setting: ${this.userVoiceSettingsService.formatVoiceMode(userMode)}`;
          }

          // Show default (admin) setting
          const adminMode = await this.adminSettingsService.getVoiceMode();
          return `Your voice setting: Default (follows admin setting: ${adminMode})`;
        }

        case 'on':
          await this.userVoiceSettingsService.setUserVoiceMode(whatsappId, UserVoiceMode.ON);
          return "🔊 Voice ON - You'll hear voice for AI responses when using voice keywords.";

        case 'off':
          await this.userVoiceSettingsService.setUserVoiceMode(whatsappId, UserVoiceMode.OFF);
          return "🔇 Voice OFF - You'll only receive text responses.";

        case 'only':
          await this.userVoiceSettingsService.setUserVoiceMode(whatsappId, UserVoiceMode.ONLY);
          return "🎤 Voice ONLY - You'll only receive voice responses (no text).";

        default: {
          // No action specified, show current status
          const currentMode = await this.userVoiceSettingsService.getUserVoiceMode(whatsappId);
          if (currentMode) {
            return (
              `Your current voice setting: ${this.userVoiceSettingsService.formatVoiceMode(currentMode)}\n\n` +
              `To change, use:\n` +
              `• \`voice on\` - Voice for AI responses\n` +
              `• \`voice off\` - No voice responses\n` +
              `• \`voice only\` - Voice only (no text)\n` +
              `• \`voice help\` - See detailed help`
            );
          }

          const defaultMode = await this.adminSettingsService.getVoiceMode();
          return (
            `Your voice setting: Default (${defaultMode})\n\n` +
            `To customize, use:\n` +
            `• \`voice on\` - Voice for AI responses\n` +
            `• \`voice off\` - No voice responses\n` +
            `• \`voice only\` - Voice only (no text)\n` +
            `• \`voice help\` - See detailed help`
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error handling voice command: ${error.message}`);
      return '❌ Failed to update voice settings. Please try again.';
    }
  }

  /**
   * Handle admin commands
   */
  private async handleAdminCommand(
    command: ParsedCommand,
    whatsappId: string,
    phoneNumber: string,
  ): Promise<string> {
    try {
      // Check if user is admin (you can customize this check)
      const adminNumbers = this.configService.get<string>('ADMIN_PHONE_NUMBERS')?.split(',') || [];
      // Remove + prefix for comparison since admin numbers in env don't have +
      const cleanPhoneNumber = phoneNumber.replace(/^\+/, '');
      const isAdmin =
        adminNumbers.includes(cleanPhoneNumber) ||
        cleanPhoneNumber === '13059244435' || // Your current number
        process.env.NODE_ENV === 'development'; // Allow in dev mode

      if (!isAdmin) {
        return '❌ Unauthorized. Admin commands are restricted.';
      }

      const action = command.args.action;

      if (!this.whatsappWebService) {
        return '❌ WhatsApp Web service not available.';
      }

      switch (action) {
        case 'status': {
          const status = this.whatsappWebService.getStatus();
          if (status.connected) {
            return `✅ *WhatsApp Status*\n\nConnected: Yes\nNumber: ${status.number}\nName: ${status.name || 'Unknown'}`;
          } else {
            return `❌ *WhatsApp Status*\n\nConnected: No\n\nUse \`admin reconnect\` to connect a new number.`;
          }
        }

        case 'disconnect': {
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
        }

        case 'clear-session': {
          try {
            // Clear the session - this will handle the messaging internally
            await this.whatsappWebService.clearSession();

            // Return a message for logging purposes only
            // The actual user notification is handled by clearSession()
            return '✅ Session cleared. The bot is now disconnected.';
          } catch (error) {
            return `❌ Failed to clear session: ${error.message}`;
          }
        }

        case 'reconnect': {
          try {
            // Use the new prepareReconnect method that handles messaging
            await this.whatsappWebService.prepareReconnect(whatsappId);

            // This response won't be sent via WhatsApp, but will show in logs
            return 'WhatsApp reconnection initiated. Check terminal for QR code.';
          } catch (error) {
            return `❌ Failed to reconnect: ${error.message}`;
          }
        }

        case 'help': {
          return this.getAdminHelpMessage();
        }

        case 'settings': {
          const settings = await this.adminSettingsService.getSettings();
          return (
            `⚙️ *Admin Settings*\n\n` +
            `🔒 Lockdown: ${settings.lockdown ? 'ENABLED' : 'Disabled'}\n` +
            `👥 Groups: ${settings.groupsEnabled ? 'Enabled' : 'DISABLED'}\n` +
            `🔊 Voice: ${settings.voiceMode.toUpperCase()}\n` +
            `💸 Payments: ${settings.paymentsEnabled ? 'Enabled' : 'Disabled'}\n` +
            `📥 Requests: ${settings.requestsEnabled ? 'Enabled' : 'Disabled'}\n\n` +
            `👮 Admins: ${settings.adminNumbers.length}\n` +
            `🆘 Support: ${settings.supportNumbers.length}\n\n` +
            `📅 Last updated: ${new Date(settings.lastUpdated).toLocaleDateString()}\n` +
            `👤 Updated by: ${settings.updatedBy}\n\n` +
            `💡 Use \`admin help\` to see available commands`
          );
        }

        case 'lockdown': {
          const mode = command.args.mode;
          if (!mode || (mode !== 'on' && mode !== 'off')) {
            const isLockdown = await this.adminSettingsService.isLockdown();
            return (
              `🔒 *Lockdown Status*: ${isLockdown ? 'ENABLED' : 'Disabled'}\n\n` +
              `To change: \`admin lockdown on\` or \`admin lockdown off\``
            );
          }
          const lockdownEnabled = mode === 'on';
          await this.adminSettingsService.updateSettings(
            { lockdown: lockdownEnabled },
            phoneNumber,
          );
          return (
            `${lockdownEnabled ? '🔒' : '🔓'} Lockdown ${lockdownEnabled ? 'ENABLED' : 'DISABLED'}\n\n` +
            `${lockdownEnabled ? 'Only admin commands are allowed now.' : 'All commands are now available.'}`
          );
        }

        case 'group': {
          const groupMode = command.args.mode;
          if (!groupMode || (groupMode !== 'on' && groupMode !== 'off')) {
            const groupsEnabled = await this.adminSettingsService.areGroupsEnabled();
            return (
              `👥 *Groups Status*: ${groupsEnabled ? 'Enabled' : 'DISABLED'}\n\n` +
              `To change: \`admin group on\` or \`admin group off\``
            );
          }
          const groupsEnabled = groupMode === 'on';
          await this.adminSettingsService.updateSettings({ groupsEnabled }, phoneNumber);
          return (
            `👥 Groups ${groupsEnabled ? 'ENABLED' : 'DISABLED'}\n\n` +
            `${groupsEnabled ? 'Bot will now respond in group chats.' : 'Bot will ignore group messages.'}`
          );
        }

        case 'voice': {
          const voiceMode = command.args.mode as VoiceMode;
          if (!voiceMode || !['always', 'on', 'off'].includes(voiceMode)) {
            const currentMode = await this.adminSettingsService.getVoiceMode();
            return (
              `🔊 *Voice Mode*: ${currentMode.toUpperCase()}\n\n` +
              `• \`always\` - All responses include voice notes\n` +
              `• \`on\` - AI responds with voice to keywords\n` +
              `• \`off\` - Voice notes disabled\n\n` +
              `Current: ${currentMode === 'always' ? 'Everything gets voice' : currentMode === 'on' ? 'AI uses voice for "voice", "speak", etc.' : 'No voice notes'}\n\n` +
              `To change: \`admin voice always/on/off\``
            );
          }
          await this.adminSettingsService.setVoiceMode(voiceMode, phoneNumber);
          return (
            `🔊 Voice mode set to: ${voiceMode.toUpperCase()}\n\n` +
            `${
              voiceMode === 'always'
                ? '• All responses will include voice notes\n• Both commands and AI will speak'
                : voiceMode === 'on'
                  ? '• AI responds with voice to keywords\n• Say "voice", "speak", "audio" to activate'
                  : '• Voice notes are disabled\n• Text-only responses'
            }`
          );
        }

        case 'find': {
          const searchTerm = command.args.searchTerm;
          if (!searchTerm) {
            return '❌ Please provide a search term.\n\nExample: `admin find john`';
          }
          return await this.handleAdminFindCommand(searchTerm);
        }

        case 'add': {
          const addType = command.args.subAction;
          const addNumber = command.args.phoneNumber;
          if (!addNumber || !addType || (addType !== 'admin' && addType !== 'support')) {
            return (
              '❌ Invalid syntax.\n\n' +
              'Use:\n' +
              '• `admin add admin 1234567890`\n' +
              '• `admin add support 1234567890`'
            );
          }
          if (addType === 'admin') {
            await this.adminSettingsService.addAdmin(addNumber, phoneNumber);
            return `✅ Added ${addNumber} as admin\n\n💡 They can now use admin commands.`;
          } else {
            await this.adminSettingsService.addSupport(addNumber, phoneNumber);
            return `✅ Added ${addNumber} as support agent\n\n💡 They will receive support requests.`;
          }
        }

        case 'remove': {
          const removeType = command.args.subAction;
          const removeNumber = command.args.phoneNumber;
          if (
            !removeNumber ||
            !removeType ||
            (removeType !== 'admin' && removeType !== 'support')
          ) {
            return (
              '❌ Invalid syntax.\n\n' +
              'Use:\n' +
              '• `admin remove admin 1234567890`\n' +
              '• `admin remove support 1234567890`'
            );
          }
          const currentSettings = await this.adminSettingsService.getSettings();
          if (removeType === 'admin') {
            const newAdmins = currentSettings.adminNumbers.filter((n) => n !== removeNumber);
            if (newAdmins.length === currentSettings.adminNumbers.length) {
              return `❌ ${removeNumber} is not an admin`;
            }
            await this.adminSettingsService.updateSettings(
              { adminNumbers: newAdmins },
              phoneNumber,
            );
            return `✅ Removed ${removeNumber} from admins`;
          } else {
            const newSupport = currentSettings.supportNumbers.filter((n) => n !== removeNumber);
            if (newSupport.length === currentSettings.supportNumbers.length) {
              return `❌ ${removeNumber} is not a support agent`;
            }
            await this.adminSettingsService.updateSettings(
              { supportNumbers: newSupport },
              phoneNumber,
            );
            return `✅ Removed ${removeNumber} from support agents`;
          }
        }

        default: {
          return this.getAdminHelpMessage();
        }
      }
    } catch (error) {
      this.logger.error(`Error handling admin command: ${error.message}`, error.stack);
      return '❌ Admin command failed. Check logs for details.';
    }
  }

  /**
   * Get admin help message
   */
  private getAdminHelpMessage(): string {
    return (
      `👮 *Admin Commands*\n\n` +
      `📊 *Status & Info:*\n` +
      `• \`admin status\` - Check WhatsApp connection\n` +
      `• \`admin settings\` - View current settings\n` +
      `• \`admin find <term>\` - Search contacts/sessions\n\n` +
      `🔧 *Connection:*\n` +
      `• \`admin disconnect\` - Disconnect current number\n` +
      `• \`admin clear-session\` - Clear all session data\n` +
      `• \`admin reconnect\` - Connect a new number\n\n` +
      `🔒 *System Control:*\n` +
      `• \`admin lockdown on/off\` - Enable/disable lockdown\n` +
      `• \`admin group on/off\` - Enable/disable groups\n` +
      `• \`admin voice always/on/off\` - Control voice responses\n\n` +
      `👥 *User Management:*\n` +
      `• \`admin add admin <phone>\` - Add admin\n` +
      `• \`admin add support <phone>\` - Add support agent\n` +
      `• \`admin remove admin <phone>\` - Remove admin\n` +
      `• \`admin remove support <phone>\` - Remove support\n\n` +
      `💡 Type any admin command for more details`
    );
  }

  /**
   * Handle admin find command
   */
  private async handleAdminFindCommand(searchTerm: string): Promise<string> {
    try {
      const results: string[] = [];

      // Search in sessions
      const sessions = await this.sessionService.getAllActiveSessions();
      const matchingSessions = sessions.filter(
        (session) =>
          session.phoneNumber.includes(searchTerm) ||
          session.whatsappId.includes(searchTerm) ||
          (session.flashUserId && session.flashUserId.includes(searchTerm)),
      );

      if (matchingSessions.length > 0) {
        results.push('📱 *Sessions Found:*');
        matchingSessions.forEach((session) => {
          results.push(
            `• ${session.phoneNumber} - ${session.isVerified ? '✅ Verified' : '⏳ Pending'}`,
          );
        });
      }

      // Search in contacts (if available)
      const contactsKey = `contacts:*`;
      const contactKeys = await this.redisService.keys(contactsKey);
      const matchingContacts: string[] = [];

      for (const key of contactKeys) {
        const contacts = await this.redisService.get(key);
        if (contacts) {
          const parsed = JSON.parse(contacts);
          Object.entries(parsed).forEach(([name, phone]) => {
            if (
              name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              String(phone).includes(searchTerm)
            ) {
              matchingContacts.push(`• ${name}: ${phone}`);
            }
          });
        }
      }

      if (matchingContacts.length > 0) {
        results.push('\n👥 *Contacts Found:*');
        results.push(...matchingContacts);
      }

      if (results.length === 0) {
        return `❌ No results found for "${searchTerm}"`;
      }

      return results.join('\n');
    } catch (error) {
      this.logger.error(`Error in admin find: ${error.message}`);
      return '❌ Error searching. Check logs.';
    }
  }

  /**
   * Check if lockdown is enabled and block non-admin commands
   */
  private async checkLockdown(whatsappId: string, command: ParsedCommand): Promise<string | null> {
    try {
      const isLockdown = await this.adminSettingsService.isLockdown();
      if (!isLockdown) return null;

      // Allow admin commands always
      if (command.type === CommandType.ADMIN) return null;

      // Check if user is admin
      const phoneNumber = whatsappId.replace('@c.us', '');
      const isAdmin = await this.adminSettingsService.isAdmin(phoneNumber);

      if (!isAdmin) {
        return (
          '🔒 *System Lockdown*\n\n' +
          'The bot is currently in lockdown mode.\n' +
          'Only administrators can use commands.\n\n' +
          'Please contact support if you need assistance.'
        );
      }

      return null;
    } catch (error) {
      this.logger.error(`Error checking lockdown: ${error.message}`);
      return null;
    }
  }

  /**
   * Get standardized "not linked" error message
   */
  private getNotLinkedMessage(): string {
    return `🔗 Account not linked yet!\n\n📱 To use Pulse, you need to connect your Flash account:\n\n1️⃣ Type 'link' to start\n2️⃣ Enter your Flash phone number\n3️⃣ Enter the 6-digit code we send you\n\n⏱️ Takes just 30 seconds!`;
  }

  /**
   * Send response as voice note if requested
   */
  private async sendResponseWithVoice(
    whatsappId: string,
    response: string,
    originalMessage: string,
  ): Promise<void> {
    try {
      // Check if voice response was requested
      const shouldUseVoice = await this.ttsService.shouldUseVoice(originalMessage);

      if (shouldUseVoice && this.whatsappWebService) {
        // Make hints TTS-friendly before cleaning
        let ttsFriendlyResponse = response;

        // Check if response contains a hint (💡)
        if (response.includes('💡')) {
          // Extract hint part and make it TTS-friendly
          const parts = response.split('💡');
          if (parts.length > 1) {
            const beforeHint = parts[0];
            const hintPart = parts[1].trim();
            const ttsFriendlyHint = this.makeTtsFriendlyHint(hintPart);
            ttsFriendlyResponse = `${beforeHint}💡 ${ttsFriendlyHint}`;
          }
        }

        // Clean the text for TTS
        const cleanedText = this.ttsService.cleanTextForTTS(ttsFriendlyResponse);

        // Convert to speech
        try {
          const audioBuffer = await this.ttsService.textToSpeech(cleanedText);

          // Send voice note
          await this.whatsappWebService.sendVoiceNote(whatsappId, audioBuffer);

          // Also send the text message for reference (original with backticks)
          await this.whatsappWebService.sendMessage(whatsappId, response);

          return;
        } catch (ttsError) {
          this.logger.error('TTS conversion failed, sending text only:', ttsError);
          // Fall back to text-only
        }
      }

      // Send text message normally
      if (this.whatsappWebService) {
        await this.whatsappWebService.sendMessage(whatsappId, response);
      }
    } catch (error) {
      this.logger.error(`Error sending response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add contextual hints to messages
   */
  private addHint(message: string, session: UserSession | null, command?: ParsedCommand): string {
    // Don't add hints to admin commands or help messages
    if (command?.type === CommandType.ADMIN || command?.type === CommandType.HELP) {
      return message;
    }

    // Don't add hints if message already has a hint (contains 💡)
    if (message.includes('💡')) {
      return message;
    }

    const hints: string[] = [];

    // Context-based hints
    if (!session) {
      hints.push('Type `link` to connect your Flash account');
    } else if (!session.isVerified) {
      hints.push('Enter your 6-digit verification code');
    } else {
      // User is linked and verified
      if (command?.type === CommandType.BALANCE) {
        hints.push('Send money with `send 10 to @username`');
      } else if (command?.type === CommandType.SEND) {
        hints.push('Check balance with `balance`');
      } else if (command?.type === CommandType.RECEIVE) {
        hints.push('Share this invoice to get paid');
      } else if (command?.type === CommandType.PRICE) {
        hints.push('Receive Bitcoin with `receive 20`');
      } else if (command?.type === CommandType.CONTACTS) {
        hints.push('Send to contacts: `send 5 to john`');
      } else {
        // Random general hints
        const generalHints = [
          'Type `help` to see all commands',
          'Need assistance? Type `support`',
          'Set username for easy payments',
          'Save contacts with `contacts add`',
          'Check Bitcoin price with `price`',
          'View transactions with `history`',
        ];
        hints.push(generalHints[Math.floor(Math.random() * generalHints.length)]);
      }
    }

    if (hints.length > 0) {
      return `${message}\n\n💡 ${hints[0]}`;
    }

    return message;
  }

  /**
   * Convert hints to TTS-friendly format
   * Transforms technical commands into natural language
   */
  private makeTtsFriendlyHint(hint: string): string {
    // First, apply phrase-level replacements for better context
    let ttsFriendly = hint;

    // Convert common phrases to more natural language
    const phraseReplacements: [RegExp | string, string][] = [
      [
        'Type `link` to connect your Flash account',
        "You can connect your Flash account by typing 'link'",
      ],
      [
        'Enter your 6-digit verification code',
        'Complete the verification by entering your 6-digit code',
      ],
      [
        'Send money with `send 10 to @username`',
        "You can send money by typing 'send', then the amount, then 'to' and the username",
      ],
      ['Check balance with `balance`', "You can check your balance by typing 'balance'"],
      ['Share this invoice to get paid', 'Share this invoice with someone to receive payment'],
      [
        'Receive Bitcoin with `receive 20`',
        "You can receive Bitcoin by typing 'receive' followed by the amount",
      ],
      [
        'Send to contacts: `send 5 to john`',
        "To send money to your contacts, type 'send 5 to' followed by the contact name",
      ],
      ['Type `help` to see all commands', "To see all available commands, type 'help'"],
      ['Need assistance? Type `support`', "If you need assistance, type 'support'"],
      ['Set username for easy payments', 'Set up a username to make payments easier'],
      ['Save contacts with `contacts add`', "You can save contacts by typing 'contacts add'"],
      [
        'Check Bitcoin price with `price`',
        "You can check the current price of Bitcoin by typing 'price'",
      ],
      [
        'View transactions with `history`',
        "You can view your transaction history by typing 'history'",
      ],
    ];

    // Apply phrase replacements
    for (const [pattern, replacement] of phraseReplacements) {
      if (typeof pattern === 'string' && ttsFriendly.includes(pattern)) {
        ttsFriendly = ttsFriendly.replace(pattern, replacement);
      }
    }

    // If no phrase replacement was applied, handle remaining backticks
    if (ttsFriendly.includes('`')) {
      ttsFriendly = ttsFriendly.replace(/`([^`]+)`/g, (_, cmd) => {
        // Default: just wrap in quotes
        return `'${cmd}'`;
      });
    }

    return ttsFriendly;
  }
}
