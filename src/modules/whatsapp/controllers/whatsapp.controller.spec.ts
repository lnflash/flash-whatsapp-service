import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from '../services/whatsapp.service';
import { WhatsAppCloudService, CloudWebhookMessage } from '../services/whatsapp-cloud.service';
import { ConfigService } from '@nestjs/config';
import { RateLimiterGuard } from '../../../common/guards/rate-limiter.guard';
import { RedisService } from '../../redis/redis.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let whatsappService: WhatsappService;
  let whatsAppCloudService: WhatsAppCloudService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            processCloudMessage: jest.fn(),
          },
        },
        {
          provide: WhatsAppCloudService,
          useValue: {
            handleVerificationChallenge: jest.fn(),
            verifyWebhookSignature: jest.fn().mockReturnValue(true),
            parseWebhookMessage: jest.fn(),
            markMessageAsRead: jest.fn(),
            sendTextMessage: jest.fn(),
            isConfigured: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: RateLimiterGuard,
          useClass: class MockRateLimiterGuard {
            canActivate = jest.fn().mockReturnValue(true);
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(true),
            exists: jest.fn().mockResolvedValue(false),
            incr: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    whatsappService = module.get<WhatsappService>(WhatsappService);
    whatsAppCloudService = module.get<WhatsAppCloudService>(WhatsAppCloudService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should process webhook and return status ok', async () => {
      // Mock service responses
      const serviceResponse = 'Response message';
      jest.spyOn(whatsappService, 'processCloudMessage').mockResolvedValue(serviceResponse);
      
      const messageData = {
        messageId: 'msg123',
        from: '18765551234',
        text: 'Hello',
        type: 'text',
        timestamp: '1234567890',
        name: 'Test User',
      };
      
      jest.spyOn(whatsAppCloudService, 'parseWebhookMessage').mockReturnValue(messageData);

      // Create test webhook payload
      const testWebhook: CloudWebhookMessage = {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'entry123',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15551234567',
                phone_number_id: 'phone123',
              },
              messages: [{
                from: '18765551234',
                id: 'msg123',
                timestamp: '1234567890',
                text: { body: 'Hello' },
                type: 'text',
              }],
            },
            field: 'messages',
          }],
        }],
      };

      // Call the controller method
      const result = await controller.handleWebhook(testWebhook, 'signature', {} as any);

      // Verify services were called
      expect(whatsAppCloudService.parseWebhookMessage).toHaveBeenCalledWith(testWebhook);
      expect(whatsappService.processCloudMessage).toHaveBeenCalled();
      expect(whatsAppCloudService.sendTextMessage).toHaveBeenCalledWith('18765551234', serviceResponse);
      
      // Verify it returns success status
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('verifyWebhook', () => {
    it('should verify webhook challenge', () => {
      const challenge = 'test-challenge';
      jest.spyOn(whatsAppCloudService, 'handleVerificationChallenge').mockReturnValue(challenge);

      const result = controller.verifyWebhook('subscribe', 'test-token', challenge);

      expect(whatsAppCloudService.handleVerificationChallenge).toHaveBeenCalledWith('subscribe', 'test-token', challenge);
      expect(result).toBe(challenge);
    });
  });

  describe('healthCheck', () => {
    it('should return health status', () => {
      const result = controller.healthCheck();

      expect(result).toEqual({
        status: 'ok',
        service: 'Flash Connect WhatsApp Integration',
        configured: true,
      });
    });
  });
});