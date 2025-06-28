# Release Notes

## v0.4.0 - Pending Payments Release

### 🎉 What's New

This release introduces the pending payments feature, allowing Flash users to send money to anyone via WhatsApp, even if they don't have a Flash account yet!

### ✨ Key Features

- **Pending Payments** - Send money to any WhatsApp number
- **30-Day Expiry** - Unclaimed payments automatically return to sender
- **Claim Codes** - Secure 6-character codes for payment verification
- **Escrow System** - Funds held securely until claimed or expired
- **Automatic Notifications** - Recipients get WhatsApp messages with claim instructions

### 🔧 Technical Improvements

- New `PendingPaymentService` for managing pending transactions
- Redis-based storage with TTL for automatic expiry
- Phone number indexing for fast lookups
- Integration with existing payment flow
- ESLint v9 migration for better code quality

### 📝 New Commands

- `pending` - View all your pending payments
- `pending sent` - View payments awaiting claim
- `pending received` - Check for money waiting to be claimed
- `pending claim [code]` - Claim a payment using the code

### 💡 Usage Example

```
# Send to non-Flash user
send 10 to +18765551234

# Recipient receives notification
💰 You have money waiting! @alice sent you $10.00
Reply "link" to claim. Code: ABC123

# After linking, payment auto-credits
✅ Your $10.00 from @alice has been credited!
```

### 🐛 Bug Fixes

- Fixed unit tests by adding PendingPaymentService mock
- Updated ESLint configuration for v9 compatibility
- Improved error handling for payment failures

---

# Release Notes - v0.1.0

## Flash WhatsApp Service - WhatsApp Web.js Prototype

### 🎉 What's New

This release introduces a fully functional WhatsApp integration for Flash Bitcoin wallet, allowing users to check their balance and manage their account through WhatsApp messages.

### ✨ Key Features

- **WhatsApp Web.js Integration** - Automated WhatsApp messaging without Business API
- **Account Linking** - Secure phone number verification with OTP
- **Multi-Currency Balance** - Check balance in USD, JMD, EUR, and more
- **Smart Caching** - 30-second cache with manual refresh option
- **AI Support** - Google Gemini integration for intelligent responses
- **Real-time Exchange Rates** - Automatic currency conversion from Flash API

### 🔧 Technical Improvements

- Message deduplication to prevent duplicate processing
- Proper error handling with user-friendly messages
- Optimized caching strategy for better performance
- Fixed currency conversion to always show 2 decimal places
- Improved logging for easier debugging

### 📝 Available Commands

- `help` - Display available commands
- `link` - Connect your Flash account
- `verify 123456` - Complete verification with OTP
- `balance` - Check your wallet balance
- `refresh` - Force refresh your balance

### 🚀 Getting Started

1. Clone the repository
2. Install dependencies with `yarn install`
3. Configure your `.env` file with API credentials
4. Run `yarn start:dev`
5. Scan the QR code with WhatsApp

### ⚠️ Known Limitations

- Requires QR code scanning (no headless mode)
- Single instance only (no horizontal scaling yet)
- WhatsApp Web.js may disconnect after long idle periods

### 🔮 Coming Next

- Payment sending functionality
- Transaction history
- Push notifications for received payments
- Migration to WhatsApp Business API

### 🙏 Acknowledgments

Thanks to the Flash team for providing API access and support during development.

---

**Full Changelog**: https://github.com/your-org/flash-whatsapp-service/compare/v0.0.1...v0.1.0