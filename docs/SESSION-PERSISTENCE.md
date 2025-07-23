# Session Persistence Guide

This guide helps you fix session persistence issues when restarting Pulse.

## Problem

When you restart Pulse, you may encounter:
1. Sessions are lost and users need to re-link their accounts
2. Redis decryption errors in the logs
3. ElevenLabs 401 authentication errors

## Solution

### 1. Generate and Set Encryption Keys

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

**IMPORTANT**: 
- Keep these keys secure
- Never change them once set (or you'll lose access to existing sessions)
- Back them up safely

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

### Still Getting Decryption Errors?

If you changed the encryption keys after users already linked:
1. Users will need to re-link their accounts once
2. Future restarts will work properly

### ElevenLabs Still Failing?

The system will automatically fall back to Google Cloud TTS or the free TTS API. To completely disable ElevenLabs, remove the API key from your `.env` file.

### Sessions Still Lost?

Check that your Redis instance is persistent:
```bash
redis-cli CONFIG GET save
```

Should show periodic saves are enabled.