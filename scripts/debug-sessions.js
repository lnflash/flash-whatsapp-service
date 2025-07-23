#!/usr/bin/env node

const Redis = require('ioredis');
const crypto = require('crypto');

// Load environment
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

function hash(data, salt) {
  return crypto
    .createHash('sha256')
    .update(data + salt)
    .digest('hex');
}

async function debugSessions() {
  console.log('=== Pulse Session Debugger ===\n');
  
  // Check environment
  console.log('1. Environment Check:');
  console.log(`   HASH_SALT: ${process.env.HASH_SALT ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log(`   ENCRYPTION_SALT: ${process.env.ENCRYPTION_SALT ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log();
  
  // Test hash consistency
  const testPhone = '18764250250@c.us';
  const hashSalt = process.env.HASH_SALT || 'pulse-hash-salt-default-value';
  const hashedId = hash(testPhone, hashSalt);
  console.log('2. Hash Test:');
  console.log(`   Test WhatsApp ID: ${testPhone}`);
  console.log(`   Hash salt: ${hashSalt}`);
  console.log(`   Hashed result: ${hashedId}`);
  console.log(`   Redis key would be: whatsapp:${hashedId}`);
  console.log();
  
  // Check Redis
  console.log('3. Redis Check:');
  try {
    const info = await redis.info('persistence');
    console.log('   Redis is connected ✓');
    
    // Check if Redis has persistence enabled
    if (info.includes('rdb_last_save_time')) {
      console.log('   RDB persistence is enabled ✓');
    } else {
      console.log('   WARNING: RDB persistence might not be enabled');
    }
    
    // Check AOF
    if (info.includes('aof_enabled:1')) {
      console.log('   AOF persistence is enabled ✓');
    } else {
      console.log('   AOF persistence is disabled');
    }
  } catch (error) {
    console.log(`   Redis connection failed: ${error.message}`);
  }
  console.log();
  
  // List all session-related keys
  console.log('4. Session Keys in Redis:');
  try {
    const sessionKeys = await redis.keys('session:*');
    const whatsappKeys = await redis.keys('whatsapp:*');
    
    console.log(`   Found ${sessionKeys.length} session keys`);
    console.log(`   Found ${whatsappKeys.length} whatsapp mapping keys`);
    
    if (sessionKeys.length > 0) {
      console.log('\n   Sample session keys:');
      sessionKeys.slice(0, 3).forEach(key => {
        console.log(`   - ${key}`);
      });
    }
    
    if (whatsappKeys.length > 0) {
      console.log('\n   Sample whatsapp keys:');
      whatsappKeys.slice(0, 3).forEach(key => {
        console.log(`   - ${key}`);
      });
    }
  } catch (error) {
    console.log(`   Error listing keys: ${error.message}`);
  }
  console.log();
  
  // Test specific WhatsApp ID lookup
  if (process.argv[2]) {
    const whatsappId = process.argv[2];
    console.log(`5. Testing lookup for WhatsApp ID: ${whatsappId}`);
    
    const hashedWhatsappId = hash(whatsappId, hashSalt);
    const whatsappKey = `whatsapp:${hashedWhatsappId}`;
    
    try {
      const sessionId = await redis.get(whatsappKey);
      if (sessionId) {
        console.log(`   ✓ Found session ID: ${sessionId}`);
        
        // Check if session data exists
        const sessionKey = `session:${sessionId}`;
        const sessionData = await redis.get(sessionKey);
        if (sessionData) {
          console.log(`   ✓ Session data exists (${sessionData.length} bytes)`);
        } else {
          console.log(`   ✗ Session data not found for key: ${sessionKey}`);
        }
      } else {
        console.log(`   ✗ No session found for hashed key: ${whatsappKey}`);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
  } else {
    console.log('5. To test a specific WhatsApp ID, run:');
    console.log('   node scripts/debug-sessions.js 18764250250@c.us');
  }
  
  await redis.quit();
}

debugSessions().catch(console.error);