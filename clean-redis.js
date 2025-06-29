const Redis = require('ioredis');

async function cleanRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || 'flash_redis_secure_pass',
  });

  try {
    console.log('Cleaning Redis sessions...');
    
    // Delete old session keys
    const sessionKeys = await redis.keys('session:*');
    console.log(`Found ${sessionKeys.length} session keys to clean`);
    
    if (sessionKeys.length > 0) {
      await redis.del(...sessionKeys);
      console.log('Deleted all session keys');
    }
    
    // Clean other old keys
    const oldKeys = [
      ...(await redis.keys('processed_msg:*')),
      ...(await redis.keys('payment_notif_sent:*')),
      ...(await redis.keys('invoice:*')),
    ];
    
    if (oldKeys.length > 0) {
      await redis.del(...oldKeys);
      console.log(`Deleted ${oldKeys.length} old temporary keys`);
    }
    
    console.log('Redis cleanup complete');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    redis.disconnect();
  }
}

cleanRedis();