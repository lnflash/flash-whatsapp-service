# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dynamic voice management system replacing hardcoded voice options
- `voice add [name] [voiceId]` command to add new ElevenLabs voices
- `voice remove [name]` command to remove voices
- `voice [name]` command to select a voice by name
- `voice list` command to show all available voices
- Voice storage in Redis for persistence
- Duplicate voice name and ID prevention
- Reserved word protection for voice names
- VoiceManagementService for centralized voice operations
- Integration with TTS service for dynamic voice lookup
- Comprehensive settings menu with `settings` command
- Natural language support for settings command (my settings, show settings, etc.)
- Mandatory payment confirmation for all send commands with detailed summary
- Support for "pay", "yes", "y", "ok", "confirm" as confirmation words
- Enhanced payment confirmation display with recipient, amount, memo, and network info
- Username validation before payment confirmation (prevents sending to non-existent users)
- Recipient type indicators in confirmation (username ✅, phone, contact, lightning)
- Voice-only payment notifications for recipients
- Automatic 'voice on' mode activation for payment recipients
- sendVoiceMessage method in WhatsAppWebService for audio delivery
- Admin default voice settings with `admin voice default [name]`
- Interactive onboarding flow with progress indicators
- Contextual help system that detects user confusion patterns
- `undo` command for transaction reversal within 30 seconds
- Payment templates with `template add/remove/list` commands
- Quick template payments with `pay [template_name]`
- Admin analytics dashboard with `admin analytics daily/weekly`
- Transaction logging for analytics and reporting
- User activity tracking for insights
- System health metrics in analytics reports
- `skip onboarding` command for experienced users
- Personalized learning system with `learn` command
- Random question generator for user engagement
- User knowledge base with encrypted storage
- Knowledge categorization and statistics features
- 30-day retention for user-provided answers
- Security hardening roadmap for knowledge base feature
- Improved onboarding flow with natural welcome message
- Fixed help command to show help instead of onboarding progress
- Made onboarding hints contextual and non-intrusive
- Simplified skip command to just 'skip'

### Removed
- Hardcoded voice selection (voice 1/2/3) replaced by dynamic voice management
- ELEVENLABS_VOICE_ID2 and ELEVENLABS_VOICE_ID3 environment variables (no longer needed)

## [2.0.0] - 2025-01-03

### Added
- One-click production deployment script for Ubuntu VPS
- Automatic SSL certificate detection and reuse
- Support for Ubuntu 24.04 LTS with proper package handling
- Google Chrome installation for Ubuntu 24.x (replacing snap Chromium)
- Automatic phone number format normalization (+ prefix handling)
- Gemini API key configuration prompt in setup script
- Kernel update detection and warning
- Non-interactive mode for unattended installations

### Changed
- **BREAKING**: Removed Docker/Kubernetes deployment support
- Migrated from Docker to native PM2 deployment
- Updated domain validation to support multi-level domains (e.g., pulse.example.com)
- Improved RabbitMQ authentication handling
- Enhanced admin and support phone number comparison logic
- Updated documentation to recommend LTS versions only

### Fixed
- WhatsApp Web stuck at 100% loading in production
- Chrome/Chromium compatibility issues on Ubuntu 24.04+
- Admin and support phone number authorization with + prefix
- RabbitMQ ACCESS_REFUSED authentication errors
- SSL certificate regeneration on existing installations
- Ubuntu 24.x t64 transition package compatibility

### Removed
- Docker and Kubernetes deployment files
- Obsolete deployment documentation
- Docker-related configuration and scripts

### Security
- Improved phone number validation and normalization
- Enhanced admin authentication checks
- Secure password generation for Redis and RabbitMQ

## [1.9.9] - Previous Release
- "Pulse Party like its 199"
- Previous features and improvements