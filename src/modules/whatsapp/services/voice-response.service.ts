import { Injectable, Logger } from '@nestjs/common';
import { ParsedCommand, CommandType } from './command-parser.service';
import { convertCurrencyToWords, convertNumbersInText } from '../utils/number-to-words';
import { ResponseLengthUtil } from '../utils/response-length.util';

@Injectable()
export class VoiceResponseService {
  private readonly logger = new Logger(VoiceResponseService.name);

  /**
   * Transform a command response into natural, conversational language for voice
   */
  async generateNaturalVoiceResponse(
    commandType: CommandType,
    originalResponse: string,
    commandArgs?: Record<string, any>,
    context?: Record<string, any>,
  ): Promise<string> {
    try {
      // Extract key information from the original response
      const responseData = this.extractResponseData(originalResponse);

      switch (commandType) {
        case CommandType.BALANCE:
          return this.generateBalanceVoiceResponse(responseData, context);

        case CommandType.SEND:
          return this.generateSendVoiceResponse(responseData, commandArgs);

        case CommandType.RECEIVE:
          return this.generateReceiveVoiceResponse(responseData, commandArgs);

        case CommandType.HISTORY:
          return this.generateHistoryVoiceResponse(responseData);

        case CommandType.PRICE:
          return this.generatePriceVoiceResponse(responseData);

        case CommandType.HELP:
          return this.generateHelpVoiceResponse(responseData, commandArgs);

        case CommandType.LINK:
          return this.generateLinkVoiceResponse(responseData);

        case CommandType.REQUEST:
          return this.generateRequestVoiceResponse(responseData, commandArgs);

        case CommandType.CONTACTS:
          return this.generateContactsVoiceResponse(responseData, commandArgs);

        case CommandType.USERNAME:
          return this.generateUsernameVoiceResponse(responseData, commandArgs);

        case CommandType.PENDING:
          return this.generatePendingVoiceResponse(responseData);

        case CommandType.VOICE:
          return this.generateVoiceSettingsResponse(responseData, commandArgs);

        case CommandType.VERIFY:
          return this.generateWelcomeVoiceResponse(responseData, context);

        default:
          return this.generateGenericVoiceResponse(originalResponse);
      }
    } catch (error) {
      this.logger.error(`Error generating natural voice response: ${error.message}`);
      return this.cleanTextForVoice(originalResponse);
    }
  }

  /**
   * Extract key data from the original response text
   */
  private extractResponseData(response: string): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Check for pending payments in welcome message
    if (response.includes('pending payment') && response.includes('credited')) {
      data.pendingPayments = true;
    }

    // Extract amounts (USD)
    const usdMatch = response.match(/\$?([\d,]+\.?\d*)\s*USD/i);
    if (usdMatch) {
      data.usdAmount = parseFloat(usdMatch[1].replace(',', ''));
    }

    // Extract Bitcoin price
    const priceMatch = response.match(/\$?([\d,]+\.?\d*)/);
    if (priceMatch && response.toLowerCase().includes('bitcoin')) {
      data.btcPrice = parseFloat(priceMatch[1].replace(',', ''));
    }

    // Extract usernames
    const usernameMatch = response.match(/@(\w+)/);
    if (usernameMatch) {
      data.username = usernameMatch[1];
    }

    // Extract success/failure status
    data.isSuccess = response.includes('✅') || response.includes('Success');
    data.isError =
      response.includes('❌') || response.includes('Error') || response.includes('Failed');

    // Extract transaction IDs
    const txIdMatch = response.match(/#([A-Za-z0-9]+)/);
    if (txIdMatch) {
      data.transactionId = txIdMatch[1];
    }

    return data;
  }

  /**
   * Generate natural balance response
   */
  private generateBalanceVoiceResponse(
    data: Record<string, any>,
    context?: Record<string, any>,
  ): string {
    const userName = context?.userName || '';
    const greeting = userName ? `Hi ${userName}! ` : '';

    if (data.usdAmount !== undefined) {
      const amount = data.usdAmount.toFixed(2);
      const amountInWords = convertCurrencyToWords(amount);

      if (data.usdAmount === 0) {
        return ResponseLengthUtil.shortenResponse(
          `${greeting}Your balance is empty. Say "receive" to add funds.`,
          true,
        );
      } else if (data.usdAmount < 5) {
        return ResponseLengthUtil.shortenResponse(
          `${greeting}Your balance is ${amountInWords}. Low balance.`,
          true,
        );
      } else {
        return ResponseLengthUtil.shortenResponse(
          `${greeting}Your balance is ${amountInWords}.`,
          true,
        );
      }
    }

    return `${greeting}I'm checking your balance now. It might take a moment.`;
  }

