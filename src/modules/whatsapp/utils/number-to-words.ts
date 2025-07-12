/**
 * Convert numbers to words for natural speech
 * Specifically designed for currency amounts
 */

const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const teens = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const thousands = ['', 'thousand', 'million', 'billion', 'trillion'];

/**
 * Convert a number less than 1000 to words
 */
function convertHundreds(num: number): string {
  const result: string[] = [];

  // Handle hundreds
  const hundreds = Math.floor(num / 100);
  if (hundreds > 0) {
    result.push(ones[hundreds], 'hundred');
  }

  // Handle tens and ones
  const remainder = num % 100;
  if (remainder > 0) {
    // Add "and" after hundreds when there's a remainder
    if (hundreds > 0) {
      result.push('and');
    }

    if (remainder >= 20) {
      const tensDigit = Math.floor(remainder / 10);
      const onesDigit = remainder % 10;
      if (onesDigit > 0) {
        result.push(tens[tensDigit] + '-' + ones[onesDigit]);
      } else {
        result.push(tens[tensDigit]);
      }
    } else if (remainder >= 10) {
      result.push(teens[remainder - 10]);
    } else {
      result.push(ones[remainder]);
    }
  }

  return result.join(' ');
}

/**
 * Convert a whole number to words with proper formatting
 */
function convertWholeNumber(num: number): string {
  if (num === 0) {
    return 'zero';
  }

  const groups: { value: string; scale: string }[] = [];
  let groupIndex = 0;

  while (num > 0) {
    const group = num % 1000;
    if (group > 0) {
      const groupWords = convertHundreds(group);
      groups.unshift({
        value: groupWords,
        scale: thousands[groupIndex],
      });
    }
    num = Math.floor(num / 1000);
    groupIndex++;
  }

  // Reconstruct with proper commas and "and"
  let result = '';
  for (let i = 0; i < groups.length; i++) {
    if (i > 0) {
      result += ', ';
    }

    result += groups[i].value;
    if (groups[i].scale) {
      result += ' ' + groups[i].scale;
    }
  }

  return result;
}

/**
 * Convert currency amount to natural speech
 * @param amount - The numeric amount (e.g., 10.50)
 * @param currency - The currency name (default: 'dollars')
 * @returns Natural speech version of the amount
 */
export function convertCurrencyToWords(
  amount: number | string,
  currency: string = 'dollars',
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return `${amount} ${currency}`;
  }

  // Handle negative amounts
  const isNegative = numAmount < 0;
  const absAmount = Math.abs(numAmount);

  // Split into dollars and cents
  const wholeDollars = Math.floor(absAmount);
  const cents = Math.round((absAmount - wholeDollars) * 100);

  let result = '';

  // Add negative prefix if needed
  if (isNegative) {
    result += 'negative ';
  }

  // Convert whole dollars
  if (wholeDollars === 0 && cents === 0) {
    return `zero ${currency}`;
  }

  if (wholeDollars > 0) {
    result += convertWholeNumber(wholeDollars);
    // Handle singular vs plural
    if (currency === 'dollars' || currency === 'dollar') {
      result += wholeDollars === 1 ? ' dollar' : ' dollars';
    } else {
      result += ` ${currency}`;
    }
  }

  // Add cents if present
  if (cents > 0) {
    if (wholeDollars > 0) {
      result += ' and ';
    }

    // Convert cents to words
    if (cents === 1) {
      result += 'one cent';
    } else {
      // Convert cents number to words
      const centsWords = convertCentsToWords(cents);
      result += centsWords + (cents === 1 ? ' cent' : ' cents');
    }
  }

  return result.trim();
}

/**
 * Convert cents (0-99) to words
 */
function convertCentsToWords(cents: number): string {
  if (cents < 10) {
    return ones[cents];
  } else if (cents < 20) {
    return teens[cents - 10];
  } else {
    const tensDigit = Math.floor(cents / 10);
    const onesDigit = cents % 10;
    let result = tens[tensDigit];
    if (onesDigit > 0) {
      result += '-' + ones[onesDigit]; // Use hyphen for compound numbers
    }
    return result;
  }
}

/**
 * Format currency with commas for display
 */
export function formatCurrencyWithCommas(amount: number | string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) {
    return amount.toString();
  }

  // Format with commas and 2 decimal places
  return '$' + numAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Convert any numeric values in text to words for better speech
 * @param text - Text containing numbers
 * @returns Text with numbers converted to words
 */
export function convertNumbersInText(text: string): string {
  let converted = text;

  // Convert currency amounts with proper formatting
  // Match $X,XXX.XX or $X.XX patterns
  converted = converted.replace(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g, (match, amount) => {
    // Remove commas before converting
    const cleanAmount = amount.replace(/,/g, '');
    return convertCurrencyToWords(cleanAmount, 'dollars');
  });

  // Also match simple $XX patterns without decimals
  converted = converted.replace(/\$(\d+)\b/g, (match, amount) => {
    return convertCurrencyToWords(amount, 'dollars');
  });

  converted = converted.replace(
    /\b(\d+(?:\.\d{1,2})?)\s*(dollars?|USD)\b/gi,
    (match, amount, currency) => {
      return convertCurrencyToWords(amount, 'dollars');
    },
  );

  // Convert percentages BEFORE converting general numbers
  converted = converted.replace(/\b(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
    const number = parseFloat(num);
    if (number === Math.floor(number)) {
      return `${convertWholeNumber(number)} percent`;
    }
    return match; // Keep decimal percentages as-is for now
  });

  // Convert simple whole numbers in common contexts
  converted = converted.replace(
    /\b(\d+)\s+(transactions?|payments?|messages?|items?|times?)\b/gi,
    (match, num, unit) => {
      const number = parseInt(num);
      if (number < 100) {
        // Only convert smaller numbers to avoid awkward long number words
        return `${convertWholeNumber(number)} ${unit}`;
      }
      return match;
    },
  );

  // Convert standalone decimal numbers that might be currency (after other conversions)
  converted = converted.replace(/\b(\d+\.\d{2})\b/g, (match, amount) => {
    // Check if it's not already part of a converted phrase
    if (!converted.includes(match + ' dollars') && !converted.includes(match + ' percent')) {
      return convertCurrencyToWords(amount, 'dollars');
    }
    return match;
  });

  return converted;
}
