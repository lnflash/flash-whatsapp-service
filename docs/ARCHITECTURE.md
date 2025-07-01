# Flash WhatsApp Service Architecture

## Overview

The Flash WhatsApp Service is built as a NestJS microservice that bridges WhatsApp messaging with the Flash Bitcoin wallet platform. It uses WhatsApp Web.js for automation and integrates with Flash's GraphQL API.

## Core Components

### 1. WhatsApp Integration Layer
- **WhatsApp Web Service** (`whatsapp-web.service.ts`)
  - Manages WhatsApp Web.js client lifecycle
  - Handles QR code generation for authentication
  - Processes incoming messages with deduplication
  - Maintains persistent WhatsApp session

### 2. Command Processing
- **Command Parser Service** (`command-parser.service.ts`)
  - Parses user messages into structured commands
  - Supports commands: `link`, `verify`, `balance`, `refresh`, `help`
  - Handles command arguments (e.g., OTP codes)

### 3. Authentication & Session Management
- **Auth Service** (`auth.service.ts`)
  - Initiates account linking via phone number
  - Sends OTP through Flash API
  - Validates OTP codes
  
- **Session Service** (`session.service.ts`)
  - Manages user sessions in Redis
  - Stores Flash user ID and auth tokens
  - Tracks verification status

### 4. Flash API Integration
- **Flash API Service** (`flash-api.service.ts`)
  - GraphQL client for Flash backend
  - Handles authentication with backend tokens
  - Executes queries and mutations

- **Balance Service** (`balance.service.ts`)
  - Fetches wallet balances from Flash API
  - Implements smart caching (30-second TTL)
  - Converts between currencies using exchange rates
  - Provides cache invalidation methods

### 5. AI Integration
- **Gemini AI Service** (`gemini-ai.service.ts`)
  - Integrates Google Gemini for intelligent responses
  - Provides contextual help and support
  - Handles unrecognized commands with AI assistance

## Data Flow

```
1. User sends WhatsApp message
   ↓
2. WhatsApp Web.js receives message
   ↓
3. Command Parser identifies command type
   ↓
4. WhatsApp Service routes to appropriate handler
   ↓
5. Handler interacts with Flash API/Redis/AI
   ↓
6. Response formatted and sent back via WhatsApp
```

## Key Design Decisions

### 1. WhatsApp Web.js vs Business API
- Using WhatsApp Web.js for rapid prototyping
- Plans to migrate to Business API for production
- Provides similar functionality with easier setup

### 2. Currency Conversion
- Real-time exchange rates from Flash API
- Same conversion logic as Flash mobile app
- Supports all Flash-supported currencies

### 3. Caching Strategy
- 30-second cache for balance queries
- Manual refresh command for immediate updates
- Redis for distributed caching

### 4. Security
- Phone number verification required
- Auth tokens never exposed to users
- MFA bypassed for WhatsApp (already authenticated)
- Session data encrypted in Redis

## Module Structure

```
src/
├── modules/
│   ├── whatsapp/          # WhatsApp integration
│   ├── auth/              # Authentication & sessions
│   ├── flash-api/         # Flash API client
│   ├── gemini-ai/         # AI integration
│   └── redis/             # Cache & session storage
├── config/                # Configuration
└── main.ts               # Application entry
```

## Scaling Considerations

1. **Horizontal Scaling**: Session affinity required due to WhatsApp Web.js
2. **Rate Limiting**: Built into balance service caching
3. **High Availability**: Redis cluster for session persistence
4. **Monitoring**: Structured logging for debugging

## Future Enhancements

1. **Payment Sending**: Add ability to send Bitcoin/Lightning payments
2. **Notifications**: Push alerts for received payments
3. **Multi-Language**: Support for Spanish, French, etc.
4. **Business API**: Migration for better scalability
5. **Voice Messages**: Support for audio commands