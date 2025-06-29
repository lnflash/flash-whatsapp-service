# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-06-29

### Added
- Human support handoff with intelligent multi-user routing
- Anonymous tip sending via direct messages for true privacy
- Group tip splitting to distribute tips evenly among Flash users
- Support mode with automatic context gathering (username, balance, npub, conversation history)
- Configurable support phone number via environment variable
- Phone number format flexibility in support routing
- Support agent commands (list sessions, route messages with @phone prefix)
- Exit support command for users to return to normal bot functions

### Changed
- Tips are now DM-only to ensure sender anonymity
- Improved session persistence to prevent QR code rescanning on restart
- Cleaned up debug logging and console statements throughout codebase

### Fixed
- WhatsApp session persistence issue on server restart
- Phone number matching in support routing system
- Circular dependency in support mode service

## [0.1.0] - 2025-06-01

### Added
- Initial release of Pulse WhatsApp bot
- Phone number-based account linking with OTP verification
- Real-time balance checking with automatic currency conversion
- Lightning invoice detection and payment
- Contact management with automatic vCard import
- Payment requests via username, phone, or contact name
- Admin session management with QR code delivery
- Content sharing ("vybz") to earn sats
- Transaction history viewing
- Pending payments for non-Flash users
- AI-powered customer support through Google Gemini