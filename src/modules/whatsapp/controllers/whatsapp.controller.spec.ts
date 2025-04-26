import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from '../services/whatsapp.service';
import { IncomingMessageDto } from '../dto/incoming-message.dto';
import { TwilioWebhookGuard } from '../guards/twilio-webhook.guard';
import { ConfigService } from '@nestjs/config';
import { RateLimiterGuard } from '../../../common/guards/rate-limiter.guard';
import { RedisService } from '../../redis/redis.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: WhatsappService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            processIncomingMessage: jest.fn(),
          },
        },
        {
          provide: TwilioWebhookGuard,
          useClass: class MockTwilioWebhookGuard {
            canActivate = jest.fn().mockReturnValue(true);
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
    service = module.get<WhatsappService>(WhatsappService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleIncomingMessage', () => {
    it('should call service.processIncomingMessage and return a response', async () => {
      // Mock service response
      const serviceResponse = 'Response message';
      jest.spyOn(service, 'processIncomingMessage').mockResolvedValue(serviceResponse);

      // Create test message
      const testMessage: IncomingMessageDto = {
        MessageSid: 'SM123456789',
        From: 'whatsapp:+18765551234',
        Body: 'Hello',
      };

      // Call the controller method
      const result = await controller.handleIncomingMessage(testMessage);

      // Verify service was called with the message
      expect(service.processIncomingMessage).toHaveBeenCalledWith(testMessage);
      
      // Verify it returns the expected response
      expect(result).toEqual({ message: serviceResponse });
    });
  });
});