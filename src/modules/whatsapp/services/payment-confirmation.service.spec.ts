import { Test, TestingModule } from '@nestjs/testing';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { RedisService } from '../../redis/redis.service';
import { CommandType, ParsedCommand } from './command-parser.service';

describe('PaymentConfirmationService', () => {
  let service: PaymentConfirmationService;
  let redisService: RedisService;

  const mockCommand: ParsedCommand = {
    type: CommandType.SEND,
    args: {
      amount: '10',
      recipient: 'alice',
      currency: 'USD',
      memo: 'test payment',
      requiresConfirmation: 'true',
    },
    rawText: 'send 10 to alice',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentConfirmationService,
        {
          provide: RedisService,
          useValue: {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(null),
            del: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentConfirmationService>(PaymentConfirmationService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('storePendingPayment', () => {
    it('should store a pending payment confirmation', async () => {
      const whatsappId = '1234567890@c.us';
      const phoneNumber = '1234567890';
      const sessionId = 'session123';

      await service.storePendingPayment(whatsappId, phoneNumber, mockCommand, sessionId);

      expect(redisService.set).toHaveBeenCalledWith(
        `payment_confirmation:${whatsappId}`,
        expect.stringContaining('"phoneNumber":"1234567890"'),
        300, // 5 minutes TTL
      );
    });

    it('should store pending payment without sessionId', async () => {
      const whatsappId = '1234567890@c.us';
      const phoneNumber = '1234567890';

      await service.storePendingPayment(whatsappId, phoneNumber, mockCommand);

      expect(redisService.set).toHaveBeenCalledWith(
        `payment_confirmation:${whatsappId}`,
        expect.stringContaining('"phoneNumber":"1234567890"'),
        300,
      );
    });
  });

  describe('hasPendingPayment', () => {
    it('should return true when pending payment exists', async () => {
      const whatsappId = '1234567890@c.us';
      const pendingData = {
        command: mockCommand,
        whatsappId,
        phoneNumber: '1234567890',
        sessionId: 'session123',
        timestamp: Date.now(),
        expiresAt: Date.now() + 300000, // 5 minutes from now
      };

      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(pendingData));

      const result = await service.hasPendingPayment(whatsappId);
      expect(result).toBe(true);
    });

    it('should return false when no pending payment exists', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.hasPendingPayment(whatsappId);
      expect(result).toBe(false);
    });
  });

  describe('getPendingPayment', () => {
    it('should retrieve pending payment data', async () => {
      const whatsappId = '1234567890@c.us';
      const pendingData = {
        command: mockCommand,
        whatsappId,
        phoneNumber: '1234567890',
        sessionId: 'session123',
        timestamp: Date.now(),
        expiresAt: Date.now() + 300000, // 5 minutes from now
      };

      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(pendingData));

      const result = await service.getPendingPayment(whatsappId);
      expect(result).toEqual(pendingData);
    });

    it('should return null when no pending payment exists', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.getPendingPayment(whatsappId);
      expect(result).toBeNull();
    });

    it('should handle JSON parse errors gracefully', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockResolvedValue('invalid json');

      const result = await service.getPendingPayment(whatsappId);
      expect(result).toBeNull();
    });

    it('should return null and clear expired payment', async () => {
      const whatsappId = '1234567890@c.us';
      const expiredData = {
        command: mockCommand,
        whatsappId,
        phoneNumber: '1234567890',
        sessionId: 'session123',
        timestamp: Date.now() - 600000, // 10 minutes ago
        expiresAt: Date.now() - 300000, // Expired 5 minutes ago
      };

      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(expiredData));

      const result = await service.getPendingPayment(whatsappId);
      expect(result).toBeNull();
      expect(redisService.del).toHaveBeenCalledWith(`payment_confirmation:${whatsappId}`);
    });
  });

  describe('clearPendingPayment', () => {
    it('should delete pending payment', async () => {
      const whatsappId = '1234567890@c.us';

      await service.clearPendingPayment(whatsappId);

      expect(redisService.del).toHaveBeenCalledWith(`payment_confirmation:${whatsappId}`);
    });
  });

  describe('formatPaymentDetails', () => {
    it('should format send command details', () => {
      const result = service.formatPaymentDetails(mockCommand);
      expect(result).toBe('💰 **$10.00 USD** to **alice**\n📝 Memo: "test payment"');
    });

    it('should format send command without memo', () => {
      const { memo, ...argsWithoutMemo } = mockCommand.args;
      const commandNoMemo: ParsedCommand = {
        ...mockCommand,
        args: argsWithoutMemo,
      };
      const result = service.formatPaymentDetails(commandNoMemo);
      expect(result).toBe('💰 **$10.00 USD** to **alice**');
    });

    it('should format request command details', () => {
      const requestCommand: ParsedCommand = {
        type: CommandType.REQUEST,
        args: {
          amount: '5',
          username: 'bob',
          currency: 'USD',
        },
        rawText: 'request 5 from bob',
      };
      const result = service.formatPaymentDetails(requestCommand);
      expect(result).toBe('Request **$5.00 USD** from **@bob**');
    });

    it('should handle unknown command type', () => {
      const unknownCommand = {
        ...mockCommand,
        type: CommandType.BALANCE,
      };
      const result = service.formatPaymentDetails(unknownCommand);
      expect(result).toBe('Unknown payment');
    });
  });

  describe('edge cases', () => {
    it('should handle send command without confirmation requirement', async () => {
      const whatsappId = '1234567890@c.us';
      const phoneNumber = '1234567890';
      const commandWithoutConfirmation: ParsedCommand = {
        ...mockCommand,
        args: {
          ...mockCommand.args,
          requiresConfirmation: 'false',
        },
      };

      await service.storePendingPayment(whatsappId, phoneNumber, commandWithoutConfirmation);

      expect(redisService.set).toHaveBeenCalledWith(
        `payment_confirmation:${whatsappId}`,
        expect.any(String),
        300,
      );
    });

    it('should handle request command with confirmation', async () => {
      const whatsappId = '1234567890@c.us';
      const phoneNumber = '1234567890';
      const requestCommand: ParsedCommand = {
        type: CommandType.REQUEST,
        args: {
          amount: '5',
          target: 'bob',
          currency: 'USD',
          requiresConfirmation: 'true',
        },
        rawText: 'request 5 from bob',
      };

      await service.storePendingPayment(whatsappId, phoneNumber, requestCommand);

      expect(redisService.set).toHaveBeenCalledWith(
        `payment_confirmation:${whatsappId}`,
        expect.stringContaining('"type":"request"'),
        300,
      );
    });
  });
});
