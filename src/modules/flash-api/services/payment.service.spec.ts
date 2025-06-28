import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService, PaymentSendResult } from './payment.service';
import { FlashApiService } from '../flash-api.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let flashApiService: jest.Mocked<FlashApiService>;

  beforeEach(async () => {
    const mockFlashApiService = {
      executeQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: FlashApiService,
          useValue: mockFlashApiService,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    flashApiService = module.get(FlashApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendLightningPayment', () => {
    it('should send a Lightning payment successfully', async () => {
      const mockResponse = {
        lnInvoicePaymentSend: {
          status: PaymentSendResult.Success,
          errors: [],
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.sendLightningPayment(
        {
          walletId: 'wallet123',
          paymentRequest: 'lnbc123...',
          memo: 'Test payment',
        },
        'auth-token',
      );

      expect(result.status).toBe(PaymentSendResult.Success);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('lnInvoicePaymentSend'),
        {
          input: {
            walletId: 'wallet123',
            paymentRequest: 'lnbc123...',
            memo: 'Test payment',
          },
        },
        'auth-token',
      );
    });

    it('should handle Lightning payment errors', async () => {
      const mockResponse = {
        lnInvoicePaymentSend: {
          status: PaymentSendResult.Failure,
          errors: [{ message: 'Insufficient balance' }],
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.sendLightningPayment(
        {
          walletId: 'wallet123',
          paymentRequest: 'lnbc123...',
        },
        'auth-token',
      );

      expect(result.status).toBe(PaymentSendResult.Failure);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.message).toBe('Insufficient balance');
    });
  });

  describe('sendLightningNoAmountPayment', () => {
    it('should send a no-amount Lightning payment successfully', async () => {
      const mockResponse = {
        lnNoAmountInvoicePaymentSend: {
          status: PaymentSendResult.Success,
          errors: [],
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.sendLightningNoAmountPayment(
        {
          walletId: 'wallet123',
          paymentRequest: 'lnbc123...',
          amount: 1000,
          memo: 'Test payment',
        },
        'auth-token',
      );

      expect(result.status).toBe(PaymentSendResult.Success);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('lnNoAmountInvoicePaymentSend'),
        {
          input: {
            walletId: 'wallet123',
            paymentRequest: 'lnbc123...',
            amount: 1000,
            memo: 'Test payment',
          },
        },
        'auth-token',
      );
    });
  });

  describe('sendIntraLedgerPayment', () => {
    it('should send an intraledger payment successfully', async () => {
      const mockResponse = {
        intraLedgerPaymentSend: {
          status: PaymentSendResult.Success,
          errors: [],
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.sendIntraLedgerPayment(
        {
          walletId: 'wallet123',
          recipientWalletId: 'wallet456',
          amount: 5000,
          memo: 'Test transfer',
        },
        'auth-token',
      );

      expect(result.status).toBe(PaymentSendResult.Success);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('intraLedgerPaymentSend'),
        {
          input: {
            walletId: 'wallet123',
            recipientWalletId: 'wallet456',
            amount: 5000,
            memo: 'Test transfer',
          },
        },
        'auth-token',
      );
    });
  });

  describe('sendOnChainPayment', () => {
    it('should send an on-chain payment successfully', async () => {
      const mockResponse = {
        onChainPaymentSend: {
          status: PaymentSendResult.Success,
          errors: [],
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.sendOnChainPayment(
        {
          walletId: 'wallet123',
          address: 'bc1qxxx...',
          amount: 10000,
          memo: 'On-chain payment',
          speed: 'FAST',
        },
        'auth-token',
      );

      expect(result.status).toBe(PaymentSendResult.Success);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('onChainPaymentSend'),
        {
          input: {
            walletId: 'wallet123',
            address: 'bc1qxxx...',
            amount: 10000,
            memo: 'On-chain payment',
            speed: 'FAST',
          },
        },
        'auth-token',
      );
    });
  });

  describe('probeLightningFee', () => {
    it('should probe Lightning fee successfully', async () => {
      const mockResponse = {
        lnInvoiceFeeProbe: {
          amount: 10,
          errors: [],
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.probeLightningFee('wallet123', 'lnbc123...', 'auth-token');

      expect(result.amount).toBe(10);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('lnInvoiceFeeProbe'),
        {
          input: {
            walletId: 'wallet123',
            paymentRequest: 'lnbc123...',
          },
        },
        'auth-token',
      );
    });
  });

  describe('getOnChainFee', () => {
    it('should get on-chain fee successfully', async () => {
      const mockResponse = {
        onChainTxFee: {
          amount: 500,
        },
      };

      flashApiService.executeQuery.mockResolvedValue(mockResponse);

      const result = await service.getOnChainFee('wallet123', 'bc1qxxx...', 10000, 'auth-token');

      expect(result).toBe(500);
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('onChainTxFee'),
        {
          walletId: 'wallet123',
          address: 'bc1qxxx...',
          amount: 10000,
        },
        'auth-token',
      );
    });
  });
});
