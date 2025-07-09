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
  if (remainder >= 20) {
    const tensDigit = Math.floor(remainder / 10);
    const onesDigit = remainder % 10;
    result.push(tens[tensDigit]);
    if (onesDigit > 0) {
      result.push(ones[onesDigit]);
    }
  } else if (remainder >= 10) {
    result.push(teens[remainder - 10]);
  } else if (remainder > 0) {
    result.push(ones[remainder]);
  }

  return result.join(' ');
}

/**
 * Convert a whole number to words
 */
function convertWholeNumber(num: number): string {
  if (num === 0) {
    return 'zero';
  }

  const groups: string[] = [];
  let groupIndex = 0;

  while (num > 0) {
    const group = num % 1000;
    if (group > 0) {
      const groupWords = convertHundreds(group);
      if (thousands[groupIndex]) {
        groups.unshift(`${groupWords} ${thousands[groupIndex]}`);
      } else {
        groups.unshift(groupWords);
      }
    }
    num = Math.floor(num / 1000);
    groupIndex++;
  }

  return groups.join(' ');
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

    if (cents === 1) {
      result += 'one cent';
    } else if (cents < 10) {
      result += `${ones[cents]} cents`;
    } else if (cents < 20) {
      result += `${teens[cents - 10]} cents`;
    } else {
      const tensDigit = Math.floor(cents / 10);
      const onesDigit = cents % 10;
      result += tens[tensDigit];
      if (onesDigit > 0) {
        result += ` ${ones[onesDigit]}`;
      }
      result += ' cents';
    }
  }

  return result.trim();
}

/**
 * Convert any numeric values in text to words for better speech
 * @param text - Text containing numbers
 * @returns Text with numbers converted to words
 */
export function convertNumbersInText(text: string): string {
  let converted = text;

  // Convert currency amounts (e.g., "10.50 dollars", "$10.50", "10 USD")
  converted = converted.replace(/\$(\d+(?:\.\d{1,2})?)\b/g, (match, amount) => {
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
