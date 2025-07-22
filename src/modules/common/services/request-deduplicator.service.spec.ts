import { Test, TestingModule } from '@nestjs/testing';
import { RequestDeduplicator, DeduplicationKeyBuilder } from './request-deduplicator.service';

describe('RequestDeduplicator', () => {
  let service: RequestDeduplicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestDeduplicator],
    }).compile();

    service = module.get<RequestDeduplicator>(RequestDeduplicator);
  });

  afterEach(() => {
    service.clearAll();
    jest.clearAllTimers();
  });

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('deduplicate', () => {
    it('should execute factory function for first request', async () => {
      const factory = jest.fn().mockResolvedValue('result');
      
      const result = await service.deduplicate('test-key', factory);
      
      expect(factory).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('should return same promise for concurrent requests', async () => {
      let resolveFactory: (value: string) => void;
      const factory = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveFactory = resolve;
        });
      });

      // Start two concurrent requests
      const promise1 = service.deduplicate('test-key', factory);
      const promise2 = service.deduplicate('test-key', factory);

      // Factory should only be called once
      expect(factory).toHaveBeenCalledTimes(1);

      // Resolve the factory
      resolveFactory!('result');

      // Both promises should resolve to the same value
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('result');
      expect(result2).toBe('result');
    });

    it('should cache results for specified TTL', async () => {
      const factory = jest.fn().mockResolvedValue('result');
      
      // First call
      await service.deduplicate('test-key', factory, { ttl: 1000 });
      expect(factory).toHaveBeenCalledTimes(1);

      // Second call within TTL should use cache
      const cachedResult = await service.deduplicate('test-key', factory, { ttl: 1000 });
      expect(factory).toHaveBeenCalledTimes(1);
      expect(cachedResult).toBe('result');
    });

    it('should expire cache after TTL', async () => {
      const factory = jest.fn().mockResolvedValue('result');
      
      // First call with short TTL
      await service.deduplicate('test-key', factory, { ttl: 50 });
      expect(factory).toHaveBeenCalledTimes(1);

      // Advance time to expire cache
      jest.advanceTimersByTime(60);

      // Second call should execute factory again
      await service.deduplicate('test-key', factory, { ttl: 50 });
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('should handle errors when throwOnError is true', async () => {
      const error = new Error('Test error');
      const factory = jest.fn().mockRejectedValue(error);

      await expect(
        service.deduplicate('test-key', factory, { throwOnError: true })
      ).rejects.toThrow('Test error');
    });

    it('should return errors when throwOnError is false', async () => {
      const error = new Error('Test error');
      const factory = jest.fn().mockRejectedValue(error);

      const result = await service.deduplicate('test-key', factory, { throwOnError: false });
      expect(result).toBe(error);
    });

    it('should handle different keys independently', async () => {
      const factory1 = jest.fn().mockResolvedValue('result1');
      const factory2 = jest.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        service.deduplicate('key1', factory1),
        service.deduplicate('key2', factory2),
      ]);

      expect(factory1).toHaveBeenCalledTimes(1);
      expect(factory2).toHaveBeenCalledTimes(1);
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
    });
  });

  describe('clear', () => {
    it('should clear specific key from cache', async () => {
      const factory = jest.fn().mockResolvedValue('result');
      
      // Cache a result
      await service.deduplicate('test-key', factory, { ttl: 1000 });
      expect(factory).toHaveBeenCalledTimes(1);

      // Clear the key
      service.clear('test-key');

      // Next call should execute factory again
      await service.deduplicate('test-key', factory, { ttl: 1000 });
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAll', () => {
    it('should clear all cached data', async () => {
      const factory1 = jest.fn().mockResolvedValue('result1');
      const factory2 = jest.fn().mockResolvedValue('result2');
      
      // Cache multiple results
      await service.deduplicate('key1', factory1, { ttl: 1000 });
      await service.deduplicate('key2', factory2, { ttl: 1000 });

      // Clear all
      service.clearAll();

      // Both keys should execute factory again
      await service.deduplicate('key1', factory1, { ttl: 1000 });
      await service.deduplicate('key2', factory2, { ttl: 1000 });

      expect(factory1).toHaveBeenCalledTimes(2);
      expect(factory2).toHaveBeenCalledTimes(2);
    });
  });

  describe('metrics', () => {
    it('should track in-flight requests', async () => {
      let resolveFactory: (value: string) => void;
      const factory = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveFactory = resolve;
        });
      });

      expect(service.getInFlightCount()).toBe(0);

      // Start request
      const promise = service.deduplicate('test-key', factory);
      expect(service.getInFlightCount()).toBe(1);

      // Resolve request
      resolveFactory!('result');
      await promise;
      expect(service.getInFlightCount()).toBe(0);
    });

    it('should track cache size', async () => {
      const factory = jest.fn().mockResolvedValue('result');
      
      expect(service.getCacheSize()).toBe(0);

      await service.deduplicate('key1', factory, { ttl: 1000 });
      expect(service.getCacheSize()).toBe(1);

      await service.deduplicate('key2', factory, { ttl: 1000 });
      expect(service.getCacheSize()).toBe(2);
    });
  });

  describe('cleanupExpiredCache', () => {
    it('should remove expired entries', async () => {
      const factory = jest.fn().mockResolvedValue('result');
      
      // Add entries with different TTLs
      await service.deduplicate('key1', factory, { ttl: 50 });
      await service.deduplicate('key2', factory, { ttl: 1000 });

      expect(service.getCacheSize()).toBe(2);

      // Advance time to expire first entry
      jest.advanceTimersByTime(60);

      // Cleanup
      service.cleanupExpiredCache();

      expect(service.getCacheSize()).toBe(1);
    });
  });
});

describe('DeduplicationKeyBuilder', () => {
  it('should build user command keys', () => {
    const key = DeduplicationKeyBuilder.forUserCommand('user123', 'balance', 'USD');
    expect(key).toBe('user:user123:cmd:balance:USD');
  });

  it('should build API call keys', () => {
    const key = DeduplicationKeyBuilder.forApiCall('/api/balance', 'user123');
    expect(key).toBe('api:/api/balance:user123');
  });

  it('should build balance keys', () => {
    const key1 = DeduplicationKeyBuilder.forBalance('user123');
    expect(key1).toBe('balance:user123');

    const key2 = DeduplicationKeyBuilder.forBalance('user123', 'USD');
    expect(key2).toBe('balance:user123:USD');
  });

  it('should build price keys', () => {
    const key = DeduplicationKeyBuilder.forPrice('USD');
    expect(key).toBe('price:USD');
  });

  it('should build transaction keys', () => {
    const key = DeduplicationKeyBuilder.forTransaction('tx123');
    expect(key).toBe('tx:tx123');
  });

  it('should build user profile keys', () => {
    const key = DeduplicationKeyBuilder.forUserProfile('user123');
    expect(key).toBe('profile:user123');
  });
});