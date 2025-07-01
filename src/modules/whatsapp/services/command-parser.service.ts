import { Injectable, Logger } from '@nestjs/common';

export enum CommandType {
  HELP = 'help',
  BALANCE = 'balance',
  LINK = 'link',
  UNLINK = 'unlink',
  VERIFY = 'verify',
  CONSENT = 'consent',
  REFRESH = 'refresh',
  USERNAME = 'username',
  PRICE = 'price',
  SEND = 'send',
  RECEIVE = 'receive',
  HISTORY = 'history',
  REQUEST = 'request',
  CONTACTS = 'contacts',
  PAY = 'pay',
  VYBZ = 'vybz',
  ADMIN = 'admin',
  PENDING = 'pending',
  UNKNOWN = 'unknown',
}

export interface ParsedCommand {
  type: CommandType;
  args: Record<string, string>;
  rawText: string;
}

@Injectable()
export class CommandParserService {
  private readonly logger = new Logger(CommandParserService.name);

  private readonly commandPatterns = [
    {
      type: CommandType.HELP,
      pattern: /^help(?:\s+(wallet|send|receive|contacts|pending|voice))?$/i,
    },
    { type: CommandType.BALANCE, pattern: /^balance|^bal$/i },
    { type: CommandType.LINK, pattern: /^link|^connect$/i },
    { type: CommandType.UNLINK, pattern: /^unlink(?:\s+(confirm))?$/i },
    { type: CommandType.VERIFY, pattern: /^(?:verify|v)\s+(\d{6})$/i },
    { type: CommandType.CONSENT, pattern: /^consent\s+(yes|no)$/i },
    { type: CommandType.REFRESH, pattern: /^refresh$/i },
    { type: CommandType.USERNAME, pattern: /^username(?:\s+(.+))?$/i },
    { type: CommandType.PRICE, pattern: /^price|^rate|^btc$/i },
    {
      type: CommandType.SEND,
      pattern: /^(?:send|sent)\s+(\d*\.?\d+)\s+to\s+(?:@?(\w+)|(\+?\d{10,})|(\w+))(?:\s+(.*))?$/i,
    },
    { type: CommandType.RECEIVE, pattern: /^receive(?:\s+(\d*\.?\d+))?\s*(.*)$/i },
    { type: CommandType.HISTORY, pattern: /^history|^transactions|^txs$/i },
    {
      type: CommandType.REQUEST,
      pattern: /^request\s+(\d*\.?\d+)\s+from\s+(?:@?(\w+)|(\+?\d{10,}))(?:\s+(.+))?$/i,
    },
    {
      type: CommandType.CONTACTS,
      pattern: /^contacts(?:\s+(add|list|remove|history))?(?:\s+(\w+))?(?:\s+(.+))?$/i,
    },
    { type: CommandType.PAY, pattern: /^pay(?:\s+(confirm|cancel|list|\d+))?(?:\s+(all))?$/i },
    {
      type: CommandType.VYBZ,
      pattern: /^(?:vybz|vybe|vibes|vibe|post|share|drop)(?:\s+(status|check))?$/i,
    },
    {
      type: CommandType.ADMIN,
      pattern:
        /^admin(?:\s+(help|disconnect|reconnect|status|clear-session|settings|lockdown|find|group|add|remove|voice))?\s*(?:support|admin)?\s*(.*)$/i,
    },
    { type: CommandType.PENDING, pattern: /^pending(?:\s+(sent|received|claim))?(?:\s+(.+))?$/i },
  ];

  /**
   * Parse an incoming message text into a command
   */
  parseCommand(text: string, isVoiceInput = false): ParsedCommand {
    try {
      let trimmedText = text.trim();
      const originalText = trimmedText;

      // Strip voice-related prefixes to allow "voice balance", "speak help", etc.
      const voicePrefixes = /^(voice|audio|speak|say it|tell me)\s+/i;
      const voiceMatch = trimmedText.match(voicePrefixes);
      if (voiceMatch) {
        // Remove the voice prefix but keep track that voice was requested
        trimmedText = trimmedText.replace(voicePrefixes, '').trim();
      }

      // If this is voice input, try natural language patterns first
      if (isVoiceInput) {
        const naturalCommand = this.parseNaturalLanguage(trimmedText);
        if (naturalCommand.type !== CommandType.UNKNOWN) {
          // Add voice confirmation flag for payment commands
          if (
            naturalCommand.type === CommandType.SEND ||
            naturalCommand.type === CommandType.REQUEST
          ) {
            naturalCommand.args.requiresConfirmation = 'true';
            naturalCommand.args.isVoiceCommand = 'true';
          }
          return naturalCommand;
        }
      }

      for (const { type, pattern } of this.commandPatterns) {
        const match = trimmedText.match(pattern);

        if (match) {
          const result = this.extractCommand(type, match, trimmedText);

          // Add voice confirmation flag for payment commands from voice
          if (isVoiceInput && (type === CommandType.SEND || type === CommandType.REQUEST)) {
            result.args.requiresConfirmation = 'true';
            result.args.isVoiceCommand = 'true';
          }

          if (type === CommandType.SEND) {
            this.logger.log(
              `SEND command matched: amount=${result.args.amount}, username=${result.args.username}, recipient=${result.args.recipient}`,
            );
          }
          return result;
        }
      }

      // If no pattern matched, return as unknown command
      return {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: originalText, // Use original text for unknown commands
      };
    } catch (error) {
      this.logger.error(`Error parsing command: ${error.message}`, error.stack);

      // Return as unknown command on error
      return {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: text,
      };
    }
  }

