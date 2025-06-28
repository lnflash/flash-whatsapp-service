# Pulse (formerly Flash Connect, Flash WhatsApp Service)

A WhatsApp integration service for Flash that enables users to check their Bitcoin wallet balance and interact with Flash services through WhatsApp. Now branded as "Pulse" to capture the pulse of the Lightning Network.

## Overview

This service uses WhatsApp Web.js to provide a seamless integration between Flash and WhatsApp, allowing users to:
- Link their Flash account via phone number verification
- Check their wallet balance in their preferred currency
- Send and receive Lightning payments
- Manage contacts and payment requests
- Share content to earn sats through the "vybz" feature
- Get AI-powered support through Google Gemini

## Tech Stack

- **NestJS** - Backend framework
- **WhatsApp Web.js** - WhatsApp automation
- **Redis** - Session management and caching
- **GraphQL** - Flash API integration
- **Google Gemini AI** - Intelligent responses
- **TypeScript** - Type safety

## Features

- ✅ Phone number-based account linking with OTP verification
- ✅ Real-time balance checking with automatic currency conversion
- ✅ Smart caching (30-second TTL) with manual refresh option
- ✅ Multi-currency support (USD, JMD, EUR, etc.)
- ✅ AI-powered customer support
- ✅ Secure session management
- ✅ Lightning invoice detection and payment
- ✅ Contact management with automatic vCard import
- ✅ Payment requests via username, phone, or contact name
- ✅ Admin session management with QR code delivery
- ✅ Content sharing ("vybz") to earn sats
- ✅ Transaction history viewing
- ✅ Pending payments for non-Flash users

## Prerequisites

- Node.js 18+
- Redis server
- Flash API access (auth token)
- Google Gemini API key

## Quick Start

1. **Clone and install:**
   ```bash
   git clone https://github.com/your-org/flash-whatsapp-service.git
   cd flash-whatsapp-service
   yarn install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start services:**
   ```bash
   # Start Redis
   docker-compose up -d redis
   
   # Start the service
   yarn start:dev
   ```

4. **Connect WhatsApp:**
   - Scan the QR code displayed in the console
   - Use a test WhatsApp number (not your personal one)

## Available Commands

### User Commands
Users can send these commands to the WhatsApp bot:

- `link` - Connect your Flash account
- `verify 123456` - Complete verification with OTP
- `balance` - Check your wallet balance
- `refresh` - Force refresh your balance
- `receive [amount] [memo]` - Create USD Lightning invoice
- `request [amount] from [target]` - Request payment (username/phone/contact)
- `pay` - Pay detected Lightning invoices (with confirm/cancel options)
- `send [amount] to [target]` - Send payment to username/phone/contact
- `contacts` - Manage saved contacts
- `history` - View recent transaction history
- `pending` - View and manage pending payments (sent/received/claim)
- `price` - Check current Bitcoin price
- `username [new_username]` - View or set username
- `vybz` - Share content to earn sats (3 posts/day limit)
- `unlink` - Disconnect your Flash account
- `consent yes/no` - Manage AI support consent
- `help` - Show available commands

### Admin Commands
Administrators can use these commands for bot management:

- `admin status` - Check WhatsApp connection status
- `admin disconnect` - Disconnect current WhatsApp session
- `admin reconnect` - Connect a new WhatsApp number (sends QR code)
- `admin clear-session` - Clear all session data

## Environment Variables

```env
# Flash API
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_API_KEY=your_auth_token_here

# Google Gemini AI
GEMINI_API_KEY=your_gemini_key_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password

# Admin Configuration
ADMIN_PHONE_NUMBERS=13059244435,18764250250

# Nostr Configuration (optional - for vybz feature)
NOSTR_PRIVATE_KEY=your_nsec_here
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol

