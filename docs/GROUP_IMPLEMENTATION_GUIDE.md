# Group Chat Implementation Guide

## Quick Start: Enabling Group Chat Support

### 1. Update Message Handler

Currently, the bot ignores group messages. To enable group support:

```typescript
// In whatsapp-web.service.ts, modify the message handler:

// Current (ignores groups):
if (!msg.from.endsWith('@c.us')) {
  return;
}

// New (accepts groups):
const isGroup = msg.from.endsWith('@g.us');
const isPrivate = msg.from.endsWith('@c.us');

if (!isGroup && !isPrivate) {
  return;
}
```

### 2. Detect Group Context

```typescript
interface MessageContext {
  isGroup: boolean;
  groupId?: string;
  senderId: string;
  mentions: string[];
}

private getMessageContext(msg: Message): MessageContext {
  const isGroup = msg.from.endsWith('@g.us');
  
  return {
    isGroup,
    groupId: isGroup ? msg.from : undefined,
    senderId: isGroup ? msg.author : msg.from,
    mentions: msg.mentionedIds || [],
  };
}
```

### 3. Handle @Mentions

```typescript
private parseMentions(text: string): string[] {
  const mentionPattern = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionPattern.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  return mentions;
}
```

### 4. Group-Specific Commands

Add group detection to command processing:

```typescript
private async handleCommand(
  command: ParsedCommand,
  whatsappId: string,
  phoneNumber: string,
  session: UserSession | null,
  context?: MessageContext,
): Promise<string | { text: string; media?: Buffer }> {
  // Check if command is group-only
  if (this.isGroupOnlyCommand(command.type) && !context?.isGroup) {
    return 'This command only works in group chats.';
  }
  
  // Route to appropriate handler
  if (context?.isGroup) {
    return this.handleGroupCommand(command, context, session);
  }
  
  // ... existing command handling
}
```

### 5. Store Group Data

```typescript
interface GroupInfo {
  groupId: string;
  name: string;
  members: string[];
  admins: string[];
  features: {
    anonymousPayments: boolean;
    paymentGames: boolean;
    expenseSplitting: boolean;
  };
  createdAt: string;
  lastActivity: string;
}

private async getOrCreateGroup(groupId: string): Promise<GroupInfo> {
  const key = `group:${groupId}`;
  const existing = await this.redisService.get(key);
  
  if (existing) {
    return JSON.parse(existing);
  }
  
  // Create new group
  const groupInfo: GroupInfo = {
    groupId,
    name: await this.getGroupName(groupId),
    members: await this.getGroupMembers(groupId),
    admins: await this.getGroupAdmins(groupId),
    features: {
      anonymousPayments: true,
      paymentGames: true,
      expenseSplitting: true,
    },
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };
  
  await this.redisService.set(key, JSON.stringify(groupInfo));
  return groupInfo;
}
```

### 6. Group Member Management

```typescript
private async getGroupMembers(groupId: string): Promise<string[]> {
  const chat = await this.client.getChatById(groupId);
  if (chat.isGroup) {
    const participants = await chat.participants;
    return participants.map(p => p.id._serialized);
  }
  return [];
}

private async isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  const chat = await this.client.getChatById(groupId);
  if (chat.isGroup) {
    const participant = await chat.participants.find(p => p.id._serialized === userId);
    return participant?.isAdmin || false;
  }
  return false;
}
```

## Example: Anonymous Payment Implementation

```typescript
private async handleAnonymousRequest(
  amount: number,
  reason: string,
  groupId: string,
  requesterId: string,
): Promise<string> {
  // Generate anonymous ID
  const anonId = this.generateAnonId();
  
  // Create invoice
  const invoice = await this.invoiceService.createInvoice(
    this.botAuthToken, // Bot creates invoice
    amount,
    `Anonymous request: ${reason}`,
  );
  
  // Store anonymous request
  const requestKey = `anon_request:${invoice.paymentHash}`;
  await this.redisService.set(requestKey, JSON.stringify({
    groupId,
    requesterId,
    amount,
    reason,
    created: new Date().toISOString(),
    contributors: [],
  }), 3600); // 1 hour expiry
  
  // Send to group
  return `🎭 Anonymous payment request

Amount: $${amount}
Reason: ${reason}

To contribute anonymously, DM me with:
/pay ${invoice.paymentHash}

Contributors: 0`;
}
```

## Testing Group Features

### 1. Create Test Group
- Add bot to a WhatsApp group
- Add at least 2 other members

### 2. Test Basic Commands
```
Bot: /help
Bot: [Shows group-specific commands]

User: /split 30
Bot: Splitting $30 among 3 members...
```

### 3. Test Mentions
```
User: /request 10 from @john
Bot: Payment request sent to @john for $10
```

### 4. Test Admin Features
```
Admin: /settings anonymous_payments off
Bot: ✅ Anonymous payments disabled for this group
```

## Security Considerations

1. **Rate Limiting**: Limit commands per user per group
2. **Permission Checks**: Verify admin status for sensitive commands  
3. **Privacy**: Don't expose phone numbers in group responses
4. **Spam Prevention**: Cooldowns on game commands
5. **Amount Limits**: Max amounts for group features

## Performance Optimization

1. **Cache Group Data**: Store member lists for 5 minutes
2. **Batch Notifications**: Group similar messages
3. **Async Processing**: Don't block on payment operations
4. **Queue Management**: Use job queue for mass operations

## Next Steps

1. Implement basic group detection
2. Add first feature (anonymous payments)
3. Test with small group
4. Gather feedback
5. Iterate and add more features

Remember: Start simple, test thoroughly, and scale gradually!