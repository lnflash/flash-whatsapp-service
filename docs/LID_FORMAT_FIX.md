# @lid Format WhatsApp ID Fix

## Issue
Users with @lid format WhatsApp IDs who had successfully linked their accounts were being prompted to link again when messaging in groups. The bot would show the error: "Your WhatsApp account uses a special ID format that cannot be linked to Flash."

## Root Cause
The `handleLinkCommand` method was checking if the WhatsApp ID contained '@lid' and blocking the link attempt BEFORE checking if the user already had an existing linked session. This meant that even users who were already linked would see the error message when the bot attempted to process a link command.

## Fix
Modified the `handleLinkCommand` method in `whatsapp.service.ts` to:
1. First check if the user already has a linked session
2. If they do, return "Your Flash account is already linked"
3. Only check for @lid format and block NEW link attempts if no existing session is found

## Code Change
```typescript
// Before: @lid check happened first
private async handleLinkCommand(whatsappId: string, phoneNumber: string): Promise<string> {
  try {
    // Check if this is an @lid format user
    if (whatsappId.includes('@lid')) {
      return `⚠️ *Unable to Link Account*...`;
    }
    // ... rest of linking logic
  }
}

// After: Check for existing session first
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

## Impact
- Users with @lid format IDs who have already linked their accounts will no longer see the error message
- The bot will correctly recognize their existing session in both DMs and groups
- New @lid format users will still be prevented from linking (as intended for privacy reasons)

## Testing
1. Link an account successfully in DM
2. Message the bot in a group with the same account
3. Confirm the bot recognizes the linked account and responds normally
4. Verify that new @lid format users still cannot link