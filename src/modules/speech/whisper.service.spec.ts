import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhisperService } from './whisper.service';
import * as fs from 'fs';

// Mock OpenAI
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock fs
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
  },
  createReadStream: jest.fn(),
}));

describe('WhisperService', () => {
  let service: WhisperService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhisperService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_API_KEY') return 'test-api-key';
              if (key === 'TEMP_DIR') return '/tmp';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WhisperService>(WhisperService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('speechToText', () => {
    it('should transcribe audio successfully', async () => {
      const mockAudioBuffer = Buffer.from('mock audio data');
      const mockTranscription = 'Hello, this is a test message';

      // Mock fs operations
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue('mock-stream');

      // Mock OpenAI transcription
      mockCreate.mockResolvedValue(mockTranscription);

      const result = await service.speechToText(mockAudioBuffer, 'audio/ogg; codecs=opus');

      expect(result).toBe(mockTranscription);
      expect(fs.promises.mkdir).toHaveBeenCalledWith('/tmp', { recursive: true });
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(fs.createReadStream).toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledWith({
        file: 'mock-stream',
        model: 'whisper-1',
        language: 'en',
        response_format: 'text',
        temperature: 0.2,
      });
    });

    it('should return null when OpenAI is not configured', async () => {
      // Create service without API key
      const testModule = await Test.createTestingModule({
        providers: [
          WhisperService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<WhisperService>(WhisperService);

      const result = await testService.speechToText(Buffer.from('test'), 'audio/ogg');

      expect(result).toBeNull();
    });

    it('should handle transcription errors gracefully', async () => {
      const mockAudioBuffer = Buffer.from('mock audio data');

      // Mock fs operations
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue('mock-stream');

      // Mock OpenAI transcription error
      mockCreate.mockRejectedValue(new Error('API Error'));

      const result = await service.speechToText(mockAudioBuffer, 'audio/ogg; codecs=opus');

      expect(result).toBeNull();
      expect(fs.promises.unlink).toHaveBeenCalled(); // Should clean up temp file
    });
  });

  describe('getFileExtension', () => {
    it('should return correct file extensions for different mime types', () => {
      const testCases = [
        { mimeType: 'audio/ogg; codecs=opus', expected: 'ogg' },
        { mimeType: 'audio/mp3', expected: 'mp3' },
        { mimeType: 'audio/wav', expected: 'wav' },
        { mimeType: 'audio/webm', expected: 'webm' },
        { mimeType: 'audio/m4a', expected: 'm4a' },
        { mimeType: 'audio/flac', expected: 'flac' },
        { mimeType: 'unknown/type', expected: 'ogg' }, // default
      ];

      testCases.forEach(({ mimeType, expected }) => {
        // Access private method through any type casting
        const result = (service as any).getFileExtension(mimeType);
        expect(result).toBe(expected);
      });
    });
  });

  describe('isAvailable', () => {
    it('should return true when configured', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when not configured', async () => {
      const testModule = await Test.createTestingModule({
        providers: [
          WhisperService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<WhisperService>(WhisperService);
      expect(testService.isAvailable()).toBe(false);
    });
  });

  describe('getSupportedFormats', () => {
    it('should return list of supported audio formats', () => {
      const formats = service.getSupportedFormats();
      expect(formats).toContain('mp3');
      expect(formats).toContain('ogg');
      expect(formats).toContain('wav');
      expect(formats).toContain('webm');
      expect(formats.length).toBeGreaterThan(5);
    });
  });
});
