import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SpeechService } from './speech.service';

describe('SpeechService', () => {
  let service: SpeechService;

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
      ],
    }).compile();

    service = module.get<SpeechService>(SpeechService);
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
});
