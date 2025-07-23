# Session Persistence Guide

This guide helps you fix session persistence issues when restarting Pulse.

## Problem

When you restart Pulse, you may encounter:
1. Sessions are lost and users need to re-link their accounts
2. Redis decryption errors in the logs
3. ElevenLabs 401 authentication errors

## Root Cause

Sessions are lost because of THREE critical issues:

1. **Redis is not persisting data**: By default, Redis runs in memory-only mode
2. **HASH_SALT is not set**: WhatsApp IDs are hashed for privacy, and if the salt changes, the hashes don't match
3. **ENCRYPTION_KEY is not set**: Session data is encrypted, and changing keys makes old sessions unreadable

## Solution

### 1. Fix Redis Persistence (MOST IMPORTANT)

First, check if Redis has persistence enabled:

```bash
node scripts/fix-redis-persistence.js
```

If Redis persistence is NOT enabled, fix it immediately:

```bash
# On your server, run:
redis-cli CONFIG SET save "900 1 300 10 60 10000"
redis-cli BGSAVE

# For permanent fix:
echo 'save 900 1' >> /etc/redis/redis.conf
echo 'save 300 10' >> /etc/redis/redis.conf  
echo 'save 60 10000' >> /etc/redis/redis.conf
sudo systemctl restart redis
```

### 2. Generate and Set Encryption Keys

First, generate secure encryption keys:

```bash
node scripts/generate-encryption-keys.js
```

This will output encryption keys. Add them to your `.env` file:

```env
# Security Configuration
ENCRYPTION_KEY=<your-generated-key>
ENCRYPTION_SALT=<your-generated-salt>
HASH_SALT=<your-generated-hash-salt>
JWT_SECRET=<your-generated-jwt-secret>
SESSION_SECRET=<your-generated-session-secret>
WEBHOOK_SECRET=<your-generated-webhook-secret>
```

**CRITICAL**: 
- **HASH_SALT** is especially important - it's used to hash WhatsApp IDs
- Keep ALL these keys secure and consistent
- Never change them once set (or you'll lose access to existing sessions)
- Back them up safely
- Make sure they're set BEFORE users link their accounts

### 2. Fix ElevenLabs Authentication

If you're seeing ElevenLabs 401 errors, either:

**Option A: Disable ElevenLabs** (if you don't have an API key)
```env
ELEVENLABS_API_KEY=
```

**Option B: Set a valid API key**
1. Sign up at https://elevenlabs.io
2. Get your API key from profile settings
3. Add to `.env`:
```env
ELEVENLABS_API_KEY=your-actual-api-key
```

### 3. Restart Pulse Properly

After setting up the environment:

```bash
# On the server
sudo -u pulse git pull
npm run build
pulse restart
```

### 4. Verify Sessions Persist

1. Link your account: send "link" to Pulse
2. Check balance: send "balance"
3. Restart Pulse: `pulse restart`
4. Check balance again - it should work without re-linking

## Troubleshooting

### Sessions STILL Being Lost After Following Above Steps?

Run the diagnostic script to identify the exact issue:

```bash
node scripts/fix-redis-persistence.js
node scripts/debug-sessions.js 18764250250@c.us
```

Common causes:
1. **Redis is restarting without saving**: Check Redis logs
2. **Redis data directory is being wiped**: Check `/var/lib/redis/` permissions
3. **Docker/Container setup**: Ensure Redis data volume is mounted persistently
4. **Multiple Redis instances**: Ensure Pulse connects to the same Redis instance

### Getting "Decryption failed" Errors?

If you see errors like:
```
ERROR [RedisService] Error: Decryption failed: Unsupported state or unable to authenticate data
```

This means you have old sessions encrypted with different keys. Clean them up:

```bash
# Interactive cleanup (recommended)
node scripts/cleanup-old-sessions.js

# Force cleanup without confirmation
node scripts/cleanup-old-sessions.js --force

# Also clean cache entries
node scripts/cleanup-old-sessions.js --force --include-cache
```

After cleanup, users will need to re-link their accounts ONE TIME.

### Still Getting Decryption Errors?

If you changed the encryption keys after users already linked:
1. Users will need to re-link their accounts once
2. Future restarts will work properly

### ElevenLabs Still Failing?

The system will automatically fall back to Google Cloud TTS or the free TTS API. To completely disable ElevenLabs, remove the API key from your `.env` file.

## Quick Checklist

Before reporting session loss issues, verify:

- [ ] Redis persistence is enabled: `redis-cli CONFIG GET save` shows save rules
- [ ] HASH_SALT is set in `.env` and matches across restarts
- [ ] ENCRYPTION_KEY is set in `.env` and matches across restarts  
- [ ] Redis data directory exists and has proper permissions
- [ ] Redis actually saves data: `redis-cli LASTSAVE` shows recent timestamp
- [ ] No Redis data wipes on restart (check your deployment scripts)