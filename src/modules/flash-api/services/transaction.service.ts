import { Injectable, Logger } from '@nestjs/common';
import { FlashApiService } from '../flash-api.service';
import { TRANSACTION_LIST_QUERY, REALTIME_PRICE_QUERY } from '../graphql/queries';

export interface Transaction {
  id: string;
  status: string;
  direction: string;
  memo?: string;
  createdAt: string; // Unix timestamp in seconds
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
   * Get transaction by payment hash
   */
  async getTransactionByPaymentHash(paymentHash: string, authToken: string): Promise<any> {
    try {
      // Fetch recent transactions (50 should be enough to find recent payments)
      const result = await this.flashApiService.executeQuery<any>(
        TRANSACTION_LIST_QUERY,
        { first: 50 },
        authToken,
      );

      if (!result?.me?.defaultAccount?.transactions?.edges) {
        this.logger.warn('No transactions found');
        return null;
      }

      // Find transaction with matching payment hash
      const transactionEdge = result.me.defaultAccount.transactions.edges.find((edge: any) => {
        const tx = edge.node;
        // Check if this is a Lightning transaction with matching payment hash
        return tx.initiationVia?.paymentHash === paymentHash;
      });

      if (!transactionEdge) {
        this.logger.warn(`Transaction not found for payment hash`);
        return null;
      }

      const transaction = transactionEdge.node;

      // Transform to expected format for notification service
      return {
        id: transaction.id,
        status: transaction.status,
        direction: transaction.direction,
        amount: transaction.settlementAmount, // Amount in sats
        memo: transaction.memo,
        createdAt: transaction.createdAt,
        userId: result.me.id,
        senderUsername: transaction.initiationVia?.counterPartyUsername,
      };
    } catch (error) {
      this.logger.error(`Error fetching transaction by payment hash: ${error.message}`);
      throw error;
    }
  }

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

      if (result?.me?.defaultAccount?.transactions) {
        return result.me.defaultAccount.transactions;
      }

