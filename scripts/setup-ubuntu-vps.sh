#!/bin/bash

# Pulse Production Setup Script for Ubuntu VPS
# Tested on Ubuntu 22.04 LTS and 24.04 LTS
# IMPORTANT: Use LTS versions only! Avoid interim releases (24.10, etc)
# This script sets up Pulse with PM2, native Chromium, Redis, and RabbitMQ

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "\n${MAGENTA}==>${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

# Check Ubuntu version
UBUNTU_VERSION=$(lsb_release -rs)
print_info "Detected Ubuntu $UBUNTU_VERSION"

# Warn if not using LTS
if [[ "$UBUNTU_VERSION" != "22.04" ]] && [[ "$UBUNTU_VERSION" != "24.04" ]]; then
    print_warning "You are using Ubuntu $UBUNTU_VERSION which is not an LTS release"
    print_warning "For production use, we strongly recommend Ubuntu 22.04 LTS or 24.04 LTS"
    print_warning "Interim releases like 24.10 may have compatibility issues with third-party repositories"
    echo ""
    read -p "Continue anyway? (not recommended) (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Please use Ubuntu 22.04 LTS or 24.04 LTS for production deployments"
        exit 1
    fi
fi

# Banner
clear
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         Pulse WhatsApp Bot - Production Setup             ║"
echo "║                  Native Installation                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "This script will install:"
echo "  • Node.js 20 LTS"
echo "  • PM2 Process Manager"
echo "  • Chromium Browser"
echo "  • Redis Server"
echo "  • RabbitMQ Server"
echo "  • Nginx with SSL"
echo "  • Automatic backups and monitoring"
echo ""

# Check for pending kernel updates
print_step "Checking system status"
CURRENT_KERNEL=$(uname -r)
LATEST_KERNEL=$(dpkg -l linux-image-* | grep '^ii' | awk '{print $2}' | grep -v "$CURRENT_KERNEL" | sort -V | tail -1 | sed 's/linux-image-//')

if [ ! -z "$LATEST_KERNEL" ] && [ "$LATEST_KERNEL" != "$CURRENT_KERNEL" ]; then
    print_warning "Kernel update available!"
    print_info "Current kernel: $CURRENT_KERNEL"
    print_info "Available kernel: $LATEST_KERNEL"
    print_warning "For best results, consider updating and rebooting before installation:"
    echo "  sudo apt update && sudo apt upgrade -y && sudo reboot"
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Please update and reboot, then run this script again"
        exit 0
    fi
fi

# Configure needrestart for non-interactive mode
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

# Create needrestart configuration for automatic mode
if [ -d "/etc/needrestart/conf.d" ]; then
    cat > /etc/needrestart/conf.d/50-autorestart.conf << 'EOF'
# Automatically restart services
$nrconf{restart} = 'a';

# Don't ask for kernel restart
$nrconf{kernelhints} = 0;

# Skip UI
$nrconf{ui} = '';
EOF
fi

# Check if already installed
if [ -d "/opt/pulse" ] && [ -f "/opt/pulse/.env" ]; then
    print_warning "Pulse appears to be already installed!"
    read -p "Do you want to reinstall? This will backup your current installation (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installation cancelled"
        exit 0
    fi
    
    # Backup existing installation
    BACKUP_DIR="/opt/pulse-backup-$(date +%Y%m%d-%H%M%S)"
    print_info "Backing up current installation to $BACKUP_DIR"
    cp -r /opt/pulse $BACKUP_DIR
fi

# Get configuration
print_step "Configuration"
echo ""

