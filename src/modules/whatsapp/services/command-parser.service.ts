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
    { type: CommandType.HELP, pattern: /^help(?:\s+(wallet|send|receive|contacts|pending|voice))?$/i },
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
  parseCommand(text: string): ParsedCommand {
    try {
      let trimmedText = text.trim();
      
      // Strip voice-related prefixes to allow "voice balance", "speak help", etc.
      const voicePrefixes = /^(voice|audio|speak|say it|tell me)\s+/i;
      const voiceMatch = trimmedText.match(voicePrefixes);
      if (voiceMatch) {
        // Remove the voice prefix but keep track that voice was requested
        trimmedText = trimmedText.replace(voicePrefixes, '').trim();
      }

      for (const { type, pattern } of this.commandPatterns) {
        const match = trimmedText.match(pattern);

        if (match) {
          const result = this.extractCommand(type, match, trimmedText);
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
        rawText: text.trim(), // Use original text for unknown commands
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
