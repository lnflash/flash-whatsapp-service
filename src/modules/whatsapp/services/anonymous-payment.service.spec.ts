import { Test, TestingModule } from '@nestjs/testing';
import { AnonymousPaymentService, AnonymousTipRequest } from './anonymous-payment.service';
import { RedisService } from '../../redis/redis.service';
import { PaymentService, PaymentSendResult } from '../../flash-api/services/payment.service';
import { FlashApiService } from '../../flash-api/flash-api.service';

describe('AnonymousPaymentService', () => {
  let service: AnonymousPaymentService;
  let _redisService: RedisService;
  let _paymentService: PaymentService;
  let _flashApiService: FlashApiService;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockPaymentService = {
    getUserWallets: jest.fn(),
    sendIntraLedgerUsdPayment: jest.fn(),
  };

  const mockFlashApiService = {
    executeQuery: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnonymousPaymentService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: FlashApiService, useValue: mockFlashApiService },
      ],
    }).compile();

    service = module.get<AnonymousPaymentService>(AnonymousPaymentService);
    _redisService = module.get<RedisService>(RedisService);
    _paymentService = module.get<PaymentService>(PaymentService);
    _flashApiService = module.get<FlashApiService>(FlashApiService);

    jest.clearAllMocks();
  });

  describe('processAnonymousTip', () => {
    const mockRequest: AnonymousTipRequest = {
      groupId: '1234567890-1234567890@g.us',
      groupName: 'Test Group',
      senderWhatsappId: 'sender123',
      recipientUsername: 'alice',
      amount: 5,
      memo: 'Great job!',
      senderAuthToken: 'mock-auth-token',
    };

    it('should successfully process an anonymous tip', async () => {
      // Mock recipient validation
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: { id: 'recipient-wallet-id' },
      });

      // Mock sender wallets
      mockPaymentService.getUserWallets.mockResolvedValue({
        usdWallet: { id: 'sender-wallet-id' },
        defaultWalletId: 'sender-wallet-id',
      });

      // Mock successful payment
      mockPaymentService.sendIntraLedgerUsdPayment.mockResolvedValue({
        status: PaymentSendResult.Success,
      });

      const result = await service.processAnonymousTip(mockRequest);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Anonymous tip sent to @alice');
      expect(result.recipientMessage).toContain('You received a $5.00 USD tip');
      expect(result.recipientMessage).toContain('Test Group');

      // Verify payment was made
      expect(mockPaymentService.sendIntraLedgerUsdPayment).toHaveBeenCalledWith(
        {
          walletId: 'sender-wallet-id',
          recipientWalletId: 'recipient-wallet-id',
          amount: 500, // 5 USD in cents
          memo: 'Great job!',
        },
        'mock-auth-token',
      );

      // Verify tip was tracked
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('anon_tip:'),
        expect.any(String),
        86400, // 24 hours TTL
      );
    });

    it('should handle recipient not found', async () => {
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: null,
      });

      const result = await service.processAnonymousTip(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('User @alice not found');
      expect(result.errorCode).toBe('RECIPIENT_NOT_FOUND');
    });

    it('should handle insufficient balance', async () => {
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: { id: 'recipient-wallet-id' },
      });

      mockPaymentService.getUserWallets.mockResolvedValue({
        usdWallet: { id: 'sender-wallet-id' },
      });

      mockPaymentService.sendIntraLedgerUsdPayment.mockResolvedValue({
        status: PaymentSendResult.Failure,
        errors: [{ message: 'Insufficient balance' }],
      });

      const result = await service.processAnonymousTip(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient balance');
      expect(result.message).toContain('$5.00 USD');
      expect(result.errorCode).toBe('INSUFFICIENT_BALANCE');
    });

    it('should handle transaction limits', async () => {
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: { id: 'recipient-wallet-id' },
      });

      mockPaymentService.getUserWallets.mockResolvedValue({
        usdWallet: { id: 'sender-wallet-id' },
      });

      mockPaymentService.sendIntraLedgerUsdPayment.mockResolvedValue({
        status: PaymentSendResult.Failure,
        errors: [{ message: 'Transaction limit exceeded' }],
      });

      const result = await service.processAnonymousTip(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Transaction limit reached');
      expect(result.errorCode).toBe('LIMIT_EXCEEDED');
    });

    it('should handle wallet access errors', async () => {
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: { id: 'recipient-wallet-id' },
      });

      mockPaymentService.getUserWallets.mockResolvedValue({
        usdWallet: null,
        defaultWalletId: null,
      });

      const result = await service.processAnonymousTip(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unable to access your wallet');
      expect(result.errorCode).toBe('WALLET_ERROR');
    });

    it('should update tip statistics', async () => {
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: { id: 'recipient-wallet-id' },
      });

      mockPaymentService.getUserWallets.mockResolvedValue({
        usdWallet: { id: 'sender-wallet-id' },
      });

      mockPaymentService.sendIntraLedgerUsdPayment.mockResolvedValue({
        status: PaymentSendResult.Success,
      });

      // Mock existing stats
      mockRedisService.get
        .mockResolvedValueOnce(
          JSON.stringify({
            totalTips: 5,
            totalAmount: 25,
            lastTipDate: '2024-01-01',
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            totalTipsReceived: 3,
            totalAmountReceived: 15,
            groups: {},
          }),
        );

      await service.processAnonymousTip(mockRequest);

      // Verify group stats were updated
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'tip_stats:group:1234567890-1234567890@g.us',
        expect.stringContaining('"totalTips":6'),
      );

      // Verify recipient stats were updated
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'tip_stats:user:alice',
        expect.stringContaining('"totalTipsReceived":4'),
      );
    });

    it('should generate proper recipient message', async () => {
      mockFlashApiService.executeQuery.mockResolvedValue({
        accountDefaultWallet: { id: 'recipient-wallet-id' },
      });

      mockPaymentService.getUserWallets.mockResolvedValue({
        usdWallet: { id: 'sender-wallet-id' },
      });

      mockPaymentService.sendIntraLedgerUsdPayment.mockResolvedValue({
        status: PaymentSendResult.Success,
      });

      const result = await service.processAnonymousTip(mockRequest);

      expect(result.recipientMessage).toContain('🎁 *Anonymous Tip Received!*');
      expect(result.recipientMessage).toContain('$5.00 USD');
      expect(result.recipientMessage).toContain('Test Group');
      expect(result.recipientMessage).toContain('Great job!');
      expect(result.recipientMessage).toContain('The sender chose to remain anonymous');
    });
  });

  describe('getGroupTipStats', () => {
    it('should return group tip statistics', async () => {
      const mockStats = {
        totalTips: 10,
        totalAmount: 50,
        lastTipDate: '2024-01-01T12:00:00Z',
      };

      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStats));

      const stats = await service.getGroupTipStats('group123');

      expect(stats).toEqual(mockStats);
      expect(mockRedisService.get).toHaveBeenCalledWith('tip_stats:group:group123');
    });

    it('should return null if no stats exist', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const stats = await service.getGroupTipStats('group123');

      expect(stats).toBeNull();
    });
  });

  describe('getUserTipStats', () => {
    it('should return user tip statistics', async () => {
      const mockStats = {
        totalTipsReceived: 5,
        totalAmountReceived: 25,
        groups: {
          group123: 3,
          group456: 2,
        },
      };

      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStats));

      const stats = await service.getUserTipStats('alice');

      expect(stats).toEqual(mockStats);
      expect(mockRedisService.get).toHaveBeenCalledWith('tip_stats:user:alice');
    });
  });
});
