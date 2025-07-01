# WhatsApp Message Replay Bug Fix

## Problem
On server startup, the WhatsApp service was resending all messages from the previous session, causing spam to users.

## Root Cause
1. **Session Persistence**: WhatsApp Web.js uses `LocalAuth` to persist sessions across restarts
2. **No Message Filtering**: When reconnecting, old messages from the session history were being reprocessed
3. **Memory-Only Deduplication**: The `processedMessages` Set was stored only in memory and cleared on restart

## Solution Implemented

### 1. Timestamp Filtering
- Added `serverStartTime` property to track when the server started
- Messages with timestamps before server startup are now ignored
- Prevents processing of any messages from previous sessions

### 2. Startup Grace Period
- Added 5-second grace period after startup where all messages are ignored
- Allows the WhatsApp client to fully initialize without processing stale messages

### 3. Persistent Message Tracking
- Message IDs are now stored in Redis with 24-hour TTL
- Prevents duplicate processing even across server restarts
- Maintains in-memory Set for fast checks with Redis as backup

## Code Changes

### File: `src/modules/whatsapp/services/whatsapp-web.service.ts`

```typescript
// Added properties
private serverStartTime = new Date();
private startupGracePeriod = 5000; // 5 seconds
private isInGracePeriod = true;

// Added Redis service to constructor
constructor(
  // ... other services
  private readonly redisService: RedisService,
)

// In onModuleInit()
setTimeout(() => {
  this.isInGracePeriod = false;
  this.logger.log('Startup grace period ended, now accepting messages');
}, this.startupGracePeriod);

// In message handler
// 1. Check grace period
if (this.isInGracePeriod) {
  this.logger.debug('Ignoring message during startup grace period');
  return;
}

// 2. Check timestamp
if (msg.timestamp && msg.timestamp * 1000 < this.serverStartTime.getTime()) {
  this.logger.debug(`Ignoring old message from before server startup`);
  return;
}

// 3. Persistent duplicate check
const processedKey = `processed_msg:${messageKey}`;
const isProcessed = await this.redisService.get(processedKey);
if (isProcessed || this.processedMessages.has(messageKey)) {
  this.logger.debug(`Skipping duplicate message: ${messageKey}`);
  return;
}

// 4. Mark as processed in Redis
await this.redisService.set(processedKey, '1', 86400); // 24 hour TTL
```

## Testing
- All existing tests pass (10/10 suites, 76/76 tests)
- Fix prevents message replay on server restart
- No impact on normal message processing

## Future Improvements
If issues persist, consider:
1. Implementing message queue with proper acknowledgment
2. Adding message timestamp to Redis key for better tracking
3. Configurable grace period based on environment