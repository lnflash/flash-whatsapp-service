import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
    const greeting = data.userName ? `Hi ${data.userName}! ` : '';
    const btcFormatted = this.formatBitcoinAmount(data.btcBalance);
    const fiatFormatted = this.formatFiatAmount(data.fiatBalance, data.fiatCurrency);
    const lastUpdated = this.formatDateTime(data.lastUpdated);
    
    return `${greeting}*Your Flash Balance*\n\n` +
           `• ${btcFormatted} BTC\n` +
           `• ${fiatFormatted}\n\n` +
           `Last updated: ${lastUpdated}\n\n` +
           `Need to add funds or make a payment? Visit ${this.appUrl}/wallet`;
  }

  /**
   * Generate a balance update notification
   */
  generateBalanceUpdateNotification(data: BalanceTemplateData, changeAmount: number, txType: 'received' | 'sent'): string {
    const btcFormatted = this.formatBitcoinAmount(Math.abs(changeAmount));
    const isReceived = txType === 'received';
    
    const transactionVerb = isReceived ? 'received' : 'sent';
    const emoji = isReceived ? '🔵' : '🟠';
    
    return `${emoji} *Flash ${txType.charAt(0).toUpperCase() + txType.slice(1)} Transaction*\n\n` +
           `You have ${transactionVerb} *${btcFormatted} BTC*\n\n` +
           `Your new balance is:\n` +
           `• ${this.formatBitcoinAmount(data.btcBalance)} BTC\n` + 
           `• ${this.formatFiatAmount(data.fiatBalance, data.fiatCurrency)}\n\n` +
           `View transaction details at ${this.appUrl}/transactions`;
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
      'JMD': (n) => `JMD $${n.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      'USD': (n) => `USD $${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      // Add more currencies as needed
    };
    
    const formatter = currencyFormatters[currency] || ((n) => `${currency} ${n.toLocaleString()}`);
    return formatter(amount);
  }

  /**
   * Format date time for display
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}