import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { CommandParserService, CommandType } from './command-parser.service';
import { BalanceTemplate } from '../templates/balance-template';
import { WhatsAppCloudService } from './whatsapp-cloud.service';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let configService: ConfigService;
  let redisService: RedisService;
  let commandParserService: CommandParserService;
  let sessionService: SessionService;
  let geminiAiService: GeminiAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              // Return mock values for configuration
              return undefined; // This prevents Twilio client initialization
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
            setNX: jest.fn(),
            exists: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            initiateAccountLinking: jest.fn(),
            verifyAccountLinking: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSession: jest.fn(),
            getSessionByWhatsappId: jest.fn(),
            createSession: jest.fn(),
            updateSession: jest.fn(),
            destroySession: jest.fn(),
          },
        },
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn(),
          },
        },
        {
          provide: BalanceService,
          useValue: {
            getUserBalance: jest.fn(),
          },
        },
        {
          provide: GeminiAiService,
          useValue: {
            processQuery: jest.fn().mockResolvedValue('AI response'),
          },
        },
        {
          provide: CommandParserService,
          useValue: {
            parseCommand: jest.fn().mockReturnValue({
              type: 'HELP',
              command: 'help',
              args: {},
            }),
          },
        },
        {
          provide: BalanceTemplate,
          useValue: {
            formatBalance: jest.fn().mockReturnValue('Your balance is: 0.0001 BTC'),
          },
        },
        {
          provide: WhatsAppCloudService,
          useValue: {
            sendTextMessage: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
    commandParserService = module.get<CommandParserService>(CommandParserService);
    sessionService = module.get<SessionService>(SessionService);
    geminiAiService = module.get<GeminiAiService>(GeminiAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processCloudMessage', () => {
    it('should process a cloud message and return a response', async () => {
      // Mock Redis set
      jest.spyOn(redisService, 'set').mockResolvedValue();

      // Mock session service
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);
      jest.spyOn(sessionService, 'createSession').mockResolvedValue({
        sessionId: 'test-session-id',
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
        flashUserId: undefined,
        isVerified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
        profileName: 'Test User',
      });

      // Mock command parser
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue({
        type: CommandType.HELP,
        args: {},
        rawText: 'help',
      });

      // Mock Gemini AI service to return a help message
      jest
        .spyOn(geminiAiService, 'processQuery')
        .mockResolvedValue('Here are the available commands: help, balance, link, verify, etc.');

      // Create test message
      const testMessage = {
        from: '18765551234',
        text: 'help',
        messageId: 'msg123',
        timestamp: '1234567890',
        name: 'Test User',
      };

      // Call the service method
      const result = await service.processCloudMessage(testMessage);

      // Verify it returns a string
      expect(typeof result).toBe('string');

      // Verify it includes the help message
      expect(result).toContain('Here are the available commands');

      // Verify Redis was called to store the message
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('whatsapp:message:'),
        expect.any(String),
        expect.any(Number),
      );
    });
  });
});
