#!/bin/bash

# Permanent fix for Pulse session persistence
# This script sets up proper encryption keys and Redis persistence

echo "=== Pulse Session Persistence Permanent Fix ==="
echo ""

# 1. Check if .env exists
if [ ! -f "/opt/pulse/.env" ]; then
    echo "❌ ERROR: /opt/pulse/.env file not found!"
    echo "Please create .env file from .env.example first"
    exit 1
fi

# 2. Generate secure encryption keys if not already set
echo "1. Checking encryption keys..."
if ! grep -q "^ENCRYPTION_KEY=" /opt/pulse/.env || grep -q "^ENCRYPTION_KEY=$" /opt/pulse/.env || grep -q "^ENCRYPTION_KEY=your_encryption_key" /opt/pulse/.env; then
    echo "   ⚠️  ENCRYPTION_KEY not set properly. Generating secure key..."
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "   ✓ Generated ENCRYPTION_KEY"
else
    echo "   ✓ ENCRYPTION_KEY already set"
fi

if ! grep -q "^ENCRYPTION_SALT=" /opt/pulse/.env || grep -q "^ENCRYPTION_SALT=$" /opt/pulse/.env || grep -q "^ENCRYPTION_SALT=your_encryption_salt" /opt/pulse/.env; then
    echo "   ⚠️  ENCRYPTION_SALT not set properly. Generating secure salt..."
    ENCRYPTION_SALT=$(openssl rand -hex 16)
    echo "   ✓ Generated ENCRYPTION_SALT"
else
    echo "   ✓ ENCRYPTION_SALT already set"
fi

if ! grep -q "^HASH_SALT=" /opt/pulse/.env || grep -q "^HASH_SALT=$" /opt/pulse/.env || grep -q "^HASH_SALT=your_hash_salt" /opt/pulse/.env; then
    echo "   ⚠️  HASH_SALT not set properly. Generating secure salt..."
    HASH_SALT=$(openssl rand -hex 16)
    echo "   ✓ Generated HASH_SALT"
else
    echo "   ✓ HASH_SALT already set"
fi

# 3. Update .env file with generated keys
echo ""
echo "2. Updating .env file..."
if [ ! -z "$ENCRYPTION_KEY" ]; then
    # Remove old line and add new one
    sed -i '/^ENCRYPTION_KEY=/d' /opt/pulse/.env
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> /opt/pulse/.env
    echo "   ✓ Updated ENCRYPTION_KEY"
fi

if [ ! -z "$ENCRYPTION_SALT" ]; then
    sed -i '/^ENCRYPTION_SALT=/d' /opt/pulse/.env
    echo "ENCRYPTION_SALT=$ENCRYPTION_SALT" >> /opt/pulse/.env
    echo "   ✓ Updated ENCRYPTION_SALT"
fi

if [ ! -z "$HASH_SALT" ]; then
    sed -i '/^HASH_SALT=/d' /opt/pulse/.env
    echo "HASH_SALT=$HASH_SALT" >> /opt/pulse/.env
    echo "   ✓ Updated HASH_SALT"
fi

# 4. Check Redis persistence
echo ""
echo "3. Checking Redis persistence..."
REDIS_SAVE=$(redis-cli CONFIG GET save | tail -n 1)
if [ "$REDIS_SAVE" = "" ]; then
    echo "   ❌ Redis persistence is NOT enabled!"
    echo "   Enabling Redis RDB persistence..."
    redis-cli CONFIG SET save "900 1 300 10 60 10000"
    redis-cli BGSAVE
    echo "   ✓ Redis persistence enabled"
else
    echo "   ✓ Redis persistence is already enabled: $REDIS_SAVE"
fi

# 5. Clean up old sessions
echo ""
echo "4. Cleaning up old encrypted sessions..."
cd /opt/pulse
node scripts/fix-sessions-immediate.js

# 6. Create backup of encryption keys
echo ""
echo "5. Creating backup of encryption keys..."
BACKUP_FILE="/opt/pulse/.env.backup.$(date +%Y%m%d_%H%M%S)"
cp /opt/pulse/.env "$BACKUP_FILE"
echo "   ✓ Backup created: $BACKUP_FILE"

# 7. Set proper permissions
echo ""
echo "6. Setting proper permissions..."
chown pulse:pulse /opt/pulse/.env
chmod 600 /opt/pulse/.env
echo "   ✓ Permissions set"

# 8. Show current configuration
echo ""
echo "7. Current configuration:"
echo "   ENCRYPTION_KEY: $(grep '^ENCRYPTION_KEY=' /opt/pulse/.env | cut -d= -f2 | cut -c1-8)..."
echo "   ENCRYPTION_SALT: $(grep '^ENCRYPTION_SALT=' /opt/pulse/.env | cut -d= -f2 | cut -c1-8)..."
echo "   HASH_SALT: $(grep '^HASH_SALT=' /opt/pulse/.env | cut -d= -f2 | cut -c1-8)..."

echo ""
echo "✅ Session persistence fix complete!"
echo ""
echo "IMPORTANT:"
echo "1. Restart Pulse: pulse restart"
echo "2. Users will need to re-link their accounts ONE TIME"
echo "3. Sessions will persist after future restarts"
echo ""
echo "⚠️  CRITICAL: Never change these encryption keys again!"
echo "⚠️  Keep the backup file safe: $BACKUP_FILE"