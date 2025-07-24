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

async function diagnoseRedis() {
  console.log('=== Redis Session Diagnostics ===\n');
  
  try {
    // 1. Check Redis connection
    console.log('1. Testing Redis connection...');
    const ping = await redis.ping();
    console.log(`   ✓ Redis connected: ${ping}\n`);
    
    // 2. Check persistence configuration
    console.log('2. Checking Redis persistence...');
    const saveConfig = await redis.config('GET', 'save');
    const aofEnabled = await redis.config('GET', 'appendonly');
    console.log(`   RDB Save: ${saveConfig[1] || 'NOT SET'}`);
    console.log(`   AOF Enabled: ${aofEnabled[1]}`);
    
    // Check last save time
    const lastSave = await redis.lastsave();
    const lastSaveDate = new Date(lastSave * 1000);
    console.log(`   Last Save: ${lastSaveDate.toISOString()}\n`);
    
    // 3. List all keys
    console.log('3. Analyzing Redis keys...');
    const allKeys = await redis.keys('*');
    console.log(`   Total keys: ${allKeys.length}`);
    
    // Group by type
    const keyTypes = {
      session: [],
      whatsapp: [],
      cache: [],
      other: []
    };
    
    for (const key of allKeys) {
      if (key.startsWith('session:')) keyTypes.session.push(key);
      else if (key.startsWith('whatsapp:')) keyTypes.whatsapp.push(key);
      else if (key.startsWith('cache:')) keyTypes.cache.push(key);
      else keyTypes.other.push(key);
    }
    
    console.log(`   - session:* keys: ${keyTypes.session.length}`);
    console.log(`   - whatsapp:* keys: ${keyTypes.whatsapp.length}`);
    console.log(`   - cache:* keys: ${keyTypes.cache.length}`);
    console.log(`   - other keys: ${keyTypes.other.length}\n`);
    
    // 4. Check session data format
    if (keyTypes.session.length > 0) {
      console.log('4. Examining session data...');
      
      for (const sessionKey of keyTypes.session) {
        console.log(`\n   Checking ${sessionKey}:`);
        
        const rawData = await redis.get(sessionKey);
        if (!rawData) {
          console.log('   ⚠️  No data');
          continue;
        }
        
        console.log(`   Data length: ${rawData.length} bytes`);
        
        // Check if it's encrypted (base64) or plain JSON
        try {
          // Try to parse as JSON first
          const parsed = JSON.parse(rawData);
          console.log('   ✓ Format: Plain JSON');
          console.log(`   User: ${parsed.username || 'unknown'}`);
          console.log(`   Linked: ${parsed.linkedAt || 'unknown'}`);
        } catch (e) {
          // Not JSON, check if it's base64 encrypted
          try {
            const decoded = Buffer.from(rawData, 'base64');
            if (decoded.length >= 32) {
              console.log('   ✓ Format: Encrypted (base64)');
              console.log('   ⚠️  Cannot decrypt without proper keys');
            } else {
              console.log('   ❌ Format: Unknown');
            }
          } catch (e2) {
            console.log('   ❌ Format: Corrupted');
          }
        }
        
        // Check TTL
        const ttl = await redis.ttl(sessionKey);
        if (ttl > 0) {
          console.log(`   TTL: ${Math.floor(ttl / 3600)} hours remaining`);
        } else if (ttl === -1) {
          console.log('   TTL: No expiry set');
        } else {
          console.log('   TTL: Expired');
        }
      }
    }
    
    // 5. Check environment variables
    console.log('\n5. Checking encryption configuration...');
    console.log(`   HASH_SALT: ${process.env.HASH_SALT ? '✓ Set' : '❌ NOT SET'}`);
    console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? '✓ Set' : '❌ NOT SET'}`);
    console.log(`   ENCRYPTION_SALT: ${process.env.ENCRYPTION_SALT ? '✓ Set' : '❌ NOT SET'}`);
    
    // 6. Test encryption/decryption
    console.log('\n6. Testing encryption...');
    try {
      const testData = { test: true, timestamp: Date.now() };
      const jsonString = JSON.stringify(testData);
      
      // Simulate what the app does
      const algorithm = 'aes-256-gcm';
      const keyString = process.env.ENCRYPTION_KEY || 'pulse-default-encryption-key-32-chars-minimum!!';
      const salt = process.env.ENCRYPTION_SALT || 'flash-connect-salt-default-16chr';
      const encryptionKey = crypto.pbkdf2Sync(keyString, salt, 100000, 32, 'sha256');
      
      // Encrypt
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const combined = Buffer.concat([iv, authTag, encrypted]);
      const base64 = combined.toString('base64');
      
      console.log('   ✓ Encryption successful');
      
      // Decrypt
      const decoded = Buffer.from(base64, 'base64');
      const ivDec = decoded.slice(0, 16);
      const authTagDec = decoded.slice(16, 32);
      const encryptedDec = decoded.slice(32);
      const decipher = crypto.createDecipheriv(algorithm, encryptionKey, ivDec);
      decipher.setAuthTag(authTagDec);
      const decrypted = Buffer.concat([decipher.update(encryptedDec), decipher.final()]);
      const result = JSON.parse(decrypted.toString('utf8'));
      
      console.log('   ✓ Decryption successful');
      console.log('   ✓ Encryption/decryption working correctly');
    } catch (error) {
      console.log('   ❌ Encryption test failed:', error.message);
    }
    
    // 7. Recommendations
    console.log('\n7. Recommendations:');
    
    if (!saveConfig[1] && aofEnabled[1] !== 'yes') {
      console.log('   ⚠️  Enable Redis persistence!');
      console.log('      Run: redis-cli CONFIG SET save "900 1 300 10 60 10000"');
    }
    
    if (keyTypes.session.length > 0) {
      console.log('   ⚠️  Found existing sessions that may be corrupted');
      console.log('      Run: node scripts/fix-sessions-immediate.js');
    }
    
    if (!process.env.HASH_SALT || !process.env.ENCRYPTION_KEY) {
      console.log('   ❌  Critical: Encryption keys not properly set!');
      console.log('      This is why sessions are failing.');
    }
    
  } catch (error) {
    console.error('\nError during diagnostics:', error);
  } finally {
    await redis.quit();
  }
}

diagnoseRedis();