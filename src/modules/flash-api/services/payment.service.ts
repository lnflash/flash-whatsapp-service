import { Injectable, Logger } from '@nestjs/common';
import { FlashApiService } from '../flash-api.service';
import {
  LN_INVOICE_PAYMENT_SEND_MUTATION,
  LN_NO_AMOUNT_INVOICE_PAYMENT_SEND_MUTATION,
  LN_NO_AMOUNT_USD_INVOICE_PAYMENT_SEND_MUTATION,
  INTRA_LEDGER_PAYMENT_SEND_MUTATION,
  INTRA_LEDGER_USD_PAYMENT_SEND_MUTATION,
  ON_CHAIN_PAYMENT_SEND_MUTATION,
  ON_CHAIN_PAYMENT_SEND_ALL_MUTATION,
  ON_CHAIN_USD_PAYMENT_SEND_MUTATION,
  ON_CHAIN_USD_PAYMENT_SEND_AS_BTC_DENOMINATED_MUTATION,
  LN_INVOICE_FEE_PROBE_MUTATION,
  LN_NO_AMOUNT_INVOICE_FEE_PROBE_MUTATION,
  LN_NO_AMOUNT_USD_INVOICE_FEE_PROBE_MUTATION,
  LN_USD_INVOICE_FEE_PROBE_MUTATION,
  ON_CHAIN_TX_FEE_QUERY,
  ON_CHAIN_USD_TX_FEE_QUERY,
  ON_CHAIN_USD_TX_FEE_AS_BTC_DENOMINATED_QUERY,
} from '../graphql/mutations';
import { ME_WALLETS_QUERY } from '../graphql/queries';

export enum PaymentSendResult {
  Success = 'SUCCESS',
  Failure = 'FAILURE',
  Pending = 'PENDING',
  AlreadyPaid = 'ALREADY_PAID',
}

export enum WalletCurrency {
  Btc = 'BTC',
  Usd = 'USD',
}

export interface PaymentResponse {
  status?: PaymentSendResult;
  errors?: Array<{ message: string }>;
}

export interface FeeProbeResponse {
  amount?: number;
  errors?: Array<{ message: string }>;
}

export interface LightningPaymentInput {
  walletId: string;
  paymentRequest: string;
  memo?: string;
  amount?: number; // For no-amount invoices
}

export interface IntraLedgerPaymentInput {
  walletId: string;
  recipientWalletId: string;
  amount: number;
  memo?: string;
}

export interface OnChainPaymentInput {
  walletId: string;
  address: string;
  amount?: number; // Optional for send-all
  memo?: string;
  speed?: 'FAST' | 'SLOW';
}

export interface WalletInfo {
  id: string;
  balance: number;
  walletCurrency: WalletCurrency;
}

