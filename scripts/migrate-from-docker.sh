#!/bin/bash

# Migration script from Docker to native installation

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

print_info "Pulse Docker to Native Migration Script"
echo ""
print_warning "This will migrate your Pulse installation from Docker to native PM2"
print_warning "Your WhatsApp sessions and configuration will be preserved"
echo ""
read -p "Continue with migration? (y/n): " CONTINUE
if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
    exit 0
fi

# Check if Docker installation exists
if [ ! -f "/opt/pulse/docker-compose.production.yml" ] && [ ! -f "/opt/pulse/docker-compose.prod.debian.yml" ]; then
    print_error "No Docker installation found at /opt/pulse"
    exit 1
fi

# Backup current data
print_info "Creating backup of current installation..."
BACKUP_DIR="/opt/pulse/backup-docker-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR

# Stop Docker containers
print_info "Stopping Docker containers..."
cd /opt/pulse
docker compose down 2>/dev/null || docker compose -f docker-compose.production.yml down 2>/dev/null || docker compose -f docker-compose.prod.debian.yml down 2>/dev/null || true

# Backup important files
print_info "Backing up WhatsApp sessions and configuration..."
cp -r whatsapp-sessions $BACKUP_DIR/ 2>/dev/null || true
cp -r whatsapp-sessions-new $BACKUP_DIR/ 2>/dev/null || true
cp .env $BACKUP_DIR/ 2>/dev/null || true
cp -r logs $BACKUP_DIR/ 2>/dev/null || true

# Extract Redis data from Docker
print_info "Extracting Redis data..."
docker run --rm -v pulse_redis-data:/data -v $BACKUP_DIR:/backup alpine cp -r /data /backup/redis-data 2>/dev/null || true

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_success "Backup completed at: $BACKUP_DIR"
echo ""
print_info "Now run the non-Docker setup script:"
echo ""
echo "wget -O - https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps-no-docker.sh | sudo bash"
echo ""
print_info "After setup completes:"
echo "1. Your .env file will be preserved automatically"
echo "2. WhatsApp sessions are already in place"
echo "3. You may need to scan the QR code again if sessions don't work"
echo "4. Redis data can be restored from: $BACKUP_DIR/redis-data"
echo ""
print_warning "Docker containers and volumes will remain intact until you manually remove them"
print_info "To remove Docker setup after confirming native installation works:"
echo "  docker compose -f docker-compose.production.yml down -v"
echo "  docker system prune -a"