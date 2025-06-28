import { Injectable, Logger } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { ParsedCommand, CommandType } from './command-parser.service';
import {
  BaseCommandDto,
  SendCommandDto,
  ReceiveCommandDto,
  PayInvoiceCommandDto,
  ContactCommandDto,
  AdminCommandDto,
} from '../dto/command-input.dto';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  validatedData?: any;
}

@Injectable()
export class CommandValidatorService {
  private readonly logger = new Logger(CommandValidatorService.name);

  /**
   * Validate a parsed command based on its type
   */
  async validateCommand(command: ParsedCommand, whatsappId: string): Promise<ValidationResult> {
    try {
      let dto: any;
      let DtoClass: any;

      // Create appropriate DTO based on command type
      switch (command.type) {
        case CommandType.SEND:
          DtoClass = SendCommandDto;
          dto = plainToClass(DtoClass, {
            rawCommand: command.rawText,
            whatsappId,
            recipient: command.args.recipient || command.args.to,
            amount: parseFloat(command.args.amount),
            memo: command.args.memo,
          });
          break;

        case CommandType.RECEIVE:
        case CommandType.REQUEST:
          DtoClass = ReceiveCommandDto;
          dto = plainToClass(DtoClass, {
            rawCommand: command.rawText,
            whatsappId,
            amount: parseFloat(command.args.amount),
            memo: command.args.memo,
            expirySeconds: command.args.expirySeconds
              ? parseInt(command.args.expirySeconds)
              : undefined,
          });
          break;

        case CommandType.PAY:
          DtoClass = PayInvoiceCommandDto;
          dto = plainToClass(DtoClass, {
            rawCommand: command.rawText,
            whatsappId,
            invoice: command.args.invoice,
          });
          break;

        case CommandType.CONTACTS:
          DtoClass = ContactCommandDto;
          dto = plainToClass(DtoClass, {
            rawCommand: command.rawText,
            whatsappId,
            action: command.args.action,
            contactNumber: command.args.phoneNumber,
            contactName: command.args.name,
          });
          break;

        case CommandType.ADMIN:
          DtoClass = AdminCommandDto;
          dto = plainToClass(DtoClass, {
            rawCommand: command.rawText,
            whatsappId,
            adminAction: command.args.action,
            forceDisconnect: command.args.force === 'true',
          });
          break;

        default:
          // For other command types, use base validation
          DtoClass = BaseCommandDto;
          dto = plainToClass(DtoClass, {
            rawCommand: command.rawText,
            whatsappId,
          });
      }

      // Validate the DTO
      const errors = await validate(dto);

      if (errors.length > 0) {
        const errorMessages = this.extractErrorMessages(errors);
        this.logger.warn(
          `Validation failed for ${command.type} command: ${errorMessages.join(', ')}`,
        );

        return {
          isValid: false,
          errors: errorMessages,
        };
      }

      return {
        isValid: true,
        errors: [],
        validatedData: dto,
      };
    } catch (error) {
      this.logger.error(`Error validating command: ${error.message}`, error.stack);
      return {
        isValid: false,
        errors: ['An error occurred while validating your command'],
      };
    }
  }

  /**
   * Extract readable error messages from validation errors
   */
  private extractErrorMessages(errors: any[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints as Record<string, string>));
      }

      if (error.children && error.children.length > 0) {
        messages.push(...this.extractErrorMessages(error.children));
      }
    }

    return messages;
  }

  /**
   * Validate amount for financial operations
   */
  validateAmount(amount: number, min: number = 0.01, max: number = 1000): ValidationResult {
    const errors: string[] = [];

    if (typeof amount !== 'number' || isNaN(amount)) {
      errors.push('Amount must be a valid number');
    } else {
      if (amount < min) {
        errors.push(`Amount must be at least $${min}`);
      }
      if (amount > max) {
        errors.push(`Amount cannot exceed $${max}`);
      }

      // Check decimal places
      const decimalPlaces = (amount.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        errors.push('Amount can have maximum 2 decimal places');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber: string): ValidationResult {
    const errors: string[] = [];

    if (!phoneNumber) {
      errors.push('Phone number is required');
    } else if (!/^\+?[1-9]\d{1,14}$/.test(phoneNumber)) {
      errors.push('Phone number must be in international format (e.g., +1234567890)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate username format
   */
  validateUsername(username: string): ValidationResult {
    const errors: string[] = [];

    if (!username) {
      errors.push('Username is required');
    } else {
      if (username.length < 3 || username.length > 16) {
        errors.push('Username must be between 3 and 16 characters');
      }
      if (!/^[a-z0-9_.]+$/i.test(username)) {
        errors.push('Username can only contain letters, numbers, underscore, and dot');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate Lightning invoice
   */
  validateLightningInvoice(invoice: string): ValidationResult {
    const errors: string[] = [];

    if (!invoice) {
      errors.push('Lightning invoice is required');
    } else if (!/^lnbc[a-z0-9]+$/i.test(invoice)) {
      errors.push('Invalid Lightning invoice format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize text input
   */
  sanitizeText(text: string): string {
    if (!text) return '';

    // Remove potential XSS patterns
    return text
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
}