# Domain name
while true; do
    read -p "Enter your domain name (e.g., pulse.example.com): " DOMAIN_NAME
    if [[ -z "$DOMAIN_NAME" ]]; then
        print_error "Domain name is required"
    elif [[ ! "$DOMAIN_NAME" =~ ^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid domain name format"
    else
        break
    fi
done

# SSL Email
while true; do
    read -p "Enter email for SSL certificates: " SSL_EMAIL
    if [[ -z "$SSL_EMAIL" ]]; then
        print_error "Email is required"
    elif [[ ! "$SSL_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid email format"
    else
        break
    fi
done

# Admin panel
read -p "Enable admin panel? (y/n) [y]: " ENABLE_ADMIN
ENABLE_ADMIN=${ENABLE_ADMIN:-y}
ENABLE_ADMIN_PANEL=false
if [[ "$ENABLE_ADMIN" =~ ^[Yy]$ ]]; then
    ENABLE_ADMIN_PANEL=true
fi

# Flash API
print_info "Flash API is required for payment processing"
read -p "Do you have your Flash API key ready? (y/n): " HAS_FLASH_KEY
if [[ "$HAS_FLASH_KEY" =~ ^[Yy]$ ]]; then
    read -p "Enter your Flash API key: " FLASH_API_KEY
fi

# Admin phone numbers
read -p "Enter admin phone numbers (comma-separated, e.g., +1234567890,+0987654321): " ADMIN_PHONES

# Support phone number
read -p "Enter support phone number (optional, press Enter to skip): " SUPPORT_PHONE

# Optional AI and Nostr configuration
print_info "The following are optional. Press Enter to skip any you don't have."

# Gemini API
read -p "Enter Google Gemini API key (optional): " GEMINI_API_KEY

# Nostr configuration
read -p "Enter Nostr private key (nsec format, optional): " NOSTR_PRIVATE_KEY
read -p "Enter Pulse bot's Nostr public key (npub format, optional): " NOSTR_PULSE_NPUB

# Google Cloud
read -p "Do you have a Google Cloud keyfile for Text-to-Speech? (y/n) [n]: " HAS_GOOGLE_CLOUD
HAS_GOOGLE_CLOUD=${HAS_GOOGLE_CLOUD:-n}
if [[ "$HAS_GOOGLE_CLOUD" =~ ^[Yy]$ ]]; then
    read -p "Enter the full path to your Google Cloud keyfile JSON: " GOOGLE_CLOUD_KEYFILE_PATH
    if [ -f "$GOOGLE_CLOUD_KEYFILE_PATH" ]; then
        GOOGLE_CLOUD_KEYFILE="/opt/pulse/credentials/google-cloud-key.json"
    else
        print_warning "File not found: $GOOGLE_CLOUD_KEYFILE_PATH"
        GOOGLE_CLOUD_KEYFILE=""
    fi
fi

print_info "Configuration summary:"
echo "  Domain: $DOMAIN_NAME"
echo "  SSL Email: $SSL_EMAIL"
echo "  Admin Panel: $ENABLE_ADMIN_PANEL"
echo "  Flash API: $([ -n "$FLASH_API_KEY" ] && echo "Configured" || echo "To be configured later")"
echo "  Support Phone: $([ -n "$SUPPORT_PHONE" ] && echo "$SUPPORT_PHONE" || echo "Not configured")"
echo "  Gemini AI: $([ -n "$GEMINI_API_KEY" ] && echo "Configured" || echo "Not configured")"
echo "  Nostr: $([ -n "$NOSTR_PRIVATE_KEY" ] && echo "Configured" || echo "Not configured")"
echo "  Google Cloud TTS: $([ -n "$GOOGLE_CLOUD_KEYFILE" ] && echo "Configured" || echo "Not configured")"
echo ""
read -p "Continue with installation? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# System update
print_step "Updating system packages"
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# Install base packages
print_step "Installing base packages"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban \
    htop \
    vim \
    nano \
    net-tools \
    lsof

# Install Node.js
print_step "Installing Node.js 20 LTS"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
print_success "Node.js $(node --version) installed"

# Install PM2
print_step "Installing PM2 Process Manager"
npm install -g pm2
print_success "PM2 installed"

# Install Chromium
print_step "Installing Chromium Browser"
# Install dependencies first
# Handle package name differences - Ubuntu 24.04+ uses t64 transition packages
if [[ "$UBUNTU_VERSION" == "24.04" ]] || [[ "$UBUNTU_VERSION" == "24.10" ]] || [[ "$UBUNTU_VERSION" > "24.10" ]]; then
    # Ubuntu 24.04+ uses t64 transition packages
    apt install -y \
        fonts-liberation \
        libasound2t64 \
        libatk-bridge2.0-0t64 \
        libatk1.0-0t64 \
        libatspi2.0-0t64 \
        libcups2t64 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0t64 \
        libnss3 \
        libx11-6 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        xdg-utils
else
    # Ubuntu 22.04 uses standard packages
    apt install -y \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnss3 \
        libx11-6 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        xdg-utils
fi

# Install Chromium based on Ubuntu version
if [[ "$UBUNTU_VERSION" == "24."* ]]; then
    # Ubuntu 24 defaults to snap, but we need the apt version for systemd compatibility
    print_info "Installing Chromium from apt (snap version has systemd issues)"
    # Add universe repository if not already enabled
    add-apt-repository universe -y
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    # Install chromium-browser instead of snap
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq chromium-browser
    CHROME_PATH="/usr/bin/chromium-browser"
else
    # Ubuntu 22 and older
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq chromium-browser
    CHROME_PATH="/usr/bin/chromium-browser"
fi

# Verify Chromium installation
if [ -x "$CHROME_PATH" ]; then
    print_success "Chromium installed at $CHROME_PATH"
else
    print_error "Chromium installation failed"
    exit 1
fi

# Install Redis
print_step "Installing and configuring Redis"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq redis-server

# Generate Redis password
REDIS_PASSWORD=$(openssl rand -hex 32)

# Configure Redis
cat > /etc/redis/redis.conf << EOF
bind 127.0.0.1
protected-mode yes
port 6379
requirepass $REDIS_PASSWORD
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
dir /var/lib/redis
EOF

# Configure system for Redis
if ! grep -q "vm.overcommit_memory = 1" /etc/sysctl.conf; then
    echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf
    sysctl -w vm.overcommit_memory=1
fi

systemctl restart redis-server
systemctl enable redis-server
print_success "Redis configured and running"

# Install RabbitMQ
print_step "Installing RabbitMQ"

# Check if we can use the official RabbitMQ repo or need to use Ubuntu's packages
if [[ "$UBUNTU_VERSION" == "24.04" ]] || [[ "$UBUNTU_VERSION" == "24.10" ]] || [[ "$UBUNTU_VERSION" > "24.10" ]]; then
    print_info "Using Ubuntu's RabbitMQ packages for Ubuntu $UBUNTU_VERSION"
    # Remove any existing RabbitMQ repo that might have been added
    rm -f /etc/apt/sources.list.d/rabbitmq.list
    apt update
    # For Ubuntu 24.04+, use the distribution's RabbitMQ
    apt install -y rabbitmq-server
else
    # For Ubuntu 22.04, use official RabbitMQ repo
    print_info "Using official RabbitMQ repository"
    # Install Erlang dependencies
    apt install -y erlang-base erlang-asn1 erlang-crypto erlang-eldap erlang-ftp \
        erlang-inets erlang-mnesia erlang-os-mon erlang-parsetools \
        erlang-public-key erlang-runtime-tools erlang-snmp erlang-ssl \
        erlang-syntax-tools erlang-tftp erlang-tools erlang-xmerl

    # Add RabbitMQ repository
    curl -1sLf 'https://packagecloud.io/rabbitmq/rabbitmq-server/gpgkey' | gpg --dearmor | tee /usr/share/keyrings/rabbitmq.gpg > /dev/null
    echo "deb [signed-by=/usr/share/keyrings/rabbitmq.gpg] https://packagecloud.io/rabbitmq/rabbitmq-server/ubuntu/ $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/rabbitmq.list
    apt update
    apt install -y rabbitmq-server
fi

# Fix hostname resolution for RabbitMQ
echo "127.0.1.1 $(hostname)" >> /etc/hosts

# Start RabbitMQ
systemctl start rabbitmq-server
systemctl enable rabbitmq-server

# Generate RabbitMQ password
RABBITMQ_PASSWORD=$(openssl rand -hex 32)

# Configure RabbitMQ
rabbitmq-plugins enable rabbitmq_management
# Delete existing pulse user if it exists and recreate with new password
rabbitmqctl delete_user pulse 2>/dev/null || true
rabbitmqctl add_user pulse "$RABBITMQ_PASSWORD"
rabbitmqctl set_user_tags pulse administrator
rabbitmqctl set_permissions -p / pulse ".*" ".*" ".*"
# Delete default guest user for security
rabbitmqctl delete_user guest 2>/dev/null || true
print_success "RabbitMQ configured and running"

# Install Nginx
print_step "Installing Nginx"
apt install -y nginx

# Create application user
print_step "Creating application user"
if ! id -u pulse &>/dev/null; then
    useradd -m -s /bin/bash pulse
fi

# Clone repository
print_step "Setting up application"
cd /opt

if [ -d "pulse" ]; then
    print_info "Pulse directory exists, updating..."
    cd pulse
    # Check if it's a git repository
    if [ -d ".git" ]; then
        sudo -u pulse git fetch origin
        sudo -u pulse git checkout main
        sudo -u pulse git pull origin main
    else
        print_warning "Existing directory is not a git repository, removing and cloning fresh"
        cd ..
        rm -rf pulse
        git clone https://github.com/lnflash/pulse.git
        cd pulse
        chown -R pulse:pulse /opt/pulse
    fi
else
    git clone https://github.com/lnflash/pulse.git
    cd pulse
    chown -R pulse:pulse /opt/pulse
fi

# Create directories
sudo -u pulse mkdir -p whatsapp-sessions logs backups credentials public scripts
chmod 777 whatsapp-sessions  # Chrome needs write access

# Copy Google Cloud keyfile if provided
if [ -n "$GOOGLE_CLOUD_KEYFILE_PATH" ] && [ -f "$GOOGLE_CLOUD_KEYFILE_PATH" ]; then
    cp "$GOOGLE_CLOUD_KEYFILE_PATH" /opt/pulse/credentials/google-cloud-key.json
    chown pulse:pulse /opt/pulse/credentials/google-cloud-key.json
    chmod 600 /opt/pulse/credentials/google-cloud-key.json
    print_success "Google Cloud keyfile copied to credentials directory"
fi

# Generate secure keys
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SALT=$(openssl rand -hex 16)
HASH_SALT=$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Create .env file
print_step "Creating environment configuration"
sudo -u pulse cat > .env << EOF
# Pulse Production Configuration
# Generated on $(date)

# Application
NODE_ENV=production
PORT=3000
DOMAIN_NAME=$DOMAIN_NAME

# Chrome/Puppeteer
PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=0

# RabbitMQ
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=pulse
RABBITMQ_PASSWORD=$RABBITMQ_PASSWORD
RABBITMQ_URL=amqp://pulse:$RABBITMQ_PASSWORD@localhost:5672

# Flash API (Required for payments)
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_API_KEY=${FLASH_API_KEY:-YOUR_FLASH_API_KEY_HERE}

# Admin Configuration
ADMIN_PHONE_NUMBERS=${ADMIN_PHONES:-YOUR_ADMIN_PHONES_HERE}
SUPPORT_PHONE_NUMBER=${SUPPORT_PHONE:-}

# Security
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENCRYPTION_SALT=$ENCRYPTION_SALT
HASH_SALT=$HASH_SALT

# Session
SESSION_SECRET=$SESSION_SECRET
SESSION_EXPIRES_IN=86400
SESSION_ROTATION_INTERVAL=3600

# Webhook
WEBHOOK_SECRET=$WEBHOOK_SECRET
WEBHOOK_TOLERANCE=300

# Optional Services
GEMINI_API_KEY=${GEMINI_API_KEY:-}
NOSTR_PRIVATE_KEY=${NOSTR_PRIVATE_KEY:-}
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band,wss://relay.flashapp.me
NOSTR_PULSE_NPUB=${NOSTR_PULSE_NPUB:-}
GOOGLE_CLOUD_KEYFILE=${GOOGLE_CLOUD_KEYFILE:-}

# Features
ENABLE_ADMIN_PANEL=$ENABLE_ADMIN_PANEL
ENABLE_INTRALEDGER_POLLING=true
ENABLE_WEBSOCKET_NOTIFICATIONS=true
PAYMENT_POLLING_INTERVAL=10000

# Limits
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
MAX_REQUEST_SIZE=10mb
MAX_JSON_SIZE=1mb
MAX_URL_ENCODED_SIZE=1mb

# Logging
LOG_LEVEL=info

# CORS
CORS_ALLOWED_ORIGINS=https://$DOMAIN_NAME
EOF

# Install dependencies and build
print_step "Installing dependencies and building application"
sudo -u pulse npm install
sudo -u pulse npm run build

# Create PM2 ecosystem file
print_step "Configuring PM2"
sudo -u pulse cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'pulse',
    script: 'dist/main.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: 10000
  }]
};
EOF

# Setup PM2 startup
pm2 startup systemd -u pulse --hp /home/pulse

# Configure Nginx (HTTP only initially)
print_step "Configuring Nginx"
cat > /etc/nginx/sites-available/pulse << EOF
# Rate limiting
limit_req_zone \$binary_remote_addr zone=pulse_limit:10m rate=10r/s;

upstream pulse_backend {
    server 127.0.0.1:3000 fail_timeout=0;
}

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN_NAME;

    # Logging
    access_log /var/log/nginx/pulse_access.log;
    error_log /var/log/nginx/pulse_error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Rate limiting
    limit_req zone=pulse_limit burst=20 nodelay;

    # Client body size
    client_max_body_size 10M;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Proxy settings
    location / {
        proxy_pass http://pulse_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket support
    location /socket.io {
        proxy_pass http://pulse_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Health check
    location /health {
        proxy_pass http://pulse_backend;
        access_log off;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/pulse /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Install Certbot
print_step "Installing SSL Certificate"
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
if [ -d "/etc/letsencrypt/live/$DOMAIN_NAME" ]; then
    print_warning "SSL certificate already exists for $DOMAIN_NAME"
    print_info "Reconfiguring Nginx to use existing certificate..."
    certbot --nginx -d $DOMAIN_NAME --reinstall --redirect --non-interactive --agree-tos -m $SSL_EMAIL
else
    print_info "Requesting new SSL certificate..."
    certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos -m $SSL_EMAIL --redirect
fi

# Reload Nginx
systemctl reload nginx

# Configure firewall
print_step "Configuring firewall"
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Create management script
print_step "Creating management scripts"
cat > /usr/local/bin/pulse << 'EOF'
#!/bin/bash
# Pulse management script

case "$1" in
    start)
        sudo -u pulse pm2 start /opt/pulse/ecosystem.config.js
        ;;
    stop)
        sudo -u pulse pm2 stop pulse
        ;;
    restart)
        sudo -u pulse pm2 restart pulse
        ;;
    reload)
        sudo -u pulse pm2 reload pulse
        ;;
    status)
        sudo -u pulse pm2 status
        ;;
    logs)
        sudo -u pulse pm2 logs pulse ${@:2}
        ;;
    monitor)
        sudo -u pulse pm2 monit
        ;;
    update)
        cd /opt/pulse
        sudo -u pulse git pull origin main
        sudo -u pulse npm install
        sudo -u pulse npm run build
        sudo -u pulse pm2 restart pulse
        ;;
    backup)
        /opt/pulse/scripts/backup.sh
        ;;
    *)
        echo "Usage: pulse {start|stop|restart|reload|status|logs|monitor|update|backup}"
        exit 1
        ;;
