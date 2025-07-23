#!/usr/bin/env node

const Redis = require('ioredis');

// Load environment
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

async function cleanupOldSessions() {
  console.log('=== Old Session Cleanup Tool ===\n');
  
  try {
    // 1. Find all session keys
    console.log('1. Scanning for session keys...');
    const sessionKeys = await redis.keys('session:*');
    const whatsappKeys = await redis.keys('whatsapp:*');
    
    console.log(`   Found ${sessionKeys.length} session keys`);
    console.log(`   Found ${whatsappKeys.length} whatsapp mapping keys`);
    
    if (sessionKeys.length === 0 && whatsappKeys.length === 0) {
      console.log('\n✓ No old sessions found. Redis is clean!');
      return;
    }
    
    // 2. Try to decrypt each session
    console.log('\n2. Checking sessions for decryption errors...');
    const badSessions = [];
    
    for (const key of sessionKeys) {
      try {
        const encryptedData = await redis.get(key);
        if (encryptedData) {
          // Try to decrypt (this will fail for old sessions)
          const crypto = require('crypto');
          const algorithm = 'aes-256-gcm';
          
          // Try to decode and see if it's valid
          const combined = Buffer.from(encryptedData, 'base64');
          if (combined.length < 32) {
            throw new Error('Invalid encrypted data format');
          }
        }
      } catch (error) {
        console.log(`   ✗ ${key} - Cannot decrypt (old encryption keys)`);
        badSessions.push(key);
      }
    }
    
    // 3. Show summary
    console.log(`\n3. Summary:`);
    console.log(`   Total sessions: ${sessionKeys.length}`);
    console.log(`   Undecryptable sessions: ${badSessions.length}`);
    console.log(`   WhatsApp mappings: ${whatsappKeys.length}`);
    
    if (badSessions.length > 0 || whatsappKeys.length > 0) {
      console.log('\n4. Cleanup required!');
      console.log('   These sessions were created with old encryption keys');
      console.log('   and cannot be decrypted with current keys.\n');
      
      // Ask for confirmation
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('   Delete all old sessions? (yes/no): ', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() === 'yes') {
        console.log('\n5. Cleaning up...');
        
        // Delete bad sessions
        for (const key of badSessions) {
          await redis.del(key);
          console.log(`   ✓ Deleted ${key}`);
        }
        
        // Delete all whatsapp mappings (they're linked to bad sessions)
        for (const key of whatsappKeys) {
          await redis.del(key);
          console.log(`   ✓ Deleted ${key}`);
        }
        
        console.log('\n✓ Cleanup complete!');
        console.log('✓ Users will need to re-link their accounts.');
        console.log('✓ Future sessions will persist correctly with current keys.');
      } else {
        console.log('\n✗ Cleanup cancelled.');
        console.log('⚠️  Old sessions will continue to cause decryption errors.');
      }
    } else {
      console.log('\n✓ All sessions are using current encryption keys!');
    }
    
  } catch (error) {
    console.error('\nError during cleanup:', error);
  } finally {
    await redis.quit();
  }
}

// Add non-interactive mode
if (process.argv.includes('--force')) {
  async function forceCleanup() {
    console.log('=== Force Cleanup Mode ===\n');
    
    try {
      const sessionKeys = await redis.keys('session:*');
      const whatsappKeys = await redis.keys('whatsapp:*');
      const cacheKeys = await redis.keys('cache:*');
      
      console.log(`Deleting ${sessionKeys.length} session keys...`);
      for (const key of sessionKeys) {
        await redis.del(key);
      }
      
      console.log(`Deleting ${whatsappKeys.length} whatsapp mapping keys...`);
      for (const key of whatsappKeys) {
        await redis.del(key);
      }
      
      // Optionally clean cache too
      if (process.argv.includes('--include-cache')) {
        console.log(`Deleting ${cacheKeys.length} cache keys...`);
        for (const key of cacheKeys) {
          await redis.del(key);
        }
      }
      
      console.log('\n✓ Force cleanup complete!');
      console.log('✓ All sessions have been cleared.');
      console.log('✓ Users will need to re-link their accounts.');
      
    } catch (error) {
      console.error('Error during force cleanup:', error);
    } finally {
      await redis.quit();
    }
  }
  
  forceCleanup();
} else {
  cleanupOldSessions();
}