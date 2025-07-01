# Claude AI Context for Flash WhatsApp Service

This file contains important context and guidelines for AI assistants working on this codebase.

## Critical Policies

### BTC Wallet Policy - IMPORTANT
**BTC wallets should be DISABLED and HIDDEN by default.**

- Flash BTC wallets are **non-custodial** - Flash cannot see or control BTC wallet balances
- USD wallets are custodial and should be the default for all operations
- **ALWAYS** show USD balances in notifications, not BTC
- **NEVER** default to BTC operations unless explicitly requested
- When implementing features, check for USD wallet first: `balance.fiatBalance > 0 || balance.btcBalance === 0`

See `/docs/BTC_WALLET_POLICY.md` for full details.

## Service Architecture

### Core Services
- **WhatsApp Integration**: Uses whatsapp-web.js for message handling
- **Flash API**: GraphQL API for payments and account management
- **Payment Types**: 
  - Intraledger (Flash-to-Flash) - Instant and free
  - Lightning Network - For external payments
  - Escrow - For users without Flash accounts

### Key Implementation Notes

1. **Payment Notifications**
   - WebSocket subscriptions only work for Lightning payments
   - Intraledger payments use polling (10-second intervals)
   - Always show USD balance in notifications for USD wallet users

2. **Contact Payments**
   - Check if contact has linked Flash account first
   - Use their Flash username for direct payments
   - Fall back to escrow for unlinked contacts

3. **Security**
   - Never log authentication tokens or full payment hashes
   - Sanitize all user input before logging
   - Use Redis for session management with encryption

4. **Testing Commands**
   - Run linting: `npm run lint`
   - Run type checking: `npm run typecheck`
   - Always run these before considering a task complete

## Common Issues and Solutions

1. **Duplicate Notifications on Restart**
   - Last transaction IDs are persisted in Redis
   - Notification deduplication uses 24-hour timeout

2. **Contact Payments Going to Escrow**
   - Ensure `lightningAddress` is cleared when using username flow
   - Check contact's linked Flash account before defaulting to escrow

3. **Wrong Currency in Notifications**
   - Always check wallet type and show appropriate currency
   - USD users should see USD balance, not BTC

## Development Guidelines

- Keep logs minimal and sanitized for production
- Prefer USD operations over BTC
- Test with both USD and BTC wallets (when BTC is explicitly needed)
- Always handle both Lightning and Intraledger payment types
- Use TypeScript strict mode and fix all type errors