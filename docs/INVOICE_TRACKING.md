# Invoice Payment Tracking

## Overview
The Flash WhatsApp service includes automatic invoice payment tracking. When users create Lightning invoices using the `receive` command, the system monitors payment status and notifies users when payments are received.

## How It Works

### 1. Invoice Creation
When a user sends `receive [amount] [memo]`:
- A Lightning invoice is created via the Flash API
- Invoice details are stored in Redis with the payment hash as key
- A QR code is generated and sent to the user
- The invoice is tracked for payment updates

### 2. Payment Monitoring
The system uses **RabbitMQ payment events** for tracking:
- Listens to `payment_received` events from the RabbitMQ message queue
- Matches payments by payment hash (paymentHash field in the event)
- Updates invoice status in Redis
- Sends notification to user via WhatsApp

**Important**: Payment events MUST include a `paymentHash` field for invoice tracking to work. The system will check multiple field names: `paymentHash`, `payment_hash`, `paymentIdentifier`, or `hash`.

### 3. Payment Notification
When an invoice is paid:
- User receives a WhatsApp message confirming payment
- Message includes amount, memo (if any), and timestamp
- Invoice status is updated in Redis

## Technical Implementation

### Components

#### WhatsappService
- `storeInvoiceForTracking()` - Stores invoice data in Redis
- `checkInvoiceStatus()` - Queries GraphQL for payment status
- `notifyInvoicePaid()` - Sends payment confirmation to user

#### PaymentEventListener
- Listens to RabbitMQ payment events
- Handles `payment_received` events
- Matches payments to invoices by payment hash
- Triggers payment notifications

#### InvoiceTrackerService
- Currently disabled (WebSocket functionality commented out)
- Service remains in place for potential future use
- Invoice tracking is handled by PaymentEventListener

#### Redis Storage
Invoices are stored with:
- Key: `invoice:{paymentHash}`
- TTL: Matches invoice expiry (minimum 1 hour)
- User invoice list: `user:{whatsappId}:invoices`

### Data Structure
```typescript
{
  paymentHash: string,
  paymentRequest: string,
  amount: number,
  currency: string,
  memo?: string,
  status: 'pending' | 'paid' | 'expired',
  paidAt?: Date,
  expiresAt: Date,
  whatsappUserId: string,
  authToken: string, // Should be encrypted in production
  createdAt: string
}
```

## Current Architecture

### Why RabbitMQ Instead of WebSocket?
The service was originally designed to use GraphQL WebSocket subscriptions (similar to the Flash mobile app), but has been temporarily switched to RabbitMQ event-based tracking due to WebSocket connection issues:

1. **Connection Stability**: WebSocket connections to the Flash GraphQL API were experiencing frequent disconnections
2. **Event Reliability**: RabbitMQ provides guaranteed message delivery with acknowledgments
3. **Scalability**: RabbitMQ-based approach can handle multiple service instances more easily

### Event Flow
1. User creates invoice via WhatsApp → Stored in Redis with payment hash
2. Payment is made on Lightning Network
3. Flash backend emits `payment_received` event to RabbitMQ
4. PaymentEventListener receives event and matches by payment hash
5. Invoice status updated in Redis
6. User notified via WhatsApp

### Requirements for Backend
For invoice tracking to work, the Flash backend must:
- Emit `payment_received` events for Lightning invoice payments
- Include a payment hash field in the event payload
- Send events to the configured RabbitMQ exchange

## Configuration

### RabbitMQ Connection
The system connects to RabbitMQ for receiving payment events. Configuration is handled in the EventsModule.

### Invoice Storage Duration
- Active invoices: Until expiry time
- Paid invoices: 1 hour after payment
- Minimum storage: 1 hour

## Security Considerations

1. **Auth Token Storage**: Currently stored in plain text. Should be encrypted in production.
2. **Redis Security**: Ensure Redis is properly secured and not exposed publicly.
3. **Rate Limiting**: Polling is rate-limited to prevent API abuse.

## Limitations

1. **No Message Editing**: WhatsApp API doesn't support editing messages, so we send a new notification instead of updating the original invoice message.
2. **Payment Hash Required**: Payment events must include a payment hash field for invoice matching to work.
3. **Backend Support Needed**: The backend must emit RabbitMQ events with the correct payment hash for Lightning invoices.

## Future Improvements

1. **WebSocket Support**: Re-enable GraphQL WebSocket subscriptions when connection issues are resolved
2. **Webhook Support**: Add webhook endpoint for instant payment notifications
3. **Message Threading**: Link payment notifications to original invoice messages
4. **Payment History Command**: Add command to view recent payments
5. **Multi-Currency Support**: Track invoices in different currencies
6. **Encrypted Storage**: Encrypt sensitive data in Redis
7. **Enhanced Event Matching**: Support additional payment identifier formats

## Usage Example

```
User: receive 10 Coffee payment
Bot: [Sends invoice details and QR code]

... payment is made ...

Bot: ✅ Payment Received!

Amount: $10.00 USD
Memo: Coffee payment
Paid at: 1/27/2025, 2:30:45 PM

Thank you for your payment!
```

## Troubleshooting

### Invoices Not Being Tracked
- Check Redis connection
- Verify PaymentEventListener is running
- Check RabbitMQ connection
- Ensure invoices are stored with correct payment hash

### No Payment Notifications
- Verify RabbitMQ events include payment hash
- Check payment event format in logs
- Ensure WhatsApp connection is active
- Look for matching invoice in Redis

### Performance Issues
- Reduce polling frequency if needed
- Implement pagination for large invoice lists
- Consider using Redis Streams for better performance