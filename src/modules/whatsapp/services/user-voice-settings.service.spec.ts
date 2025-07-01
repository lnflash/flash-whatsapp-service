import { Test, TestingModule } from '@nestjs/testing';
import { UserVoiceSettingsService, UserVoiceMode } from './user-voice-settings.service';
import { RedisService } from '../../redis/redis.service';

describe('UserVoiceSettingsService', () => {
  let service: UserVoiceSettingsService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserVoiceSettingsService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<UserVoiceSettingsService>(UserVoiceSettingsService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserVoiceMode', () => {
    it('should return null when no setting exists', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.getUserVoiceMode(whatsappId);
      expect(result).toBeNull();
    });

    it('should return stored voice mode', async () => {
      const whatsappId = '1234567890@c.us';
      const settings = {
        whatsappId,
        mode: UserVoiceMode.OFF,
        updatedAt: new Date().toISOString(),
      };
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(settings));

      const result = await service.getUserVoiceMode(whatsappId);
      expect(result).toBe(UserVoiceMode.OFF);
    });

    it('should return ONLY mode correctly', async () => {
      const whatsappId = '1234567890@c.us';
      const settings = {
        whatsappId,
        mode: UserVoiceMode.ONLY,
        updatedAt: new Date().toISOString(),
      };
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(settings));

      const result = await service.getUserVoiceMode(whatsappId);
      expect(result).toBe(UserVoiceMode.ONLY);
    });

    it('should handle invalid stored values gracefully', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockResolvedValue('invalid-json');

      const result = await service.getUserVoiceMode(whatsappId);
      expect(result).toBeNull();
    });
  });

  describe('setUserVoiceMode', () => {
    it('should store ON mode', async () => {
      const whatsappId = '1234567890@c.us';

      await service.setUserVoiceMode(whatsappId, UserVoiceMode.ON);

      expect(redisService.set).toHaveBeenCalledWith(
        `user_voice_settings:${whatsappId}`,
        expect.stringContaining('"mode":"on"'),
        0, // Persistent TTL
      );
    });

    it('should store OFF mode', async () => {
      const whatsappId = '1234567890@c.us';

      await service.setUserVoiceMode(whatsappId, UserVoiceMode.OFF);

      expect(redisService.set).toHaveBeenCalledWith(
        `user_voice_settings:${whatsappId}`,
        expect.stringContaining('"mode":"off"'),
        0,
      );
    });

    it('should store ONLY mode', async () => {
      const whatsappId = '1234567890@c.us';

      await service.setUserVoiceMode(whatsappId, UserVoiceMode.ONLY);

      expect(redisService.set).toHaveBeenCalledWith(
        `user_voice_settings:${whatsappId}`,
        expect.stringContaining('"mode":"only"'),
        0,
      );
    });
  });

  describe('clearUserVoiceSettings', () => {
    it('should delete user voice settings', async () => {
      const whatsappId = '1234567890@c.us';

      await service.clearUserVoiceSettings(whatsappId);

      expect(redisService.del).toHaveBeenCalledWith(`user_voice_settings:${whatsappId}`);
    });
  });

  describe('formatVoiceMode', () => {
    it('should format ON mode correctly', () => {
      const result = service.formatVoiceMode(UserVoiceMode.ON);
      expect(result).toContain('🔊 ON - Voice for AI responses');
    });

    it('should format OFF mode correctly', () => {
      const result = service.formatVoiceMode(UserVoiceMode.OFF);
      expect(result).toContain('🔇 OFF - No voice responses');
    });

    it('should format ONLY mode correctly', () => {
      const result = service.formatVoiceMode(UserVoiceMode.ONLY);
      expect(result).toContain('🎤 ONLY - Voice responses only (no text)');
    });
  });

  describe('getVoiceHelp', () => {
    it('should return comprehensive help text', () => {
      const result = service.getVoiceHelp();
      expect(result).toContain('Voice Settings');
      expect(result).toContain('voice on');
      expect(result).toContain('voice off');
      expect(result).toContain('voice only');
      expect(result).toContain('voice status');
    });
  });

  describe('hasUserVoiceSettings', () => {
    it('should return true when settings exist', async () => {
      const whatsappId = '1234567890@c.us';
      const settings = {
        whatsappId,
        mode: UserVoiceMode.ON,
        updatedAt: new Date().toISOString(),
      };
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify(settings));

      const result = await service.hasUserVoiceSettings(whatsappId);
      expect(result).toBe(true);
    });

    it('should return false when no settings exist', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.hasUserVoiceSettings(whatsappId);
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle Redis errors gracefully in getUserVoiceMode', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'get').mockRejectedValue(new Error('Redis error'));

      const result = await service.getUserVoiceMode(whatsappId);
      expect(result).toBeNull(); // Returns null on error
    });

    it('should handle Redis errors in setUserVoiceMode', async () => {
      const whatsappId = '1234567890@c.us';
      jest.spyOn(redisService, 'set').mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(service.setUserVoiceMode(whatsappId, UserVoiceMode.OFF)).resolves.not.toThrow();
    });

    it('should handle empty whatsappId', async () => {
      const result = await service.getUserVoiceMode('');
      expect(result).toBeNull();
    });

    it('should validate voice mode values', async () => {
      const whatsappId = '1234567890@c.us';

      // Test all valid enum values
      for (const mode of Object.values(UserVoiceMode)) {
        await service.setUserVoiceMode(whatsappId, mode);
        expect(redisService.set).toHaveBeenLastCalledWith(
          `user_voice_settings:${whatsappId}`,
          expect.stringContaining(`"mode":"${mode}"`),
          0,
        );
      }
    });
  });
});
