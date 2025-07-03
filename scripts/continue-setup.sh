#!/bin/bash

# Continue setup from Node.js installation
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Get domain info
DOMAIN_NAME="pulse.getflash.io"
SSL_EMAIL="pulse@getflash.io"
ENABLE_ADMIN_PANEL=true

# Install Chromium via snap
print_info "Installing Chromium..."
snap install chromium || true
ln -sf /snap/bin/chromium /usr/bin/chromium || true

# Install Node.js 20
print_info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 globally
print_info "Installing PM2..."
npm install -g pm2

# The rest of your setup continues from here...
print_info "Continuing with Pulse setup..."

# Now run the main setup script but skip the package installation
export SKIP_PACKAGE_INSTALL=1
cd /opt/pulse
./setup-ubuntu-vps-no-docker.sh