import { Test, TestingModule } from '@nestjs/testing';
import { GroupRateLimiterService } from './group-rate-limiter.service';
import { RedisService } from '../../redis/redis.service';

describe('GroupRateLimiterService', () => {
  let service: GroupRateLimiterService;
  let redisService: RedisService;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupRateLimiterService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<GroupRateLimiterService>(GroupRateLimiterService);
    redisService = module.get<RedisService>(RedisService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    const groupId = 'group123@g.us';
    const userId = '1234567890';

    it('should allow request when under limits', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.checkRateLimit(groupId, userId, 'price');

      expect(result.allowed).toBe(true);
      expect(result.remainingUserLimit).toBeGreaterThan(0);
      expect(result.remainingGroupLimit).toBeGreaterThan(0);
      expect(mockRedisService.set).toHaveBeenCalledTimes(2); // User and group keys
    });

    it('should deny request when user hits rate limit', async () => {
      const now = Date.now();
      const timestamps = Array(5).fill(now - 1000); // 5 recent requests (at limit for price)
      mockRedisService.get.mockImplementation((key) => {
        if (key.includes(userId) && !key.includes('block')) {
          return Promise.resolve(JSON.stringify(timestamps));
        }
        return Promise.resolve(null);
      });

      const result = await service.checkRateLimit(groupId, userId, 'price');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("You've sent too many commands");
      expect(result.remainingUserLimit).toBe(0);
    });

    it('should deny request when group hits rate limit', async () => {
      const now = Date.now();
      const groupTimestamps = Array(20).fill(now - 1000); // 20 recent group requests
      mockRedisService.get.mockImplementation((key) => {
        if (key.includes('all')) {
          return Promise.resolve(JSON.stringify(groupTimestamps));
        }
        return Promise.resolve(null);
      });

      const result = await service.checkRateLimit(groupId, userId, 'price');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('This group has reached its command limit');
      expect(result.remainingGroupLimit).toBe(0);
    });

    it('should block user after hitting payment rate limit', async () => {
      const now = Date.now();
      const timestamps = Array(3).fill(now - 1000); // 3 recent requests (at limit)
      mockRedisService.get.mockImplementation((key) => {
        if (key.includes(userId) && !key.includes('block')) {
          return Promise.resolve(JSON.stringify(timestamps));
        }
        return Promise.resolve(null);
      });

      const result = await service.checkRateLimit(groupId, userId, 'payment');

      expect(result.allowed).toBe(false);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('block'),
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should deny request when user is blocked', async () => {
      const blockUntil = Date.now() + 60000;
      mockRedisService.get.mockImplementation((key) => {
        if (key.includes('block')) {
          return Promise.resolve(blockUntil.toString());
        }
        return Promise.resolve(null);
      });

      const result = await service.checkRateLimit(groupId, userId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('temporarily blocked');
      expect(result.resetAt).toEqual(new Date(blockUntil));
    });

    it('should filter out old timestamps outside window', async () => {
      const now = Date.now();
      const oldTimestamp = now - 120000; // 2 minutes ago
      const recentTimestamp = now - 30000; // 30 seconds ago
      const timestamps = [oldTimestamp, recentTimestamp];

      mockRedisService.get.mockImplementation((key) => {
        if (key.includes('all')) {
          // Group has 1 recent request
          return Promise.resolve(JSON.stringify([recentTimestamp]));
        } else if (!key.includes('block')) {
          // User has mixed old and recent timestamps
          return Promise.resolve(JSON.stringify(timestamps));
        }
        return Promise.resolve(null);
      });

      const result = await service.checkRateLimit(groupId, userId);

      expect(result.allowed).toBe(true);
      // Should update Redis with only recent timestamp
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(userId),
        expect.stringContaining(recentTimestamp.toString()),
        expect.any(Number),
      );
    });

    it('should allow request on Redis error', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis connection error'));

      const result = await service.checkRateLimit(groupId, userId);

      expect(result.allowed).toBe(true);
      expect(result.remainingUserLimit).toBeUndefined();
    });
  });

  describe('clearUserLimit', () => {
    it('should clear user rate limit data', async () => {
      await service.clearUserLimit('group123@g.us', 'user123');

      expect(mockRedisService.del).toHaveBeenCalledWith('group-rate:group123@g.us:user123:*');
      expect(mockRedisService.del).toHaveBeenCalledWith('group-rate:block:group123@g.us:user123');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      const now = Date.now();
      const userTimestamps = [now - 1000, now - 2000];
      const groupTimestamps = Array(5).fill(now - 1000);

      mockRedisService.get.mockImplementation((key) => {
        if (key.includes('all')) {
          return Promise.resolve(JSON.stringify(groupTimestamps));
        } else if (key.includes('block')) {
          return Promise.resolve(null);
        } else {
          return Promise.resolve(JSON.stringify(userTimestamps));
        }
      });

      const status = await service.getRateLimitStatus('group123@g.us', 'user123', 'price');

      expect(status.userCount).toBe(2);
      expect(status.groupCount).toBe(5);
      expect(status.isBlocked).toBe(false);
      expect(status.config).toMatchObject({
        maxPerUser: 5,
        maxPerGroup: 20,
      });
    });
  });
});
