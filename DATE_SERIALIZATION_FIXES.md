# Date Serialization Fixes

## Overview
When caching objects with Date fields in Redis using JSON serialization, Date objects are converted to strings and need to be converted back when retrieved.

## Issues Fixed

### 1. PriceService
- **File**: `/src/modules/flash-api/services/price.service.ts`
- **Issue**: The `PriceInfo.timestamp` field was returned as a string from cache
- **Fix**: Added conversion in `getCachedPrice()` to convert timestamp back to Date object
- **Impact**: Prevented `timestamp.getTime is not a function` error in group price commands

### 2. SessionService
- **File**: `/src/modules/auth/services/session.service.ts`
- **Issue**: Multiple Date fields in `UserSession` were returned as strings from Redis
- **Fix**: Added `deserializeSession()` method to convert all date fields back to Date objects
- **Fields affected**: `createdAt`, `updatedAt`, `expiresAt`, `lastActivityAt`
- **Impact**: Prevents potential runtime errors when code expects Date methods

## Best Practices

### When to Use Date Objects vs Strings

1. **Use Date objects** when:
   - You need to perform date calculations
   - You need to call Date methods (getTime(), toISOString(), etc.)
   - The field is used internally and not exposed in APIs

2. **Use ISO date strings** when:
   - The data is exposed in APIs
   - You want consistent JSON serialization
   - You don't need Date object methods

### Examples in Codebase

**Good Practice - Using strings:**
- `PendingPaymentService`: Uses ISO strings for all date fields
- `GroupService`: Uses strings for `createdAt` and `lastActivity`

**Requires Care - Using Date objects:**
- `PriceService`: Uses Date for timestamp calculations
- `SessionService`: Uses Date for session expiry checks

## Future Considerations

1. Consider creating a custom Redis service layer that automatically handles Date serialization/deserialization
2. Use a schema validation library (like class-transformer) to automatically handle type conversions
3. Document which fields should be Date objects vs strings in interfaces