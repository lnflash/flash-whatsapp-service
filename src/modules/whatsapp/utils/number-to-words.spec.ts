import { convertCurrencyToWords, formatCurrencyWithCommas, convertNumbersInText } from './number-to-words';

describe('Number to Words Converter', () => {
  describe('convertCurrencyToWords', () => {
    it('should convert simple dollar amounts', () => {
      expect(convertCurrencyToWords('10')).toBe('ten dollars');
      expect(convertCurrencyToWords('1')).toBe('one dollar');
      expect(convertCurrencyToWords('0')).toBe('zero dollars');
    });

    it('should convert amounts with cents', () => {
      expect(convertCurrencyToWords('10.50')).toBe('ten dollars and fifty cents');
      expect(convertCurrencyToWords('1.01')).toBe('one dollar and one cent');
      expect(convertCurrencyToWords('0.99')).toBe('ninety-nine cents');
      expect(convertCurrencyToWords('0.01')).toBe('one cent');
    });

    it('should convert hundreds with proper "and"', () => {
      expect(convertCurrencyToWords('100')).toBe('one hundred dollars');
      expect(convertCurrencyToWords('101')).toBe('one hundred and one dollars');
      expect(convertCurrencyToWords('120')).toBe('one hundred and twenty dollars');
      expect(convertCurrencyToWords('999')).toBe('nine hundred and ninety-nine dollars');
    });

    it('should convert thousands with commas', () => {
      expect(convertCurrencyToWords('1000')).toBe('one thousand dollars');
      expect(convertCurrencyToWords('1001')).toBe('one thousand, one dollars');
      expect(convertCurrencyToWords('1100')).toBe('one thousand, one hundred dollars');
      expect(convertCurrencyToWords('1234')).toBe('one thousand, two hundred and thirty-four dollars');
    });

    it('should convert the example amounts correctly', () => {
      expect(convertCurrencyToWords('110920.77')).toBe(
        'one hundred and ten thousand, nine hundred and twenty dollars and seventy-seven cents'
      );
      expect(convertCurrencyToWords('2485045.01')).toBe(
        'two million, four hundred and eighty-five thousand, forty-five dollars and one cent'
      );
    });

    it('should handle large amounts', () => {
      expect(convertCurrencyToWords('1000000')).toBe('one million dollars');
      expect(convertCurrencyToWords('1000000000')).toBe('one billion dollars');
      expect(convertCurrencyToWords('1234567890.12')).toBe(
        'one billion, two hundred and thirty-four million, five hundred and sixty-seven thousand, eight hundred and ninety dollars and twelve cents'
      );
    });

    it('should handle negative amounts', () => {
      expect(convertCurrencyToWords('-10')).toBe('negative ten dollars');
      expect(convertCurrencyToWords('-100.50')).toBe('negative one hundred dollars and fifty cents');
    });

    it('should handle teen amounts', () => {
      expect(convertCurrencyToWords('11')).toBe('eleven dollars');
      expect(convertCurrencyToWords('15')).toBe('fifteen dollars');
      expect(convertCurrencyToWords('19')).toBe('nineteen dollars');
    });

    it('should handle hyphenated tens in cents', () => {
      expect(convertCurrencyToWords('0.21')).toBe('twenty-one cents');
      expect(convertCurrencyToWords('0.99')).toBe('ninety-nine cents');
      expect(convertCurrencyToWords('10.45')).toBe('ten dollars and forty-five cents');
    });
  });

  describe('formatCurrencyWithCommas', () => {
    it('should format currency with commas', () => {
      expect(formatCurrencyWithCommas('1000')).toBe('$1,000.00');
      expect(formatCurrencyWithCommas('110920.77')).toBe('$110,920.77');
      expect(formatCurrencyWithCommas('2485045.01')).toBe('$2,485,045.01');
      expect(formatCurrencyWithCommas('10')).toBe('$10.00');
    });
  });

  describe('convertNumbersInText', () => {
    it('should convert currency in text', () => {
      expect(convertNumbersInText('Your balance is $110,920.77')).toBe(
        'Your balance is one hundred and ten thousand, nine hundred and twenty dollars and seventy-seven cents'
      );
      expect(convertNumbersInText('You received $10.50 from Alice')).toBe(
        'You received ten dollars and fifty cents from Alice'
      );
    });

    it('should handle multiple currency amounts', () => {
      expect(convertNumbersInText('Send $10 to get $5 back')).toBe(
        'Send ten dollars to get five dollars back'
      );
    });

    it('should convert percentages', () => {
      expect(convertNumbersInText('10% discount')).toBe('ten percent discount');
      expect(convertNumbersInText('25% off')).toBe('twenty-five percent off');
    });

    it('should convert numbers with units', () => {
      expect(convertNumbersInText('You have 5 transactions')).toBe('You have five transactions');
      expect(convertNumbersInText('Sent 3 payments')).toBe('Sent three payments');
    });
  });
});