  /**
   * Generate natural send response
   */
  private generateSendVoiceResponse(data: Record<string, any>, args?: Record<string, any>): string {
    if (data.isSuccess) {
      const amount = args?.amount || 'the payment';
      const amountInWords = amount !== 'the payment' ? convertCurrencyToWords(amount) : amount;
      const recipient = args?.username || args?.recipient || 'them';
      return ResponseLengthUtil.shortenResponse(`Sent ${amountInWords} to ${recipient}.`, true);
    } else if (data.isError) {
      if (data.originalResponse?.includes('Insufficient balance')) {
        return `Sorry, you don't have enough funds to complete this payment. Please check your balance first.`;
      }
      return `I wasn't able to send that payment. Please check the recipient details and try again.`;
    }

    return `I'm processing your payment now. This should only take a moment.`;
  }

  /**
   * Generate natural receive response
   */
  private generateReceiveVoiceResponse(
    data: Record<string, any>,
    args?: Record<string, any>,
  ): string {
    const amount = args?.amount;

    if (data.isSuccess) {
      if (amount) {
        const amountInWords = convertCurrencyToWords(amount);
        return ResponseLengthUtil.shortenResponse(
          `Created payment request for ${amountInWords}.`,
          true,
        );
      }
      return ResponseLengthUtil.shortenResponse(`Payment request created.`, true);
    }

    return `Creating your payment request now. Remember, all amounts are in US dollars, not Bitcoin.`;
  }

  /**
   * Generate natural history response
   */
  private generateHistoryVoiceResponse(data: Record<string, any>): string {
    const original = data.originalResponse || '';

    // Count transactions
    const sentCount = (original.match(/📤/g) || []).length;
    const receivedCount = (original.match(/📥/g) || []).length;
    const totalCount = sentCount + receivedCount;

    if (totalCount === 0) {
      return `You don't have any transactions yet. Once you start sending or receiving payments, they'll appear in your history.`;
    }

    let response = `Here's your recent transaction history. `;

    if (sentCount > 0 && receivedCount > 0) {
      response += `You have ${sentCount} sent and ${receivedCount} received transactions. `;
    } else if (sentCount > 0) {
      response += `You have ${sentCount} sent transaction${sentCount > 1 ? 's' : ''}. `;
    } else {
      response += `You have ${receivedCount} received transaction${receivedCount > 1 ? 's' : ''}. `;
    }

    response += `For more details about a specific transaction, you can say "history" followed by the transaction ID.`;

    return response;
  }

  /**
   * Generate natural price response
   */
  private generatePriceVoiceResponse(data: Record<string, any>): string {
    if (data.btcPrice) {
      // For large numbers like Bitcoin price, we'll use a formatted version
      const price = data.btcPrice.toLocaleString();
      const priceInWords = this.convertLargeNumberToWords(data.btcPrice);

      // Add market context
      let marketContext = '';
      if (data.btcPrice > 100000) {
        marketContext = ' Bitcoin has reached a significant milestone!';
      } else if (data.btcPrice > 50000) {
        marketContext = ' The price is quite strong today.';
      }

      return `The current Bitcoin price is ${priceInWords}.${marketContext} Remember, when you send or receive money through Flash, it's always in US dollars, not Bitcoin.`;
    }

    return `I'm checking the current Bitcoin price for you. This will just take a moment.`;
  }

  /**
   * Generate natural help response
   */
  private generateHelpVoiceResponse(data: Record<string, any>, args?: Record<string, any>): string {
    const category = args?.category;

    if (category === 'wallet' || category === '1') {
      return `For wallet commands, you can say "balance" to check how much money you have, or "refresh" to update your balance. You can also say "username" to set up an easy payment address, or "history" to see your past transactions.`;
    } else if (category === 'send' || category === '2') {
      return `To send money, just say "send" followed by the amount in dollars and the recipient. For example, "send 10 dollars to john". You can send to usernames, phone numbers, or saved contacts.`;
    } else if (category === 'receive' || category === '3') {
      return `To receive money, say "receive" followed by the amount you want. For example, "receive 20 dollars". This creates a payment request that you can share. You can also say "request" to ask someone specific for money.`;
    }

    return ResponseLengthUtil.shortenResponse(`Say: balance, send, receive, or history.`, true);
  }

