# Testing Invoice Payment Notifications

## Current Status
The invoice payment tracking system is implemented but depends on receiving payment events from RabbitMQ with the correct `paymentHash` field.

## Debug Steps

### 1. Enable Debug Logging
Set the log level to debug in your `.env` file:
```
LOG_LEVEL=debug
```

### 2. Monitor Logs
When you create an invoice and make a payment, watch for these log messages:

```
# When invoice is created:
[WhatsappService] Stored invoice {paymentHash} for tracking

# When any RabbitMQ event is received:
[EventsService] Received event: {eventType}

# When payment event is received:
[PaymentEventListener] Handling payment_received event: {data}

# If payment hash is found:
[PaymentEventListener] Found paymentHash in event: {paymentHash}

# When notification is sent:
[PaymentEventListener] Lightning invoice payment notification sent for hash: {paymentHash}
```

### 3. Test Payment Event Manually

You can simulate a payment event using the test script:

```bash
# First, create an invoice and note the payment hash
# receive 1 test payment

# Then run the test script with the payment hash
npx ts-node scripts/test-invoice-payment.ts YOUR_PAYMENT_HASH 1
```

Example:
```bash
npx ts-node scripts/test-invoice-payment.ts 157394127221537680b2041b93cf79e55775ad094e1611d9bcb6703a17664cd2 1
```

### 4. Check Redis
You can verify the invoice is stored in Redis:

```bash
redis-cli
> GET invoice:YOUR_PAYMENT_HASH
```

## Troubleshooting

### No Payment Events Received
If you don't see any "Received event" logs:
1. Check RabbitMQ is running: `rabbitmqctl status`
2. Verify queue exists: `rabbitmqctl list_queues`
3. Check RabbitMQ connection in logs

### Payment Events Without paymentHash
If payment events are received but don't include `paymentHash`:
1. The Flash backend needs to be updated to include payment hash in Lightning payment events
2. This is required for invoice tracking to work

### Manual Testing Alternative
If the payment event system isn't working, you can manually verify the notification system:

1. Create an invoice and note the payment hash
2. Use the test script to simulate a payment
3. You should receive a WhatsApp notification

## What Should Happen

When everything works correctly:
1. User creates invoice: `receive 10 coffee payment`
2. Invoice is created and stored with payment hash
3. User pays the Lightning invoice
4. Flash backend publishes payment event with payment hash
5. WhatsApp service receives event and matches payment hash
6. User receives WhatsApp notification: "✅ Payment Received!"

## Current Limitations

1. **Requires Payment Hash**: The payment event MUST include the `paymentHash` field
2. **Event-Based Only**: No polling or manual checking of invoice status
3. **Backend Dependency**: Depends on Flash backend publishing correct events

## Next Steps

If payment notifications aren't working:
1. Check with the Flash backend team about including `paymentHash` in payment events
2. Consider implementing webhook endpoint for direct payment notifications
3. Add GraphQL subscription support when available