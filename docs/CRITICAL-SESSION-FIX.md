# CRITICAL: Pulse Session Persistence Fix

## The Problem
Sessions are being lost on every restart because:
1. Encryption keys are not properly set in `.env`
2. Default/example keys are being used
3. Keys change between restarts
4. Redis might not have persistence enabled

## The Solution

### Run This Command on Your Server NOW:
```bash
cd /opt/pulse
sudo bash scripts/fix-session-persistence-permanent.sh
```

This script will:
1. Generate secure encryption keys (if not already set)
2. Update your `.env` file
3. Enable Redis persistence
4. Clean up old corrupted sessions
5. Create a backup of your configuration
6. Set proper file permissions

### After Running the Script:
```bash
pulse restart
```

## What Will Happen
1. All users will need to re-link their accounts ONE TIME
2. Sessions will persist after future restarts
3. No more "Decryption failed" errors

## CRITICAL WARNINGS
- **NEVER** change the encryption keys once they're set
- **ALWAYS** keep your `.env.backup.*` file safe
- **ENSURE** Redis persistence stays enabled

## Verify It's Working
After users re-link:
1. Send "balance" - it should work
2. Restart Pulse: `pulse restart`
3. Send "balance" again - it should STILL work without re-linking

## Emergency Rollback
If something goes wrong:
```bash
# Restore from backup
cp /opt/pulse/.env.backup.* /opt/pulse/.env
pulse restart
```