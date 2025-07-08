# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multiple voice selection support for ElevenLabs TTS
- Voice selection commands (voice 1/2/3) for choosing between Terri-Ann, Patience, and Dean voices
- Support for ELEVENLABS_VOICE_ID2 and ELEVENLABS_VOICE_ID3 environment variables
- User-specific voice preference storage in Redis
- Voice selection information in voice status command
- Comprehensive settings menu with `settings` command
- Natural language support for settings command (my settings, show settings, etc.)
- Mandatory payment confirmation for all send commands with detailed summary
- Support for "pay", "yes", "y", "ok", "confirm" as confirmation words
- Enhanced payment confirmation display with recipient, amount, memo, and network info

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