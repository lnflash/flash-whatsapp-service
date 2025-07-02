#!/bin/bash

# Script to help upload Google Cloud credentials to Pulse server

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Pulse - Google Cloud Credentials Upload Helper${NC}"
echo ""

# Check if credentials file is provided
if [ $# -eq 0 ]; then
    echo "Usage: ./upload-google-credentials.sh <path-to-service-account.json> <server-ip-or-domain>"
    echo ""
    echo "Example: ./upload-google-credentials.sh ./my-service-account.json pulse.example.com"
    exit 1
fi

CREDENTIALS_FILE=$1
SERVER=$2

# Validate credentials file exists
if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo -e "${RED}Error: Credentials file not found: $CREDENTIALS_FILE${NC}"
    exit 1
fi

# Validate server is provided
if [ -z "$SERVER" ]; then
    echo -e "${RED}Error: Server IP or domain not provided${NC}"
    exit 1
fi

# Get the filename
FILENAME=$(basename "$CREDENTIALS_FILE")

echo "Uploading $CREDENTIALS_FILE to $SERVER..."
echo ""

# Upload the file
scp "$CREDENTIALS_FILE" "root@$SERVER:/opt/pulse/credentials/$FILENAME"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ File uploaded successfully${NC}"
    echo ""
    
    # SSH to server and update permissions
    echo "Setting secure permissions..."
    ssh "root@$SERVER" "chmod 600 /opt/pulse/credentials/$FILENAME && chown root:root /opt/pulse/credentials/$FILENAME"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Permissions set successfully${NC}"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "1. SSH to your server: ssh root@$SERVER"
        echo "2. Edit the .env file: nano /opt/pulse/.env"
        echo "3. Add this line: GOOGLE_CLOUD_KEYFILE=/app/credentials/$FILENAME"
        echo "4. Restart Pulse: cd /opt/pulse && docker compose -f docker-compose.production.yml restart"
        echo ""
        echo -e "${GREEN}Done! Your Google Cloud credentials are ready to use.${NC}"
    else
        echo -e "${RED}Error setting permissions. Please check manually.${NC}"
    fi
else
    echo -e "${RED}Error uploading file. Please check your connection and try again.${NC}"
fi