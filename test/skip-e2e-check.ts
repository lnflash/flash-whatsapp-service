import Redis from 'ioredis';

/**
 * Check if Redis is available for E2E tests
 * If not, skip E2E tests to prevent CI failures
 */
export async function checkRedisConnection(): Promise<boolean> {
  if (process.env.SKIP_E2E_TESTS === 'true') {
    return false;
  }

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    connectTimeout: 3000,
    retryStrategy: () => null, // Don't retry
  });

  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return true;
  } catch (error) {
    console.log('Redis not available for E2E tests. Skipping E2E tests.');
    await redis.quit().catch(() => {});
    return false;
  }
}

/**
 * Conditionally run E2E tests based on Redis availability
 */
export function describeE2E(name: string, fn: () => void) {
  checkRedisConnection().then((redisAvailable) => {
    if (redisAvailable) {
      describe(name, fn);
    } else {
      describe.skip(name, fn);
    }
  });
}