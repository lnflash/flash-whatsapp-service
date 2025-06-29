#!/usr/bin/env ts-node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/modules/redis/redis.service';

async function cleanOldSessions() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const redisService = app.get(RedisService);

  try {
    console.log('Cleaning old Redis sessions...');
    
    // Get all session keys
    const sessionKeys = await redisService.keys('session:*');
    console.log(`Found ${sessionKeys.length} session keys`);
    
    let cleaned = 0;
    for (const key of sessionKeys) {
      try {
        // Try to get the encrypted value
        await redisService.getEncrypted(key);
      } catch (error) {
        // If decryption fails, delete the key
        console.log(`Deleting corrupted session: ${key}`);
        await redisService.del(key);
        cleaned++;
      }
    }
    
    console.log(`Cleaned ${cleaned} corrupted sessions`);
    
    // Also clean old processing and notification keys
    const oldKeys = [
      ...(await redisService.keys('processed_msg:*')),
      ...(await redisService.keys('payment_notif_sent:*')),
      ...(await redisService.keys('invoice:*')),
    ];
    
    console.log(`Found ${oldKeys.length} old temporary keys`);
    
    if (oldKeys.length > 0) {
      await Promise.all(oldKeys.map(key => redisService.del(key)));
      console.log('Cleaned old temporary keys');
    }
    
  } catch (error) {
    console.error('Error cleaning sessions:', error);
  } finally {
    await app.close();
  }
}

cleanOldSessions().catch(console.error);