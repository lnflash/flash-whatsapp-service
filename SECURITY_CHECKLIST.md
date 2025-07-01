# Production Security Checklist

## Environment Variables
- [ ] Generate secure random values for all secrets (use `openssl rand -hex 32`)
- [ ] Set strong passwords for Redis and RabbitMQ
- [ ] Ensure JWT_SECRET is at least 32 characters
- [ ] Set proper CORS origins (no wildcards in production)
- [ ] Configure rate limiting appropriately
- [ ] Remove or secure any development/test credentials

## Authentication & Authorization
- [ ] JWT tokens expire appropriately (24h for access, 7d for refresh)
- [ ] Session rotation is enabled (every hour)
- [ ] OTP/MFA timeouts are configured (5 minutes)
- [ ] Maximum login attempts are enforced

## Data Protection
- [ ] Encryption keys are properly generated and stored
- [ ] Sensitive data is encrypted at rest (Redis)
- [ ] No authentication tokens in logs
- [ ] Payment hashes are sanitized in logs
- [ ] User input is properly sanitized

## Network Security
- [ ] HTTPS is enforced in production
- [ ] HSTS headers are enabled
- [ ] CSP headers are configured
- [ ] CORS is properly configured
- [ ] Webhook signatures are validated

## Infrastructure
- [ ] Redis requires authentication
- [ ] RabbitMQ requires authentication
- [ ] Docker containers run as non-root user
- [ ] Volume permissions are restricted
- [ ] Health check endpoints don't expose sensitive data

## Monitoring & Logging
- [ ] Production logs are set to 'error' level only
- [ ] No debug information in production logs
- [ ] Sensitive data is redacted from logs
- [ ] Error tracking is configured (Sentry)
- [ ] Metrics don't expose sensitive information

## Dependencies
- [ ] All dependencies are up to date
- [ ] No known vulnerabilities (run `npm audit`)
- [ ] Production dependencies only (no dev dependencies)
- [ ] Package lock file is committed

## Code Security
- [ ] No hardcoded secrets or credentials
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (if applicable)
- [ ] XSS prevention measures
- [ ] No eval() or dynamic code execution

## Deployment
- [ ] Environment files are not committed to git
- [ ] Production secrets are stored securely
- [ ] Backup and recovery procedures are tested
- [ ] Rollback procedures are documented
- [ ] Access to production is restricted

## WhatsApp Specific
- [ ] Session data is encrypted
- [ ] Session persistence is secure
- [ ] Message content is not logged
- [ ] Phone numbers are sanitized in logs

## Payment Security
- [ ] Payment confirmations required for voice commands
- [ ] Transaction limits are enforced
- [ ] Payment logs don't contain full details
- [ ] Escrow payments are properly secured

## Review Checklist
- [ ] Security audit completed
- [ ] Penetration testing performed (if applicable)
- [ ] Code review for security vulnerabilities
- [ ] Documentation updated
- [ ] Team trained on security procedures