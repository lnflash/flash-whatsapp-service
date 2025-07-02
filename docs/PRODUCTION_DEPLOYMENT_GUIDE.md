# Production Deployment Guide

This guide walks you through deploying Pulse on a fresh Ubuntu 24 VPS using our automated setup script.

## Prerequisites

1. **VPS Requirements**:
   - Ubuntu 24.04 LTS
   - Minimum 2GB RAM (4GB recommended)
   - 20GB storage
   - Root access

2. **Domain Setup**:
   - A domain name pointing to your VPS IP
   - DNS A record configured

3. **API Keys** (can be added after setup):
   - Flash API credentials
   - Google Gemini API key (optional)

## Quick Start

1. **Connect to your VPS**:
   ```bash
   ssh root@your-vps-ip
   ```

2. **Download and run the setup script**:
   ```bash
   wget https://raw.githubusercontent.com/lnflash/pulse/admin-panel/scripts/setup-ubuntu-vps.sh
   chmod +x setup-ubuntu-vps.sh
   ./setup-ubuntu-vps.sh
   ```

3. **Follow the prompts**:
   - Enter your domain name (e.g., `pulse.yourdomain.com`)
   - Enter your email for SSL certificates
   - Choose whether to enable the admin panel

4. **The script will automatically**:
   - Update system packages
   - Install Docker and dependencies
   - Configure firewall (UFW)
   - Set up Nginx with SSL (Let's Encrypt)
   - Create secure passwords
   - Deploy Pulse with Redis and RabbitMQ
   - Set up automated backups
   - Configure monitoring
   - Enable fail2ban for security

## Post-Installation Steps

### 1. Configure Environment Variables

Edit the `.env` file with your API credentials:
```bash
cd /opt/pulse
nano .env
```

Update these values:
- `FLASH_API_KEY`: Your Flash API key
- `GEMINI_API_KEY`: Google Gemini API key (optional)
- `ADMIN_PHONE_NUMBERS`: Comma-separated admin phone numbers
- `SUPPORT_PHONE_NUMBER`: Support agent phone number

### 2. Restart Services

After updating the configuration:
```bash
docker compose -f docker-compose.production.yml restart
```

### 3. Connect WhatsApp

View the QR code to connect WhatsApp:
```bash
docker logs pulse-app
```

Scan the QR code with WhatsApp on your phone.

### 4. Verify Installation

Check service status:
```bash
/opt/pulse/scripts/monitor.sh
```

Test the health endpoint:
```bash
curl https://your-domain.com/health
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