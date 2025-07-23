#!/usr/bin/env node

const Redis = require('ioredis');

// Load environment
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

async function listAllKeys() {
  try {
    const allKeys = await redis.keys('*');
    console.log(`Total keys in Redis: ${allKeys.length}\n`);
    
    // Group by prefix
    const groups = {};
    for (const key of allKeys) {
      const prefix = key.split(':')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(key);
    }
    
    // Show groups
    for (const [prefix, keys] of Object.entries(groups)) {
      console.log(`${prefix}: ${keys.length} keys`);
      // Show first few examples
      keys.slice(0, 3).forEach(key => console.log(`  - ${key}`));
      if (keys.length > 3) console.log(`  ... and ${keys.length - 3} more`);
      console.log();
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redis.quit();
  }
}

listAllKeys();