#!/usr/bin/env node

/**
 * Clear corrupted sessions that can't be decrypted
 * Run this after setting up persistent keys
 */

const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
});

async function clearCorruptedSessions() {
  console.log('🧹 Clearing corrupted sessions...\n');

  try {
    // Find all session keys
    const sessionKeys = await redis.keys('session:*');
    console.log(`Found ${sessionKeys.length} session keys`);

    let cleared = 0;
    for (const key of sessionKeys) {
      try {
        const value = await redis.get(key);
        if (value) {
          // Try to parse as JSON (encrypted sessions will fail)
          JSON.parse(value);
        }
      } catch (error) {
        // This is likely an encrypted session with old keys
        await redis.del(key);
        console.log(`❌ Cleared corrupted session: ${key}`);
        cleared++;
      }
    }

    // Also clear any OTP keys
    const otpKeys = await redis.keys('otp:*');
    for (const key of otpKeys) {
      await redis.del(key);
    }
    console.log(`\n❌ Cleared ${otpKeys.length} OTP keys`);

    console.log(`\n✅ Cleared ${cleared} corrupted sessions`);
    console.log('✅ Cleared all OTP keys');
    console.log('\n🎉 Database cleaned! Users will need to re-link their accounts.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    redis.disconnect();
  }
}

clearCorruptedSessions();