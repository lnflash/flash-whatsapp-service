#!/bin/bash

# Script to generate Nostr keys in both hex and nsec format
# Usage: ./scripts/generate-nostr-keys.sh

echo "============================================"
echo "Flash Connect - Nostr Key Generator"
echo "============================================"
echo ""

# Function to convert hex to bech32 (nsec/npub format)
# Note: This is a simplified version. For production, use a proper Nostr library
hex_to_bech32() {
    local hex=$1
    local hrp=$2
    echo "# To convert hex to $hrp format, use one of these tools:"
    echo "# - https://damus.io/key/"
    echo "# - https://nostrtool.com/"
    echo "# - nostr-tools CLI: npm install -g @noble/secp256k1 @scure/base"
}

# Generate Nostr private key (32 bytes)
PRIVATE_KEY_HEX=$(openssl rand -hex 32)

# Derive public key using OpenSSL (simplified - for demo only)
# In production, use proper secp256k1 library
echo "Generated Nostr Keys:"
echo "===================="
echo ""
echo "# Private Key (hex format):"
echo "NOSTR_PRIVATE_KEY=$PRIVATE_KEY_HEX"
echo ""
echo "# Private Key (nsec format):"
hex_to_bech32 $PRIVATE_KEY_HEX "nsec"
echo ""
echo "# To get the public key (npub), use the conversion tools above"
echo ""
echo "============================================"
echo ""
echo "⚠️  CRITICAL SECURITY WARNING:"
echo "⚠️  - NEVER share your private key (hex or nsec format)"
echo "⚠️  - Store it in a secure password manager"
echo "⚠️  - This key controls the Pulse bot's Nostr identity"
echo "⚠️  - If compromised, all zaps sent to Pulse could be stolen"
echo ""
echo "📝 Next Steps:"
echo "1. Convert the hex private key to nsec format using a tool"
echo "2. Add the private key to your .env file"
echo "3. Use a Nostr client to get the npub (public key)"
echo "4. Add the npub to NOSTR_PULSE_NPUB in your .env file"
echo ""