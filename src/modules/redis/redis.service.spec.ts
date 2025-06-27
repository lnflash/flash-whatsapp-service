import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';

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
  };

  return {
    default: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;
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
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

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
});
