import { Test, TestingModule } from '@nestjs/testing';
import { MapleAiService } from './maple-ai.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

// Mock fetch
global.fetch = jest.fn();

describe('MapleAiService', () => {
  let service: MapleAiService;
  let configService: ConfigService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapleAiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'mapleAi.apiUrl':
                  return 'https://api.trymaple.ai';
                case 'mapleAi.apiKey':
                  return 'test-api-key';
                default:
                  return undefined;
              }
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<MapleAiService>(MapleAiService);
    configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processQuery', () => {
    it('should process a query and return AI response', async () => {
      // Mock RedisService.get to return null (no cached response)
      jest.spyOn(service['redisService'], 'get').mockResolvedValue(null);
      
      // Mock getFaqDatabase to return empty object to simplify test
      jest.spyOn(service as any, 'getFaqDatabase').mockResolvedValue({});
      
      // Mock fetch response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          response: 'This is the AI response',
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Process a test query
      const query = 'How do I check my balance?';
      const context = { user: 'test-user' };

      const result = await service.processQuery(query, context);
      
      // Verify result
      expect(result).toBe('This is the AI response');
      
      // Verify fetch was called with the right method and headers
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://api.trymaple.ai/query');
      expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('POST');
      expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key',
      });
      
      // Parse the body that was sent to verify it contains the right query
      const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(sentBody.query).toBe(query);
      expect(sentBody.context.user).toBe('test-user');
    });

    it('should sanitize sensitive information from context', async () => {
      // Mock fetch response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          response: 'This is the AI response',
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Process a test query with sensitive information
      const query = 'How do I check my balance?';
      const context = {
        user: 'test-user',
        password: 'secret123',
        creditCard: '1234-5678-9012-3456',
        userDetails: {
          accountNumber: '987654321',
          walletAddress: 'bc1q...',
        },
      };

      await service.processQuery(query, context);

      // Get the body that was passed to fetch
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      const lastCallBody = JSON.parse(fetchCalls[0][1].body);
      
      // Verify sensitive information was redacted
      expect(lastCallBody.context.password).toBe('[REDACTED]');
      expect(lastCallBody.context.creditCard).toBe('[REDACTED]');
      expect(lastCallBody.context.userDetails.accountNumber).toBe('[REDACTED]');
      expect(lastCallBody.context.userDetails.walletAddress).toBe('[REDACTED]');
      
      // Verify non-sensitive information was preserved
      expect(lastCallBody.context.user).toBe('test-user');
    });

    it('should return fallback response when API call fails', async () => {
      // Mock RedisService.get to return null (no cached response)
      jest.spyOn(service['redisService'], 'get').mockResolvedValue(null);
      
      // Mock getFaqDatabase to return empty object to simplify test
      jest.spyOn(service as any, 'getFaqDatabase').mockResolvedValue({});
      
      // Mock fetch response with error
      const mockResponse = {
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Override the getFallbackResponse method to return a predictable value
      jest.spyOn(service as any, 'getFallbackResponse').mockReturnValue(
        "I'm sorry, I'm having trouble accessing the information you need right now."
      );

      // Process a test query
      const query = 'How do I check my balance?';
      
      const result = await service.processQuery(query);
      
      // Verify it returns fallback response
      expect(result).toContain('I\'m sorry');
    });
  });
});