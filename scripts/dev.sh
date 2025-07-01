#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Flash WhatsApp Service in development mode...${NC}"

# Kill any existing Node processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Clear any existing sessions
rm -rf session-* 2>/dev/null

echo -e "${YELLOW}Starting development server with auto-restart...${NC}"

# Start with nodemon for better restart handling
npm run start:dev:nodemon