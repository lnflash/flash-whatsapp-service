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
            Authorization: '',
            'User-Agent': 'Flash-WhatsApp-Service/1.0',
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
      await expect(service.executeQuery(query)).rejects.toThrow(
        'Flash API error (400): Bad Request',
      );
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

  describe('initiatePhoneVerification', () => {
    it('should initiate phone verification with WhatsApp channel', async () => {
      // Mock fetch response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            userPhoneRegistrationInitiate: {
              success: true,
            },
          },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const phoneNumber = '+18765551234';
      const result = await service.initiatePhoneVerification(phoneNumber);

      expect(result).toEqual({ success: true });

      // Verify the mutation was called with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.flashapp.me/graphql',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('WHATSAPP'),
        }),
      );
    });

    it('should throw error when API is not configured', async () => {
      // Mock config to return no API URL
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'flashApi.url') return '';
        if (key === 'flashApi.apiKey') return '';
        return undefined;
      });

      // Create a new instance to pick up the mocked config
      const serviceWithoutConfig = new FlashApiService(configService);

      const phoneNumber = '+18765551234';

      await expect(serviceWithoutConfig.initiatePhoneVerification(phoneNumber)).rejects.toThrow(
        'Flash API URL not configured',
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('validatePhoneVerification', () => {
    it('should validate phone verification code and return auth token', async () => {
      // Mock fetch response for login
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            userLogin: {
              authToken: 'test_auth_token',
            },
          },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const phoneNumber = '+18765551234';
      const code = '123456';
      const result = await service.validatePhoneVerification(phoneNumber, code);

      expect(result).toEqual({ authToken: 'test_auth_token' });
    });

    it('should handle login errors correctly', async () => {
      // Mock fetch to return login error
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            userLogin: {
              errors: [{ message: 'Invalid code' }],
            },
          },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const phoneNumber = '+18765551234';
      const code = '123456';
      const result = await service.validatePhoneVerification(phoneNumber, code);

      expect(result).toEqual({
        errors: [{ message: 'Invalid code' }],
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when API is not configured', async () => {
      // Mock config to return no API URL
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'flashApi.url') return '';
        if (key === 'flashApi.apiKey') return '';
        return undefined;
      });

      // Create a new instance to pick up the mocked config
      const serviceWithoutConfig = new FlashApiService(configService);

      const phoneNumber = '+18765551234';
      const code = '123456';

      await expect(
        serviceWithoutConfig.validatePhoneVerification(phoneNumber, code),
      ).rejects.toThrow('Flash API URL not configured');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getUserDetails', () => {
    it('should get user details using auth token', async () => {
      // Mock fetch response
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              id: 'user_123',
              phone: '+18765551234',
              username: 'testuser',
            },
          },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const authToken = 'test_auth_token';
      const result = await service.getUserDetails(authToken);

      expect(result).toEqual({
        id: 'user_123',
        phone: '+18765551234',
        username: 'testuser',
      });

      // Verify auth token was passed in headers
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.flashapp.me/graphql',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test_auth_token',
            'User-Agent': 'Flash-WhatsApp-Service/1.0',
          }),
        }),
      );
    });

    it('should throw error when API is not configured', async () => {
      // Mock config to return no API URL
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'flashApi.url') return '';
        return undefined;
      });

      // Create a new instance to pick up the mocked config
      const serviceWithoutConfig = new FlashApiService(configService);

      const authToken = 'test_auth_token';

      await expect(serviceWithoutConfig.getUserDetails(authToken)).rejects.toThrow(
        'Flash API URL not configured',
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