  /**
   * Generate natural link response
   */
  private generateLinkVoiceResponse(data: Record<string, any>): string {
    if (data.isSuccess) {
      return `Great! I've sent a verification code to your phone. Please tell me the 6-digit code when you receive it, and I'll complete the connection to your Flash account.`;
    }

    return `To use all of my features, I need to connect to your Flash account. I'll send you a verification code now.`;
  }

  /**
   * Generate natural request response
   */
  private generateRequestVoiceResponse(
    data: Record<string, any>,
    args?: Record<string, any>,
  ): string {
    if (data.isSuccess) {
      const amount = args?.amount || 'the amount';
      const amountInWords = amount !== 'the amount' ? convertCurrencyToWords(amount) : amount;
      const from = args?.username || 'them';
      return `I've sent a payment request for ${amountInWords} to ${from}. They'll receive a notification and can pay you instantly.`;
    }

    return `I'm creating your payment request now. The recipient will be notified right away.`;
  }

  /**
   * Generate natural contacts response
   */
  private generateContactsVoiceResponse(
    data: Record<string, any>,
    args?: Record<string, any>,
  ): string {
    const action = args?.action;

    if (action === 'add' && data.isSuccess) {
      const name = args?.name;
      return `Perfect! I've saved ${name} to your contacts. Now you can send them money easily by just using their name.`;
    } else if (action === 'remove' && data.isSuccess) {
      const name = args?.name;
      return `I've removed ${name} from your contacts.`;
    } else if (action === 'list' || !action) {
      const original = data.originalResponse || '';
      const contactCount = (original.match(/•/g) || []).length;

      if (contactCount === 0) {
        return `You don't have any saved contacts yet. To add one, say "contacts add" followed by their name and phone number.`;
      } else if (contactCount === 1) {
        return `You have one saved contact. You can send them money by using their name.`;
      } else {
        return `You have ${contactCount} saved contacts. You can send money to any of them by using their name.`;
      }
    }

    return `I can help you manage your contacts. You can add, remove, or list your saved contacts.`;
  }

  /**
   * Generate natural username response
   */
  private generateUsernameVoiceResponse(
    data: Record<string, any>,
    args?: Record<string, any>,
  ): string {
    if (data.isSuccess && args?.username) {
      return `Excellent! Your username is now set to ${args.username}. People can send you money using this username instead of your phone number.`;
    } else if (data.username) {
      return `Your current username is ${data.username}. This is like your payment address that makes it easy for others to send you money.`;
    }

    return `You can set a username to make it easier for people to send you money. Just say "username" followed by your desired name.`;
  }

  /**
   * Generate natural pending payments response
   */
  private generatePendingVoiceResponse(data: Record<string, any>): string {
    const original = data.originalResponse || '';

    if (original.includes('No pending payments')) {
      return `You don't have any pending payments right now. All your payments have been completed.`;
    }

    const pendingCount = (original.match(/Code:/g) || []).length;
    if (pendingCount === 1) {
      return `You have one pending payment. The recipient hasn't claimed it yet, but they have time to do so.`;
    } else if (pendingCount > 1) {
      return `You have ${pendingCount} pending payments waiting to be claimed. These will be available until they expire or are claimed.`;
    }

    return `I'm checking your pending payments now.`;
  }

  /**
   * Generate natural voice settings response
   */
  private generateVoiceSettingsResponse(
    data: Record<string, any>,
    args?: Record<string, any>,
  ): string {
    const action = args?.action;

    switch (action) {
      case 'on':
        return `I've turned on voice responses. You'll now hear voice messages when you use voice-related keywords.`;
      case 'off':
        return `I've turned off voice responses. You'll only receive text messages from now on.`;
      case 'only':
        return `I've switched to voice-only mode. You'll only hear voice responses without any text.`;
      case 'status':
        return `Your current voice setting is displayed in the text message. You can change it anytime.`;
      default:
        return `You can control how I respond to you. Say "voice on" for voice with text, "voice off" for text only, or "voice only" for just voice responses.`;
    }
  }

