#!/bin/bash

# Pulse Production Setup Script for Ubuntu 24 VPS (No Docker)
# This script sets up a complete production environment without containerization

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
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

# Banner
echo -e "${YELLOW}"
echo "=================================================="
echo "     Pulse WhatsApp Bot - Production Setup"
echo "           (Non-Docker Installation)"
echo "=================================================="
echo -e "${NC}"

# Check if Pulse is already installed
if [ -f /opt/pulse/.env ] && systemctl is-active --quiet pulse; then
    print_warning "Pulse appears to be already installed!"
    read -p "Do you want to continue and reconfigure? (y/n): " CONTINUE_INSTALL
    if [[ ! "$CONTINUE_INSTALL" =~ ^[Yy]$ ]]; then
        print_info "Exiting. To update Pulse, use: cd /opt/pulse && git pull"
        exit 0
    fi
fi

# Get domain name
echo ""
read -p "Enter your domain name (e.g., pulse.yourdomain.com): " DOMAIN_NAME
if [[ -z "$DOMAIN_NAME" ]]; then
    print_error "Domain name is required"
    exit 1
fi

# Get email for SSL certificate
read -p "Enter your email address for SSL certificate notifications: " SSL_EMAIL
if [[ -z "$SSL_EMAIL" ]]; then
    print_error "Email address is required for SSL certificates"
    exit 1
fi

# Ask if user wants to set up admin panel
read -p "Do you want to enable the admin panel? (y/n): " ENABLE_ADMIN
ENABLE_ADMIN_PANEL=false
if [[ "$ENABLE_ADMIN" =~ ^[Yy]$ ]]; then
    ENABLE_ADMIN_PANEL=true
fi

print_info "Setting up Pulse on domain: $DOMAIN_NAME"

# Update system
print_info "Updating system packages..."
apt update && apt upgrade -y

# Install required packages
print_info "Installing required packages..."
apt install -y \
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
    redis-server \
    nginx \
    certbot \
    python3-certbot-nginx

# Install Chrome dependencies separately
print_info "Installing Chrome dependencies..."
apt install -y \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgbm1 \
    libxshmfence1 || true

# Install Chromium
print_info "Installing Chromium browser..."
# Try snap first (Ubuntu 24 default)
if command -v snap &> /dev/null; then
    snap install chromium || true
    # Create symlink for compatibility
    ln -sf /snap/bin/chromium /usr/bin/chromium || true
else
    # Fallback to apt
    apt install -y chromium || apt install -y chromium-browser || true
fi

# Install Node.js 20
print_info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 globally
print_info "Installing PM2..."
npm install -g pm2

# Install RabbitMQ
print_info "Installing RabbitMQ..."
curl -1sLf 'https://keys.openpgp.org/vks/v1/by-fingerprint/0A9AF2115F4687BD29803A206B73A36E6026DFCA' | gpg --dearmor | tee /usr/share/keyrings/com.rabbitmq.team.gpg > /dev/null
curl -1sLf https://github.com/rabbitmq/signing-keys/releases/download/3.0/cloudsmith.rabbitmq.com.E495BB49CC4BBE5B.key | gpg --dearmor | tee /usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg > /dev/null
curl -1sLf https://github.com/rabbitmq/signing-keys/releases/download/3.0/cloudsmith.rabbitmq.com.9F4587F226208342.key | gpg --dearmor | tee /usr/share/keyrings/rabbitmq.9F4587F226208342.gpg > /dev/null

