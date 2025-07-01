import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TtsService } from './tts.service';
import { AdminSettingsService } from '../whatsapp/services/admin-settings.service';
import { UserVoiceSettingsService } from '../whatsapp/services/user-voice-settings.service';

describe('TtsService', () => {
  let service: TtsService;
  let adminSettingsService: AdminSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TtsService,
        {
          provide: AdminSettingsService,
          useValue: {
            getVoiceMode: jest.fn().mockResolvedValue('on'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined), // No Google Cloud config by default
          },
        },
        {
          provide: UserVoiceSettingsService,
          useValue: {
            getUserVoiceMode: jest.fn().mockResolvedValue('on'),
            setUserVoiceMode: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TtsService>(TtsService);
    adminSettingsService = module.get<AdminSettingsService>(AdminSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('shouldUseVoice', () => {
    it('should return false when voice mode is off', async () => {
      jest.spyOn(adminSettingsService, 'getVoiceMode').mockResolvedValue('off');

      const result = await service.shouldUseVoice('test message', true);
      expect(result).toBe(false);
    });

    it('should return true when voice mode is always', async () => {
      jest.spyOn(adminSettingsService, 'getVoiceMode').mockResolvedValue('always');

      const result = await service.shouldUseVoice('test message', true);
      expect(result).toBe(true);
    });

    it('should check keywords for AI responses when voice mode is on', async () => {
      jest.spyOn(adminSettingsService, 'getVoiceMode').mockResolvedValue('on');

      // Should return true for voice keywords
      expect(await service.shouldUseVoice('voice balance', true)).toBe(true);
      expect(await service.shouldUseVoice('speak help', true)).toBe(true);
      expect(await service.shouldUseVoice('audio price', true)).toBe(true);

      // Should return false without keywords
      expect(await service.shouldUseVoice('balance', true)).toBe(false);
    });

    it('should return false for command responses when voice mode is on', async () => {
      jest.spyOn(adminSettingsService, 'getVoiceMode').mockResolvedValue('on');

      const result = await service.shouldUseVoice('balance', false);
      expect(result).toBe(false);
    });
  });

  describe('cleanTextForTTS', () => {
    it('should remove emojis', () => {
      const input = '🎉 Your balance is $100 💰';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('Your balance is 100 dollars');
    });

    it('should expand abbreviations', () => {
      const input = 'You have 10 USD and 0.001 BTC';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('You have 10 U S D and 0.001 bitcoin');
    });

    it('should clean formatting', () => {
      const input = '**Bold text**\n\nNew paragraph';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('Bold text. New paragraph');
    });

    it('should remove various punctuation marks', () => {
      const input = 'Hello `world`! Check_this_out: $50.25 & more';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('Hello world! Check this out, 50.25 dollars and more');
    });

    it('should handle complex symbols', () => {
      const input = 'User@example.com | Balance: ₿0.5 + $100 [PENDING]';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('User and example.com Balance, 0.5 bitcoin plus 100 dollars PENDING');
    });

    it('should clean up multiple punctuation', () => {
      const input = 'Wait!!! What??? Really... Yes!!!';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('Wait! What? Really. Yes!');
    });

    it('should handle code-like text', () => {
      const input = 'Use command: `admin_settings --enable` or {config: true}';
      const result = service.cleanTextForTTS(input);
      expect(result).toBe('Use command, admin settings enable or config, true');
    });
  });
});