  /**
   * Generate generic voice response for unknown commands
   */
  private generateGenericVoiceResponse(originalResponse: string): string {
    // Clean up the response for voice
    let cleaned = this.cleanTextForVoice(originalResponse);

    // Add natural language wrapper if it's an error
    if (originalResponse.includes('❌')) {
      return `I'm sorry, but ${cleaned}`;
    } else if (originalResponse.includes('✅')) {
      return `Great news! ${cleaned}`;
    } else if (originalResponse.includes('please') || originalResponse.includes('Please')) {
      return cleaned; // Already polite
    }

    return cleaned;
  }

  /**
   * Convert large numbers to natural speech format
   */
  private convertLargeNumberToWords(num: number): string {
    if (num >= 1000000) {
      const millions = (num / 1000000).toFixed(1);
      return `${millions} million dollars`;
    } else if (num >= 1000) {
      const thousands = Math.floor(num / 1000);
      const remainder = num % 1000;
      if (remainder === 0) {
        return `${thousands} thousand dollars`;
      } else {
        return `${thousands} thousand ${remainder} dollars`;
      }
    } else {
      return convertCurrencyToWords(num);
    }
  }

  /**
   * Clean text for voice output
   */
  private cleanTextForVoice(text: string): string {
    return text
      .replace(/[❌✅⚡💰💸🎉🔊🔇🎤💡📱]/g, '') // Remove emojis
      .replace(/\*([^*]+)\*/g, '$1') // Remove markdown bold
      .replace(/_([^_]+)_/g, '$1') // Remove markdown italic
      .replace(/`([^`]+)`/g, "'$1'") // Replace backticks with quotes
      .replace(/@/g, ' at ') // Replace @ with "at" for proper pronunciation
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\.\s*\./g, '.') // Remove double periods
      .trim();
  }

  /**
   * Convert formatted responses to natural speech for voice-only mode
   * This is used for command responses that need to be more conversational
   */
  async convertToNaturalSpeech(
    formattedResponse: string,
    context?: Record<string, any>,
  ): Promise<string> {
    // Remove all formatting and emojis
    let naturalResponse = this.cleanTextForVoice(formattedResponse);

    // Process different types of content
    naturalResponse = this.convertBulletListsToSpeech(naturalResponse);
    naturalResponse = this.handleErrorMessages(naturalResponse, formattedResponse);
    naturalResponse = this.handleSuccessMessages(naturalResponse, formattedResponse);
    naturalResponse = this.convertTechnicalTermsToSpeech(naturalResponse);
    naturalResponse = this.removeUrlsAndIdentifiers(naturalResponse);
    naturalResponse = this.cleanupFinalText(naturalResponse);

    return naturalResponse;
  }

  /**
   * Convert bullet point lists to natural language
   */
  private convertBulletListsToSpeech(text: string): string {
    if (!text.includes('•')) {
      return text;
    }

    const lines = text.split('.');
    const items: string[] = [];
    let mainMessage = '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('•')) {
        items.push(trimmed.substring(1).trim());
      } else if (trimmed) {
        mainMessage += trimmed + '. ';
      }
    });

    if (items.length === 0) {
      return text;
    }

    let result = mainMessage;
    if (items.length === 1) {
      result += `You have ${items[0]}.`;
    } else if (items.length === 2) {
      result += `You have ${items[0]} and ${items[1]}.`;
    } else {
      const lastItem = items.pop();
      result += `You have ${items.join(', ')}, and ${lastItem}.`;
    }

    return result;
  }

  /**
   * Handle error messages and make them conversational
   */
  private handleErrorMessages(text: string, originalResponse: string): string {
    if (!originalResponse.includes('❌')) {
      return text;
    }

    const errorMatch = text.match(/([^.]+)/);
    if (!errorMatch) {
      return text;
    }

    const errorMsg = errorMatch[1].trim();

    // Check for specific error patterns
    if (errorMsg.includes('not found')) {
      return `I'm sorry, but ${errorMsg.toLowerCase()}. Please check the spelling and try again.`;
    }

    if (errorMsg.includes('Usage:') || errorMsg.includes('usage:')) {
      // Convert usage instructions to natural language
      let result = text.replace(/Usage:/gi, 'To use this command, you need to say');
      result = result.replace(/\[([^\]]+)\]/g, 'followed by $1');
      return result;
    }

    return `I'm sorry, but ${errorMsg.toLowerCase()}.`;
  }

  /**
   * Handle success messages
   */
  private handleSuccessMessages(text: string, originalResponse: string): string {
    if (originalResponse.includes('✅')) {
      return text.replace(/^([^.]+)/, 'Great! $1');
    }
    return text;
  }

  /**
   * Convert technical terms to natural speech
   */
  private convertTechnicalTermsToSpeech(text: string): string {
    return text
      .replace(/\b(\w+)\s*\([^)]+\)/g, '$1') // Remove parenthetical info
      .replace(/Type\s+['"]([^'"]+)['"]/gi, 'Say $1') // Convert "Type" to "Say"
      .replace(/\bOR\b/g, 'or') // Lowercase OR
      .replace(/\be\.g\./gi, 'for example')
      .replace(/\bi\.e\./gi, 'that is')
      .replace(/\betc\./gi, 'and so on');
  }

  /**
   * Remove URLs and technical identifiers
   */
  private removeUrlsAndIdentifiers(text: string): string {
    return text.replace(/https?:\/\/[^\s]+/g, '').replace(/#[A-Za-z0-9]+/g, '');
  }

  /**
   * Clean up final text formatting
   */
  private cleanupFinalText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .replace(/,\s*,/g, ',')
      .trim();
  }

  /**
   * Generate natural voice list response
   */
  async generateNaturalVoiceListResponse(
    voiceList: Record<string, any>,
    requestedVoice?: string,
  ): Promise<string> {
    const voiceNames = Object.keys(voiceList);

    if (requestedVoice) {
      // User asked for a specific voice that wasn't found
      if (voiceNames.length === 0) {
        return `I couldn't find a voice named '${requestedVoice}'. You don't have any voices available yet. You can add a new voice by saying 'voice add' followed by the voice ID.`;
      } else if (voiceNames.length === 1) {
        const voiceName = voiceNames[0];
        const voiceDetails = voiceList[voiceName];
        let response = `I couldn't find a voice named '${requestedVoice}'. `;
        response += `You currently have one voice available: ${voiceName}`;
        if (voiceDetails.addedBy) {
          response += `, which was added by ${voiceDetails.addedBy}`;
        }
        response += `. You can select it by saying 'voice ${voiceName}' or add a new voice by saying 'voice add' followed by the voice ID.`;
        return response;
      } else {
        const lastVoice = voiceNames.pop();
        let response = `I couldn't find a voice named '${requestedVoice}'. `;
        response += `You have ${voiceNames.length + 1} voices available: ${voiceNames.join(', ')}, and ${lastVoice}. `;
        response += `You can select any of them by saying 'voice' followed by the name, or add a new voice by saying 'voice add' followed by the voice ID.`;
        return response;
      }
    }

    // Regular voice list request
    if (voiceNames.length === 0) {
      return `You don't have any voices available yet. To add a voice, say 'voice add' followed by the voice ID.`;
    } else if (voiceNames.length === 1) {
      const voiceName = voiceNames[0];
      const voiceDetails = voiceList[voiceName];
      let response = `You have one voice available: ${voiceName}`;
      if (voiceDetails.addedBy) {
        response += `, added by ${voiceDetails.addedBy}`;
      }
      response += `. To use it, say 'voice ${voiceName}'.`;
      return response;
    } else {
      const lastVoice = voiceNames.pop();
      let response = `You have ${voiceNames.length + 1} voices available: ${voiceNames.join(', ')}, and ${lastVoice}. `;
      response += `To select a voice, say 'voice' followed by the name. For example, 'voice ${voiceNames[0]}'. `;
      response += `You can also add new voices or remove existing ones.`;
      return response;
    }
  }

  /**
   * Generate natural welcome message for voice
   */
  private generateWelcomeVoiceResponse(data: Record<string, any>, context?: Record<string, any>): string {
    const userName = context?.userName || 'there';
    const firstName = userName === 'there' ? '' : userName.split(' ')[0];
    
    let response = '';
    
    if (firstName && firstName !== 'there') {
      response = `Welcome ${firstName}! Great news, your Flash account is now connected. `;
    } else {
      response = `Welcome! Your Flash account is successfully connected. `;
    }
    
    // Check if there were pending payments claimed
    if (data.pendingPayments) {
      response += `Even better, you had some money waiting for you that's now in your account. `;
    }
    
    response += `I'm Pulse, your personal assistant for sending and receiving money through WhatsApp. `;
    response += `You can ask me things like 'what's my balance' or 'send 10 dollars to John'. `;
    response += `To see everything I can do, just say 'help'. `;
    response += `Ready to get started? Try asking for your balance!`;
    
    return response;
  }
}
