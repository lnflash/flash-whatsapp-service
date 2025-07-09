import { convertCurrencyToWords, convertNumbersInText } from './number-to-words';

describe('Number to Words Conversion', () => {
  describe('convertCurrencyToWords', () => {
    it('should convert simple dollar amounts', () => {
      expect(convertCurrencyToWords(0)).toBe('zero dollars');
      expect(convertCurrencyToWords(1)).toBe('one dollar');
      expect(convertCurrencyToWords(5)).toBe('five dollars');
      expect(convertCurrencyToWords(10)).toBe('ten dollars');
      expect(convertCurrencyToWords(25)).toBe('twenty five dollars');
      expect(convertCurrencyToWords(100)).toBe('one hundred dollars');
      expect(convertCurrencyToWords(1000)).toBe('one thousand dollars');
    });

    it('should convert amounts with cents', () => {
      expect(convertCurrencyToWords(0.01)).toBe('one cent');
      expect(convertCurrencyToWords(0.05)).toBe('five cents');
      expect(convertCurrencyToWords(0.10)).toBe('ten cents');
      expect(convertCurrencyToWords(0.25)).toBe('twenty five cents');
      expect(convertCurrencyToWords(0.99)).toBe('ninety nine cents');
      expect(convertCurrencyToWords(1.01)).toBe('one dollar and one cent');
      expect(convertCurrencyToWords(5.50)).toBe('five dollars and fifty cents');
      expect(convertCurrencyToWords(10.05)).toBe('ten dollars and five cents');
      expect(convertCurrencyToWords(25.99)).toBe('twenty five dollars and ninety nine cents');
    });

    it('should handle string inputs', () => {
      expect(convertCurrencyToWords('10.50')).toBe('ten dollars and fifty cents');
      expect(convertCurrencyToWords('100')).toBe('one hundred dollars');
      expect(convertCurrencyToWords('0.50')).toBe('fifty cents');
    });

    it('should handle large amounts', () => {
      expect(convertCurrencyToWords(1234)).toBe('one thousand two hundred thirty four dollars');
      expect(convertCurrencyToWords(10000)).toBe('ten thousand dollars');
      expect(convertCurrencyToWords(100000)).toBe('one hundred thousand dollars');
      expect(convertCurrencyToWords(1000000)).toBe('one million dollars');
    });

    it('should handle negative amounts', () => {
      expect(convertCurrencyToWords(-10)).toBe('negative ten dollars');
      expect(convertCurrencyToWords(-0.50)).toBe('negative fifty cents');
      expect(convertCurrencyToWords(-100.25)).toBe('negative one hundred dollars and twenty five cents');
    });

    it('should handle custom currency', () => {
      expect(convertCurrencyToWords(10, 'euros')).toBe('ten euros');
      expect(convertCurrencyToWords(1, 'euro')).toBe('one euro');
      expect(convertCurrencyToWords(50.50, 'pounds')).toBe('fifty pounds and fifty cents');
    });
  });

  describe('convertNumbersInText', () => {
    it('should convert currency amounts in text', () => {
      expect(convertNumbersInText('Your balance is 10.50 dollars')).toBe(
        'Your balance is ten dollars and fifty cents',
      );
      expect(convertNumbersInText('You have $25.99')).toBe(
        'You have twenty five dollars and ninety nine cents',
      );
      expect(convertNumbersInText('Balance: 100 USD')).toBe('Balance: one hundred dollars');
    });

    it('should convert percentages', () => {
      expect(convertNumbersInText('Increased by 25%')).toBe('Increased by twenty five percent');
      expect(convertNumbersInText('100% complete')).toBe('one hundred percent complete');
    });

    it('should convert counts of items', () => {
      expect(convertNumbersInText('You have 5 transactions')).toBe('You have five transactions');
      expect(convertNumbersInText('Sent 3 payments today')).toBe('Sent three payments today');
      expect(convertNumbersInText('10 messages received')).toBe('ten messages received');
    });

    it('should not convert large numbers in item counts', () => {
      expect(convertNumbersInText('You have 150 transactions')).toBe('You have 150 transactions');
      expect(convertNumbersInText('1000 items found')).toBe('1000 items found');
    });

    it('should handle mixed content', () => {
      expect(convertNumbersInText('Send $10.50 to receive 25% bonus')).toBe(
        'Send ten dollars and fifty cents to receive twenty five percent bonus',
      );
    });
  });
});