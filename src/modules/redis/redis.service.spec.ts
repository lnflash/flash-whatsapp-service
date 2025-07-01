import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/crypto/crypto.service';

// Mock ioredis
jest.mock('ioredis', () => {
  const mockRedisInstance = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('test-value'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    keys: jest.fn().mockResolvedValue(['test-key']),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    duplicate: jest.fn().mockReturnValue({
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    }),
    ttl: jest.fn().mockResolvedValue(300),
  };

  return {
    default: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let _configService: ConfigService;
  let cryptoService: CryptoService;
  let redisMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'redis') {
                return {
                  host: 'localhost',
                  port: 6379,
                  password: '',
                  db: 0,
                };
              }
              return undefined;
            }),
          },
        },
        {
          provide: CryptoService,
          useValue: {
            encrypt: jest.fn().mockReturnValue('encrypted-value'),
            decrypt: jest.fn().mockReturnValue('decrypted-value'),
            hash: jest.fn().mockReturnValue('hashed-value'),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    _configService = module.get<ConfigService>(ConfigService);
    cryptoService = module.get<CryptoService>(CryptoService);

    // Get the Redis mock instance
    // Call onModuleInit manually since Jest doesn't call lifecycle hooks
    await service.onModuleInit();
    redisMock = (service as any).redisClient;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should set a value in Redis', async () => {
    await service.set('test-key', 'test-value');
    expect(redisMock.set).toHaveBeenCalledWith('test-key', 'test-value');
  });

  it('should set a value with expiry in Redis', async () => {
    await service.set('test-key', 'test-value', 60);
    expect(redisMock.set).toHaveBeenCalledWith('test-key', 'test-value', 'EX', 60);
  });

  it('should get a value from Redis', async () => {
    const result = await service.get('test-key');
    expect(redisMock.get).toHaveBeenCalledWith('test-key');
    expect(result).toBe('test-value');
  });

  it('should delete a key from Redis', async () => {
    await service.del('test-key');
    expect(redisMock.del).toHaveBeenCalledWith('test-key');
  });

  it('should check if a key exists in Redis', async () => {
    const result = await service.exists('test-key');
    expect(redisMock.exists).toHaveBeenCalledWith('test-key');
    expect(result).toBe(true);
  });

  it('should get TTL for a key', async () => {
    const result = await service.ttl('test-key');
    expect(redisMock.ttl).toHaveBeenCalledWith('test-key');
    expect(result).toBe(300);
  });

  describe('Encrypted Storage Methods', () => {
    it('should set encrypted value in Redis', async () => {
      const testData = { user: 'test', balance: 100 };
      await service.setEncrypted('test-key', testData);

      expect(cryptoService.encrypt).toHaveBeenCalledWith(JSON.stringify(testData));
      expect(redisMock.set).toHaveBeenCalledWith('test-key', 'encrypted-value');
    });

    it('should set encrypted value with expiry', async () => {
      const testData = { user: 'test', balance: 100 };
      await service.setEncrypted('test-key', testData, 3600);

      expect(cryptoService.encrypt).toHaveBeenCalledWith(JSON.stringify(testData));
      expect(redisMock.set).toHaveBeenCalledWith('test-key', 'encrypted-value', 'EX', 3600);
    });

    it('should get and decrypt value from Redis', async () => {
      redisMock.get.mockResolvedValue('encrypted-value');
      (cryptoService.decrypt as jest.Mock).mockReturnValue('{"user":"test","balance":100}');

      const result = await service.getEncrypted('test-key');

      expect(redisMock.get).toHaveBeenCalledWith('test-key');
      expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-value');
      expect(result).toEqual({ user: 'test', balance: 100 });
    });

    it('should return null for non-existent encrypted key', async () => {
      redisMock.get.mockResolvedValue(null);

      const result = await service.getEncrypted('non-existent');

      expect(result).toBeNull();
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
    });

    it('should handle encryption errors gracefully', async () => {
      (cryptoService.encrypt as jest.Mock).mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      await expect(service.setEncrypted('test-key', { data: 'test' })).rejects.toThrow(
        'Encryption failed',
      );
    });

    it('should handle decryption errors gracefully', async () => {
      redisMock.get.mockResolvedValue('corrupted-data');
      (cryptoService.decrypt as jest.Mock).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = await service.getEncrypted('test-key');
      expect(result).toBeNull();
      expect(cryptoService.decrypt).toHaveBeenCalledWith('corrupted-data');
    });
  });

  describe('Key Hashing', () => {
    it('should hash key with prefix', () => {
      const result = service.hashKey('session', '1234567890');

      expect(cryptoService.hash).toHaveBeenCalledWith('1234567890');
      expect(result).toBe('session:hashed-value');
    });
  });
});
