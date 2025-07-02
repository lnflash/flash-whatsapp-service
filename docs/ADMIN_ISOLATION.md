# Admin Panel Isolation Architecture

This document describes how the admin panel is isolated from the core Pulse bot functionality to prevent admin bugs from affecting bot operations.

## Overview

The admin panel uses multiple layers of isolation to ensure that bugs, errors, or malicious actions in the admin panel cannot disrupt the core bot functionality.

## Isolation Layers

### 1. Service Facades
- **AdminFacadeService**: Acts as a boundary between admin operations and core services
- All admin operations go through facades that:
  - Validate inputs
  - Add timeouts to prevent hanging operations
  - Return copies of data to prevent modification
  - Log all operations for audit trails

### 2. Exception Isolation
- **AdminExceptionFilter**: Catches all admin panel exceptions
- Admin errors are:
  - Logged separately from bot errors
  - Sanitized before returning to client
  - Never propagated to core bot error handlers

### 3. Rate Limiting
- **AdminRateLimitGuard**: Prevents admin abuse
- Protects against:
  - Announcement spam (5 per 5 minutes)
  - Mass session clearing (1 per hour)
  - Command flooding (50 per 5 minutes)
- Rate limits are configurable per endpoint

### 4. Circuit Breakers
- **@WithCircuitBreaker**: Protects critical operations
- Circuit breakers:
  - Open after repeated failures
  - Prevent cascading failures
  - Auto-reset after cooldown period
  - Have configurable thresholds

### 5. Resource Isolation
- Admin operations have:
  - Timeout limits (30 seconds default)
  - Bulk operation limits (100 recipients max)
  - Message length limits (1000 chars)
  - Batch processing with delays

## Implementation Details

### Admin Facade Example
```typescript
async sendAdminMessage(to: string, message: string): Promise<void> {
  // Validate recipient
  if (!await this.validateRecipient(to)) {
    throw new Error('Invalid recipient');
  }

  // Add timeout protection
  await Promise.race([
    this.whatsappWebService.sendMessage(to, message),
    timeoutPromise
  ]);
}
```

### Rate Limiting Example
```typescript
@Post('announcement')
@RateLimit(5, 300000) // 5 per 5 minutes
async sendAnnouncement() {
  // Rate limited endpoint
}
```

### Circuit Breaker Example
```typescript
@WithCircuitBreaker({ 
  failureThreshold: 3, 
  resetTimeout: 300000 
})
async sendAnnouncement() {
  // Protected by circuit breaker
}
```

## Monitoring

### Health Checks
The AdminHealthService provides:
- Isolation mechanism status
- Service connectivity checks
- Error metrics (24h)
- Rate limit hit counts
- Circuit breaker trip counts

### Audit Logging
All admin operations are logged:
- Action performed
- Admin user
- Timestamp
- Operation data
- Stored in Redis with rotation

## Configuration

See `admin-isolation.config.ts` for:
- Rate limit settings
- Circuit breaker thresholds
- Operation limits
- Timeout values
- Audit settings

## Testing

Run isolation tests:
```bash
# Test error isolation
npm run test:admin:isolation

# Test rate limiting
npm run test:admin:ratelimit

# Test circuit breakers
npm run test:admin:circuit
```

## Best Practices

1. **Always use facades** for admin operations
2. **Never bypass rate limits** in production
3. **Monitor circuit breaker trips** - they indicate problems
4. **Review audit logs** regularly
5. **Test isolation** after major changes

## Emergency Procedures

If admin panel affects bot:
1. Circuit breakers will automatically isolate failing operations
2. Rate limits prevent resource exhaustion
3. Admin errors are contained by exception filter
4. As last resort, disable admin module in app.module.ts

## Future Improvements

1. Separate Redis database for admin operations
2. Separate event bus for admin events
3. Resource quotas for admin operations
4. Automated isolation testing
5. Real-time monitoring dashboard