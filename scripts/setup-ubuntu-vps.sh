#!/bin/bash

# Pulse Production Setup Script for Ubuntu 24 VPS
# This script sets up a complete production environment for Pulse

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
echo "=================================================="
echo -e "${NC}"

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
    nano

# Install Docker
print_info "Installing Docker..."
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Install Node.js (for running scripts)
print_info "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Nginx
print_info "Installing Nginx..."
apt install -y nginx

# Install Certbot for SSL
print_info "Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# Configure firewall
print_info "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 3000/tcp  # Pulse API
ufw allow 5672/tcp  # RabbitMQ
ufw allow 15672/tcp # RabbitMQ Management
ufw --force enable

# Create application directory
print_info "Creating application directory..."
mkdir -p /opt/pulse
cd /opt/pulse

# Clone the repository
print_info "Cloning Pulse repository..."
git clone https://github.com/lnflash/pulse.git .
git checkout admin-panel  # Or your preferred branch

# Create necessary directories
mkdir -p whatsapp-sessions
mkdir -p logs
mkdir -p backups

# Generate secure passwords
print_info "Generating secure passwords..."
REDIS_PASSWORD=$(openssl rand -hex 32)
RABBITMQ_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SALT=$(openssl rand -hex 16)
HASH_SALT=$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Create .env file
print_info "Creating environment configuration..."
cat > .env << EOF
# Pulse Production Configuration
# Generated on $(date)

# Application Configuration
NODE_ENV=production
PORT=3000

# Domain Configuration
DOMAIN_NAME=$DOMAIN_NAME

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=0

# RabbitMQ Configuration
RABBITMQ_URL=amqp://pulse:$RABBITMQ_PASSWORD@rabbitmq:5672

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

# Admin Panel
ENABLE_ADMIN_PANEL=$ENABLE_ADMIN_PANEL
EOF

# Create docker-compose.production.yml
print_info "Creating production Docker Compose configuration..."
cat > docker-compose.production.yml << 'EOF'
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: pulse-app
    restart: always
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env
    depends_on:
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - pulse-network
    volumes:
      - ./whatsapp-sessions:/app/whatsapp-sessions
      - ./logs:/app/logs
      - ./public:/app/public:ro
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: pulse-redis
    restart: always
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - pulse-network
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "--auth", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  rabbitmq:
    image: rabbitmq:3-management-alpine
    container_name: pulse-rabbitmq
    restart: always
    ports:
      - "127.0.0.1:5672:5672"
      - "127.0.0.1:15672:15672"
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks:
      - pulse-network
    environment:
      RABBITMQ_DEFAULT_USER: pulse
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  pulse-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  redis-data:
  rabbitmq-data:
EOF