export interface UserWalletsInfo {
  defaultWalletId: string;
  btcWallet?: WalletInfo;
  usdWallet?: WalletInfo;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly flashApiService: FlashApiService) {}

  /**
   * Get user's wallet information
   */
  async getUserWallets(authToken: string): Promise<UserWalletsInfo> {
    try {
      const result = await this.flashApiService.executeQuery<{
        me: {
          id: string;
          defaultAccount: {
            id: string;
            defaultWalletId: string;
            wallets: WalletInfo[];
          };
        };
      }>(ME_WALLETS_QUERY, {}, authToken);

      const wallets = result.me.defaultAccount.wallets;
      const btcWallet = wallets.find((w) => w.walletCurrency === WalletCurrency.Btc);
      const usdWallet = wallets.find((w) => w.walletCurrency === WalletCurrency.Usd);

      return {
        defaultWalletId: result.me.defaultAccount.defaultWalletId,
        btcWallet,
        usdWallet,
      };
    } catch (error) {
      this.logger.error('Error getting user wallets:', error);
      throw error;
    }
  }

  /**
   * Send a Lightning payment with a fixed amount invoice
   */
  async sendLightningPayment(
    input: LightningPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnInvoicePaymentSend: PaymentResponse;
      }>(
        LN_INVOICE_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            paymentRequest: input.paymentRequest,
            memo: input.memo,
          },
        },
        authToken,
      );

      return result.lnInvoicePaymentSend;
    } catch (error) {
      this.logger.error('Error sending Lightning payment:', error);
      throw error;
    }
  }

  /**
   * Send a Lightning payment with a no-amount invoice (BTC wallet)
   */
  async sendLightningNoAmountPayment(
    input: LightningPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnNoAmountInvoicePaymentSend: PaymentResponse;
      }>(
        LN_NO_AMOUNT_INVOICE_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            paymentRequest: input.paymentRequest,
            amount: input.amount,
            memo: input.memo,
          },
        },
        authToken,
      );

      return result.lnNoAmountInvoicePaymentSend;
    } catch (error) {
      this.logger.error('Error sending Lightning no-amount payment:', error);
      throw error;
    }
  }

  /**
   * Send a Lightning payment with a no-amount invoice (USD wallet)
   */
  async sendLightningNoAmountUsdPayment(
    input: LightningPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnNoAmountUsdInvoicePaymentSend: PaymentResponse;
      }>(
        LN_NO_AMOUNT_USD_INVOICE_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            paymentRequest: input.paymentRequest,
            amount: input.amount,
            memo: input.memo,
          },
        },
        authToken,
      );

      return result.lnNoAmountUsdInvoicePaymentSend;
    } catch (error) {
      this.logger.error('Error sending Lightning no-amount USD payment:', error);
      throw error;
    }
  }

  /**
   * Send an intraledger payment (BTC)
   */
  async sendIntraLedgerPayment(
    input: IntraLedgerPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        intraLedgerPaymentSend: PaymentResponse;
      }>(
        INTRA_LEDGER_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            recipientWalletId: input.recipientWalletId,
            amount: input.amount,
            memo: input.memo,
          },
        },
        authToken,
      );

      return result.intraLedgerPaymentSend;
    } catch (error) {
      this.logger.error('Error sending intraledger payment:', error);
      throw error;
    }
  }

  /**
   * Send an intraledger payment (USD)
   */
  async sendIntraLedgerUsdPayment(
    input: IntraLedgerPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        intraLedgerUsdPaymentSend: PaymentResponse;
      }>(
        INTRA_LEDGER_USD_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            recipientWalletId: input.recipientWalletId,
            amount: input.amount,
            memo: input.memo,
          },
        },
        authToken,
      );

      return result.intraLedgerUsdPaymentSend;
    } catch (error) {
      this.logger.error('Error sending intraledger USD payment:', error);
      throw error;
    }
  }

  /**
   * Send an on-chain payment
   */
  async sendOnChainPayment(
    input: OnChainPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainPaymentSend: PaymentResponse;
      }>(
        ON_CHAIN_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            address: input.address,
            amount: input.amount,
            memo: input.memo,
            speed: input.speed,
          },
        },
        authToken,
      );

      return result.onChainPaymentSend;
    } catch (error) {
      this.logger.error('Error sending on-chain payment:', error);
      throw error;
    }
  }

  /**
   * Send all funds on-chain
   */
  async sendOnChainPaymentAll(
    input: Omit<OnChainPaymentInput, 'amount'>,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainPaymentSendAll: PaymentResponse;
      }>(
        ON_CHAIN_PAYMENT_SEND_ALL_MUTATION,
        {
          input: {
            walletId: input.walletId,
            address: input.address,
            memo: input.memo,
            speed: input.speed,
          },
        },
        authToken,
      );

      return result.onChainPaymentSendAll;
    } catch (error) {
      this.logger.error('Error sending all on-chain:', error);
      throw error;
    }
  }

  /**
   * Send an on-chain payment in USD
   */
  async sendOnChainUsdPayment(
    input: OnChainPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainUsdPaymentSend: PaymentResponse;
      }>(
        ON_CHAIN_USD_PAYMENT_SEND_MUTATION,
        {
          input: {
            walletId: input.walletId,
            address: input.address,
            amount: input.amount,
            memo: input.memo,
            speed: input.speed,
          },
        },
        authToken,
      );

      return result.onChainUsdPaymentSend;
    } catch (error) {
      this.logger.error('Error sending on-chain USD payment:', error);
      throw error;
    }
  }

  /**
   * Send an on-chain payment from USD wallet as BTC denominated
   */
  async sendOnChainUsdPaymentAsBtcDenominated(
    input: OnChainPaymentInput,
    authToken: string,
  ): Promise<PaymentResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainUsdPaymentSendAsBtcDenominated: PaymentResponse;
      }>(
        ON_CHAIN_USD_PAYMENT_SEND_AS_BTC_DENOMINATED_MUTATION,
        {
          input: {
            walletId: input.walletId,
            address: input.address,
            amount: input.amount,
            memo: input.memo,
            speed: input.speed,
          },
        },
        authToken,
      );

      return result.onChainUsdPaymentSendAsBtcDenominated;
    } catch (error) {
      this.logger.error('Error sending on-chain USD as BTC denominated payment:', error);
      throw error;
    }
  }

  /**
   * Probe fee for Lightning invoice with amount
   */
  async probeLightningFee(
    walletId: string,
    paymentRequest: string,
    authToken: string,
  ): Promise<FeeProbeResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnInvoiceFeeProbe: FeeProbeResponse;
      }>(
        LN_INVOICE_FEE_PROBE_MUTATION,
        {
          input: {
            walletId,
            paymentRequest,
          },
        },
        authToken,
      );

      return result.lnInvoiceFeeProbe;
    } catch (error) {
      this.logger.error('Error probing Lightning fee:', error);
      throw error;
    }
  }

  /**
   * Probe fee for Lightning no-amount invoice (BTC)
   */
  async probeLightningNoAmountFee(
    walletId: string,
    paymentRequest: string,
    amount: number,
    authToken: string,
  ): Promise<FeeProbeResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnNoAmountInvoiceFeeProbe: FeeProbeResponse;
      }>(
        LN_NO_AMOUNT_INVOICE_FEE_PROBE_MUTATION,
        {
          input: {
            walletId,
            paymentRequest,
            amount,
          },
        },
        authToken,
      );

      return result.lnNoAmountInvoiceFeeProbe;
    } catch (error) {
      this.logger.error('Error probing Lightning no-amount fee:', error);
      throw error;
    }
  }

  /**
   * Probe fee for Lightning no-amount invoice (USD)
   */
  async probeLightningNoAmountUsdFee(
    walletId: string,
    paymentRequest: string,
    amount: number,
    authToken: string,
  ): Promise<FeeProbeResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnNoAmountUsdInvoiceFeeProbe: FeeProbeResponse;
      }>(
        LN_NO_AMOUNT_USD_INVOICE_FEE_PROBE_MUTATION,
        {
          input: {
            walletId,
            paymentRequest,
            amount,
          },
        },
        authToken,
      );

      return result.lnNoAmountUsdInvoiceFeeProbe;
    } catch (error) {
      this.logger.error('Error probing Lightning no-amount USD fee:', error);
      throw error;
    }
  }

  /**
   * Probe fee for Lightning invoice (USD wallet)
   */
  async probeLightningUsdFee(
    walletId: string,
    paymentRequest: string,
    authToken: string,
  ): Promise<FeeProbeResponse> {
    try {
      const result = await this.flashApiService.executeQuery<{
        lnUsdInvoiceFeeProbe: FeeProbeResponse;
      }>(
        LN_USD_INVOICE_FEE_PROBE_MUTATION,
        {
          input: {
            walletId,
            paymentRequest,
          },
        },
        authToken,
      );

      return result.lnUsdInvoiceFeeProbe;
    } catch (error) {
      this.logger.error('Error probing Lightning USD fee:', error);
      throw error;
    }
  }

  /**
   * Get fee for on-chain transaction (BTC)
   */
  async getOnChainFee(
    walletId: string,
    address: string,
    amount: number,
    authToken: string,
  ): Promise<number | undefined> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainTxFee: { amount: number };
      }>(
        ON_CHAIN_TX_FEE_QUERY,
        {
          walletId,
          address,
          amount,
        },
        authToken,
      );

      return result.onChainTxFee?.amount;
    } catch (error) {
      this.logger.error('Error getting on-chain fee:', error);
      throw error;
    }
  }

  /**
   * Get fee for on-chain transaction (USD)
   */
  async getOnChainUsdFee(
    walletId: string,
    address: string,
    amount: number,
    authToken: string,
  ): Promise<number | undefined> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainUsdTxFee: { amount: number };
      }>(
        ON_CHAIN_USD_TX_FEE_QUERY,
        {
          walletId,
          address,
          amount,
        },
        authToken,
      );

      return result.onChainUsdTxFee?.amount;
    } catch (error) {
      this.logger.error('Error getting on-chain USD fee:', error);
      throw error;
    }
  }

  /**
   * Get fee for on-chain transaction from USD wallet as BTC denominated
   */
  async getOnChainUsdFeeAsBtcDenominated(
    walletId: string,
    address: string,
    amount: number,
    authToken: string,
  ): Promise<number | undefined> {
    try {
      const result = await this.flashApiService.executeQuery<{
        onChainUsdTxFeeAsBtcDenominated: { amount: number };
      }>(
        ON_CHAIN_USD_TX_FEE_AS_BTC_DENOMINATED_QUERY,
        {
          walletId,
          address,
          amount,
        },
        authToken,
      );

      return result.onChainUsdTxFeeAsBtcDenominated?.amount;
    } catch (error) {
      this.logger.error('Error getting on-chain USD fee as BTC denominated:', error);
      throw error;
    }
  }
}