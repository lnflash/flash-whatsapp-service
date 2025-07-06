import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SpeechService } from './speech.service';
import { WhisperService } from './whisper.service';

describe('SpeechService', () => {
  let service: SpeechService;
  let whisperService: WhisperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpeechService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined), // No Google Cloud config by default
          },
        },
        {
          provide: WhisperService,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(false),
            speechToText: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<SpeechService>(SpeechService);
    whisperService = module.get<WhisperService>(WhisperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should not be available without configuration', () => {
    expect(service.isAvailable()).toBe(false);
  });

  it('should return null when not configured', async () => {
    const mockBuffer = Buffer.from('fake audio data');
    const result = await service.speechToText(mockBuffer, 'audio/ogg; codecs=opus');
    expect(result).toBeNull();
  });

  it('should be available when Whisper is configured', () => {
    (whisperService.isAvailable as jest.Mock).mockReturnValue(true);
    expect(service.isAvailable()).toBe(true);
  });

  it('should use Whisper as fallback when Google Cloud fails', async () => {
    const mockBuffer = Buffer.from('fake audio data');
    const mockTranscription = 'Hello from Whisper';
    
    (whisperService.isAvailable as jest.Mock).mockReturnValue(true);
    (whisperService.speechToText as jest.Mock).mockResolvedValue(mockTranscription);
    
    const result = await service.speechToText(mockBuffer, 'audio/ogg; codecs=opus');
    expect(result).toBe(mockTranscription);
    expect(whisperService.speechToText).toHaveBeenCalledWith(mockBuffer, 'audio/ogg; codecs=opus');
  });
});
