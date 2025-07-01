#!/bin/bash

# Simple development script with auto-restart

echo "Starting Flash WhatsApp Service development server..."

# Kill any existing Node processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Clean build directory
rm -rf dist

# Initial build
echo "Building project..."
npm run build

# Start with concurrently
echo "Starting development server with auto-restart..."
npm run dev