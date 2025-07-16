import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { convertCurrencyToWords } from '../utils/number-to-words';
import { ResponseLengthUtil } from '../utils/response-length.util';

export interface BalanceTemplateData {
  btcBalance: number;
  fiatBalance: number;
  fiatCurrency: string;
  lastUpdated: Date;
  userName?: string;
}

@Injectable()
export class BalanceTemplate {
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appUrl = this.configService.get<string>('app_url') || 'https://flashapp.me';
  }

  /**
   * Generate a rich message template for balance information
   */
  generateBalanceMessage(data: BalanceTemplateData): string {
    const fiatFormatted = this.formatFiatAmount(data.fiatBalance, data.fiatCurrency);

    // Use concise format
    let tip = '';
    if (data.fiatBalance === 0) {
      tip = '\n💡 Type "receive" to add funds';
    } else if (data.fiatBalance < 5) {
      tip = '\n💡 Low balance';
    }

    return ResponseLengthUtil.getConciseResponse('balance', {
      fiatFormatted,
      tip,
    });
  }

  /**
   * Generate a balance update notification
   */
  generateBalanceUpdateNotification(
    data: BalanceTemplateData,
    changeAmount: number,
    txType: 'received' | 'sent',
  ): string {
    const isReceived = txType === 'received';
    const emoji = isReceived ? '💸' : '✅';

    // Convert BTC change to approximate fiat for display
    const fiatChangeApprox = changeAmount * (data.fiatBalance / data.btcBalance);
    const amount = Math.abs(fiatChangeApprox).toFixed(2);

    return `${emoji} ${txType === 'received' ? 'Received' : 'Sent'} $${amount}\nBalance: ${this.formatFiatAmount(data.fiatBalance, data.fiatCurrency)}`;
  }

  /**
   * Format Bitcoin amount with appropriate precision
   */
  private formatBitcoinAmount(amount: number): string {
    // For small amounts (under 0.001 BTC), show more decimal places
    if (amount < 0.001) {
      return amount.toFixed(8);
    }

    // For larger amounts, show fewer decimal places
    return amount.toFixed(amount < 0.1 ? 6 : 4);
  }

  /**
   * Format fiat amount with appropriate currency symbol and separators
   */
  private formatFiatAmount(amount: number, currency: string): string {
    const currencyFormatters: Record<string, (n: number) => string> = {
      JMD: (n) =>
        `JMD $${n.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      USD: (n) =>
        `USD $${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      EUR: (n) =>
        `EUR €${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      // Add more currencies as needed
    };

    const formatter =
      currencyFormatters[currency] ||
      ((n) =>
        `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    return formatter(amount);
  }

  /**
   * Generate a voice-friendly balance message
   */
  generateVoiceBalanceMessage(data: BalanceTemplateData): string {
    const amount = data.fiatBalance.toFixed(2);
    const currency = data.fiatCurrency === 'USD' ? 'dollars' : data.fiatCurrency;

    // Convert amount to natural speech
    const amountInWords = convertCurrencyToWords(amount, currency);

    let message = `Your balance is ${amountInWords}.`;

    // Add brief contextual tip
    if (data.fiatBalance === 0) {
      message += ' Say "receive" to add funds.';
    } else if (data.fiatBalance < 5) {
      message += ' Low balance.';
    }

    // Ensure it's within voice duration limit
    return ResponseLengthUtil.shortenResponse(message, true);
  }

  /**
   * Format date time for display
   */
  private formatDateTime(date: Date | string): string {
    // Ensure we have a Date object
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Just now';
    }

    const now = new Date();

    // Format in Jamaica timezone (EST/EDT)
    const jamaicaOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Jamaica',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };

    // Check if it's today in Jamaica timezone
    const jamaicaDateStr = dateObj.toLocaleDateString('en-US', { timeZone: 'America/Jamaica' });
    const nowJamaicaStr = now.toLocaleDateString('en-US', { timeZone: 'America/Jamaica' });
    const isToday = jamaicaDateStr === nowJamaicaStr;

    if (isToday) {
      const timeStr = dateObj.toLocaleTimeString('en-US', jamaicaOptions);
      return `Today at ${timeStr} EST`;
    }

    // For dates other than today
    const fullOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Jamaica',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };

    return `${dateObj.toLocaleString('en-US', fullOptions)} EST`;
  }
}
