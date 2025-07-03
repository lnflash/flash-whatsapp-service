#!/bin/bash

# Pulse Production Cleanup Script
# This script completely removes a Pulse installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

echo -e "${YELLOW}WARNING: This will completely remove Pulse and all its data!${NC}"
echo "This includes:"
echo "  - All Docker containers and volumes"
echo "  - WhatsApp sessions"
echo "  - Configuration files"
echo "  - Logs and backups"
echo ""
read -p "Are you absolutely sure you want to continue? Type 'yes' to confirm: " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo -e "${YELLOW}Starting cleanup...${NC}"

# Stop and remove systemd service
if systemctl is-active --quiet pulse; then
    echo "Stopping Pulse service..."
    systemctl stop pulse
fi

if systemctl is-enabled --quiet pulse 2>/dev/null; then
    echo "Disabling Pulse service..."
    systemctl disable pulse
fi

if [ -f /etc/systemd/system/pulse.service ]; then
    echo "Removing systemd service..."
    rm -f /etc/systemd/system/pulse.service
    systemctl daemon-reload
fi

# Stop and remove Docker containers
cd /opt/pulse 2>/dev/null || true
if [ -f docker-compose.production.yml ]; then
    echo "Stopping Docker containers..."
    docker compose -f docker-compose.production.yml down -v || true
fi

if [ -f docker-compose.prod.debian.yml ]; then
    docker compose -f docker-compose.prod.debian.yml down -v || true
fi

# Remove Docker volumes
echo "Removing Docker volumes..."
docker volume rm pulse_redis-data pulse_rabbitmq-data 2>/dev/null || true
docker volume ls | grep pulse | awk '{print $2}' | xargs -r docker volume rm 2>/dev/null || true

# Remove Nginx configuration
if [ -L /etc/nginx/sites-enabled/pulse ]; then
    echo "Removing Nginx configuration..."
    rm -f /etc/nginx/sites-enabled/pulse
fi

if [ -f /etc/nginx/sites-available/pulse ]; then
    rm -f /etc/nginx/sites-available/pulse
fi

# Reload Nginx if it's running
if systemctl is-active --quiet nginx; then
    nginx -t && systemctl reload nginx || true
fi

# Remove cron jobs
if [ -f /etc/cron.d/pulse ]; then
    echo "Removing cron jobs..."
    rm -f /etc/cron.d/pulse
fi

# Remove fail2ban configuration
if [ -f /etc/fail2ban/jail.d/pulse.conf ]; then
    echo "Removing fail2ban configuration..."
    rm -f /etc/fail2ban/jail.d/pulse.conf
fi

if [ -f /etc/fail2ban/filter.d/pulse-auth.conf ]; then
    rm -f /etc/fail2ban/filter.d/pulse-auth.conf
fi

# Reload fail2ban if it's running
if systemctl is-active --quiet fail2ban; then
    systemctl reload fail2ban || true
fi

# Backup .env file if it exists
if [ -f /opt/pulse/.env ]; then
    echo "Backing up .env file to /root/pulse-env-backup-$(date +%Y%m%d-%H%M%S)"
    cp /opt/pulse/.env /root/pulse-env-backup-$(date +%Y%m%d-%H%M%S)
fi

# Remove application directory
if [ -d /opt/pulse ]; then
    echo "Removing application directory..."
    rm -rf /opt/pulse
fi

# Remove log files
if [ -f /var/log/nginx/pulse_access.log ]; then
    rm -f /var/log/nginx/pulse_access.log
fi

if [ -f /var/log/nginx/pulse_error.log ]; then
    rm -f /var/log/nginx/pulse_error.log
fi

echo -e "${GREEN}Cleanup completed!${NC}"
echo ""
echo "The following items have been removed:"
echo "  ✓ Pulse systemd service"
echo "  ✓ Docker containers and volumes"
echo "  ✓ Nginx configuration"
echo "  ✓ Cron jobs"
echo "  ✓ Fail2ban rules"
echo "  ✓ Application directory (/opt/pulse)"
echo ""
echo "The following items were NOT removed:"
echo "  - Docker itself"
echo "  - Node.js"
echo "  - Nginx"
echo "  - System packages"
echo "  - SSL certificates (in /etc/letsencrypt)"
echo ""
if [ -f /root/pulse-env-backup-* ]; then
    echo "Your .env file has been backed up to: /root/pulse-env-backup-*"
fi
echo ""
echo "You can now run the setup script again for a fresh installation:"
echo "  wget -O - https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh | sudo bash"