tee /etc/apt/sources.list.d/rabbitmq.list <<EOF
## Provides RabbitMQ
deb [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main
deb-src [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main

deb [signed-by=/usr/share/keyrings/rabbitmq.9F4587F226208342.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-server/deb/ubuntu jammy main
deb-src [signed-by=/usr/share/keyrings/rabbitmq.9F4587F226208342.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-server/deb/ubuntu jammy main
EOF

apt update
apt install -y rabbitmq-server

# Enable RabbitMQ management plugin
rabbitmq-plugins enable rabbitmq_management

# Configure system for Redis
print_info "Configuring system for Redis..."
# Enable memory overcommit
if ! grep -q "vm.overcommit_memory = 1" /etc/sysctl.conf; then
    echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf
    sysctl -w vm.overcommit_memory=1
fi
# Increase max connections
if ! grep -q "net.core.somaxconn = 65535" /etc/sysctl.conf; then
    echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
    sysctl -w net.core.somaxconn=65535
fi

# Configure Redis
print_info "Configuring Redis..."
# Generate Redis password
REDIS_PASSWORD=$(openssl rand -hex 32)

# Update Redis configuration
cat > /etc/redis/redis.conf << EOF
# Redis Configuration
bind 127.0.0.1
protected-mode yes
port 6379
requirepass $REDIS_PASSWORD
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfilename "appendonly.aof"
dir /var/lib/redis
EOF

# Restart Redis
systemctl restart redis-server
systemctl enable redis-server

# Configure RabbitMQ
print_info "Configuring RabbitMQ..."
RABBITMQ_PASSWORD=$(openssl rand -hex 32)

# Delete default guest user and create pulse user
rabbitmqctl delete_user guest 2>/dev/null || true
rabbitmqctl add_user pulse $RABBITMQ_PASSWORD
rabbitmqctl set_user_tags pulse administrator
rabbitmqctl set_permissions -p / pulse ".*" ".*" ".*"

# Start and enable RabbitMQ
systemctl start rabbitmq-server
systemctl enable rabbitmq-server

# Configure firewall
print_info "Configuring firewall..."
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 3000/tcp  # Pulse API
ufw --force enable

# Create pulse user
print_info "Creating pulse user..."
if ! id -u pulse &>/dev/null; then
    useradd -m -s /bin/bash pulse
fi

# Create application directory
print_info "Creating application directory..."
mkdir -p /opt/pulse
cd /opt/pulse

# Clone or update the repository
if [ -d ".git" ]; then
    print_info "Repository already exists, updating..."
    git fetch origin
    git checkout main
    git pull origin main
else
    print_info "Cloning Pulse repository..."
    git clone https://github.com/lnflash/pulse.git .
    git checkout main
fi

# Set ownership
chown -R pulse:pulse /opt/pulse

# Create necessary directories
print_info "Creating application directories..."
sudo -u pulse mkdir -p whatsapp-sessions
sudo -u pulse mkdir -p whatsapp-sessions/session-pulse-bot
sudo -u pulse mkdir -p whatsapp-sessions-new/session
sudo -u pulse mkdir -p logs
sudo -u pulse mkdir -p backups
sudo -u pulse mkdir -p credentials
sudo -u pulse mkdir -p public
sudo -u pulse mkdir -p scripts

# Generate secure passwords and keys
print_info "Generating secure passwords..."
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SALT=$(openssl rand -hex 16)
HASH_SALT=$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Create .env file
print_info "Creating environment configuration..."
if [ -f .env ]; then
    print_warning "Existing .env file found, backing up..."
    cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
fi

sudo -u pulse cat > .env << EOF
# Pulse Production Configuration
# Generated on $(date)

# Application Configuration
NODE_ENV=production
PORT=3000

# Domain Configuration
DOMAIN_NAME=$DOMAIN_NAME

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=0

# RabbitMQ Configuration
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=pulse
RABBITMQ_PASSWORD=$RABBITMQ_PASSWORD
RABBITMQ_URL=amqp://pulse:$RABBITMQ_PASSWORD@localhost:5672

# Puppeteer Configuration
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Flash API Configuration (Update these with your API credentials)
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_API_KEY=

# Google Gemini AI Configuration (Optional)
GEMINI_API_KEY=

# Security Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Encryption Keys
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENCRYPTION_SALT=$ENCRYPTION_SALT
HASH_SALT=$HASH_SALT

# Session Configuration
SESSION_SECRET=$SESSION_SECRET
SESSION_EXPIRES_IN=86400
SESSION_ROTATION_INTERVAL=3600

# Webhook Security
WEBHOOK_SECRET=$WEBHOOK_SECRET
WEBHOOK_TOLERANCE=300

# MFA/OTP Configuration
OTP_LENGTH=6
OTP_EXPIRES_IN=300
OTP_MAX_ATTEMPTS=3
MFA_TIMEOUT_SECONDS=300

# CORS Configuration
CORS_ALLOWED_ORIGINS=https://$DOMAIN_NAME

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Request Size Limits
MAX_REQUEST_SIZE=10mb
MAX_JSON_SIZE=1mb
MAX_URL_ENCODED_SIZE=1mb

# Logging
LOG_LEVEL=info

# Payment Notifications
ENABLE_INTRALEDGER_POLLING=true
ENABLE_WEBSOCKET_NOTIFICATIONS=true
PAYMENT_POLLING_INTERVAL=10000

# Admin Configuration (Update with your admin phone numbers)
ADMIN_PHONE_NUMBERS=

# Support Configuration
SUPPORT_PHONE_NUMBER=

# Nostr Configuration (Optional)
NOSTR_PRIVATE_KEY=
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band,wss://relay.flashapp.me,wss://relay.primal.net
NOSTR_PULSE_NPUB=

# Google Cloud Services (Optional)
GOOGLE_CLOUD_KEYFILE=

# Admin Panel
ENABLE_ADMIN_PANEL=$ENABLE_ADMIN_PANEL
EOF

# Set proper permissions
chown pulse:pulse .env
chmod 600 .env

# Install dependencies and build
print_info "Installing dependencies and building application..."
sudo -u pulse npm install
sudo -u pulse npm run build

# Create PM2 ecosystem file
print_info "Creating PM2 configuration..."
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
    time: true
  }]
};
EOF

# Create systemd service for PM2
print_info "Creating systemd service..."
pm2 startup systemd -u pulse --hp /home/pulse
sudo -u pulse pm2 start ecosystem.config.js
sudo -u pulse pm2 save

# Create Nginx configuration
print_info "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/pulse << EOF
# Rate limiting
limit_req_zone \$binary_remote_addr zone=pulse_limit:10m rate=10r/s;

# Upstream configuration
upstream pulse_backend {
    server 127.0.0.1:3000 fail_timeout=0;
}

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN_NAME;

    # Location for Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/pulse /etc/nginx/sites-enabled/pulse
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t && systemctl reload nginx

# Obtain SSL certificate
print_info "Obtaining SSL certificate..."
if [ -d "/etc/letsencrypt/live/$DOMAIN_NAME" ]; then
    print_warning "SSL certificate already exists"
else
    certbot certonly --webroot -w /var/www/html -d $DOMAIN_NAME --non-interactive --agree-tos -m $SSL_EMAIL
fi

# Update Nginx with SSL configuration
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
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN_NAME;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Logging
    access_log /var/log/nginx/pulse_access.log;
    error_log /var/log/nginx/pulse_error.log;

    # Rate limiting
    limit_req zone=pulse_limit burst=20 nodelay;

    # Client body size limit
    client_max_body_size 10M;

    # API endpoints
    location / {
        proxy_pass http://pulse_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
EOF

# Add admin panel configuration if enabled
if [[ "$ENABLE_ADMIN_PANEL" == "true" ]]; then
    cat >> /etc/nginx/sites-available/pulse << EOF
    
    # Admin panel (static files)
    location /admin {
        alias /opt/pulse/public/admin;
        try_files \$uri \$uri/ /admin/index.html;
    }
EOF
fi

echo "}" >> /etc/nginx/sites-available/pulse

# Reload Nginx
nginx -t && systemctl reload nginx

# Create backup script
print_info "Creating backup script..."
cat > /opt/pulse/scripts/backup.sh << 'EOF'
#!/bin/bash
# Pulse Backup Script

BACKUP_DIR="/opt/pulse/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="pulse_backup_$DATE"

# Create backup directory
mkdir -p $BACKUP_DIR/$BACKUP_NAME

# Backup WhatsApp sessions
cp -r /opt/pulse/whatsapp-sessions $BACKUP_DIR/$BACKUP_NAME/

# Backup environment file
cp /opt/pulse/.env $BACKUP_DIR/$BACKUP_NAME/

# Backup Redis data
redis-cli -a $REDIS_PASSWORD BGSAVE
sleep 5
cp /var/lib/redis/appendonly.aof $BACKUP_DIR/$BACKUP_NAME/redis_backup.aof

# Create tarball
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
print_info "Creating monitoring script..."
cat > /opt/pulse/scripts/monitor.sh << 'EOF'
#!/bin/bash
# Pulse Monitoring Script

echo "=== Pulse Service Status ==="
if pm2 list | grep -q "pulse.*online"; then
    echo "✓ Pulse is running"
else
    echo "✗ Pulse is not running"
    # Restart the service
    sudo -u pulse pm2 restart pulse
fi

echo ""
echo "=== Redis Status ==="
if systemctl is-active --quiet redis-server; then
    echo "✓ Redis is running"
else
    echo "✗ Redis is not running"
    systemctl restart redis-server
fi

echo ""
echo "=== RabbitMQ Status ==="
if systemctl is-active --quiet rabbitmq-server; then
    echo "✓ RabbitMQ is running"
else
    echo "✗ RabbitMQ is not running"
    systemctl restart rabbitmq-server
fi

echo ""
echo "=== Disk Usage ==="
df -h | grep -E '^/dev/'

echo ""
echo "=== Memory Usage ==="
free -h

echo ""
echo "=== Recent Errors ==="
sudo -u pulse pm2 logs pulse --err --lines 20 --nostream || echo "No recent errors"
EOF

chmod +x /opt/pulse/scripts/monitor.sh

# Set up cron jobs
print_info "Setting up cron jobs..."
cat > /etc/cron.d/pulse << EOF
# Pulse Cron Jobs
# Daily backup at 3 AM
0 3 * * * pulse /opt/pulse/scripts/backup.sh >> /opt/pulse/logs/backup.log 2>&1

# Monitor services every 5 minutes
*/5 * * * * root /opt/pulse/scripts/monitor.sh >> /opt/pulse/logs/monitor.log 2>&1

# Rotate logs weekly
0 0 * * 0 pulse find /opt/pulse/logs -name "*.log" -mtime +7 -delete

# SSL certificate renewal
0 2 * * * root certbot renew --quiet --post-hook "systemctl reload nginx"
EOF

# Set up fail2ban
print_info "Configuring fail2ban..."
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

# Final permissions check
chown -R pulse:pulse /opt/pulse
chmod 755 /opt/pulse
chmod -R 775 /opt/pulse/whatsapp-sessions
chmod -R 755 /opt/pulse/logs /opt/pulse/public
chmod 700 /opt/pulse/credentials

# Create helper script for managing Pulse
cat > /usr/local/bin/pulse << 'EOF'
#!/bin/bash
# Pulse management helper script

case "$1" in
    start)
        sudo -u pulse pm2 start pulse
        ;;
    stop)
        sudo -u pulse pm2 stop pulse
        ;;
    restart)
        sudo -u pulse pm2 restart pulse
        ;;
    status)
        sudo -u pulse pm2 status pulse
        ;;
    logs)
        sudo -u pulse pm2 logs pulse ${@:2}
        ;;
    monitor)
        sudo -u pulse pm2 monit
        ;;
    *)
        echo "Usage: pulse {start|stop|restart|status|logs|monitor}"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/pulse

