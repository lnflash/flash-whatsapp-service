#!/usr/bin/env node

const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

async function checkAndFixRedis() {
  console.log('=== Redis Persistence Checker & Fixer ===\n');

  try {
    // 1. Check current Redis persistence settings
    console.log('1. Current Redis Persistence Settings:');
    const [saveInfo, aofInfo, dirInfo] = await Promise.all([
      redis.config('GET', 'save'),
      redis.config('GET', 'appendonly'), 
      redis.config('GET', 'dir'),
    ]);

    console.log(`   RDB Save: ${saveInfo[1] || '(empty - persistence disabled)'}`);
    console.log(`   AOF Enabled: ${aofInfo[1]}`);
    console.log(`   Data Directory: ${dirInfo[1]}`);
    console.log();

    // 2. Check if we need to enable persistence
    const needsFix = !saveInfo[1] || saveInfo[1] === '';
    
    if (needsFix) {
      console.log('2. ⚠️  Redis persistence is NOT configured!');
      console.log('   Sessions will be lost on Redis restart.\n');
      
      console.log('3. Attempting to enable RDB persistence...');
      try {
        // Enable RDB with reasonable save intervals
        await redis.config('SET', 'save', '900 1 300 10 60 10000');
        console.log('   ✓ RDB persistence enabled with:');
        console.log('     - Save after 900 sec if at least 1 key changed');
        console.log('     - Save after 300 sec if at least 10 keys changed');
        console.log('     - Save after 60 sec if at least 10000 keys changed');
        
        // Force a save now
        await redis.bgsave();
        console.log('   ✓ Background save initiated');
      } catch (error) {
        console.log('   ✗ Failed to enable persistence via CONFIG SET');
        console.log(`   Error: ${error.message}`);
        console.log('\n   This might be because:');
        console.log('   - Redis is running with protected mode');
        console.log('   - CONFIG commands are disabled');
        console.log('   - You need to modify redis.conf directly');
      }
    } else {
      console.log('2. ✓ Redis persistence is already configured');
      console.log(`   Current settings: ${saveInfo[1]}`);
    }

    // 4. Check last save time
    console.log('\n4. Last Save Information:');
    const lastSaveTime = await redis.lastsave();
    const lastSaveDate = new Date(lastSaveTime * 1000);
    console.log(`   Last save: ${lastSaveDate.toISOString()}`);
    console.log(`   (${Math.floor((Date.now() - lastSaveDate) / 1000 / 60)} minutes ago)`);

    // 5. Create systemd service file for Redis persistence
    console.log('\n5. Redis Systemd Configuration:');
    const redisServiceContent = `[Unit]
Description=Redis In-Memory Data Store
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis.conf
ExecStop=/usr/bin/redis-cli shutdown
TimeoutStopSec=0
Restart=always
User=redis
Group=redis
RuntimeDirectory=redis
RuntimeDirectoryMode=0755

# Important: Save data on shutdown
ExecStop=/usr/bin/redis-cli BGSAVE

[Install]
WantedBy=multi-user.target
`;

    const serviceFilePath = '/tmp/redis-persistent.service';
    fs.writeFileSync(serviceFilePath, redisServiceContent);
    console.log(`   ✓ Systemd service file created at: ${serviceFilePath}`);
    console.log('   To use it:');
    console.log('   sudo cp /tmp/redis-persistent.service /etc/systemd/system/redis.service');
    console.log('   sudo systemctl daemon-reload');
    console.log('   sudo systemctl restart redis');

    // 6. Create Redis configuration snippet
    console.log('\n6. Redis Configuration Snippet:');
    const redisConfSnippet = `# Redis Persistence Configuration for Pulse
# Add this to your redis.conf or /etc/redis/redis.conf

# Enable RDB persistence
save 900 1      # Save after 900 sec if at least 1 key changed
save 300 10     # Save after 300 sec if at least 10 keys changed  
save 60 10000   # Save after 60 sec if at least 10000 keys changed

# RDB file settings
dbfilename dump.rdb
dir /var/lib/redis

# Optional: Enable AOF for better durability
# appendonly yes
# appendfilename "appendonly.aof"
# appendfsync everysec

# Ensure data is saved on shutdown
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
`;

    const confPath = '/tmp/redis-persistence.conf';
    fs.writeFileSync(confPath, redisConfSnippet);
    console.log(`   ✓ Configuration snippet saved to: ${confPath}`);
    console.log('   To apply:');
    console.log('   sudo cat /tmp/redis-persistence.conf >> /etc/redis/redis.conf');
    console.log('   sudo systemctl restart redis');

    // 7. Test session persistence
    console.log('\n7. Testing Session Persistence:');
    const testKey = 'test:persistence:' + Date.now();
    const testValue = 'This should persist across restarts';
    
    await redis.set(testKey, testValue);
    console.log(`   ✓ Test key created: ${testKey}`);
    
    // Force a save
    await redis.bgsave();
    console.log('   ✓ Forced background save');
    
    // Verify
    const retrieved = await redis.get(testKey);
    console.log(`   ✓ Test key verified: ${retrieved === testValue ? 'Success' : 'Failed'}`);
    
    // Clean up
    await redis.del(testKey);

    // 8. Summary and recommendations
    console.log('\n=== Summary & Recommendations ===');
    if (needsFix) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log('1. Redis persistence is NOT enabled on your server');
      console.log('2. Sessions are being lost when Redis restarts');
      console.log('3. To fix this permanently, run these commands on your server:');
      console.log();
      console.log('   # Option 1: Quick fix (if Redis allows CONFIG commands)');
      console.log('   redis-cli CONFIG SET save "900 1 300 10 60 10000"');
      console.log('   redis-cli BGSAVE');
      console.log();
      console.log('   # Option 2: Permanent fix (recommended)');
      console.log('   sudo cat /tmp/redis-persistence.conf >> /etc/redis/redis.conf');
      console.log('   sudo systemctl restart redis');
      console.log();
      console.log('4. After fixing Redis persistence, users will need to re-link ONE MORE TIME');
      console.log('5. After that, sessions will persist across all restarts');
    } else {
      console.log('\n✓ Redis persistence is properly configured');
      console.log('✓ Sessions should persist across Redis restarts');
      console.log();
      console.log('If sessions are still being lost, check:');
      console.log('1. HASH_SALT environment variable is consistent');
      console.log('2. ENCRYPTION_KEY environment variable is consistent');
      console.log('3. Redis data directory has proper permissions');
      console.log('4. Redis is not being completely wiped on restart');
    }

  } catch (error) {
    console.error('Error checking Redis:', error);
  } finally {
    await redis.quit();
  }
}

checkAndFixRedis().catch(console.error);