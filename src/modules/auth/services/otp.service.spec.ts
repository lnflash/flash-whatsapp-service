import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { createHash } from 'crypto';

describe('OtpService', () => {
  let service: OtpService;
  let _configService: ConfigService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'security.mfaExpiry':
                  return 300; // 5 minutes
                case 'security.jwtSecret':
                  return 'test_jwt_secret';
                default:
                  return undefined;
              }
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn().mockImplementation(() => Promise.resolve()),
            get: jest.fn(),
            del: jest.fn().mockImplementation(() => Promise.resolve()),
            setEncrypted: jest.fn().mockImplementation(() => Promise.resolve()),
            getEncrypted: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
    _configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateOtp', () => {
    it('should generate a 6-digit OTP and store it in Redis', async () => {
      // Mock Redis setEncrypted
      jest.spyOn(redisService, 'setEncrypted').mockResolvedValue();

      const phoneNumber = '+18765551234';
      const sessionId = 'test_session_id';

      const otp = await service.generateOtp(phoneNumber, sessionId);

      // Verify the OTP has the expected format
      expect(otp).toMatch(/^\d{6}$/);

      // Verify Redis was called with the correct parameters
      expect(redisService.setEncrypted).toHaveBeenCalledWith(
        `otp:${sessionId}`,
        { hash: expect.any(String) }, // encrypted OTP data
        300, // expiry
      );
    });
  });

  describe('verifyOtp', () => {
    it('should verify a valid OTP', async () => {
      const sessionId = 'test_session_id';
      const otpCode = '123456';

      // Store a hashed OTP in the mock
      const otpHash = createHash('sha256')
        .update(otpCode + 'test_jwt_secret')
        .digest('hex');

      // Mock Redis getEncrypted and del
      jest.spyOn(redisService, 'getEncrypted').mockResolvedValue({ hash: otpHash });
      jest.spyOn(redisService, 'del').mockResolvedValue(1);

      const isValid = await service.verifyOtp(sessionId, otpCode);

      expect(isValid).toBe(true);

      // Verify Redis was called to get and delete the OTP
      expect(redisService.getEncrypted).toHaveBeenCalledWith(`otp:${sessionId}`);
      expect(redisService.del).toHaveBeenCalledWith(`otp:${sessionId}`);
    });

    it('should reject an invalid OTP', async () => {
      const sessionId = 'test_session_id';
      const correctOtp = '123456';
      const wrongOtp = '654321';

      // Store a hashed OTP in the mock
      const otpHash = createHash('sha256')
        .update(correctOtp + 'test_jwt_secret')
        .digest('hex');

      // Mock Redis getEncrypted
      jest.spyOn(redisService, 'getEncrypted').mockResolvedValue({ hash: otpHash });
      jest.spyOn(redisService, 'del').mockResolvedValue(1);

      const isValid = await service.verifyOtp(sessionId, wrongOtp);

      expect(isValid).toBe(false);

      // Verify Redis was called to get the OTP, but not to delete it
      expect(redisService.getEncrypted).toHaveBeenCalledWith(`otp:${sessionId}`);
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('should return false if no OTP is found for the session', async () => {
      const sessionId = 'test_session_id';
      const otpCode = '123456';

      // Mock Redis getEncrypted returning null (no OTP found)
      jest.spyOn(redisService, 'getEncrypted').mockResolvedValue(null);

      const isValid = await service.verifyOtp(sessionId, otpCode);

      expect(isValid).toBe(false);
    });
  });
});
