#!/bin/bash

# Pulse Local Development Setup Script
# This script sets up the development environment for running Pulse locally

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

print_success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

print_info() {
    echo -e "${YELLOW}[INFO] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if running on macOS or Linux
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
    
    # Check for Docker
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    else
        print_info "Docker installed"
    fi
    
    # Check if Docker is running
    if command -v docker &> /dev/null; then
        if ! docker info &> /dev/null; then
            print_error "Docker is not running. Please start Docker Desktop."
            exit 1
        fi
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
                    docker)
                        print_info "  Download Docker Desktop from https://www.docker.com/products/docker-desktop"
                        ;;
                esac
            done
        fi
        exit 1
    fi
}

# Create .env file from example if it doesn't exist
setup_env_file() {
    if [ -f .env ]; then
        print_warning ".env file already exists."
        print_info "Your current settings will be preserved, only Docker-related hosts will be updated."
        read -p "Continue? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Skipping .env configuration"
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
    
    # Set Redis and RabbitMQ hosts for local development (npm run start:dev)
    if grep -q "REDIS_HOST=" .env; then
        sed -i.bak 's/REDIS_HOST=.*/REDIS_HOST=localhost/' .env
    else
        echo "REDIS_HOST=localhost" >> .env
    fi
    
    if grep -q "RABBITMQ_HOST=" .env; then
        sed -i.bak 's/RABBITMQ_HOST=.*/RABBITMQ_HOST=localhost/' .env
    else
        echo "RABBITMQ_HOST=localhost" >> .env
    fi
    
    # Set Redis password to empty for local dev
    if grep -q "REDIS_PASSWORD=" .env; then
        sed -i.bak 's/REDIS_PASSWORD=.*/REDIS_PASSWORD=/' .env
    fi
    
    # Remove backup files
    rm -f .env.bak
    
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

# Start services
start_services() {
    print_info "Starting Docker services (Redis and RabbitMQ)..."
    
    # Stop any existing containers
    docker compose down 2>/dev/null || true
    
    # Start only Redis and RabbitMQ
    docker compose up -d redis rabbitmq
    
    print_info "Waiting for services to be ready..."
    sleep 10
    
    # Check if services are healthy
    if docker compose ps | grep -q "healthy"; then
        print_success "Docker services are running"
    else
        print_warning "Services may still be starting up..."
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
    start_services
    
    print_success "Local setup complete!"
    print_info ""
    print_info "To start the development server:"
    print_info "  npm run start:dev"
    print_info ""
    print_info "To run everything in Docker:"
    print_info "  docker compose up"
    print_info ""
    print_info "To view logs:"
    print_info "  docker compose logs -f"
    print_info ""
    print_info "To stop services:"
    print_info "  docker compose down"
    print_info ""
    print_info "Access points:"
    print_info "  - API: http://localhost:3000"
    print_info "  - Health: http://localhost:3000/health"
    print_info "  - RabbitMQ Management: http://localhost:15672 (guest/guest)"
}

# Run main function
main