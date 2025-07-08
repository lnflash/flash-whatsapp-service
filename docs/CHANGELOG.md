# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-07-08

### Added
- Natural language voice responses for all commands powered by AI
- ElevenLabs integration for ultra-realistic voice synthesis in voice-only mode
- Transaction details view with voice narration (`history <transaction_id>`)
- 200+ natural language pattern variations for command recognition
- Voice response service to transform technical outputs into conversational language
- Support for voice mode context in Gemini AI responses
- Automatic provider selection (ElevenLabs for voice-only users, Google Cloud for others)

### Changed
- Voice-only mode now provides natural, conversational responses instead of reading command output
- Enhanced NLP patterns with extensive word-to-number conversion
- Improved typo correction for common command mistakes
- TTS service now accepts WhatsApp ID for provider selection

### Fixed
- Critical bug where voice-only users heard instruction hints instead of actual command responses
- Voice response preservation to prevent regeneration
- Transaction ID formatting in history command
- Auth token validation in getTransactionDetails

## [0.4.1] - 2025-06-29

### Added
- Real-time push notifications for received payments via hybrid WebSocket/RabbitMQ approach
- Automatic subscription to payment updates when users link their accounts
- Deduplication system to prevent duplicate payment notifications
- Automatic balance display in payment notifications
- Support for both WebSocket subscriptions and RabbitMQ event fallback

### Fixed
- Decimal number handling in command patterns (now supports .01 format)
- Debug logging removed from send command parser

## [0.4.0] - 2025-06-29

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