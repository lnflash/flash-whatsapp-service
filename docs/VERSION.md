# Version History

## v0.3.0 (2024-06-28) - Admin Reconnection & Enhanced Features

### Major Features
- **Admin Session Management**: Complete control over WhatsApp connections
  - `admin status` - Check connection status
  - `admin disconnect` - Disconnect current session
  - `admin reconnect` - Connect new number with QR code delivery
  - `admin clear-session` - Clear all session data
- **QR Code Delivery**: QR codes sent directly via WhatsApp (no terminal access needed)
- **Seamless Reconnection**: Zero downtime when switching WhatsApp numbers
- **Welcome Messages**: Automatic confirmation when new connection established

### New Commands
- `pay` - Interactive Lightning invoice payment with confirm/cancel
- `send [amount] to [target]` - Send payments to username/phone/contact
- `vybz` - Share content to earn sats (3 posts/day limit)
- Contact sharing via WhatsApp vCards now automatically saves contacts

### Technical Improvements
- Session persistence across server restarts
- Improved invoice detection with amount parsing
- Multiple pending payment support (up to 10)
- Enhanced error handling for puppeteer context
- Better state management during client switching

### Bug Fixes
- Fixed message sending after reconnection
- Fixed session persistence issues
- Fixed timing issues with QR code generation
- Improved client stability after switching

---

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