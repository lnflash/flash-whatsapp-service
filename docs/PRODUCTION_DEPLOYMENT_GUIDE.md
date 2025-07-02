# Production Deployment Guide

This is the official guide for deploying Pulse WhatsApp Bot on a production server.

## 🚀 Quick Deploy - One Command Installation

Deploy Pulse with a single command on Ubuntu 24 VPS:

```bash
curl -sSL https://raw.githubusercontent.com/lnflash/pulse/admin-panel/scripts/quick-install.sh | sudo bash
```

This command will:
1. Download and run our automated setup script
2. Prompt you for your domain name and email
3. Install and configure everything automatically
4. Provide you with next steps when complete

**That's it!** The script handles the entire deployment process.

## Prerequisites

1. **VPS Requirements**:
   - Ubuntu 24.04 LTS (fresh installation)
   - Minimum 2GB RAM (4GB recommended)
   - 20GB storage minimum
   - Root access via SSH

2. **Domain Setup**:
   - A domain name (e.g., `pulse.yourdomain.com`)
   - DNS A record pointing to your VPS IP address

3. **API Credentials** (can be added after installation):
   - Flash API key (required for payment features)
   - Google Gemini API key (optional, for AI responses)
   - Nostr private key (optional, for content sharing)

## Standard Installation

### 1. Connect to Your VPS

```bash
ssh root@your-vps-ip
```

### 2. Run the Setup Script

```bash
# Download and execute the setup script
wget https://raw.githubusercontent.com/lnflash/pulse/admin-panel/scripts/setup-ubuntu-vps.sh
chmod +x setup-ubuntu-vps.sh
./setup-ubuntu-vps.sh
```

### 3. Follow the Interactive Prompts

The script will ask for:
- **Domain name**: Enter your domain (e.g., `pulse.yourdomain.com`)
- **Email address**: For SSL certificate notifications
- **Admin panel**: Choose whether to enable the web admin dashboard

### 4. What the Script Does