esac
EOF
chmod +x /usr/local/bin/pulse

# Create backup script
cat > /opt/pulse/scripts/backup.sh << 'EOF'
#!/bin/bash
# Pulse backup script

BACKUP_DIR="/opt/pulse/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="pulse_backup_$TIMESTAMP"

mkdir -p $BACKUP_DIR/$BACKUP_NAME

# Backup application data
cp -r /opt/pulse/whatsapp-sessions $BACKUP_DIR/$BACKUP_NAME/
cp /opt/pulse/.env $BACKUP_DIR/$BACKUP_NAME/

# Backup Redis
redis-cli --no-auth-warning -a $(grep REDIS_PASSWORD /opt/pulse/.env | cut -d'=' -f2) BGSAVE
sleep 5
cp /var/lib/redis/dump.rdb $BACKUP_DIR/$BACKUP_NAME/

# Create archive
cd $BACKUP_DIR
tar -czf $BACKUP_NAME.tar.gz $BACKUP_NAME
rm -rf $BACKUP_NAME

# Keep only last 7 backups
ls -t $BACKUP_DIR/*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
EOF
chmod +x /opt/pulse/scripts/backup.sh
chown pulse:pulse /opt/pulse/scripts/backup.sh

# Create monitoring script
cat > /opt/pulse/scripts/monitor.sh << 'EOF'
#!/bin/bash
# Pulse monitoring script

echo "=== Pulse Service Status ==="
pm2 status

echo -e "\n=== System Resources ==="
echo "Memory Usage:"
free -h

echo -e "\nDisk Usage:"
df -h /

echo -e "\n=== Service Health ==="
# Check Redis
if systemctl is-active --quiet redis-server; then
    echo "✓ Redis is running"
else
    echo "✗ Redis is not running"
fi

# Check RabbitMQ
if systemctl is-active --quiet rabbitmq-server; then
    echo "✓ RabbitMQ is running"
else
    echo "✗ RabbitMQ is not running"
fi

# Check Nginx
if systemctl is-active --quiet nginx; then
    echo "✓ Nginx is running"
else
    echo "✗ Nginx is not running"
fi

# Check API endpoint
if curl -s http://localhost:3000/health | grep -q "ok"; then
    echo "✓ API is responding"
else
    echo "✗ API is not responding"
fi

echo -e "\n=== Recent Errors ==="
pm2 logs pulse --err --lines 10 --nostream 2>/dev/null || echo "No recent errors"
EOF
chmod +x /opt/pulse/scripts/monitor.sh

# Setup cron jobs
print_step "Setting up automated tasks"
cat > /etc/cron.d/pulse << EOF
# Pulse automated tasks
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Daily backup at 3 AM
0 3 * * * pulse /opt/pulse/scripts/backup.sh >> /opt/pulse/logs/backup.log 2>&1

# Monitor every 5 minutes
*/5 * * * * root /opt/pulse/scripts/monitor.sh >> /opt/pulse/logs/monitor.log 2>&1

