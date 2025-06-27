# Version History

## v0.1.0 (2024-01-26) - WhatsApp Web.js Prototype

### Features
- **WhatsApp Integration**: Implemented WhatsApp Web.js for message automation
- **Account Linking**: Phone number-based verification with OTP
- **Balance Checking**: Real-time wallet balance with multi-currency support
- **Currency Conversion**: Automatic conversion using Flash API exchange rates
- **Smart Caching**: 30-second cache with manual refresh command
- **AI Support**: Google Gemini integration for intelligent responses

### Technical Improvements
- Migrated from Twilio to WhatsApp Web.js
- Implemented message deduplication
- Added proper error handling and logging
- Optimized Redis caching strategy
- Fixed currency conversion precision (2 decimal places)

### Commands
- `help` - Show available commands
- `link` - Connect Flash account
- `verify [code]` - Complete verification
- `balance` - Check wallet balance
- `refresh` - Force balance update

### Known Issues
- WhatsApp Web.js requires QR code scanning
- Single instance limitation (no horizontal scaling)

### Breaking Changes
- Removed Twilio WhatsApp Business API support
- Changed from Cloud API to Web automation

---

## v0.0.1 - Initial Foundation (December 2024)

### Completed
- ✅ Phase 1: Foundation & Infrastructure
- ✅ Phase 2: Account Security & Linking
- ✅ Phase 3: Core Functionality
- ✅ Phase 4: Testing & Security

### Key Features
- Account linking with OTP verification
- Balance checking with MFA
- Payment notifications
- AI-powered support with Maple AI

### Infrastructure
- GitHub Actions workflows for CI/CD
- Docker Compose deployment
- Prometheus metrics integration