import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validator for phone numbers in international format
 */
@ValidatorConstraint({ name: 'isPhoneNumber', async: false })
export class IsPhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(phoneNumber: string, args: ValidationArguments) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;

    // International phone number regex (E.164 format)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Phone number must be in international format (e.g., +1234567890)';
  }
}

export function IsPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPhoneNumberConstraint,
    });
  };
}

/**
 * Validator for Flash usernames
 */
@ValidatorConstraint({ name: 'isFlashUsername', async: false })
export class IsFlashUsernameConstraint implements ValidatorConstraintInterface {
  validate(username: string, args: ValidationArguments) {
    if (!username || typeof username !== 'string') return false;

    // Username: 3-16 characters, alphanumeric with underscore and dot
    const usernameRegex = /^[a-z0-9_.]{3,16}$/i;
    return usernameRegex.test(username);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Username must be 3-16 characters long and contain only letters, numbers, underscore, and dot';
  }
}

export function IsFlashUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsFlashUsernameConstraint,
    });
  };
}

/**
 * Validator for Lightning invoices
 */
@ValidatorConstraint({ name: 'isLightningInvoice', async: false })
export class IsLightningInvoiceConstraint implements ValidatorConstraintInterface {
  validate(invoice: string, args: ValidationArguments) {
    if (!invoice || typeof invoice !== 'string') return false;

    // Basic Lightning invoice validation (starts with lnbc and contains alphanumeric)
    const invoiceRegex = /^lnbc[a-z0-9]+$/i;
    return invoiceRegex.test(invoice);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Must be a valid Lightning invoice';
  }
}

export function IsLightningInvoice(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsLightningInvoiceConstraint,
    });
  };
}

/**
 * Validator for Bitcoin addresses
 */
@ValidatorConstraint({ name: 'isBitcoinAddress', async: false })
export class IsBitcoinAddressConstraint implements ValidatorConstraintInterface {
  validate(address: string, args: ValidationArguments) {
    if (!address || typeof address !== 'string') return false;

    // Basic Bitcoin address validation
    // P2PKH (Legacy): starts with 1
    // P2SH (SegWit compatible): starts with 3
    // Bech32 (Native SegWit): starts with bc1
    const btcRegex =
      /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})$/;
    return btcRegex.test(address);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Must be a valid Bitcoin address';
  }
}

export function IsBitcoinAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsBitcoinAddressConstraint,
    });
  };
}

/**
 * Validator for positive amounts with precision
 */
@ValidatorConstraint({ name: 'isValidAmount', async: false })
export class IsValidAmountConstraint implements ValidatorConstraintInterface {
  validate(amount: number, args: ValidationArguments) {
    if (typeof amount !== 'number') return false;

    const [minAmount = 0.01, maxAmount = 1000, maxDecimals = 2] = args.constraints;

    // Check range
    if (amount < minAmount || amount > maxAmount) return false;

    // Check decimal places
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > maxDecimals) return false;

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const [minAmount = 0.01, maxAmount = 1000] = args.constraints;
    return `Amount must be between $${minAmount} and $${maxAmount} with maximum 2 decimal places`;
  }
}

export function IsValidAmount(
  minAmount: number = 0.01,
  maxAmount: number = 1000,
  maxDecimals: number = 2,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [minAmount, maxAmount, maxDecimals],
      validator: IsValidAmountConstraint,
    });
  };
}

/**
 * Validator for memo/description fields
 */
@ValidatorConstraint({ name: 'isSanitizedText', async: false })
export class IsSanitizedTextConstraint implements ValidatorConstraintInterface {
  validate(text: string, args: ValidationArguments) {
    if (!text || typeof text !== 'string') return true; // Optional fields

    // Check for potential XSS or injection patterns
    const dangerousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img[^>]*onerror=/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Text contains potentially unsafe content';
  }
}

export function IsSanitizedText(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSanitizedTextConstraint,
    });
  };
}
