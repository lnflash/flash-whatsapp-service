#!/bin/bash

# Pulse Local Development Setup Script
# This script sets up the development environment for running Pulse locally

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

print_success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

print_info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check operating system
OS="$(uname -s)"
case "${OS}" in
    Linux*)     OS_TYPE=Linux;;
    Darwin*)    OS_TYPE=Mac;;
    *)          print_error "Unsupported OS: ${OS}"; exit 1;;
esac

print_info "Detected OS: ${OS_TYPE}"

# Check for required tools
check_requirements() {
    local missing_tools=()
    
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        missing_tools+=("node")
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2)
        print_info "Node.js version: $NODE_VERSION"
    fi
    
    # Check for npm
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi
    
    # Check for Redis
    if ! command -v redis-server &> /dev/null; then
        missing_tools+=("redis")
    else
        print_info "Redis installed"
    fi
    
    # Check for Chrome/Chromium
    if command -v google-chrome &> /dev/null; then
        print_info "Google Chrome installed"
    elif command -v chromium &> /dev/null; then
        print_info "Chromium installed"
    elif command -v chromium-browser &> /dev/null; then
        print_info "Chromium Browser installed"
    else
        missing_tools+=("chrome")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_info "Please install the missing tools and run this script again."
        
        if [[ "$OS_TYPE" == "Mac" ]]; then
            print_info "On macOS, you can use Homebrew:"
            for tool in "${missing_tools[@]}"; do
                case $tool in
                    node|npm)
                        print_info "  brew install node"
                        ;;
                    redis)
                        print_info "  brew install redis"
                        print_info "  brew services start redis"
                        ;;
                    chrome)
                        print_info "  Download Google Chrome from https://www.google.com/chrome/"
                        ;;
                esac
            done
        elif [[ "$OS_TYPE" == "Linux" ]]; then
            print_info "On Linux, you can use your package manager:"
            print_info "  sudo apt update"
            print_info "  sudo apt install nodejs npm redis-server chromium-browser"
        fi
        exit 1
    fi
}

# Create .env file from example if it doesn't exist
setup_env_file() {
    if [ -f .env ]; then
        print_warning ".env file already exists."
        read -p "Do you want to update it for local development? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing .env file"
            return
        fi
        print_info "Backing up to .env.backup-$(date +%Y%m%d-%H%M%S)"
        cp .env .env.backup-$(date +%Y%m%d-%H%M%S)
    else
        if [ -f .env.example ]; then
            print_info "Creating .env file from .env.example"
            cp .env.example .env
        else
            print_error ".env.example file not found!"
            exit 1
        fi
    fi
    
    # Update .env for local development
    print_info "Configuring .env for local development..."
    
    # Set Redis configuration for local development
    if [[ "$OS_TYPE" == "Mac" ]]; then
        # macOS usually doesn't require Redis password for local dev
        sed -i '' 's/REDIS_HOST=.*/REDIS_HOST=localhost/' .env
        sed -i '' 's/REDIS_PASSWORD=.*/REDIS_PASSWORD=/' .env
    else
        # Linux
        sed -i 's/REDIS_HOST=.*/REDIS_HOST=localhost/' .env
        sed -i 's/REDIS_PASSWORD=.*/REDIS_PASSWORD=/' .env
    fi
    
    # Set RabbitMQ to optional for local dev
    if [[ "$OS_TYPE" == "Mac" ]]; then
        sed -i '' 's/RABBITMQ_HOST=.*/RABBITMQ_HOST=localhost/' .env
    else
        sed -i 's/RABBITMQ_HOST=.*/RABBITMQ_HOST=localhost/' .env
    fi
    
    print_success ".env file configured for local development"
    print_warning "Remember to add your API keys:"
    print_info "  - FLASH_API_KEY: Your Flash API key"
    print_info "  - GEMINI_API_KEY: Your Google Gemini API key (optional)"
    print_info "  - ADMIN_PHONE_NUMBERS: Admin phone numbers (comma-separated)"
}

# Install npm dependencies
install_dependencies() {
    print_info "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Create necessary directories
create_directories() {
    print_info "Creating necessary directories..."
    mkdir -p logs
    mkdir -p whatsapp-sessions
    mkdir -p whatsapp-sessions-new
    mkdir -p credentials
    mkdir -p public
    chmod 777 whatsapp-sessions whatsapp-sessions-new
    chmod 755 logs public
    chmod 700 credentials
    print_success "Directories created"
}

# Start Redis if on Mac
start_redis_mac() {
    if [[ "$OS_TYPE" == "Mac" ]]; then
        if ! pgrep -x "redis-server" > /dev/null; then
            print_info "Starting Redis..."
            if command -v brew &> /dev/null; then
                brew services start redis
            else
                redis-server --daemonize yes
            fi
        else
            print_info "Redis is already running"
        fi
    fi
}

# Main execution
main() {
    print_info "Starting Pulse local development setup..."
    
    # Check we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "This script must be run from the Pulse project root directory"
        exit 1
    fi
    
    check_requirements
    setup_env_file
    create_directories
    install_dependencies
    start_redis_mac
    
    print_success "Local setup complete!"
    print_info ""
    print_info "To start the development server:"
    print_info "  npm run start:dev"
    print_info ""
    print_info "The bot will start and show a QR code for WhatsApp connection."
    print_info ""
    print_info "Access points:"
    print_info "  - API: http://localhost:3000"
    print_info "  - Health: http://localhost:3000/health"
    print_info "  - Admin API: http://localhost:3000/api/admin"
    print_info ""
    if [[ "$OS_TYPE" == "Mac" ]]; then
        print_info "To stop Redis when done:"
        print_info "  brew services stop redis"
    fi
}

# Run main function
main