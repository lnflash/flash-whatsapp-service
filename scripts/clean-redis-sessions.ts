#!/usr/bin/env ts-node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/modules/redis/redis.service';

async function cleanOldSessions() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // Disable logger for script
  });
  const redisService = app.get(RedisService);

  try {
    // Get all session keys
    const sessionKeys = await redisService.keys('session:*');
    
    let cleaned = 0;
    for (const key of sessionKeys) {
      try {
        // Try to get the encrypted value
        await redisService.getEncrypted(key);
      } catch (error) {
        // If decryption fails, delete the key
        await redisService.del(key);
        cleaned++;
      }
    }
    
    // Also clean old processing and notification keys
    const oldKeys = [
      ...(await redisService.keys('processed_msg:*')),
      ...(await redisService.keys('payment_notif_sent:*')),
      ...(await redisService.keys('invoice:*')),
    ];
    
    if (oldKeys.length > 0) {
      await Promise.all(oldKeys.map(key => redisService.del(key)));
    }
    
  } catch (error) {
    // Silently handle errors
  } finally {
    await app.close();
  }
}

cleanOldSessions().catch(() => {
  // Silently handle errors
});