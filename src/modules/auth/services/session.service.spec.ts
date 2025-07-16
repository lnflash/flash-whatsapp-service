import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { UserSession } from '../interfaces/user-session.interface';
import { GroupAuthService } from './group-auth.service';

describe('SessionService', () => {
  let service: SessionService;
  let _configService: ConfigService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'security.sessionExpiry':
                  return 86400; // 24 hours
                case 'security.mfaExpiry':
                  return 300; // 5 minutes
                default:
                  return undefined;
              }
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
            expire: jest.fn(),
          },
        },
        {
          provide: GroupAuthService,
          useValue: {
            getRealIdForLid: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    _configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a session and store it in Redis', async () => {
      // Mock Redis encrypted set
      jest.spyOn(redisService, 'setEncrypted').mockResolvedValue();
      jest.spyOn(redisService, 'set').mockResolvedValue();

      const whatsappId = '18765551234';
      const phoneNumber = '+18765551234';

      const session = await service.createSession(whatsappId, phoneNumber);

      // Verify the session has the expected properties
      expect(session.sessionId).toBeDefined();
      expect(session.whatsappId).toBe(whatsappId);
      expect(session.phoneNumber).toBe(phoneNumber);
      expect(session.flashUserId).toBeUndefined();
      expect(session.isVerified).toBe(false);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);

      // Verify Redis was called with the correct parameters
      expect(redisService.setEncrypted).toHaveBeenCalledTimes(1);
      expect(redisService.setEncrypted).toHaveBeenCalledWith(
        `session:${session.sessionId}`,
        expect.objectContaining({
          sessionId: session.sessionId,
          whatsappId,
          phoneNumber,
        }),
        86400,
      );
      expect(redisService.hashKey).toHaveBeenCalledWith('whatsapp', whatsappId);
      expect(redisService.set).toHaveBeenCalledWith(
        `whatsapp:hashed_${whatsappId}`,
        session.sessionId,
        86400,
      );
    });

    it('should create a verified session when flashUserId is provided', async () => {
      // Mock Redis encrypted set
      jest.spyOn(redisService, 'setEncrypted').mockResolvedValue();
      jest.spyOn(redisService, 'set').mockResolvedValue();

      const whatsappId = '18765551234';
      const phoneNumber = '+18765551234';
      const flashUserId = 'flash_123';

      const session = await service.createSession(whatsappId, phoneNumber, flashUserId);

      // Verify session is marked as verified
      expect(session.isVerified).toBe(true);
      expect(session.flashUserId).toBe(flashUserId);
    });
  });

  describe('getSession', () => {
    it('should retrieve a session by sessionId', async () => {
      // Mock session data in Redis
      const mockSession: UserSession = {
        sessionId: 'test_session_id',
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
        isVerified: true,
        flashUserId: 'flash_123',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };

      jest.spyOn(redisService, 'getEncrypted').mockResolvedValue(mockSession);

      const session = await service.getSession('test_session_id');

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(mockSession.sessionId);
      expect(session?.whatsappId).toBe(mockSession.whatsappId);
      expect(session?.isVerified).toBe(mockSession.isVerified);

      // Verify Redis was called with the correct key
      expect(redisService.getEncrypted).toHaveBeenCalledWith('session:test_session_id');
    });

    it('should return null if session does not exist', async () => {
      jest.spyOn(redisService, 'getEncrypted').mockResolvedValue(null);

      const session = await service.getSession('nonexistent_session');

      expect(session).toBeNull();
    });
  });

  describe('getSessionByWhatsappId', () => {
    it('should retrieve a session by WhatsApp ID', async () => {
      const whatsappId = '18765551234';
      const sessionId = 'test_session_id';

      // Mock the sessionId lookup
      jest.spyOn(redisService, 'get').mockResolvedValue(sessionId);

      const mockSession: UserSession = {
        sessionId,
        whatsappId,
        phoneNumber: '+18765551234',
        isVerified: true,
        flashUserId: 'flash_123',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };

      jest.spyOn(redisService, 'getEncrypted').mockResolvedValue(mockSession);

      const session = await service.getSessionByWhatsappId(whatsappId);

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe(sessionId);
      expect(session?.whatsappId).toBe(whatsappId);

      // Verify Redis was called with the correct keys
      expect(redisService.hashKey).toHaveBeenCalledWith('whatsapp', whatsappId);
      expect(redisService.get).toHaveBeenCalledWith(`whatsapp:hashed_${whatsappId}`);
      expect(redisService.getEncrypted).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('should return null for @lid format WhatsApp IDs', async () => {
      const lidWhatsappId = '163947525222525@lid';

      // Mock Redis calls
      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null);

      const session = await service.getSessionByWhatsappId(lidWhatsappId);

      expect(session).toBeNull();

      // Verify Redis was called only once (no alternative format attempts)
      expect(redisService.hashKey).toHaveBeenCalledWith('whatsapp', lidWhatsappId);
      expect(redisService.get).toHaveBeenCalledTimes(1);
    });
  });
});