  /**
   * Parse natural language variations for voice commands
   */
  private parseNaturalLanguage(text: string): ParsedCommand {
    const lowerText = text.toLowerCase();

    // Balance variations
    if (
      lowerText.includes('check my balance') ||
      lowerText.includes('what is my balance') ||
      lowerText.includes('show me my balance') ||
      lowerText.includes('how much do i have') ||
      lowerText.includes('how much money') ||
      lowerText.includes('my wallet balance')
    ) {
      return { type: CommandType.BALANCE, args: {}, rawText: text };
    }

    // Price variations
    if (
      lowerText.includes('bitcoin price') ||
      lowerText.includes('btc price') ||
      lowerText.includes('price of bitcoin') ||
      lowerText.includes('how much is bitcoin') ||
      lowerText.includes('what is bitcoin worth') ||
      lowerText.includes('current bitcoin price') ||
      lowerText.includes('check the price')
    ) {
      return { type: CommandType.PRICE, args: {}, rawText: text };
    }

    // Help variations
    if (
      lowerText === 'help please' ||
      lowerText === 'please help' ||
      lowerText === 'help me' ||
      lowerText === 'i need help' ||
      lowerText === 'can you help me' ||
      lowerText === 'what can you do' ||
      lowerText === 'show me what you can do'
    ) {
      return { type: CommandType.HELP, args: {}, rawText: text };
    }

    // Send variations with natural language
    const sendPatterns = [
      /(?:please\s+)?send\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /(?:please\s+)?send\s+(\w+)\s+(?:dollars?\s+)?to\s+(\w+)/i, // "send one dollar to john"
      /(?:please\s+)?pay\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /(?:please\s+)?pay\s+(\w+)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /transfer\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
      /give\s+(\w+)\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /give\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?to\s+(\w+)/i,
    ];

    for (const pattern of sendPatterns) {
      const match = text.match(pattern);
      if (match) {
        let amount = match[1];
        const recipient = match[2];

        // Convert word numbers to digits
        const wordNumbers: Record<string, string> = {
          one: '1',
          two: '2',
          three: '3',
          four: '4',
          five: '5',
          six: '6',
          seven: '7',
          eight: '8',
          nine: '9',
          ten: '10',
          twenty: '20',
          thirty: '30',
          forty: '40',
          fifty: '50',
          hundred: '100',
          thousand: '1000',
        };

        if (wordNumbers[amount.toLowerCase()]) {
          amount = wordNumbers[amount.toLowerCase()];
        }

        return {
          type: CommandType.SEND,
          args: { amount, recipient },
          rawText: text,
        };
      }
    }

    // Request variations
    const requestPatterns = [
      /(?:please\s+)?request\s+(\d+(?:\.\d+)?)\s+(?:dollars?\s+)?from\s+(\w+)/i,
      /(?:please\s+)?ask\s+(\w+)\s+for\s+(\d+(?:\.\d+)?)\s+(?:dollars?)?/i,
      /(?:can you\s+)?request\s+(\d+(?:\.\d+)?)\s+from\s+(\w+)/i,
    ];

    for (const pattern of requestPatterns) {
      const match = text.match(pattern);
      if (match) {
        let amount, username;
        if (pattern.toString().includes('ask')) {
          username = match[1];
          amount = match[2];
        } else {
          amount = match[1];
          username = match[2];
        }

        return {
          type: CommandType.REQUEST,
          args: { amount, username },
          rawText: text,
        };
      }
    }

    // Link account variations
    if (
      lowerText.includes('link my account') ||
      lowerText.includes('connect my account') ||
      lowerText.includes('link my flash') ||
      lowerText.includes('connect to flash') ||
      lowerText === 'link me' ||
      lowerText === 'connect me'
    ) {
      return { type: CommandType.LINK, args: {}, rawText: text };
    }

    // History variations
    if (
      lowerText.includes('show my history') ||
      lowerText.includes('transaction history') ||
      lowerText.includes('show my transactions') ||
      lowerText.includes('recent transactions') ||
      lowerText.includes('payment history')
    ) {
      return { type: CommandType.HISTORY, args: {}, rawText: text };
    }

    // Receive variations
    if (
      lowerText.includes('receive money') ||
      lowerText.includes('receive payment') ||
      lowerText.includes('get paid') ||
      lowerText.includes('request money') ||
      lowerText.includes('create invoice')
    ) {
      // Try to extract amount if mentioned
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (amountMatch) {
        return {
          type: CommandType.RECEIVE,
          args: { amount: amountMatch[1] },
          rawText: text,
        };
      }
      return { type: CommandType.RECEIVE, args: {}, rawText: text };
    }

    return { type: CommandType.UNKNOWN, args: {}, rawText: text };
  }

