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

      // Merge response data with context for richer voice responses
      const enrichedData = { ...responseData, ...context };

      switch (commandType) {
        case CommandType.BALANCE:
          return this.generateBalanceVoiceResponse(enrichedData, context);

        case CommandType.SEND:
          return this.generateSendVoiceResponse(enrichedData, commandArgs);

        case CommandType.RECEIVE:
          return this.generateReceiveVoiceResponse(enrichedData, commandArgs);

        case CommandType.HISTORY:
          return this.generateHistoryVoiceResponse(enrichedData);

        case CommandType.PRICE:
          return this.generatePriceVoiceResponse(enrichedData);

        case CommandType.HELP:
          return this.generateHelpVoiceResponse(enrichedData, commandArgs);

        case CommandType.LINK:
          return this.generateLinkVoiceResponse(enrichedData);

        case CommandType.REQUEST:
          return this.generateRequestVoiceResponse(enrichedData, commandArgs);

        case CommandType.CONTACTS:
          return this.generateContactsVoiceResponse(enrichedData, commandArgs);

        case CommandType.USERNAME:
          return this.generateUsernameVoiceResponse(enrichedData, commandArgs);

        case CommandType.PENDING:
          return this.generatePendingVoiceResponse(enrichedData);

        case CommandType.VOICE:
          return this.generateVoiceSettingsResponse(enrichedData, commandArgs);

        case CommandType.VERIFY:
          return this.generateWelcomeVoiceResponse(enrichedData, context);

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
    const firstName = userName && userName !== 'there' ? userName.split(' ')[0] : '';
    const greeting = firstName ? `Hey ${firstName}! ` : 'Alright, ';

    if (data.usdAmount !== undefined) {
      const amount = data.usdAmount.toFixed(2);
      const amountInWords = convertCurrencyToWords(amount);

      if (data.usdAmount === 0) {
        return `${greeting}Your Flash balance is currently empty. Would you like to add some funds? Just say "receive" followed by the amount you want to request, and I'll create a payment link for you.`;
      } else if (data.usdAmount < 5) {
        return `${greeting}You have ${amountInWords} in your Flash account. That's getting a bit low. If you need to add more funds, just let me know and I can help you create a payment request.`;
      } else if (data.usdAmount < 20) {
        return `${greeting}Your current balance is ${amountInWords}. You're all set for small transactions. Need to send money to someone?`;
      } else if (data.usdAmount < 100) {
        return `${greeting}You've got ${amountInWords} in your Flash account. Looking good! What would you like to do today?`;
      } else {
        return `${greeting}Nice! Your balance is ${amountInWords}. You're well funded and ready to go. How can I help you today?`;
      }
    }

    return `${greeting}Let me check your Flash balance for you. This should just take a moment...`;
  }

  /**
   * Generate natural send response
   */
  private generateSendVoiceResponse(data: Record<string, any>, args?: Record<string, any>): string {
    if (data.isSuccess) {
      const amount = args?.amount || 'the payment';
      const amountInWords = amount !== 'the payment' ? convertCurrencyToWords(amount) : amount;
      const recipient = args?.username || args?.recipient || 'them';
      
      // Create varied success responses
      const responses = [
        `Perfect! I've sent ${amountInWords} to ${recipient}. They should receive it instantly.`,
        `All done! ${recipient} just received ${amountInWords} from you. The payment went through successfully.`,
        `Great! Your payment of ${amountInWords} to ${recipient} has been completed. They'll get a notification right away.`,
        `Success! I've transferred ${amountInWords} to ${recipient}'s Flash account. The money is already in their wallet.`,
      ];
      
      // Pick a random response for variety
      return responses[Math.floor(Math.random() * responses.length)];
    } else if (data.isError) {
      if (data.originalResponse?.includes('Insufficient balance')) {
        return `Oops! It looks like you don't have enough in your balance to send that amount. You can check your current balance by saying "balance", or add funds by saying "receive" followed by the amount you need.`;
      }
      if (data.originalResponse?.includes('not found')) {
        return `Hmm, I couldn't find that recipient. Make sure you've spelled their username correctly, or try using their phone number instead. You can also save them as a contact first to make it easier.`;
      }
      return `I ran into a problem sending that payment. Let's try again - make sure to include the amount and the recipient's username or phone number. For example, say "send 10 to john".`;
    }

    return `Alright, I'm sending that payment now. Just a moment while I process it...`;
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
        return `Perfect! I've created a payment request for ${amountInWords}. You can share this with anyone who has a Lightning wallet - they can pay you from CashApp, Strike, or any other Lightning-enabled app. Just copy and send them the invoice I've generated.`;
      }
      return `I've created your payment request! Share this Lightning invoice with whoever needs to pay you. They can scan it or paste it into any Lightning wallet to send you money instantly.`;
    }

    if (data.isError) {
      return `I had trouble creating that payment request. Make sure to specify the amount you want to receive. For example, say "receive 20 dollars" or just "receive 20".`;
    }

    return `Alright, let me create that payment request for you. This will generate a Lightning invoice that anyone can use to send you money...`;
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
      return `It looks like you haven't made any transactions yet. Once you start sending or receiving money through Flash, I'll keep track of everything here for you. Ready to make your first transaction?`;
    }

    if (totalCount === 1) {
      if (sentCount === 1) {
        return `I found your first transaction - a payment you sent. Great start! As you use Flash more, your transaction history will build up here. Each transaction includes the amount, recipient, and timestamp.`;
      } else {
        return `I see you received your first payment - welcome to Flash! Your transaction history will grow as you send and receive more payments. Everything is tracked securely for your records.`;
      }
    }

    // Multiple transactions
    let response = `Looking at your transaction history... `;

    if (sentCount > 0 && receivedCount > 0) {
      response += `You've sent ${sentCount} payment${sentCount > 1 ? 's' : ''} and received ${receivedCount} payment${receivedCount > 1 ? 's' : ''}. `;
      response += `Nice to see you're actively using Flash for both sending and receiving money! `;
    } else if (sentCount > 0) {
      response += `You've sent ${sentCount} payment${sentCount > 1 ? 's' : ''} so far. `;
      response += `Looks like you're using Flash to pay people - that's great! `;
    } else {
      response += `You've received ${receivedCount} payment${receivedCount > 1 ? 's' : ''}. `;
      response += `People have been sending you money through Flash - excellent! `;
    }

    if (totalCount > 10) {
      response += `You're becoming quite the Flash power user! `;
    }

    response += `Want me to tell you more about any specific transaction?`;

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

      // Add market context with more personality
      let marketContext = '';
      if (data.btcPrice > 100000) {
        marketContext = ` Wow! Bitcoin has crossed the hundred thousand dollar mark - that's a huge milestone! We're witnessing history here.`;
      } else if (data.btcPrice > 90000) {
        marketContext = ` Bitcoin is really strong right now, approaching six figures. The market is looking very bullish!`;
      } else if (data.btcPrice > 70000) {
        marketContext = ` That's a solid price point. Bitcoin is holding strong in the market.`;
      } else if (data.btcPrice > 50000) {
        marketContext = ` Bitcoin is doing well today, maintaining a healthy price level.`;
      } else if (data.btcPrice > 30000) {
        marketContext = ` The market is in an interesting spot right now. Could be a good time to keep an eye on things.`;
      } else {
        marketContext = ` The market is in a consolidation phase. These prices have historically been seen as accumulation opportunities.`;
      }

      return `The current Bitcoin price is ${priceInWords}.${marketContext} Just remember, when you use Flash, all your transactions are in US dollars, so you don't have to worry about Bitcoin price fluctuations affecting your payments.`;
    }

    return `Let me check the latest Bitcoin price for you. I'll get that information right away...`;
  }

  /**
   * Generate natural help response
   */
  private generateHelpVoiceResponse(data: Record<string, any>, args?: Record<string, any>): string {
    const category = args?.category;
    const isLinked = data.isLinked;
    const isVerified = data.isVerified;
    const isGroup = data.isGroup;
    const userName = data.userName;

    // Group help
    if (isGroup) {
      return `Hey there! In this group, I can help you play games and have fun. You can play trivia to earn sats, create polls, or even have typing races with Quick Draw. If you've linked your Flash account, you can also send money to other group members. Just say their name and the amount, like "send 5 dollars to john". Want to know more? Just ask me about any specific feature!`;
    }

    // Not linked yet
    if (!isLinked) {
      return `Hi! I'm Pulse, your friendly assistant for sending and receiving money through WhatsApp. To get started, you'll need to connect your Flash account. Just say "link" and I'll walk you through it. Once you're connected, you can send money to friends, check your balance, and much more. Ready to begin?`;
    }

    // Linked but not verified
    if (!isVerified) {
      return `I see you're almost there! I just need the 6-digit verification code that was sent to your phone. Once you tell me that code, you'll be all set to start using Flash through WhatsApp. If you didn't receive the code, just say "link" again and I'll send you a new one.`;
    }

    // Handle specific category help
    if (category === 'wallet' || category === '1') {
      return `Let me tell you about managing your wallet! You can check how much money you have by saying "balance" or just "bal" for short. If you want to refresh your balance, say "refresh". You can also set up a username to make it easier for people to send you money - just say "username" followed by your desired name. And if you want to see your transaction history, just say "history". What would you like to try first?`;
    } else if (category === 'send' || category === '2') {
      return `Sending money is super easy! Just tell me who you want to send to and how much. For example, you can say "send 10 dollars to sarah" or "pay john 5 bucks". You can send to people using their username, phone number, or if they're in your contacts, just their name. I'll always confirm the details with you before sending. Want to try sending some money now?`;
    } else if (category === 'receive' || category === '3') {
      return `Getting paid is simple! When you need to receive money, just tell me the amount. For example, say "receive 20 dollars" and I'll create a payment link you can share. You can also request money from specific people by saying something like "request 15 from mike". The person will get a notification and can pay you instantly. Need to receive some money now?`;
    }

    // Main help menu - personalized if we have a name
    const greeting = userName && userName !== 'there' ? `Hey ${userName.split(' ')[0]}!` : `Hey there!`;
    
    return `${greeting} Here's what I can help you with today. You can check your balance anytime - just say "balance". Need to send money? Tell me the amount and who to send it to, like "send 20 to mike". Want to receive money? Say "receive" and the amount. I can also show you your transaction history, help you play games to earn sats, and much more. What would you like to do?`;
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
