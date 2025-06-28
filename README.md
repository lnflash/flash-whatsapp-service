# Flash WhatsApp Service

A WhatsApp integration service for Flash that enables users to check their Bitcoin wallet balance and interact with Flash services through WhatsApp.

## Overview

This service uses WhatsApp Web.js to provide a seamless integration between Flash and WhatsApp, allowing users to:
- Link their Flash account via phone number verification
- Check their wallet balance in their preferred currency
- Refresh balance on demand with minimal caching
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

Users can send these commands to the WhatsApp bot:

- `link` - Connect your Flash account
- `verify 123456` - Complete verification with OTP
- `balance` - Check your wallet balance
- `refresh` - Force refresh your balance
- `receive [amount] [memo]` - Create USD Lightning invoice
- `request [amount] from [@username] [phone]` - Request payment from another user
- `history` - View recent transaction history
- `price` - Check current Bitcoin price
- `username [new_username]` - View or set username
- `unlink` - Disconnect your Flash account
- `consent yes/no` - Manage AI support consent
- `help` - Show available commands

## Environment Variables

```env
# Flash API
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_BACKEND_API_KEY=your_auth_token_here

# Google Gemini AI
GEMINI_API_KEY=your_gemini_key_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# WhatsApp (optional)
WHATSAPP_SESSION_PATH=./.wwebjs_auth
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

## Roadmap

- [ ] Payment sending functionality
- [x] Transaction history
- [ ] Push notifications for received payments
- [ ] Multi-language support
- [ ] WhatsApp Business API migration

## License

Proprietary - Flash Technologies Ltd.