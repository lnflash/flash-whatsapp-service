# Production Deployment Guide

## Prerequisites
- Docker and Docker Compose installed
- Node.js 20+ (for local builds)
- Access to production servers
- All environment variables configured
- Google Cloud service account (for voice features)

## Pre-Deployment Checklist
1. Run tests: `npm test`
2. Run linting: `npm run lint`
3. Run type checking: `npm run typecheck`
4. Check for vulnerabilities: `npm audit`
5. Review SECURITY_CHECKLIST.md

## Environment Setup

### 1. Create Production Environment File
```bash
cp .env.production.example .env.production
# Edit .env.production with production values
```

### 2. Generate Secure Secrets
```bash
# Generate secure random strings
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For ENCRYPTION_KEY
openssl rand -hex 16  # For salts
```

### 3. Configure Google Cloud (for voice features)
- Create service account with Speech-to-Text and Text-to-Speech permissions
- Download JSON key file
- Set GOOGLE_CLOUD_KEYFILE path in .env.production

## Deployment Options

### Option 1: Docker Compose (Recommended)
```bash
# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f pulse

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### Option 2: PM2 Process Manager
```bash
# Install PM2 globally
npm install -g pm2

# Build application
npm run build

# Start with PM2
pm2 start ecosystem.prod.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

### Option 3: Kubernetes (Advanced)
See `/k8s` directory for Kubernetes manifests (if available)

## Post-Deployment

### 1. Verify Health
```bash
curl https://your-domain.com/health
# Should return: {"status":"ok"}
```

### 2. Check WhatsApp Connection
- Monitor logs for QR code (first time only)
- Scan QR code with WhatsApp
- Verify "WhatsApp client is ready" in logs

### 3. Test Basic Commands
Send WhatsApp messages to test:
- "balance" - Check account balance
- "help" - Get help menu
- "voice on" - Enable voice responses

### 4. Monitor Logs
```bash
# Docker logs
docker logs pulse-production -f

# PM2 logs
pm2 logs pulse-production
```

## Maintenance

### Updating the Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart (Docker)
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Rebuild and restart (PM2)
npm run build
pm2 restart pulse-production
```

### Backup
- Redis data: `/var/lib/docker/volumes/pulse_redis-data`
- WhatsApp sessions: `/var/lib/docker/volumes/pulse_whatsapp-sessions`

### Monitoring
- Set up alerts for container restarts
- Monitor Redis memory usage
- Track message processing metrics
- Set up uptime monitoring

## Troubleshooting

### WhatsApp Connection Issues
```bash
# Clear session and re-authenticate
docker-compose -f docker-compose.prod.yml exec pulse rm -rf /app/whatsapp-sessions/*
docker-compose -f docker-compose.prod.yml restart pulse
```

### Redis Connection Issues
```bash
# Check Redis connectivity
docker-compose -f docker-compose.prod.yml exec redis redis-cli ping
```

### High Memory Usage
```bash
# Check memory usage
docker stats

# Restart with memory limits
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## Security Reminders
- Never commit .env.production to git
- Rotate secrets regularly
- Monitor for suspicious activity
- Keep dependencies updated
- Review access logs regularly

## Support
For issues or questions:
- Check logs first
- Review error messages
- Consult CLAUDE.md for context
- Contact development team