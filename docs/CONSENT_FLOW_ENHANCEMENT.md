# Consent Flow Enhancement

## Overview
Enhanced the consent flow to remember and answer user questions after consent is given, improving user experience by not requiring users to repeat their questions.

## Previous Behavior
1. User asks a question requiring AI assistance
2. Bot requests consent
3. User provides consent
4. Bot says "Thank you" but doesn't answer the original question
5. User must repeat their question

## New Behavior
1. User asks a question requiring AI assistance
2. Bot stores the question and requests consent
3. User provides consent
4. Bot thanks the user AND answers their original question immediately

## Implementation Details

### 1. Question Storage
When a user asks a question before giving consent:
```typescript
// In handleAiQuery()
if (!session.consentGiven) {
  // Store the pending question for after consent is given
  const normalizedWhatsappId = session.whatsappId.replace('+', '');
  const pendingQuestionKey = `pending_ai_question:${normalizedWhatsappId}`;
  await this.redisService.set(pendingQuestionKey, query, 300); // 5 minute expiry
  
  return 'Hi There! I would love to chat with you more...';
}
```

### 2. Question Retrieval and Answer
When user gives consent:
```typescript
// In handleConsentCommand()
if (choice === 'yes') {
  await this.authService.recordConsent(session.sessionId, true);
  
  // Check if there's a pending AI question
  const pendingQuestionKey = `pending_ai_question:${whatsappId}`;
  const pendingQuestion = await this.redisService.get(pendingQuestionKey);
  
  if (pendingQuestion) {
    // Clear the pending question
    await this.redisService.del(pendingQuestionKey);
    
    // Update session to reflect consent given
    session.consentGiven = true;
    
    // Answer the pending question
    const aiResponse = await this.handleAiQuery(pendingQuestion, session);
    return `Thank you for providing your consent! 🎉\n\nNow, regarding your question: "${pendingQuestion}"\n\n${aiResponse}`;
  }
}
```

### 3. Cleanup on Decline
If user declines consent, any pending question is cleared:
```typescript
if (choice === 'no') {
  await this.authService.recordConsent(session.sessionId, false);
  
  // Clear any pending question since user declined consent
  const pendingQuestionKey = `pending_ai_question:${whatsappId}`;
  await this.redisService.del(pendingQuestionKey);
}
```

## Key Features

1. **Automatic Question Storage**: Questions are automatically stored in Redis with a 5-minute TTL
2. **Seamless Experience**: Users get their answer immediately after consent without repeating
3. **Clean State Management**: Questions are cleared after being answered or if consent is declined
4. **Error Handling**: If answering fails, user still gets consent confirmation with a friendly error message

## Example Flow

### User Experience:
```
User: "What is Bitcoin?"
Bot: "Hi There! I would love to chat with you more, but first I need you to give your consent to talking to an AI bot. To use AI-powered support, please provide your consent by typing 'consent yes'."
User: "consent yes"
Bot: "Thank you for providing your consent! 🎉

Now, regarding your question: 'What is Bitcoin?'

[AI response about Bitcoin follows...]"
```

## Technical Notes

- WhatsApp IDs are normalized (+ sign removed) for consistent Redis key formatting
- Pending questions expire after 5 minutes to prevent stale data
- The implementation handles edge cases like no pending question or AI errors gracefully
- All existing tests pass and the feature is fully backward compatible