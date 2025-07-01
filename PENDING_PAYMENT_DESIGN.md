# Pending Payment Mechanism Design

## Overview
A system that allows Flash users to send money to non-Flash users, which can be claimed when recipients create a Flash account.

## Key Features

### 1. Pending Payment Creation
When sending to a non-Flash user:
- Create a pending payment record with:
  - Sender's Flash ID and username
  - Recipient's phone number or identifier
  - Amount in USD
  - Creation timestamp
  - Expiration date (e.g., 30 days)
  - Unique claim code
  - Optional memo

### 2. Notification System
- Send WhatsApp message to recipient with:
  - Amount pending
  - Sender's name
  - Link to download Flash app
  - Unique claim code
  - Expiration warning

### 3. Claim Process
When recipient signs up:
- Verify phone number matches pending payment
- Automatic credit upon account creation
- Notification to sender when claimed
- Handle expired payments (return to sender)

### 4. Storage Structure
```typescript
interface PendingPayment {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientPhone: string;
  recipientName?: string;
  amountCents: number;
  claimCode: string;
  status: 'pending' | 'claimed' | 'expired' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
  claimedAt?: Date;
  claimedById?: string;
  memo?: string;
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create pending payments storage in Redis
2. Generate secure claim codes
3. Implement expiration handling

### Phase 2: Send Flow
1. Update send command to detect non-Flash recipients
2. Create pending payment instead of failing
3. Send notification to recipient

### Phase 3: Claim Flow
1. Add claim check on Flash account creation
2. Auto-credit pending payments
3. Send confirmation to sender

### Phase 4: Management
1. List pending payments (sent/received)
2. Cancel pending payments
3. Handle refunds for expired payments

## Benefits
- Seamless onboarding for new users
- No lost payments
- Viral growth mechanism
- Better user experience