# Final instructions
echo ""
print_success "Pulse installation completed!"
echo ""
echo -e "${YELLOW}Important next steps:${NC}"
echo "1. Update the .env file with your configuration:"
echo "   nano /opt/pulse/.env"
echo ""
echo "   Required settings:"
echo "   - FLASH_API_KEY: Your Flash API key"
echo "   - ADMIN_PHONE_NUMBERS: Admin phone numbers (comma-separated)"
echo ""
echo "   Optional settings:"
echo "   - GEMINI_API_KEY: Google Gemini API key"
echo "   - SUPPORT_PHONE_NUMBER: Support phone number"
echo "   - NOSTR_PRIVATE_KEY: Nostr private key"
echo "   - NOSTR_PULSE_NPUB: Your Pulse bot's Nostr public key"
echo ""
echo "2. Restart Pulse after updating .env:"
echo "   pulse restart"
echo ""
echo "3. Connect WhatsApp by checking the QR code:"
echo "   pulse logs"
echo ""
echo "4. Useful commands:"
echo "   pulse status    - Check service status"
echo "   pulse logs      - View logs"
echo "   pulse restart   - Restart the service"
echo "   pulse monitor   - Real-time monitoring"
echo ""
if [[ "$ENABLE_ADMIN_PANEL" == "true" ]]; then
    echo "5. Access the admin panel at:"
    echo "   https://$DOMAIN_NAME/admin"
    echo ""
fi
echo -e "${GREEN}Service Information:${NC}"
echo "WhatsApp sessions: /opt/pulse/whatsapp-sessions"
echo "Logs: /opt/pulse/logs"
echo "Backups: /opt/pulse/backups (daily at 3 AM)"
echo "SSL: Auto-renewing via Certbot"
echo ""
echo "RabbitMQ Management: http://localhost:15672"
echo "Username: pulse"
echo "Password: [stored in .env as RABBITMQ_PASSWORD]"
echo ""
print_success "Setup complete! Your Pulse bot is ready."