# Receive Command Documentation

The `receive` command allows users to create Lightning invoices to receive payments via WhatsApp.

## Features

- **Lightning Invoice Generation**: Create BOLT11 invoices for receiving USD payments
- **QR Code Generation**: Automatically generates QR codes for easy scanning
- **Flexible Amount Options**: Support for USD amounts or no-amount invoices
- **Custom Memos**: Add descriptions to your payment requests
- **Expiration Tracking**: Shows remaining validity time for invoices
- **USD Wallet Support**: Works with USD wallet for stable value payments

## Usage

### Basic Commands

1. **Receive any amount** (creates an open invoice):
   ```
   receive
   ```

2. **Receive specific USD amount**:
   ```
   receive 10
   receive 25.50
   ```

3. **Receive with memo**:
   ```
   receive 10 Coffee payment
   receive 50 Invoice for services
   ```

**Note**: BTC invoices are not currently supported. All amounts are in USD.

### Examples

**User**: `receive`
**Bot**: 
```
*Lightning Invoice*

Amount: Any amount
Valid for: 1 hour

`lnbc1...` (invoice string)

Copy and paste this invoice to pay, or scan the QR code below.
[QR Code Image]
```

**User**: `receive 20 Lunch money`
**Bot**:
```
*Lightning Invoice*

Amount: $20.00
Memo: Lunch money
Valid for: 1 hour

`lnbc20u...` (invoice string)

Copy and paste this invoice to pay, or scan the QR code below.
[QR Code Image]
```

## Technical Implementation

### Components

1. **InvoiceService** (`src/modules/flash-api/services/invoice.service.ts`):
   - Handles GraphQL mutations for invoice creation
   - Supports three types: no-amount, USD amount, and BTC amount
   - Parses BOLT11 invoices to extract expiration info

2. **QrCodeService** (`src/modules/whatsapp/services/qr-code.service.ts`):
   - Generates QR codes from Lightning invoices
   - Properly formats with `lightning:` prefix for wallet compatibility

3. **Command Parser Updates**:
   - Pattern: `/^receive(?:\s+(\d+(?:\.\d+)?))?\s*(.*)$/i`
   - Extracts amount and memo from command

4. **WhatsApp Service Integration**:
   - Returns both text and media (QR code) in response
   - Validates amounts (USD only)
   - Enforces reasonable limits ($10,000 USD maximum)
   - Rejects BTC amount requests with helpful message

### GraphQL Mutations Used

1. **No Amount Invoice**:
   ```graphql
   mutation lnNoAmountInvoiceCreate($input: LnNoAmountInvoiceCreateInput!) {
     lnNoAmountInvoiceCreate(input: $input) {
       invoice {
         paymentRequest
         paymentHash
         paymentSecret
       }
     }
   }
   ```

2. **USD Invoice**:
   ```graphql
   mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
     lnUsdInvoiceCreate(input: $input) {
       invoice {
         paymentRequest
         paymentHash
         satoshis
       }
     }
   }
   ```

### Error Handling

- Invalid amounts: Clear error message with examples
- BTC amounts: Rejects with message about USD-only support
- Amount too large: Enforces $10,000 limit for safety
- API failures: Generic error message to user
- Expired invoices: Shows expiration status

### Security Considerations

- Requires authenticated session
- Validates all input amounts
- Enforces reasonable limits
- Uses secure GraphQL mutations with auth tokens

## Future Enhancements

1. **Invoice Status Tracking**: Listen for payment completion events
2. **Invoice History**: Command to view recent invoices
3. **Custom Expiration**: Allow users to set invoice validity period
4. **BTC Invoice Support**: Re-enable BTC invoices when needed
5. **Payment Notifications**: Real-time alerts when invoice is paid
6. **Invoice Templates**: Save frequently used amounts/memos