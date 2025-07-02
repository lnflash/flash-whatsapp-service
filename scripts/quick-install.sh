#!/bin/bash
# Quick install script for Pulse - downloads and runs the main setup script

echo "🚀 Starting Pulse Quick Installation..."
echo ""

# Download the setup script
wget -q https://raw.githubusercontent.com/lnflash/pulse/main/scripts/setup-ubuntu-vps.sh -O setup-pulse.sh

# Make it executable
chmod +x setup-pulse.sh

# Run it
./setup-pulse.sh

# Clean up
rm -f setup-pulse.sh