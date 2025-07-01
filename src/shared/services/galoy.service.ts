import { Injectable } from '@nestjs/common';
import { FlashApiService } from '../../modules/flash-api/flash-api.service';

/**
 * Legacy service wrapper for backward compatibility
 * Delegates all calls to FlashApiService
 */
@Injectable()
export class GaloyService {
  constructor(private readonly flashApiService: FlashApiService) {}

  async executeQuery<T>(
    query: string,
    variables: Record<string, any> = {},
    authToken?: string,
  ): Promise<T> {
    return this.flashApiService.executeQuery<T>(query, variables, authToken);
  }

  async getWallets(authToken: string): Promise<any[]> {
    const query = `
      query GetWallets {
        me {
          defaultAccount {
            wallets {
              id
              walletCurrency
              balance
            }
          }
        }
      }
    `;
    const result = await this.executeQuery<any>(query, {}, authToken);
    return result.me?.defaultAccount?.wallets || [];
  }

  async sendIntraledger(params: any, authToken: string): Promise<any> {
    const mutation = `
      mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
        intraLedgerPaymentSend(input: $input) {
          status
          errors {
            message
          }
        }
      }
    `;
    return this.executeQuery(mutation, { input: params }, authToken);
  }

  async checkUserExists(userId: string, authToken: string): Promise<boolean> {
    // Mock implementation
    return true;
  }

  async getNodeInfo(authToken: string): Promise<any> {
    // Mock implementation
    return { isOnline: true };
  }

  async payInvoice(params: any, authToken: string): Promise<any> {
    const mutation = `
      mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
        lnInvoicePaymentSend(input: $input) {
          status
          errors {
            message
          }
        }
      }
    `;
    return this.executeQuery(mutation, { input: params }, authToken);
  }

  async decodeInvoice(invoice: string, authToken: string): Promise<any> {
    const query = `
      query lnInvoiceDecode($invoice: LnPaymentRequest!) {
        lnInvoiceDecode(invoice: $invoice) {
          amount
          description
          expiresAt
        }
      }
    `;
    return this.executeQuery(query, { invoice }, authToken);
  }

  async sendOnchain(params: any, authToken: string): Promise<any> {
    const mutation = `
      mutation onChainPaymentSend($input: OnChainPaymentSendInput!) {
        onChainPaymentSend(input: $input) {
          status
          errors {
            message
          }
        }
      }
    `;
    return this.executeQuery(mutation, { input: params }, authToken);
  }

  async getOnchainFeeEstimates(authToken: string): Promise<any> {
    // Mock implementation
    return { fast: 20, medium: 10, slow: 5 };
  }

  async getOnchainBalance(authToken: string): Promise<any> {
    // Mock implementation
    return { confirmed: 1000000, unconfirmed: 0 };
  }
}
