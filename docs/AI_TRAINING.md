# AI Training Guide for Flash WhatsApp Bot

## Overview
The Flash WhatsApp bot uses Google's Gemini AI with a comprehensive knowledge base to provide accurate, helpful responses to user queries.

## How AI Training Works

### 1. Knowledge Base Structure
The AI knowledge base is located at: `src/modules/gemini-ai/training/flash-knowledge-base.ts`

It contains:
- **Command definitions**: Detailed info about each available command
- **Training examples**: Q&A pairs for common queries
- **Conversation context**: Personality, tone, and rules
- **Error responses**: Standardized error messages

### 2. AI Response Process
1. User sends a message (not a command)
2. System checks for AI consent
3. Relevant training examples are found based on keywords
4. A comprehensive prompt is built with:
   - User context (authenticated, phone, last command)
   - Available commands with usage
   - Relevant Q&A examples
   - Common mistakes to watch for
   - Error message templates
5. Gemini AI generates a response
6. Response is cached for 1 hour

### 3. Adding Training Examples

#### Using the Management Script
```bash
# Add a new training example interactively
npm run ts-node scripts/manage-ai-training.ts add

# Test what examples match a query
npm run ts-node scripts/manage-ai-training.ts test

# List all training examples
npm run ts-node scripts/manage-ai-training.ts list
```

#### Manual Addition
Add to `TRAINING_EXAMPLES` in `flash-knowledge-base.ts`:
```typescript
{
  question: 'How do I send money to someone?',
  answer: 'To send money, you need to use the Flash mobile app. Open the app, tap "Send", enter the recipient\'s username or scan their QR code, enter the amount, and confirm.',
  category: 'payments',
  keywords: ['send', 'money', 'payment', 'transfer']
}
```

### 4. Training Best Practices

#### Categories
- `balance`: Balance checking, refresh
- `receive`: Creating invoices, receiving payments
- `linking`: Account connection/disconnection
- `username`: Username management
- `general`: General Flash info
- `security`: Security questions
- `support`: Support/help queries
- `troubleshooting`: Error resolution
- `payments`: Sending money (app-only)

#### Writing Good Examples
1. **Be specific**: Address exact user concerns
2. **Include commands**: Show command syntax when relevant
3. **Add examples**: "receive 10" is clearer than "receive [amount]"
4. **Consider auth state**: Remind about linking when needed
5. **Use friendly tone**: Match the Caribbean-friendly style

#### Keywords Selection
- Include variations: "balance", "funds", "money"
- Add common misspellings: "recieve", "balanc"
- Include related terms: "invoice" for "receive"

### 5. Testing AI Responses

#### Quick Test
```bash
# Test a specific query
npm run ts-node scripts/manage-ai-training.ts test
# Enter: "how do I receive bitcoin?"
```

#### Live Testing
1. Start the dev server: `npm run start:dev`
2. Send test messages via WhatsApp
3. Check logs for AI processing

### 6. Common Issues to Address

#### Current Limitations
- **Receive command**: USD only, no BTC
- **Payments**: App-only, not via WhatsApp
- **Username**: One-time setting only
- **Memo limit**: 200 characters max

#### Frequent User Mistakes
1. Trying to receive BTC amounts
2. Long memos exceeding 200 chars
3. Using commands without linking
4. Expecting send functionality

### 7. Improving Accuracy

#### Monitor User Queries
1. Check logs for unmatched queries
2. Add training examples for common questions
3. Update command notes for clarity

#### Update Context
- Keep command list current
- Update error messages
- Refine personality/tone guidelines

#### Cache Management
- AI responses cached for 1 hour
- Clear cache after major updates:
  ```bash
  redis-cli DEL "ai:query:*"
  ```

### 8. Example Training Session

```bash
# 1. User asks about receiving payments
User: "how can someone pay me?"

# 2. AI finds relevant examples:
- "How do I receive money?"
- "Can I receive Bitcoin directly?"

# 3. AI responds with:
"To receive money, use the 'receive' command followed by the amount in USD. 
For example: 'receive 10' creates an invoice for $10. You can add an optional 
memo: 'receive 10 Coffee payment'. Note: Only USD amounts are supported, not BTC."
```

### 9. Maintenance Schedule
- **Weekly**: Review user queries, add missing examples
- **Monthly**: Update command descriptions, refine responses
- **Quarterly**: Major knowledge base review

### 10. Emergency Fallbacks
If Gemini AI is unavailable, the system uses:
1. Keyword-based matching from training examples
2. Command-specific responses
3. Generic helpful messages

## Tips for Continuous Improvement
1. Log analysis: Look for "No matching examples" in logs
2. User feedback: Track confused/repeat questions
3. A/B testing: Try different answer formats
4. Regional adaptation: Add more Caribbean context
5. Command updates: Keep sync with new features