# Log rotation weekly
0 0 * * 0 pulse find /opt/pulse/logs -name "*.log" -mtime +7 -delete

# SSL renewal check
0 2 * * * root certbot renew --quiet --post-hook "systemctl reload nginx"
EOF

# Setup fail2ban
print_step "Configuring security"
cat > /etc/fail2ban/jail.d/pulse.conf << EOF
[pulse-auth]
enabled = true
port = https,http
filter = pulse-auth
logpath = /var/log/nginx/pulse_access.log
maxretry = 5
bantime = 3600
findtime = 600

[nginx-limit-req]
enabled = true
port = https,http
filter = nginx-limit-req
logpath = /var/log/nginx/pulse_error.log
maxretry = 10
bantime = 600
findtime = 60
EOF

cat > /etc/fail2ban/filter.d/pulse-auth.conf << EOF
[Definition]
failregex = ^<HOST> .* "(POST|GET) /api/admin/auth/login.*" 401
ignoreregex =
EOF

systemctl restart fail2ban

# Start application
print_step "Starting Pulse"
cd /opt/pulse
sudo -u pulse pm2 start ecosystem.config.js
sudo -u pulse pm2 save

# Final summary
clear
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              Pulse Installation Complete!                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
print_success "Pulse has been successfully installed!"
echo ""
echo -e "${CYAN}Access Points:${NC}"
echo "  • WhatsApp Bot: Send messages to your connected number"
echo "  • API Endpoint: https://$DOMAIN_NAME"
echo "  • Health Check: https://$DOMAIN_NAME/health"
if [[ "$ENABLE_ADMIN_PANEL" == "true" ]]; then
    echo "  • Admin Panel: https://$DOMAIN_NAME/admin"
