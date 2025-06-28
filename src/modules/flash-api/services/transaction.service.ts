import { Injectable, Logger } from '@nestjs/common';
import { FlashApiService } from '../flash-api.service';
import { TRANSACTION_LIST_QUERY, REALTIME_PRICE_QUERY } from '../graphql/queries';

export interface Transaction {
  id: string;
  status: string;
  direction: string;
  memo?: string;
  createdAt: string;
  settlementAmount: number;
  settlementFee: number;
  settlementCurrency: string;
  settlementDisplayAmount?: string;
  settlementDisplayCurrency?: string;
  settlementPrice?: {
    base: number;
    offset: number;
    currencyUnit: string;
    formattedAmount: string;
  };
  initiationVia: any;
  settlementVia: any;
}

export interface TransactionEdge {
  cursor: string;
  node: Transaction;
}

export interface TransactionConnection {
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
  edges: TransactionEdge[];
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly flashApiService: FlashApiService) {}

  /**
   * Get recent transactions for the user
   */
  async getRecentTransactions(
    authToken: string,
    limit: number = 10,
  ): Promise<TransactionConnection | null> {
    try {
      const result = await this.flashApiService.executeQuery<any>(
        TRANSACTION_LIST_QUERY,
        { first: limit },
        authToken,
      );

      if (result?.data?.me?.defaultAccount?.transactions) {
        return result.data.me.defaultAccount.transactions;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error fetching transactions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get real-time price for currency conversion
   */
  async getRealtimePrice(authToken: string): Promise<any> {
    try {
      const result = await this.flashApiService.executeQuery<any>(
        REALTIME_PRICE_QUERY,
        {},
        authToken,
      );

      if (result?.data?.me?.defaultAccount?.realtimePrice) {
        return result.data.me.defaultAccount.realtimePrice;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error fetching realtime price: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Format transaction for WhatsApp display
   */
  formatTransaction(tx: Transaction, displayCurrency?: string): string {
    const direction = tx.direction === 'SEND' ? '📤 Sent' : '📥 Received';
    const status = tx.status === 'SUCCESS' ? '✅' : tx.status === 'PENDING' ? '⏳' : '❌';
    
    // Format date
    const date = new Date(tx.createdAt);
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Format amounts
    let amountStr = '';
    if (tx.settlementCurrency === 'BTC') {
      const btcAmount = tx.settlementAmount / 100000000; // Convert sats to BTC
      amountStr = `${btcAmount.toFixed(8)} BTC`;
      
      // Add USD equivalent if available
      if (tx.settlementDisplayAmount && tx.settlementDisplayCurrency) {
        amountStr += ` (~${tx.settlementDisplayAmount} ${tx.settlementDisplayCurrency})`;
      }
    } else {
      // USD transaction
      const usdAmount = tx.settlementAmount / 100; // Convert cents to dollars
      amountStr = `$${usdAmount.toFixed(2)} USD`;
      
      // Add BTC equivalent if available
      if (tx.settlementPrice) {
        const btcEquivalent = this.calculateBtcEquivalent(tx.settlementAmount, tx.settlementPrice);
        if (btcEquivalent) {
          amountStr += ` (~${btcEquivalent} BTC)`;
        }
      }
    }

    // Build transaction line
    let txLine = `${status} ${direction} ${amountStr}\n   ${dateStr}`;
    
    // Add memo if present
    if (tx.memo) {
      txLine += `\n   📝 ${tx.memo}`;
    }

    // Add counterparty info if available
    const counterparty = this.getCounterpartyInfo(tx);
    if (counterparty) {
      txLine += `\n   👤 ${counterparty}`;
    }

    return txLine;
  }

  /**
   * Format transaction history for WhatsApp
   */
  formatTransactionHistory(
    transactions: TransactionConnection,
    displayCurrency?: string,
  ): string {
    if (!transactions.edges || transactions.edges.length === 0) {
      return '📊 No transactions found.';
    }

    let message = '📊 *Recent Transactions*\n\n';
    
    // Group by date
    const grouped = this.groupTransactionsByDate(transactions.edges);
    
    for (const [dateGroup, txs] of Object.entries(grouped)) {
      message += `*${dateGroup}*\n`;
      message += '─────────────────\n';
      
      for (const edge of txs) {
        message += this.formatTransaction(edge.node, displayCurrency) + '\n\n';
      }
    }

    // Add navigation hint if there are more transactions
    if (transactions.pageInfo.hasNextPage) {
      message += '\n_Type "history more" to see older transactions_';
    }

    return message;
  }

  /**
   * Group transactions by date
   */
  private groupTransactionsByDate(edges: TransactionEdge[]): Record<string, TransactionEdge[]> {
    const groups: Record<string, TransactionEdge[]> = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const edge of edges) {
      const txDate = new Date(edge.node.createdAt);
      let dateGroup: string;

      if (this.isSameDay(txDate, today)) {
        dateGroup = 'Today';
      } else if (this.isSameDay(txDate, yesterday)) {
        dateGroup = 'Yesterday';
      } else {
        dateGroup = txDate.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric',
          year: txDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
      }

      if (!groups[dateGroup]) {
        groups[dateGroup] = [];
      }
      groups[dateGroup].push(edge);
    }

    return groups;
  }

  /**
   * Check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /**
   * Calculate BTC equivalent from USD amount and price
   */
  private calculateBtcEquivalent(usdCents: number, price: any): string | null {
    if (!price || !price.base || !price.offset) {
      return null;
    }

    try {
      // Convert cents to dollars
      const usdAmount = usdCents / 100;
      
      // Calculate BTC amount using price
      const priceValue = price.base / Math.pow(10, price.offset);
      const btcAmount = usdAmount / priceValue;
      
      // Format based on amount size
      if (btcAmount < 0.00001) {
        const sats = Math.round(btcAmount * 100000000);
        return `${sats} sats`;
      } else {
        return `${btcAmount.toFixed(8)} BTC`;
      }
    } catch (error) {
      this.logger.error('Error calculating BTC equivalent:', error);
      return null;
    }
  }

  /**
   * Get counterparty information from transaction
   */
  private getCounterpartyInfo(tx: Transaction): string | null {
    // Check initiation via
    if (tx.initiationVia) {
      if (tx.initiationVia.counterPartyUsername) {
        return `@${tx.initiationVia.counterPartyUsername}`;
      }
      if (tx.initiationVia.address) {
        // Shorten on-chain address
        const addr = tx.initiationVia.address;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      }
    }

    // Check settlement via
    if (tx.settlementVia) {
      if (tx.settlementVia.counterPartyUsername) {
        return `@${tx.settlementVia.counterPartyUsername}`;
      }
      if (tx.settlementVia.transactionHash) {
        // Shorten tx hash
        const hash = tx.settlementVia.transactionHash;
        return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
      }
    }

    return null;
  }
}