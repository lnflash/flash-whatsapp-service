# Pulse

## Keep your finger on it.

![logo](https://github.com/user-attachments/assets/f54a0c3e-0614-404f-a98f-087a0d61a056)

### A WhatsApp integration service for Flash that enables users to check their Bitcoin wallet balance and interact with Flash services through WhatsApp. Now branded as "Pulse" to capture the pulse of the Lightning Network.

> **Version**: 2.0.0 - "One-Click Deploy"  
> **Status**: Production Ready

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
- **RabbitMQ** - Event-driven messaging (optional)
- **PM2** - Production process management
- **GraphQL** - Flash API integration
- **Google Gemini AI** - Intelligent responses
- **TypeScript** - Type safety
- **Chromium** - Browser automation for WhatsApp

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
- ✅ Human support handoff with intelligent routing
- ✅ Anonymous tip sending via DM
- ✅ Group tip splitting for Flash users
- ✅ Voice note support with Speech-to-Text
- ✅ Natural language command processing
- ✅ User-specific voice settings (on/off/only modes)
- ✅ Payment confirmation for voice commands

## Prerequisites

### Local Development
- Node.js 20+
- Redis server
- Chrome/Chromium browser
- Flash API access token
- Google Gemini API key (optional)

### Production
- Ubuntu LTS version (22.04 LTS or 24.04 LTS strongly recommended)
  - ⚠️ **IMPORTANT**: Use LTS (Long Term Support) versions only
  - ⚠️ **AVOID**: Interim releases like 24.10 - they lack third-party repository support
- Domain name with DNS configured
- 2GB+ RAM recommended

## Quick Start

### Local Development

1. **Clone and setup:**
   ```bash
   git clone https://github.com/lnflash/pulse.git
   cd pulse
   
   # Run the automated setup script
   ./scripts/setup-local.sh
   ```

2. **Configure API keys in `.env`:**
   - `FLASH_API_KEY` - Your Flash API key (required)
   - `GEMINI_API_KEY` - Google Gemini API key (optional)
   - `ADMIN_PHONE_NUMBERS` - Admin phone numbers

3. **Start development server:**
   ```bash
   npm run start:dev
   ```

4. **Connect WhatsApp:**
   - Scan the QR code displayed in the console
   - Use a test WhatsApp number (not your personal one)

### Production Deployment

Deploy to Ubuntu VPS:
```bash
# 1. Download the setup script
wget https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh

# 2. Review script & add permissions
chmod +x setup-ubuntu-vps.sh

# 3. Run it
sudo ./setup-ubuntu-vps.sh
```

This will:
- Install Node.js, PM2, Chromium, Redis, and RabbitMQ
- Configure Nginx with SSL (Let's Encrypt)
- Set up automatic backups and monitoring
- Create systemd service for auto-start
- Configure firewall and fail2ban

After installation:
```bash
# View logs and QR code
pulse logs

# Management commands
pulse start|stop|restart|status|update|backup
```

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
- `voice on/off/only/status` - Manage voice response settings
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

# Support Configuration
SUPPORT_PHONE_NUMBER=18762909250

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

⚠️ **WARNING**: Docker deployment is NOT supported for Pulse. WhatsApp Web.js requires native Chrome/Chromium installation and does not work reliably in Docker containers. Please use the native PM2 deployment method described above.

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

## Support Mode

The AI-powered support mode provides seamless handoff to human agents when users need assistance:

### How it works:
1. **Automatic Detection**: The AI detects when users request human support (e.g., "speak to an agent", "human help")
2. **Context Gathering**: Collects user info (username, balance, npub, recent conversation)
3. **Smart Routing**: Routes messages between multiple users and support simultaneously
4. **Easy Management**: Support agents reply with `@phone: message` to specific users
5. **Session Control**: Users type "exit support" to return to normal bot functions

### Support Agent Features:
- View all active sessions: Type `list` or `sessions`
- Reply to specific user: `@13059244435: Hello, how can I help?`
- End support session: `@13059244435: exit support`
- Automatic session info with each new connection

## Anonymous Tips

Send tips anonymously through direct messages:

### Features:
- **True Anonymity**: Tips sent via DM ensure sender identity is hidden
- **Group Tip Splitting**: Distribute tips evenly among Flash users in a group
- **Flexible Amounts**: Send any amount with optional messages
- **Privacy First**: Recipients only see "Someone sent you a tip"

### Tip Commands:
- `tip @username 5` - Send anonymous 5 USD tip
- `tip @alice 10 great job!` - Include a message with tip
- `tip group "Flash Users" 20` - Split $20 among all Flash users in the group
- `tip group "Dev Team" 50 thanks everyone` - Group tip with message

## Push Notifications

The service implements real-time payment notifications with a hybrid approach:

### How it works:
1. **WebSocket Subscriptions**: Primary real-time connection to Flash API for instant updates
2. **RabbitMQ Fallback**: Reliable message queue ensures notifications are never missed
3. **Automatic Setup**: Users are subscribed when they link their account
4. **Smart Deduplication**: Prevents duplicate notifications across both channels
5. **Rich Notifications**: Shows amount in BTC and fiat, sender info, and updated balance

### Notification Features:
- Instant WhatsApp message when payment is received
- Shows payment amount in both BTC and user's preferred currency
- Displays sender's username and memo if provided
- Includes updated wallet balance
- Works whether app is active or not

### Technical Architecture:
```
Flash API → WebSocket/RabbitMQ → PaymentNotificationService → WhatsApp Message
```

## Roadmap

- [x] Payment sending functionality
- [x] Transaction history
- [x] Lightning invoice detection and payment
- [x] Contact management
- [x] Admin session management
- [x] Pending payments for non-Flash users
- [x] Push notifications for received payments
- [ ] Multi-language support
- [ ] WhatsApp Business API migration
- [ ] Group chat support

## Production Deployment

### Minimum Recommended Specs with DigitalOcean pricing as of July 2025:

For Development/Testing:

- CPU: 1 vCPU
- RAM: 2GB
- Storage: 25GB SSD
- Droplet: Basic Regular Intel ($12/month)

For Production (Small-Medium Scale):

- CPU: 2 vCPUs
- RAM: 4GB
- Storage: 80GB SSD
- Droplet: Basic Regular Intel ($24/month)

For Production (High Traffic):

- CPU: 4 vCPUs
- RAM: 8GB
- Storage: 160GB SSD
- Droplet: General Purpose ($48/month)

  
### 🚀 Production Deployment Steps

⚠️ **IMPORTANT**: 
- Use Ubuntu LTS versions only (22.04 LTS or 24.04 LTS)
- Docker is NOT supported due to WhatsApp Web.js browser requirements
- Avoid interim Ubuntu releases (like 24.10) as they lack third-party repository support

Deploy Pulse on your Ubuntu VPS:

```bash
# 1. Download the setup script
wget https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh

# 2. Review script & add permissions
chmod +x setup-ubuntu-vps.sh

# 3. Run it
sudo ./setup-ubuntu-vps.sh
```

This automated script handles the complete production setup including SSL, PM2, native Chromium, Redis, RabbitMQ, security, and monitoring.

### Documentation

- [Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT_GUIDE.md) - Complete deployment instructions
- [Admin Panel Guide](docs/ADMIN_PANEL.md) - Admin dashboard documentation
- [Security Checklist](SECURITY_CHECKLIST.md) - Pre-deployment security verification
- [Environment Template](.env.example) - Configuration template

### Post-Deployment Configuration

After running the setup script, configure your API credentials in `/opt/pulse/.env`:
- `FLASH_API_KEY` - Your Flash API key
- `ADMIN_PHONE_NUMBERS` - Admin phone numbers
- `SUPPORT_PHONE_NUMBER` - Support routing number
- `GEMINI_API_KEY` - Google AI key (optional)
- `NOSTR_PRIVATE_KEY` - Nostr nsec (optional)
- `NOSTR_PULSE_NPUB` - Bot's Nostr npub (optional)

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

MIT License - Island Bitcoin LLC 
