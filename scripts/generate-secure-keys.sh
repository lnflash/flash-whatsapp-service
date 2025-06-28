#!/bin/bash

# Script to generate secure keys for production environment
# Usage: ./scripts/generate-secure-keys.sh

echo "============================================"
echo "Flash Connect - Secure Key Generator"
echo "============================================"
echo ""
echo "This script generates secure keys for production use."
echo "Copy these values to your production .env file."
echo ""
echo "============================================"
echo ""

# Generate keys
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_SALT=$(openssl rand -hex 16)
HASH_SALT=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Generate Nostr private key (32 bytes hex)
NOSTR_PRIVATE_KEY_HEX=$(openssl rand -hex 32)

# Display the keys
echo "# Security Configuration (Generated $(date))"
echo "# IMPORTANT: Keep these keys secure and never commit them to version control!"
echo ""
echo "# Encryption Keys"
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "ENCRYPTION_SALT=$ENCRYPTION_SALT"
echo "HASH_SALT=$HASH_SALT"
echo ""
echo "# JWT Configuration"
echo "JWT_SECRET=$JWT_SECRET"
echo ""
echo "# Session Configuration"
echo "SESSION_SECRET=$SESSION_SECRET"
echo ""
echo "# Webhook Security"
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"
echo ""
echo "# Nostr Configuration"
echo "NOSTR_PRIVATE_KEY=$NOSTR_PRIVATE_KEY_HEX"
echo "# Note: This is the hex format. Your Nostr client may need it in nsec format."
echo "# Use a Nostr key converter tool to convert hex to nsec if needed."
echo "# Example: https://damus.io/key/"
echo ""
echo "============================================"
echo ""
echo "⚠️  WARNING: These keys are for production use only!"
echo "⚠️  Store them securely in a password manager or secret management system."
echo "⚠️  Never share these keys or commit them to version control."
echo ""
echo "For development, use the default keys in .env.example"
echo ""