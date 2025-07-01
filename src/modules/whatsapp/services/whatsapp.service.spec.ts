import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../../auth/services/auth.service';
import { SessionService } from '../../auth/services/session.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { PriceService } from '../../flash-api/services/price.service';
import { InvoiceService } from '../../flash-api/services/invoice.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { PaymentService } from '../../flash-api/services/payment.service';
import { PendingPaymentService } from '../../flash-api/services/pending-payment.service';
import { GeminiAiService } from '../../gemini-ai/gemini-ai.service';
import { QrCodeService } from './qr-code.service';
import { CommandParserService, CommandType } from './command-parser.service';
import { BalanceTemplate } from '../templates/balance-template';
import { WhatsAppWebService } from './whatsapp-web.service';
import { InvoiceTrackerService } from './invoice-tracker.service';
import { EventsService } from '../../events/events.service';
import { AdminSettingsService } from './admin-settings.service';
import { SupportModeService } from './support-mode.service';
import { TtsService } from '../../tts/tts.service';

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
            setEncrypted: jest.fn(),
            getEncrypted: jest.fn(),
            hashKey: jest.fn((prefix, id) => `${prefix}:hashed_${id}`),
          },
        },
        {
          provide: AuthService,
          useValue: {
            initiateAccountLinking: jest.fn(),
            verifyAccountLinking: jest.fn(),
            unlinkAccount: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSessionByWhatsappId: jest.fn(),
            createSession: jest.fn(),
            getSession: jest.fn(),
            updateSession: jest.fn(),
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
            getBalance: jest.fn().mockResolvedValue({
              btcBalance: 0,
              usdBalance: 0,
              formattedBtcBalance: '0 sats',
              formattedUsdBalance: '$0.00',
            }),
          },
        },
        {
          provide: UsernameService,
          useValue: {
            getUsername: jest.fn(),
            setUsername: jest.fn(),
          },
        },
        {
          provide: PriceService,
          useValue: {
            getBtcPrice: jest.fn().mockResolvedValue({
              price: 50000,
              formattedPrice: '$50,000.00',
            }),
          },
        },
        {
          provide: InvoiceService,
          useValue: {
            createInvoice: jest.fn(),
            decodeInvoice: jest.fn(),
          },
        },
        {
          provide: TransactionService,
          useValue: {
            getTransactionHistory: jest.fn(),
          },
        },
        {
          provide: PaymentService,
          useValue: {
            sendPayment: jest.fn(),
            sendPaymentToUsername: jest.fn(),
            sendPaymentToPhone: jest.fn(),
          },
        },
        {
          provide: PendingPaymentService,
          useValue: {
            createPendingPayment: jest.fn(),
            getPendingPayment: jest.fn(),
            confirmPayment: jest.fn(),
            cancelPayment: jest.fn(),
            cleanupExpiredPayments: jest.fn(),
          },
        },
        {
          provide: GeminiAiService,
          useValue: {
            processQuery: jest.fn().mockResolvedValue('This is a test AI response'),
          },
        },
        {
          provide: QrCodeService,
          useValue: {
            generateQrCode: jest.fn(),
          },
        },
        {
          provide: CommandParserService,
          useValue: {
            parseCommand: jest.fn(),
          },
        },
        {
          provide: BalanceTemplate,
          useValue: {
            formatBalanceMessage: jest.fn().mockReturnValue('Balance: $0.00 (0 sats)'),
          },
        },
        {
          provide: WhatsAppWebService,
          useValue: {
            sendMessage: jest.fn(),
            isClientReady: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: InvoiceTrackerService,
          useValue: {
            trackInvoice: jest.fn(),
            untrackInvoice: jest.fn(),
          },
        },
        {
          provide: EventsService,
          useValue: {
            publishEvent: jest.fn(),
          },
        },
        {
          provide: AdminSettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({
              lockdown: false,
              groupsEnabled: false,
              paymentsEnabled: true,
              requestsEnabled: true,
              supportNumbers: ['18762909250'],
              adminNumbers: ['13059244435'],
              voiceMode: 'on',
              lastUpdated: new Date(),
              updatedBy: 'system',
            }),
            isLockdown: jest.fn().mockResolvedValue(false),
            isAdmin: jest.fn().mockResolvedValue(false),
            getVoiceMode: jest.fn().mockResolvedValue('on'),
            setVoiceMode: jest.fn(),
          },
        },
        {
          provide: SupportModeService,
          useValue: {
            isInSupportMode: jest.fn().mockResolvedValue(false),
            isRequestingSupport: jest.fn().mockReturnValue(false),
            initiateSupportMode: jest.fn(),
            routeMessage: jest.fn(),
          },
        },
        {
          provide: TtsService,
          useValue: {
            shouldUseVoice: jest.fn().mockResolvedValue(false),
            textToSpeech: jest.fn(),
            cleanTextForTTS: jest.fn(),
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
      // Mock command parser
      const mockCommand = {
        type: CommandType.HELP,
        args: {},
        rawText: 'help',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      // Mock session
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Process a test message
      const messageData = {
        from: '+18765551234',
        text: 'help',
        messageId: 'test_msg_123',
        timestamp: new Date().toISOString(),
        name: 'Test User',
      };

      const response = await service.processCloudMessage(messageData);

      // Verify response is a string (help message)
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response).toContain('Welcome to Flash WhatsApp Bot');

      // Verify command parser was called
      expect(commandParserService.parseCommand).toHaveBeenCalledWith('help');
    });

    it('should handle unknown commands', async () => {
      // Mock command for unknown/AI query
      const mockCommand = {
        type: CommandType.UNKNOWN,
        args: {},
        rawText: 'What is Bitcoin?',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      // Mock no session
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Process message
      const messageData = {
        from: '+18765551234',
        text: 'What is Bitcoin?',
        messageId: 'test_msg_124',
        timestamp: new Date().toISOString(),
      };

      const response = await service.processCloudMessage(messageData);

      // Verify response suggests linking or help
      expect(response).toContain('Keep your finger on it');
      expect(response).toContain('link');
      expect(response).toContain('help');
    });

    it('should require link for payment commands', async () => {
      // Mock command
      const mockCommand = {
        type: CommandType.PAY,
        args: { action: 'check' },
        rawText: 'pay check',
      };
      jest.spyOn(commandParserService, 'parseCommand').mockReturnValue(mockCommand);

      // Mock no session (user not linked)
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Process message
      const messageData = {
        from: '+18765551234',
        text: 'pay check',
        messageId: 'test_msg_125',
        timestamp: new Date().toISOString(),
      };

      const response = await service.processCloudMessage(messageData);

      // Verify response prompts to link account
      expect(response).toContain('link your Flash account');
    });
  });
});
