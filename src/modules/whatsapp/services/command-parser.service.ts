import { Injectable, Logger } from '@nestjs/common';

export enum CommandType {
  HELP = 'help',
  BALANCE = 'balance',
  LINK = 'link',
  VERIFY = 'verify',
  CONSENT = 'consent',
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
    { type: CommandType.HELP, pattern: /^help|^h$|^\?$/i },
    { type: CommandType.BALANCE, pattern: /^balance|^bal$/i },
    { type: CommandType.LINK, pattern: /^link|^connect$/i },
    { type: CommandType.VERIFY, pattern: /^verify|^v\s+(\d{6})$/i },
    { type: CommandType.CONSENT, pattern: /^consent\s+(yes|no)$/i },
  ];

  /**
   * Parse an incoming message text into a command
   */
  parseCommand(text: string): ParsedCommand {
    try {
      const trimmedText = text.trim();
      
      for (const { type, pattern } of this.commandPatterns) {
        const match = trimmedText.match(pattern);
        
        if (match) {
          return this.extractCommand(type, match, trimmedText);
        }
      }
      
      // If no pattern matched, return as unknown command
      return {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: trimmedText,
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
  private extractCommand(type: CommandType, match: RegExpMatchArray, rawText: string): ParsedCommand {
    const args: Record<string, string> = {};
    
    switch (type) {
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
    }
    
    return { type, args, rawText };
  }
}