The automated script handles everything:
- ✅ System updates and security hardening
- ✅ Docker and Docker Compose installation
- ✅ Nginx reverse proxy with SSL/TLS (Let's Encrypt)
- ✅ Redis with persistence and authentication
- ✅ RabbitMQ message broker setup
- ✅ Firewall configuration (UFW)
- ✅ Fail2ban intrusion prevention
- ✅ Automated daily backups
- ✅ Health monitoring and auto-recovery
- ✅ Systemd service for auto-start
- ✅ Secure password generation

## Post-Installation Configuration

### 1. Configure API Credentials

After installation completes, edit the environment file:

```bash
cd /opt/pulse
nano .env
```

Update these required values:
- `FLASH_API_KEY`: Your Flash API key (get from Flash team)
- `ADMIN_PHONE_NUMBERS`: Comma-separated list of admin phone numbers
- `SUPPORT_PHONE_NUMBER`: Phone number for human support routing

Optional configurations:
- `GEMINI_API_KEY`: For AI-powered responses (get from [Google AI Studio](https://makersuite.google.com/app/apikey))
- `NOSTR_PRIVATE_KEY`: Your Nostr nsec for content sharing features
- `NOSTR_PULSE_NPUB`: Your Pulse bot's Nostr public key

### 2. Restart Services

Apply your configuration changes:

```bash
cd /opt/pulse
docker compose -f docker-compose.production.yml restart
```

### 3. Connect WhatsApp

Get the QR code for WhatsApp connection:

```bash
docker logs pulse-app
```

1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code displayed in the terminal

⚠️ **Important**: Use a dedicated WhatsApp number for the bot. Do not use your personal number.

### 4. Verify Installation

Check that everything is running correctly:

```bash
# Check service status
/opt/pulse/scripts/monitor.sh

# Test the health endpoint
curl https://your-domain.com/health

# View application logs
docker logs pulse-app -f
```

## Service Management

### Start/Stop/Restart
```bash
systemctl start pulse
systemctl stop pulse
systemctl restart pulse
```

### View Logs
```bash
# System logs
journalctl -u pulse -f

# Application logs
docker logs pulse-app -f

# Redis logs
docker logs pulse-redis -f

# RabbitMQ logs
docker logs pulse-rabbitmq -f
```

### Manual Docker Commands
```bash
cd /opt/pulse

# Start services
docker compose -f docker-compose.production.yml up -d

# Stop services
docker compose -f docker-compose.production.yml down

# Restart services
docker compose -f docker-compose.production.yml restart

# View running containers
docker compose -f docker-compose.production.yml ps
```

## Admin Panel Access

If you enabled the admin panel during setup:
1. Navigate to `https://your-domain.com/admin`
2. Login with your admin phone number
3. Enter the OTP sent to your WhatsApp

## Backup and Recovery

### Automatic Backups
- Daily backups at 3 AM
- Stored in `/opt/pulse/backups`
- Last 7 backups are retained

### Manual Backup
```bash
/opt/pulse/scripts/backup.sh
```

### Restore from Backup
```bash
cd /opt/pulse/backups
tar -xzf pulse_backup_YYYYMMDD_HHMMSS.tar.gz
# Copy necessary files back to /opt/pulse
```

## Security Features

1. **Firewall (UFW)**:
   - Only required ports are open
   - SSH, HTTP, HTTPS allowed

2. **SSL/TLS**:
   - Auto-renewed via Let's Encrypt
   - Strong security headers

3. **Fail2ban**:
   - Protects against brute force
   - Rate limiting on API endpoints

4. **Docker Security**:
   - Services run with limited privileges
   - Network isolation

5. **Secrets Management**:
   - Auto-generated secure passwords
   - Environment variables for sensitive data

## Monitoring

### Health Checks
- Automatic monitoring every 5 minutes
- Service auto-restart on failure
- Logs in `/opt/pulse/logs/monitor.log`

### Resource Usage
```bash
# Check disk space
df -h

# Check memory
free -h

# Check Docker stats
docker stats
```

### Nginx Access Logs
```bash
tail -f /var/log/nginx/pulse_access.log
```

## Troubleshooting

### WhatsApp Connection Issues
```bash
# Check QR code
docker logs pulse-app | grep -i qr

# Restart WhatsApp service
docker compose -f docker-compose.production.yml restart app
```

### Redis Connection Issues
```bash
# Test Redis connection
docker exec pulse-redis redis-cli --auth $REDIS_PASSWORD ping
```

### RabbitMQ Issues
```bash
# Access RabbitMQ management UI
# Create SSH tunnel: ssh -L 15672:localhost:15672 root@your-vps-ip
# Visit: http://localhost:15672
```

### SSL Certificate Issues
```bash
# Renew certificate manually
certbot renew --nginx

# Test auto-renewal
certbot renew --dry-run
```

## Updating Pulse

1. **Backup first**:
   ```bash
   /opt/pulse/scripts/backup.sh
   ```

2. **Pull latest changes**:
   ```bash
   cd /opt/pulse
   git pull origin admin-panel
   ```

3. **Rebuild and restart**:
   ```bash
   docker compose -f docker-compose.production.yml build
   docker compose -f docker-compose.production.yml up -d
   ```

## Performance Tuning

### Redis Optimization
Edit Redis configuration in `docker-compose.production.yml`:
- Adjust `maxmemory` based on available RAM
- Configure `maxmemory-policy` for your use case

### Nginx Optimization
Edit `/etc/nginx/sites-available/pulse`:
- Adjust `worker_processes`
- Configure `worker_connections`
- Tune `keepalive_timeout`

### Docker Resources
Create `/opt/pulse/docker-compose.override.yml`:
```yaml
version: '3.8'
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## Support

For issues or questions:
1. Check application logs
2. Review this documentation
3. Visit [GitHub Issues](https://github.com/lnflash/pulse/issues)

## License

See LICENSE file in the repository.