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

async function testSessionPersistence() {
  console.log('=== Session Persistence Test ===\n');
  
  const testPhone = '18764250250@c.us';
  const hashSalt = process.env.HASH_SALT || 'pulse-hash-salt-default-value';
  const hashedId = hash(testPhone, hashSalt);
  const sessionId = crypto.randomBytes(16).toString('hex');
  
  try {
    // 1. Create a test session
    console.log('1. Creating test session...');
    const sessionKey = `session:${sessionId}`;
    const whatsappKey = `whatsapp:${hashedId}`;
    
    const testSession = {
      sessionId,
      whatsappId: testPhone,
      phoneNumber: '+18764250250',
      flashUserId: 'test-flash-id',
      isVerified: true,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
      lastActivity: new Date(),
      mfaVerified: false,
      consentGiven: true,
    };
    
    // Store encrypted session (simulating what the app does)
    await redis.set(sessionKey, JSON.stringify(testSession), 'EX', 86400);
    await redis.set(whatsappKey, sessionId, 'EX', 86400);
    
    console.log(`   ✓ Session created with ID: ${sessionId}`);
    console.log(`   ✓ WhatsApp mapping created: ${whatsappKey} -> ${sessionId}`);
    
    // 2. Force Redis to save
    console.log('\n2. Forcing Redis save...');
    await redis.bgsave();
    console.log('   ✓ Background save initiated');
    
    // Wait for save to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Verify session can be retrieved
    console.log('\n3. Verifying session retrieval...');
    const retrievedSessionId = await redis.get(whatsappKey);
    const retrievedSession = await redis.get(sessionKey);
    
    if (retrievedSessionId === sessionId && retrievedSession) {
      console.log('   ✓ Session retrieval successful');
      console.log(`   ✓ Session data intact: ${retrievedSession.length} bytes`);
    } else {
      console.log('   ✗ Session retrieval failed!');
    }
    
    // 4. Check Redis info
    console.log('\n4. Redis Persistence Info:');
    const info = await redis.info('persistence');
    const lines = info.split('\n');
    
    // Extract key information
    const lastSave = lines.find(l => l.startsWith('rdb_last_save_time'));
    const changes = lines.find(l => l.startsWith('rdb_changes_since_last_save'));
    const aofEnabled = lines.find(l => l.startsWith('aof_enabled'));
    
    if (lastSave) console.log(`   ${lastSave}`);
    if (changes) console.log(`   ${changes}`);
    if (aofEnabled) console.log(`   ${aofEnabled}`);
    
    // 5. Test what happens after "restart" (disconnect/reconnect)
    console.log('\n5. Simulating Redis reconnection...');
    await redis.quit();
    
    // Create new connection (simulating app restart)
    const redis2 = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
    });
    
    const afterRestartSessionId = await redis2.get(whatsappKey);
    const afterRestartSession = await redis2.get(sessionKey);
    
    if (afterRestartSessionId === sessionId && afterRestartSession) {
      console.log('   ✓ Session survived simulated restart!');
    } else {
      console.log('   ✗ Session lost after restart!');
      console.log('   This indicates Redis is not persisting data.');
    }
    
    // Cleanup
    await redis2.del(sessionKey, whatsappKey);
    await redis2.quit();
    
    // 6. Summary
    console.log('\n=== Test Summary ===');
    if (afterRestartSessionId === sessionId) {
      console.log('✓ Redis persistence appears to be working correctly');
      console.log('✓ Sessions should survive restarts');
      console.log('\nIf users still lose sessions, check:');
      console.log('- Environment variables are consistent across restarts');
      console.log('- No scripts are flushing Redis on deployment');
      console.log('- Redis container/service is not being recreated');
    } else {
      console.log('✗ Redis persistence is NOT working!');
      console.log('✗ Sessions will be lost on every restart');
      console.log('\nTo fix this:');
      console.log('1. Run: node scripts/fix-redis-persistence.js');
      console.log('2. Follow the instructions to enable Redis persistence');
      console.log('3. Users will need to re-link ONE MORE TIME after the fix');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testSessionPersistence().catch(console.error);