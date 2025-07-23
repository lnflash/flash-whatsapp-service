#!/usr/bin/env node

/**
 * Immediate fix for session decryption errors
 * This script cleans up all old sessions that can't be decrypted
 * Run this directly on the server to fix the issue
 */

const Redis = require('ioredis');

// Load environment
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

async function fixSessions() {
  console.log('=== Immediate Session Fix ===\n');
  
  try {
    // 1. Delete all session keys
    console.log('1. Finding all session keys...');
    const sessionKeys = await redis.keys('session:*');
    const whatsappKeys = await redis.keys('whatsapp:*');
    
    console.log(`   Found ${sessionKeys.length} session keys`);
    console.log(`   Found ${whatsappKeys.length} whatsapp mapping keys`);
    
    // 2. Delete them all
    console.log('\n2. Deleting all old sessions...');
    
    if (sessionKeys.length > 0) {
      await redis.del(...sessionKeys);
      console.log(`   ✓ Deleted ${sessionKeys.length} session keys`);
    }
    
    if (whatsappKeys.length > 0) {
      await redis.del(...whatsappKeys);
      console.log(`   ✓ Deleted ${whatsappKeys.length} whatsapp mapping keys`);
    }
    
    // 3. Also clean cache entries that might be corrupted
    console.log('\n3. Cleaning cache entries...');
    const cacheKeys = await redis.keys('cache:*');
    
    if (cacheKeys.length > 0) {
      await redis.del(...cacheKeys);
      console.log(`   ✓ Deleted ${cacheKeys.length} cache entries`);
    }
    
    // 4. Clean any notification-related keys
    console.log('\n4. Cleaning notification keys...');
    const notificationKeys = await redis.keys('last-transaction:*');
    const dedupKeys = await redis.keys('notification:dedup:*');
    
    const allNotifKeys = [...notificationKeys, ...dedupKeys];
    if (allNotifKeys.length > 0) {
      await redis.del(...allNotifKeys);
      console.log(`   ✓ Deleted ${allNotifKeys.length} notification keys`);
    }
    
    console.log('\n✓ Session cleanup complete!');
    console.log('✓ All users will need to re-link their accounts.');
    console.log('✓ Future sessions will work properly.\n');
    
    // 5. Show Redis persistence status
    console.log('5. Checking Redis persistence...');
    const info = await redis.info('persistence');
    const lines = info.split('\n');
    
    const rdbEnabled = lines.find(l => l.includes('rdb_last_save_time'));
    const aofEnabled = lines.find(l => l.includes('aof_enabled'));
    
    if (rdbEnabled) {
      console.log('   ✓ Redis RDB persistence is configured');
    }
    
    if (aofEnabled && aofEnabled.includes('1')) {
      console.log('   ✓ Redis AOF persistence is enabled');
    }
    
    if (!rdbEnabled && (!aofEnabled || !aofEnabled.includes('1'))) {
      console.log('   ⚠️  WARNING: Redis persistence is NOT enabled!');
      console.log('   ⚠️  Sessions will be lost on Redis restart.');
      console.log('   ⚠️  Run: node scripts/fix-redis-persistence.js');
    }
    
  } catch (error) {
    console.error('\nError during cleanup:', error);
  } finally {
    await redis.quit();
  }
}

// Run immediately
fixSessions();