# Update RabbitMQ password in docker-compose
sed -i "s/\${REDIS_PASSWORD}/$REDIS_PASSWORD/g" docker-compose.production.yml
sed -i "s/\${RABBITMQ_PASSWORD}/$RABBITMQ_PASSWORD/g" docker-compose.production.yml

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

    # Redirect to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN_NAME;

    # SSL configuration will be added by Certbot
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: wss:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://cdn.jsdelivr.net;" always;
    
    # Logging
    access_log /var/log/nginx/pulse_access.log;
    error_log /var/log/nginx/pulse_error.log;

    # Rate limiting
    limit_req zone=pulse_limit burst=20 nodelay;

    # Client body size limit
    client_max_body_size 10M;

    # API endpoints
    location /api {
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

    # Health check endpoint
    location /health {
        proxy_pass http://pulse_backend;
        proxy_set_header Host \$host;
        access_log off;
    }

EOF

# Add admin panel configuration if enabled
if [[ "$ENABLE_ADMIN_PANEL" == "true" ]]; then
    cat >> /etc/nginx/sites-available/pulse << EOF
    # Admin panel (static files)
    location /admin {
        alias /opt/pulse/public/admin;
        try_files \$uri \$uri/ /admin/index.html;
        
        # Security for admin area
        add_header X-Frame-Options "DENY" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://cdn.jsdelivr.net;" always;
    }

EOF
fi

# Complete Nginx configuration
cat >> /etc/nginx/sites-available/pulse << EOF
    # Default location
    location / {
        return 404;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/pulse /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx

# Obtain SSL certificate
print_info "Obtaining SSL certificate..."
certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos -m $SSL_EMAIL

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
docker exec pulse-redis redis-cli --auth $REDIS_PASSWORD BGSAVE
sleep 5
docker cp pulse-redis:/data/dump.rdb $BACKUP_DIR/$BACKUP_NAME/redis_dump.rdb

# Create tarball
cd $BACKUP_DIR
tar -czf $BACKUP_NAME.tar.gz $BACKUP_NAME
rm -rf $BACKUP_NAME

# Keep only last 7 backups
ls -t $BACKUP_DIR/*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
EOF

chmod +x /opt/pulse/scripts/backup.sh

# Create monitoring script
print_info "Creating monitoring script..."
cat > /opt/pulse/scripts/monitor.sh << 'EOF'
#!/bin/bash
# Pulse Monitoring Script

# Check if services are running
check_service() {
    if docker ps | grep -q $1; then
        echo "✓ $1 is running"
    else
        echo "✗ $1 is not running"
        # Restart the service
        docker compose -f /opt/pulse/docker-compose.production.yml up -d $1
    fi
}

echo "=== Pulse Service Status ==="
check_service "pulse-app"
check_service "pulse-redis"
check_service "pulse-rabbitmq"

# Check disk space
echo ""
echo "=== Disk Usage ==="
df -h | grep -E '^/dev/'

# Check memory usage
echo ""
echo "=== Memory Usage ==="
free -h

# Check Docker logs for errors
echo ""
echo "=== Recent Errors ==="
docker logs pulse-app --tail 20 2>&1 | grep -i error || echo "No recent errors"
EOF

chmod +x /opt/pulse/scripts/monitor.sh

# Create systemd service for auto-start
print_info "Creating systemd service..."
cat > /etc/systemd/system/pulse.service << EOF
[Unit]
Description=Pulse WhatsApp Bot
Requires=docker.service
After=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
WorkingDirectory=/opt/pulse
ExecStart=/usr/bin/docker compose -f docker-compose.production.yml up
ExecStop=/usr/bin/docker compose -f docker-compose.production.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
systemctl daemon-reload
systemctl enable pulse.service

# Set up cron jobs
print_info "Setting up cron jobs..."
cat > /etc/cron.d/pulse << EOF
# Pulse Cron Jobs
# Daily backup at 3 AM
0 3 * * * root /opt/pulse/scripts/backup.sh >> /opt/pulse/logs/backup.log 2>&1

# Monitor services every 5 minutes
*/5 * * * * root /opt/pulse/scripts/monitor.sh >> /opt/pulse/logs/monitor.log 2>&1

# Rotate logs weekly
0 0 * * 0 root find /opt/pulse/logs -name "*.log" -mtime +7 -delete
EOF

# Set up fail2ban for additional security
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

# Create fail2ban filter
cat > /etc/fail2ban/filter.d/pulse-auth.conf << EOF
[Definition]
failregex = ^<HOST> .* "(POST|GET) /api/admin/auth/login.*" 401
ignoreregex =
EOF

systemctl restart fail2ban

# Build and start the application
print_info "Building and starting Pulse..."
cd /opt/pulse
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d

# Wait for services to be ready
print_info "Waiting for services to start..."
sleep 30

# Check service status
docker compose -f docker-compose.production.yml ps

# Final instructions
echo ""
print_success "Pulse installation completed!"
echo ""
echo -e "${YELLOW}Important next steps:${NC}"
echo "1. Update the .env file with your configuration:"
echo "   - FLASH_API_KEY: Your Flash API key"
echo "   - GEMINI_API_KEY: Your Google Gemini API key (optional)"
echo "   - ADMIN_PHONE_NUMBERS: Admin phone numbers"
echo "   - SUPPORT_PHONE_NUMBER: Support phone number"
echo ""
echo "2. Restart the service after updating .env:"
echo "   cd /opt/pulse && docker compose -f docker-compose.production.yml restart"
echo ""
echo "3. Connect WhatsApp by checking the QR code:"
echo "   docker logs pulse-app"
echo ""
echo "4. Monitor the services:"
echo "   /opt/pulse/scripts/monitor.sh"
echo ""
if [[ "$ENABLE_ADMIN_PANEL" == "true" ]]; then
    echo "5. Access the admin panel at:"
    echo "   https://$DOMAIN_NAME/admin"
    echo ""
fi
echo -e "${GREEN}SSL Certificate:${NC} Auto-renewing via Certbot"
echo -e "${GREEN}Backups:${NC} Daily at 3 AM to /opt/pulse/backups"
echo -e "${GREEN}Monitoring:${NC} Every 5 minutes via cron"
echo ""
echo -e "${BLUE}Service Management Commands:${NC}"
echo "Start:   systemctl start pulse"
echo "Stop:    systemctl stop pulse"
echo "Restart: systemctl restart pulse"
echo "Logs:    journalctl -u pulse -f"
echo ""
print_success "Setup complete! Your Pulse bot is ready."