  /**
   * Extract command details based on the match
   */
  private extractCommand(
    type: CommandType,
    match: RegExpMatchArray,
    rawText: string,
  ): ParsedCommand {
    const args: Record<string, string> = {};

    switch (type) {
      case CommandType.HELP:
        // Extract help category if provided
        if (match[1]) {
          args.category = match[1];
        }
        break;

      case CommandType.VERIFY:
        // Extract OTP code
        if (match[1]) {
          args.otp = match[1];
        }
        break;

      case CommandType.CONSENT:
        // Extract consent choice
        if (match[1]) {
          args.choice = match[1].toLowerCase();
        }
        break;

      case CommandType.UNLINK:
        // Extract confirmation if provided
        if (match[1]) {
          args.confirm = match[1].toLowerCase();
        }
        break;

      case CommandType.USERNAME:
        // Extract username if provided
        if (match[1]) {
          args.username = match[1].trim();
        }
        break;

      case CommandType.SEND:
        // Extract amount and recipient (username, phone, or contact name)
        if (match[1]) {
          args.amount = match[1];
        }
        if (match[2]) {
          // Username (with or without @)
          args.username = match[2];
        } else if (match[3]) {
          // Phone number
          args.phoneNumber = match[3];
        } else if (match[4]) {
          // Contact name or Lightning address
          args.recipient = match[4];
        }
        if (match[5]) {
          // Optional memo/note
          args.memo = match[5].trim();
        }
        break;

      case CommandType.RECEIVE:
        // Extract amount and memo if provided
        if (match[1]) {
          args.amount = match[1];
        }
        if (match[2]) {
          // Limit memo length at parsing stage to prevent issues
          const rawMemo = match[2].trim();
          args.memo = rawMemo.substring(0, 1000); // Generous limit at parse stage
        }
        break;

      case CommandType.REQUEST:
        // Extract amount and either username or phone number
        if (match[1]) {
          args.amount = match[1];
        }
        if (match[2]) {
          // Username was provided
          args.username = match[2];
        } else if (match[3]) {
          // Phone number was provided instead of username
          args.phoneNumber = match[3];
        }
        if (match[4]) {
          // Additional phone number (when username was provided)
          args.phoneNumber = match[4].trim();
        }
        break;

      case CommandType.CONTACTS:
        // Extract action, name, and phone number
        if (match[1]) {
          args.action = match[1].toLowerCase(); // add, list, remove
        }
        if (match[2]) {
          args.name = match[2];
        }
        if (match[3]) {
          args.phoneNumber = match[3].trim();
        }
        break;

      case CommandType.PAY:
        // Extract action: confirm, cancel, list, or a number
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        // Check for "all" modifier (e.g., "pay cancel all")
        if (match[2]) {
          args.modifier = match[2].toLowerCase();
        }
        break;

      case CommandType.VYBZ:
        // Extract status/check action
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        break;

      case CommandType.ADMIN:
        // Extract admin action
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        // Extract additional parameters for admin commands
        if (match[2]) {
          // For "add support" or "add admin", the phone number is in match[2]
          if (args.action === 'add' && rawText.includes('support')) {
            args.subAction = 'support';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'add' && rawText.includes('admin')) {
            args.subAction = 'admin';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'find') {
            args.searchTerm = match[2].trim();
          } else if (args.action === 'remove' && rawText.includes('support')) {
            args.subAction = 'support';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'remove' && rawText.includes('admin')) {
            args.subAction = 'admin';
            args.phoneNumber = match[2].trim();
          } else if (args.action === 'lockdown') {
            args.mode = match[2].trim().toLowerCase();
          } else if (args.action === 'group') {
            args.mode = match[2].trim().toLowerCase();
          } else if (args.action === 'voice') {
            args.mode = match[2].trim().toLowerCase();
          }
        }
        break;

      case CommandType.PENDING:
        // Extract action: sent, received, or claim
        if (match[1]) {
          args.action = match[1].toLowerCase();
        }
        // Extract claim code for claim action
        if (match[2]) {
          args.claimCode = match[2].trim();
        }
        break;
    }

    return { type, args, rawText };
  }
}
