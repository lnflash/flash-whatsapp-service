# @lid Format WhatsApp ID Fix

## Issue
Users with @lid format WhatsApp IDs who had successfully linked their accounts were being prompted to link again when messaging in groups. The bot would show the error: "Your WhatsApp account uses a special ID format that cannot be linked to Flash."

## Root Cause
The issue had two parts:
1. The `handleLinkCommand` method was checking if the WhatsApp ID contained '@lid' and blocking the link attempt BEFORE checking if the user already had an existing linked session.
2. When users link their account in DM, their session is stored with one WhatsApp ID format (e.g., `18765551234@c.us`), but when they message in groups, their ID might be in a different format (e.g., `18765551234@lid`). The session lookup was not finding the existing session due to this format mismatch.

## Fix
### Part 1: Order of Operations Fix
Modified the `handleLinkCommand` method in `whatsapp.service.ts` to:
1. First check if the user already has a linked session
2. If they do, return "Your Flash account is already linked"
3. Only check for @lid format and block NEW link attempts if no existing session is found

### Part 2: Session Lookup Enhancement
Modified the `getSessionByWhatsappId` method in `session.service.ts` to handle multiple WhatsApp ID formats:
1. First try to find session with the provided WhatsApp ID
2. If not found and the ID is in @lid format, extract the phone number and try alternative formats:
   - Try with @c.us format (most common)
   - Try with @s.whatsapp.net format (fallback)

## Code Changes

### whatsapp.service.ts
```typescript
// Check for existing session first
private async handleLinkCommand(whatsappId: string, phoneNumber: string): Promise<string> {
  try {
    // First check if user already has a linked session
    const existingSession = await this.sessionService.getSessionByWhatsappId(whatsappId);
    if (existingSession) {
      return 'Your Flash account is already linked.';
    }

    // Check if this is an @lid format user
    if (whatsappId.includes('@lid')) {
      return `⚠️ *Unable to Link Account*...`;
    }
    // ... rest of linking logic
  }
}
```

### session.service.ts
```typescript
async getSessionByWhatsappId(whatsappId: string): Promise<UserSession | null> {
  try {
    const whatsappKey = this.redisService.hashKey('whatsapp', whatsappId);
    let sessionId = await this.redisService.get(whatsappKey);

    // If no session found and this is an @lid format, try alternative formats
    if (!sessionId && whatsappId.includes('@lid')) {
      this.logger.debug(`No session found for @lid format: ${whatsappId}, trying alternatives...`);
      
      // Try @c.us format
      const phoneNumber = whatsappId.replace('@lid', '');
      const alternativeId1 = `${phoneNumber}@c.us`;
      const altKey1 = this.redisService.hashKey('whatsapp', alternativeId1);
      sessionId = await this.redisService.get(altKey1);
      
      if (sessionId) {
        this.logger.debug(`Found session with @c.us format: ${alternativeId1}`);
      } else {
        // Try @s.whatsapp.net format
        const alternativeId2 = `${phoneNumber}@s.whatsapp.net`;
        const altKey2 = this.redisService.hashKey('whatsapp', alternativeId2);
        sessionId = await this.redisService.get(altKey2);
        
        if (sessionId) {
          this.logger.debug(`Found session with @s.whatsapp.net format: ${alternativeId2}`);
        }
      }
    }

    if (!sessionId) {
      return null;
    }

    return this.getSession(sessionId);
  } catch (error) {
    this.logger.error(`Error getting session by WhatsApp ID: ${error.message}`, error.stack);
    return null;
  }
}
```

## Impact
- Users with @lid format IDs who have already linked their accounts will be recognized in both DMs and groups
- The bot correctly handles different WhatsApp ID formats for the same user
- New @lid format users will still be prevented from linking (as intended for privacy reasons)
- No changes needed to existing sessions - the lookup logic handles the format conversion transparently

## Testing
1. Link an account successfully in DM (creates session with @c.us format)
2. Message the bot in a group with the same account (uses @lid format)
3. Confirm the bot recognizes the linked account and responds normally
4. Verify that new @lid format users still cannot link
5. Unit test added to verify @lid to @c.us format conversion works correctly