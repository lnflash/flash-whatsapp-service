import { Test, TestingModule } from '@nestjs/testing';
import { FlashApiService } from './flash-api.service';
import { ConfigService } from '@nestjs/config';

// Mock fetch
global.fetch = jest.fn();

describe('FlashApiService', () => {
  let service: FlashApiService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashApiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'flashApi.url':
                  return 'https://api.flashapp.me/graphql';
                case 'flashApi.apiKey':
                  return 'test-api-key';
                case 'flashApi.apiSecret':
                  return 'test-api-secret';
                default:
                  return undefined;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FlashApiService>(FlashApiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeQuery', () => {
    it('should execute a GraphQL query and return the result', async () => {
      // Mock fetch response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { testQuery: { result: 'success' } },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Execute a test query
      const query = 'query TestQuery { testQuery { result } }';
      const variables = { testVar: 'value' };

      const result = await service.executeQuery(query, variables);

      // Verify fetch was called with correct params
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.flashapp.me/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key',
            'X-Timestamp': expect.any(String),
            'X-Signature': expect.any(String),
          }),
          body: JSON.stringify({ query, variables }),
        }),
      );

      // Verify result
      expect(result).toEqual({ testQuery: { result: 'success' } });
    });

    it('should throw an error if the API returns an error', async () => {
      // Mock fetch response with error
      const mockResponse = {
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Execute a test query
      const query = 'query TestQuery { testQuery { result } }';
      
      // Verify it throws an error
      await expect(service.executeQuery(query)).rejects.toThrow('Flash API error (400): Bad Request');
    });

    it('should throw an error if GraphQL returns errors', async () => {
      // Mock fetch response with GraphQL errors
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: 'GraphQL Error' }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Execute a test query
      const query = 'query TestQuery { testQuery { result } }';
      
      // Verify it throws an error
      await expect(service.executeQuery(query)).rejects.toThrow('GraphQL error:');
    });
  });

  describe('verifyUserAccount', () => {
    it('should verify if user account exists', async () => {
      // This is a mock implementation since the actual implementation is a placeholder
      const phoneNumber = '+18765551234';
      const result = await service.verifyUserAccount(phoneNumber);
      
      // The placeholder implementation just returns true
      expect(result).toBe(true);
    });
  });
});