      this.logger.warn('No transactions found in response');
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
  formatTransaction(tx: Transaction, _displayCurrency?: string): string {
    const direction = tx.direction === 'SEND' ? '📤 Sent' : '📥 Received';
    const status = tx.status === 'SUCCESS' ? '✅' : tx.status === 'PENDING' ? '⏳' : '❌';

    // Format date - createdAt is in seconds, convert to milliseconds
    const date = new Date(parseInt(tx.createdAt) * 1000);
    const dateStr = date.toLocaleString('en-US', {
      timeZone: 'America/Jamaica',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' EST';

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
      // USD transaction - amount is already in dollars
      const usdAmount = parseFloat(tx.settlementAmount.toString());
      amountStr = `$${usdAmount.toFixed(2)} USD`;

      // Add BTC equivalent if available
      if (tx.settlementPrice) {
        const btcEquivalent = this.calculateBtcEquivalent(usdAmount * 100, tx.settlementPrice);
        if (btcEquivalent) {
          amountStr += ` (~${btcEquivalent})`;
        }
      }
    }

    // Extract short transaction ID (last 8 chars)
    const shortTxId = tx.id.slice(-8);

    // Build transaction line
    let txLine = `${status} ${direction} ${amountStr}\n   ${dateStr} • #${shortTxId}`;

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
  formatTransactionHistory(transactions: TransactionConnection, displayCurrency?: string): string {
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
    
    // Get current timestamp and create dates for comparison
    const now = new Date();
    
    // Create dates at midnight in Jamaica timezone for today and yesterday
    const todayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Jamaica',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    
    const todayParts = todayFormatter.formatToParts(now);
    const todayYear = parseInt(todayParts.find(p => p.type === 'year')?.value || '0');
    const todayMonth = parseInt(todayParts.find(p => p.type === 'month')?.value || '0') - 1; // 0-based
    const todayDay = parseInt(todayParts.find(p => p.type === 'day')?.value || '0');

    for (const edge of edges) {
      const txDate = new Date(parseInt(edge.node.createdAt) * 1000);
      
      // Get transaction date parts in Jamaica timezone
      const txParts = todayFormatter.formatToParts(txDate);
      const txYear = parseInt(txParts.find(p => p.type === 'year')?.value || '0');
      const txMonth = parseInt(txParts.find(p => p.type === 'month')?.value || '0') - 1; // 0-based
      const txDay = parseInt(txParts.find(p => p.type === 'day')?.value || '0');
      
      let dateGroup: string;

      // Compare dates using year, month, day components
      if (txYear === todayYear && txMonth === todayMonth && txDay === todayDay) {
        dateGroup = 'Today';
      } else if (txYear === todayYear && txMonth === todayMonth && txDay === todayDay - 1) {
        dateGroup = 'Yesterday';
      } else {
        dateGroup = txDate.toLocaleDateString('en-US', {
          timeZone: 'America/Jamaica',
          month: 'long',
          day: 'numeric',
          year: txYear !== todayYear ? 'numeric' : undefined,
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
   * Format detailed transaction information
   */
  async formatDetailedTransaction(tx: Transaction, authToken: string): Promise<string> {
    const direction = tx.direction === 'SEND' ? '📤 SENT' : '📥 RECEIVED';
    const status = tx.status === 'SUCCESS' ? '✅ Confirmed' : tx.status === 'PENDING' ? '⏳ Pending' : '❌ Failed';
    
    // Format date with full details
    const date = new Date(parseInt(tx.createdAt) * 1000);
    const fullDate = date.toLocaleString('en-US', {
      timeZone: 'America/Jamaica',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }) + ' EST';

    // Format amounts with more detail
    let primaryAmount = '';
    let secondaryAmount = '';
    let fee = '';
    
    if (tx.settlementCurrency === 'BTC') {
      const btcAmount = tx.settlementAmount / 100000000;
      const satsAmount = tx.settlementAmount;
      primaryAmount = `${btcAmount.toFixed(8)} BTC`;
      primaryAmount += `\n💎 ${satsAmount.toLocaleString()} sats`;
      
      if (tx.settlementDisplayAmount && tx.settlementDisplayCurrency) {
        secondaryAmount = `\n💵 ${tx.settlementDisplayAmount} ${tx.settlementDisplayCurrency}`;
      }
    } else {
      const usdAmount = parseFloat(tx.settlementAmount.toString());
      primaryAmount = `$${usdAmount.toFixed(2)} USD`;
      
      if (tx.settlementPrice) {
        const btcEquivalent = this.calculateBtcEquivalent(usdAmount * 100, tx.settlementPrice);
        if (btcEquivalent) {
          secondaryAmount = `\n₿ ${btcEquivalent}`;
        }
      }
    }

    // Format fee if present
    if (tx.settlementFee && tx.settlementFee > 0) {
      if (tx.settlementCurrency === 'BTC') {
        const feeSats = tx.settlementFee;
        fee = `\n⚡ Fee: ${feeSats} sats`;
      } else {
        const feeAmount = parseFloat(tx.settlementFee.toString());
        fee = `\n⚡ Fee: $${feeAmount.toFixed(2)}`;
      }
    }

    // Build detailed message
    let message = `📄 *Transaction Details*\n\n`;
    message += `${direction}\n`;
    message += `━━━━━━━━━━━━━━━━\n\n`;
    
    message += `💰 *Amount:*\n${primaryAmount}${secondaryAmount}${fee}\n\n`;
    message += `📅 *Date:*\n${fullDate}\n\n`;
    message += `🔖 *Status:* ${status}\n\n`;
    message += `🆔 *Transaction ID:*\n#${tx.id}\n\n`;

    // Add memo if present
    if (tx.memo) {
      message += `📝 *Memo:*\n"${tx.memo}"\n\n`;
    }

    // Add counterparty info
    const counterparty = this.getCounterpartyInfo(tx);
    if (counterparty) {
      message += `👤 *${tx.direction === 'SEND' ? 'Sent to' : 'Received from'}:*\n${counterparty}\n\n`;
    }

    // Add payment method info
    if (tx.settlementVia) {
      const paymentMethod = this.getPaymentMethodInfo(tx.settlementVia);
      if (paymentMethod) {
        message += `💳 *Payment Method:*\n${paymentMethod}\n\n`;
      }
    }

    // Add current BTC price if available
    if (tx.settlementPrice && tx.settlementPrice.formattedAmount) {
      message += `📈 *BTC Price at Time:*\n${tx.settlementPrice.formattedAmount}\n\n`;
    }

    message += `💡 Type "history" to see all transactions`;

    return message;
  }

  /**
   * Format transaction for voice output
   */
  formatTransactionForVoice(tx: Transaction): string {
    const direction = tx.direction === 'SEND' ? 'sent' : 'received';
    const date = new Date(parseInt(tx.createdAt) * 1000);
    const dateStr = date.toLocaleDateString('en-US', {
      timeZone: 'America/Jamaica',
      month: 'long',
      day: 'numeric',
    });
    
    let amount = '';
    if (tx.settlementCurrency === 'BTC') {
      const sats = tx.settlementAmount;
      amount = `${sats.toLocaleString()} sats`;
      if (tx.settlementDisplayAmount) {
        amount += ` or about ${tx.settlementDisplayAmount} ${tx.settlementDisplayCurrency}`;
      }
    } else {
      const usd = parseFloat(tx.settlementAmount.toString());
      amount = `${usd.toFixed(2)} dollars`;
    }

    let message = `You ${direction} ${amount} on ${dateStr}`;
    
    if (tx.memo) {
      message += `. The memo says: ${tx.memo}`;
    }

    const counterparty = this.getCounterpartyInfo(tx);
    if (counterparty) {
      const preposition = tx.direction === 'SEND' ? 'to' : 'from';
      message += `. This was ${preposition} ${counterparty}`;
    }

    message += `. The transaction ID ends with ${tx.id.slice(-4)}.`;

    return message;
  }

  /**
   * Get payment method information
   */
  private getPaymentMethodInfo(settlementVia: any): string | null {
    if (!settlementVia) return null;

    if (settlementVia.__typename === 'SettlementViaLn') {
      return '⚡ Lightning Network';
    } else if (settlementVia.__typename === 'SettlementViaIntraLedger') {
      return '🏦 Flash Internal Transfer';
    } else if (settlementVia.__typename === 'SettlementViaOnChain') {
      return '⛓️ On-chain Bitcoin';
    }

    return null;
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