fi
echo "  • RabbitMQ Management: http://$DOMAIN_NAME:15672"
echo "    Username: pulse"
echo "    Password: Check RABBITMQ_PASSWORD in /opt/pulse/.env"
echo ""
echo -e "${YELLOW}Important Next Steps:${NC}"
if [ -z "$FLASH_API_KEY" ]; then
    echo "1. Add your Flash API key:"
    echo "   nano /opt/pulse/.env"
    echo "   Update: FLASH_API_KEY=your_actual_key"
    echo "   Then restart: pulse restart"
    echo ""
fi
echo "2. Connect WhatsApp:"
echo "   pulse logs"
echo "   Scan the QR code with WhatsApp"
echo ""
echo "3. Configure admin numbers if not done:"
echo "   nano /opt/pulse/.env"
echo "   Update: ADMIN_PHONE_NUMBERS=+1234567890,+0987654321"
echo ""
echo -e "${CYAN}Management Commands:${NC}"
echo "  pulse start     - Start the bot"
echo "  pulse stop      - Stop the bot"
echo "  pulse restart   - Restart the bot"
echo "  pulse status    - Check status"
echo "  pulse logs      - View logs"
echo "  pulse monitor   - System monitoring"
echo "  pulse update    - Update to latest version"
echo "  pulse backup    - Create backup"
echo ""
echo -e "${CYAN}Automatic Features:${NC}"
echo "  ✓ SSL certificate auto-renewal"
echo "  ✓ Daily backups at 3 AM"
echo "  ✓ Service monitoring every 5 minutes"
echo "  ✓ Log rotation weekly"
echo "  ✓ Fail2ban protection"
echo ""
print_info "Installation log: /var/log/pulse-install.log"
print_success "Your Pulse bot is ready to use!"