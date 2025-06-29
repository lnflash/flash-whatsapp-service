import { Test, TestingModule } from '@nestjs/testing';
import { SupportModeService } from './support-mode.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';
import { BalanceService } from '../../flash-api/services/balance.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { FlashApiService } from '../../flash-api/flash-api.service';

describe('SupportModeService', () => {
  let service: SupportModeService;
  let redisService: jest.Mocked<RedisService>;
  let sessionService: jest.Mocked<SessionService>;
  let balanceService: jest.Mocked<BalanceService>;
  let usernameService: jest.Mocked<UsernameService>;
  let whatsappWebService: jest.Mocked<WhatsAppWebService>;
  let flashApiService: jest.Mocked<FlashApiService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportModeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('18762909250'),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSessionByWhatsappId: jest.fn(),
          },
        },
        {
          provide: BalanceService,
          useValue: {
            getUserBalance: jest.fn(),
          },
        },
        {
          provide: UsernameService,
          useValue: {
            getUsername: jest.fn(),
          },
        },
        {
          provide: WhatsAppWebService,
          useValue: {
            sendMessage: jest.fn(),
          },
        },
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SupportModeService>(SupportModeService);
    redisService = module.get(RedisService);
    sessionService = module.get(SessionService);
    balanceService = module.get(BalanceService);
    usernameService = module.get(UsernameService);
    whatsappWebService = module.get(WhatsAppWebService);
    flashApiService = module.get(FlashApiService);
  });

  describe('isRequestingSupport', () => {
    it('should detect support keywords', () => {
      expect(service.isRequestingSupport('I need to speak to a human')).toBe(true);
      expect(service.isRequestingSupport('Can I talk to customer support?')).toBe(true);
      expect(service.isRequestingSupport('Get me a real person')).toBe(true);
      expect(service.isRequestingSupport('I want to contact Flash support')).toBe(true);
      expect(service.isRequestingSupport('Help me please')).toBe(true);
    });

    it('should not detect support in regular messages', () => {
      expect(service.isRequestingSupport('What is my balance?')).toBe(false);
      expect(service.isRequestingSupport('Send 5 USD to @alice')).toBe(false);
      expect(service.isRequestingSupport('Show me the price')).toBe(false);
    });
  });

  describe('initiateSupportMode', () => {
    const mockUserSession = {
      sessionId: 'session123',
      whatsappId: '1234567890@c.us',
      phoneNumber: '1234567890',
      flashUserId: 'user123',
      flashAuthToken: 'auth-token',
      isVerified: true,
      createdAt: new Date(),
      expiresAt: new Date(),
      lastActivity: new Date(),
      mfaVerified: false,
      consentGiven: true,
    };

    it('should successfully initiate support mode', async () => {
      redisService.get.mockResolvedValue(null); // Not in support mode
      usernameService.getUsername.mockResolvedValue('johndoe');
      balanceService.getUserBalance.mockResolvedValue({
        btcBalance: 0.001,
        fiatBalance: 50,
        fiatCurrency: 'USD',
        lastUpdated: new Date(),
        exchangeRate: undefined,
      });
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          npub: 'npub1example1234567890',
        },
      });

      const result = await service.initiateSupportMode('1234567890@c.us', mockUserSession, [
        'User: I need help',
        'Bot: How can I help?',
      ]);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Support Mode Activated');

      // Verify support was notified
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '18762909250@c.us',
        expect.stringContaining('New Support Request'),
      );

      // Verify session was stored
      expect(redisService.set).toHaveBeenCalledWith(
        'support_mode:1234567890@c.us',
        expect.any(String),
        7200,
      );
    });

    it('should prevent duplicate support sessions', async () => {
      redisService.get.mockResolvedValue('existing-session'); // Already in support mode

      const result = await service.initiateSupportMode('1234567890@c.us', mockUserSession, []);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already connected to a support agent');
    });
  });

  describe('routeMessage', () => {
    const mockSession = {
      userId: 'user123',
      userWhatsappId: '1234567890@c.us',
      supportAgentId: '+18762909250',
      startTime: new Date(),
      status: 'active' as const,
      conversationSummary: 'Test conversation',
      userInfo: {
        phoneNumber: '1234567890',
      },
    };

    it('should route user message to support', async () => {
      redisService.get.mockResolvedValueOnce(JSON.stringify(mockSession));

      const result = await service.routeMessage(
        '1234567890@c.us',
        'I have a problem with my payment',
        false,
      );

      expect(result.routed).toBe(true);
      expect(result.response).toContain('Message sent to support');

      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '18762909250@c.us',
        expect.stringContaining('From 1234567890:'),
      );
    });

    it('should route support message to user', async () => {
      redisService.get
        .mockResolvedValueOnce('1234567890@c.us') // last active session
        .mockResolvedValueOnce(JSON.stringify(mockSession)); // session data

      const result = await service.routeMessage(
        '+18769202950@c.us',
        'I can help you with that payment issue',
        true,
      );

      expect(result.routed).toBe(true);

      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '1234567890@c.us',
        '👨‍💼 *Support Agent*: I can help you with that payment issue',
      );
    });

    it('should handle exit support command from user', async () => {
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(mockSession))
        .mockResolvedValueOnce(JSON.stringify(mockSession)); // For endSupportSession

      const result = await service.routeMessage('1234567890@c.us', 'exit support', false);

      expect(result.routed).toBe(true);
      expect(result.response).toContain('Support Session Ended');

      // Verify session was deleted
      expect(redisService.del).toHaveBeenCalledWith('support_mode:1234567890@c.us');
    });
  });

  describe('endSupportSession', () => {
    it('should properly end support session', async () => {
      const mockSession = {
        userId: 'user123',
        userWhatsappId: '1234567890@c.us',
        supportAgentId: '+18762909250',
        startTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        status: 'active' as const,
        conversationSummary: 'Test conversation',
        userInfo: {
          phoneNumber: '1234567890',
        },
      };

      redisService.get.mockResolvedValue(JSON.stringify(mockSession));

      const result = await service.endSupportSession('1234567890@c.us');

      expect(result.routed).toBe(true);
      expect(result.response).toContain('Support Session Ended');

      // Verify session was archived
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('support_session:1234567890@c.us:'),
        expect.any(String),
        2592000, // 30 days
      );

      // Verify support was notified
      expect(whatsappWebService.sendMessage).toHaveBeenCalledWith(
        '18762909250@c.us',
        expect.stringContaining('Support session ended'),
      );
    });
  });
});
