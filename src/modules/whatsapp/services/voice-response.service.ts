import { Injectable, Logger } from '@nestjs/common';
import { ParsedCommand, CommandType } from './command-parser.service';

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

      if (data.usdAmount === 0) {
        return `${greeting}Your Flash balance is currently empty. To add funds, you can ask someone to send you money, or say "receive" followed by an amount to create a payment request.`;
      } else if (data.usdAmount < 5) {
        return `${greeting}Your Flash balance is ${amount} dollars. Your balance is getting a bit low. You might want to add more funds soon.`;
      } else if (data.usdAmount > 100) {
        return `${greeting}Your Flash balance is ${amount} dollars. You have a healthy balance! You can send money by saying "send" followed by the amount and recipient.`;
      } else {
        return `${greeting}Your Flash balance is ${amount} dollars.`;
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
      const recipient = args?.username || args?.recipient || 'them';
      return `Great! I've successfully sent ${amount} dollars to ${recipient}. The payment was instant and they should have received it already.`;
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
        return `Perfect! I've created a payment request for ${amount} dollars. You can share this invoice with anyone, and they'll be able to pay you instantly through the Lightning Network.`;
      }
      return `I've created your payment request. Share this invoice to receive payment instantly.`;
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
      const price = data.btcPrice.toLocaleString();

      // Add market context
      let marketContext = '';
      if (data.btcPrice > 100000) {
        marketContext = ' Bitcoin has reached a significant milestone!';
      } else if (data.btcPrice > 50000) {
        marketContext = ' The price is quite strong today.';
      }

      return `The current Bitcoin price is ${price} US dollars.${marketContext} Remember, when you send or receive money through Flash, it's always in US dollars, not Bitcoin.`;
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

    return `I can help you with many things! The main commands are: "balance" to check your money, "send" to pay someone, "receive" to get paid, and "history" to see your transactions. What would you like to do?`;
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
      const from = args?.username || 'them';
      return `I've sent a payment request for ${amount} dollars to ${from}. They'll receive a notification and can pay you instantly.`;
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
   * Clean text for voice output
   */
  private cleanTextForVoice(text: string): string {
    return text
      .replace(/[❌✅⚡💰💸🎉🔊🔇🎤💡📱]/g, '') // Remove emojis
      .replace(/\*([^*]+)\*/g, '$1') // Remove markdown bold
      .replace(/_([^_]+)_/g, '$1') // Remove markdown italic
      .replace(/`([^`]+)`/g, "'$1'") // Replace backticks with quotes
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\.\s*\./g, '.') // Remove double periods
      .trim();
  }

  /**
   * Convert formatted responses to natural speech for voice-only mode
   * This is used for command responses that need to be more conversational
   */
  async convertToNaturalSpeech(formattedResponse: string, context?: Record<string, any>): Promise<string> {
    // Remove all formatting and emojis
    let naturalResponse = this.cleanTextForVoice(formattedResponse);

    // Convert bullet points and lists to natural language
    if (naturalResponse.includes('•')) {
      const lines = naturalResponse.split('.');
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

      if (items.length > 0) {
        naturalResponse = mainMessage;
        if (items.length === 1) {
          naturalResponse += `You have ${items[0]}.`;
        } else if (items.length === 2) {
          naturalResponse += `You have ${items[0]} and ${items[1]}.`;
        } else {
          const lastItem = items.pop();
          naturalResponse += `You have ${items.join(', ')}, and ${lastItem}.`;
        }
      }
    }

    // Handle error messages - make them more conversational
    if (formattedResponse.includes('❌')) {
      // Extract the error message
      const errorMatch = naturalResponse.match(/([^.]+)/);
      if (errorMatch) {
        const errorMsg = errorMatch[1].trim();
        
        // Check for specific error patterns
        if (errorMsg.includes('not found')) {
          naturalResponse = `I'm sorry, but ${errorMsg.toLowerCase()}. Please check the spelling and try again.`;
        } else if (errorMsg.includes('Usage:') || errorMsg.includes('usage:')) {
          // Convert usage instructions to natural language
          naturalResponse = naturalResponse.replace(/Usage:/gi, 'To use this command, you need to say');
          naturalResponse = naturalResponse.replace(/\[([^\]]+)\]/g, 'followed by $1');
        } else {
          naturalResponse = `I'm sorry, but ${errorMsg.toLowerCase()}.`;
        }
      }
    }

    // Handle success messages
    if (formattedResponse.includes('✅')) {
      naturalResponse = naturalResponse.replace(/^([^.]+)/, 'Great! $1');
    }

    // Convert technical formatting to natural speech
    naturalResponse = naturalResponse
      .replace(/\b(\w+)\s*\([^)]+\)/g, '$1') // Remove parenthetical info
      .replace(/Type\s+['"]([^'"]+)['"]/gi, 'Say $1') // Convert "Type" to "Say"
      .replace(/\bOR\b/g, 'or') // Lowercase OR
      .replace(/\be\.g\./gi, 'for example')
      .replace(/\bi\.e\./gi, 'that is')
      .replace(/\betc\./gi, 'and so on');

    // Remove URLs and technical identifiers
    naturalResponse = naturalResponse.replace(/https?:\/\/[^\s]+/g, '');
    naturalResponse = naturalResponse.replace(/#[A-Za-z0-9]+/g, '');

    // Clean up any double spaces or periods
    naturalResponse = naturalResponse
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .replace(/,\s*,/g, ',')
      .trim();

    return naturalResponse;
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
}