# WhatsApp (managed automatically)
# Session stored in ./whatsapp-sessions/
```

## Architecture

```
WhatsApp User → WhatsApp Web.js → NestJS Service → Flash GraphQL API
                                         ↓
                                    Redis Cache
                                         ↓
                                    Gemini AI
```

## Development

```bash
# Run tests
yarn test

# Lint code
yarn lint

# Format code
yarn format

# Build for production
yarn build
```

## Docker Support

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Currency Conversion

The service automatically converts USD wallet balances to the user's display currency using real-time exchange rates from the Flash API. Supported currencies include:
- JMD (Jamaican Dollar)
- EUR (Euro)
- USD (US Dollar)
- And more...

## Security

- Phone number verification required for account linking
- Auth tokens stored securely in Redis
- No MFA required for balance checks (user already authenticated via WhatsApp)
- All sensitive data excluded from logs

## Pending Payments Feature

The pending payments feature allows Flash users to send money to anyone via WhatsApp, even if the recipient doesn't have a Flash account yet:

### How it works:
1. **Send to any phone number**: Use `send [amount] to [phone]` to send money to any WhatsApp number
2. **Recipient gets notified**: The recipient receives a WhatsApp message with a claim code
3. **Easy claiming**: Recipients can claim by replying "link" to create an account
4. **Automatic credit**: Once linked, the pending payment is automatically credited
5. **30-day expiry**: Unclaimed payments are returned to sender after 30 days

### Pending payment commands:
- `pending` - View all your pending payments
- `pending sent` - View payments you've sent that are awaiting claim
- `pending received` - Check if you have money waiting to be claimed
- `pending claim [code]` - Claim a payment using the provided code

### Example flow:
```
Sender: send 10 to +18765551234
Bot: ✅ $10.00 sent to +18765551234. They'll receive instructions to claim it.

[Recipient receives message]
Bot: 💰 You have money waiting! @alice sent you $10.00
     Reply "link" to claim your payment.
     Claim code: ABC123

Recipient: link
[... account creation flow ...]
Bot: ✅ Your $10.00 from @alice has been credited to your account!
```

## Admin Reconnection Feature

The admin reconnection feature allows authorized administrators to change the WhatsApp number connected to the bot without SSH access:

1. **Check Status**: `admin status` - Shows current connection info
2. **Reconnect**: `admin reconnect` - Generates and sends QR code via WhatsApp
3. **Scan QR**: Open WhatsApp on new device and scan the QR code
4. **Confirmation**: Bot sends welcome message from new number

This seamless process ensures zero downtime during number changes.

## Roadmap

- [x] Payment sending functionality
- [x] Transaction history
- [x] Lightning invoice detection and payment
- [x] Contact management
- [x] Admin session management
- [x] Pending payments for non-Flash users
- [ ] Push notifications for received payments
- [ ] Multi-language support
- [ ] WhatsApp Business API migration
- [ ] Group chat support

## Security Features

Pulse implements enterprise-grade security:

- **🔐 Encryption at Rest**: All sensitive data encrypted with AES-256-GCM
- **✅ Input Validation**: Comprehensive DTOs with custom validators
- **🚦 Rate Limiting**: Per-endpoint and per-user rate limits
- **🔑 Secure Sessions**: Encrypted session storage with rotation
- **🛡️ Webhook Security**: HMAC signature validation
- **🔒 Secrets Management**: Environment-based configuration with validation

For detailed security documentation, see:
- [Security Implementation Guide](docs/SECURITY.md)
- [Security Improvements](docs/SECURITY_IMPROVEMENTS.md)
- [Known Vulnerabilities](docs/KNOWN_VULNERABILITIES.md)

### Generating Secure Keys

For production deployment, generate secure keys:

```bash
# Generate all security keys (encryption, JWT, session, webhook, Nostr)
./scripts/generate-secure-keys.sh

# Generate only Nostr keys with detailed instructions
./scripts/generate-nostr-keys.sh
```

## License

Proprietary - Flash Technologies Ltd.