// Invoice validation constants and functions
export const MEMO_MAX_LENGTH = 200; // Conservative limit to avoid backend errors
export const MEMO_MIN_LENGTH = 0;
export const AMOUNT_MIN_USD = 0.01; // Minimum 1 cent
export const AMOUNT_MAX_USD = 10000; // Maximum $10,000

export enum InvoiceValidationError {
  MEMO_TOO_LONG = 'MEMO_TOO_LONG',
  AMOUNT_TOO_SMALL = 'AMOUNT_TOO_SMALL',
  AMOUNT_TOO_LARGE = 'AMOUNT_TOO_LARGE',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
}

/**
 * Validate invoice memo
 */
export function validateMemo(memo?: string): InvoiceValidationError | null {
  if (!memo) {
    return null;
  }

  if (memo.length > MEMO_MAX_LENGTH) {
    return InvoiceValidationError.MEMO_TOO_LONG;
  }

  return null;
}

/**
 * Validate invoice amount
 */
export function validateAmount(amount?: number): InvoiceValidationError | null {
  if (!amount) {
    // No amount is valid (open invoice)
    return null;
  }

  if (isNaN(amount) || !isFinite(amount)) {
    return InvoiceValidationError.INVALID_AMOUNT;
  }

  if (amount < AMOUNT_MIN_USD) {
    return InvoiceValidationError.AMOUNT_TOO_SMALL;
  }

  if (amount > AMOUNT_MAX_USD) {
    return InvoiceValidationError.AMOUNT_TOO_LARGE;
  }

  return null;
}

/**
 * Get user-friendly error message for validation errors
 */
export function getInvoiceValidationErrorMessage(error: InvoiceValidationError): string {
  switch (error) {
    case InvoiceValidationError.MEMO_TOO_LONG:
      return `Memo is too long. Maximum length is ${MEMO_MAX_LENGTH} characters.`;
    case InvoiceValidationError.AMOUNT_TOO_SMALL:
      return `Amount too small. Minimum amount is $${AMOUNT_MIN_USD.toFixed(2)}.`;
    case InvoiceValidationError.AMOUNT_TOO_LARGE:
      return `Amount too large. Maximum amount is $${AMOUNT_MAX_USD.toLocaleString()}.`;
    case InvoiceValidationError.INVALID_AMOUNT:
      return 'Invalid amount. Please enter a valid number.';
  }
}

/**
 * Sanitize memo by removing potentially problematic characters
 */
export function sanitizeMemo(memo: string): string {
  // Remove control characters and trim whitespace
  return memo
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .substring(0, MEMO_MAX_LENGTH); // Ensure max length
}

/**
 * Parse and validate amount from string
 */
export function parseAndValidateAmount(amountStr: string): { amount?: number; error?: string } {
  // Remove all non-numeric characters except decimal point
  const cleanAmount = amountStr.replace(/[^0-9.]/g, '');
  
  // Check for multiple decimal points
  const decimalCount = (cleanAmount.match(/\./g) || []).length;
  if (decimalCount > 1) {
    return { error: 'Invalid amount format. Please use only one decimal point.' };
  }
  
  // Check for too many decimal places (more than 2 for USD)
  const parts = cleanAmount.split('.');
  if (parts[1] && parts[1].length > 2) {
    return { error: 'Too many decimal places. USD amounts support up to 2 decimal places.' };
  }
  
  const amount = parseFloat(cleanAmount);
  
  if (isNaN(amount) || !isFinite(amount)) {
    return { error: 'Invalid amount. Please enter a valid number.' };
  }
  
  // Round to 2 decimal places for USD
  const roundedAmount = Math.round(amount * 100) / 100;
  
  return { amount: roundedAmount };
}