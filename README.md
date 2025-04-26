# Flash WhatsApp Bot Service

This service enables secure communication between Flash users and the Flash platform via WhatsApp, providing account management, notifications, and AI-powered customer support.

## Overview

The Flash WhatsApp Bot Service is a NestJS microservice that integrates with:

- Twilio WhatsApp Business API for messaging
- Flash GraphQL API for business logic
- Maple AI API for AI-powered support
- Redis for session management
- RabbitMQ for event handling

## Features

- Secure webhook handling for WhatsApp messages
- Account linking with OTP verification
- Real-time balance checking with MFA
- Payment notifications
- AI-powered support with Maple AI
- Event-driven architecture

## Implementation Progress

- ✅ Phase 1: Foundation & Infrastructure Setup
- ✅ Phase 2: Account Security & Linking
- ✅ Phase 3: Core Functionality
- ✅ Phase 4: Testing & Security
- 🔄 Phase 5: Production Deployment & Operational Excellence (In Progress)

## Getting Started

> 👉 **New to this project?** Check out the [Quick Start Guide](QUICKSTART.md) for a comprehensive overview and setup instructions.

### Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose
- Twilio account with WhatsApp Business API access
- Flash API credentials
- Maple AI API credentials

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/flashapp/flash-whatsapp-service.git
   cd flash-whatsapp-service
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create environment configuration:
   ```
   cp .env.example .env
   ```
   Edit the `.env` file and add your configuration values.

4. Start the service:
   ```
   npm run start:dev
   ```

### Docker Setup

To run the service with Docker:

```
docker-compose up -d
```

## Development

### Running Tests

```
# Run unit tests
npm test

# Run E2E and integration tests
npm run test:e2e

# Run all tests (unit, integration, security)
./scripts/run-all-tests.sh

# Run security scans
./scripts/security-scan.sh
```

### Code Quality

```
npm run lint
npm run format
```

### CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI Workflow**: Runs on every push and pull request
  - Builds the application
  - Runs linting and type checking
  - Executes unit and integration tests
  - Performs security scanning

- **CD Workflow**: Runs on main branch pushes and tags
  - Builds and pushes Docker images
  - Deploys to staging environment for main branch commits
  - Deploys to production environment for tagged releases
  - Implements Docker Compose deployment strategy

- **Security Scan**: Runs weekly and on-demand
  - Performs dependency vulnerability scanning
  - Checks for secrets in codebase
  - Runs static code analysis

- **Monitoring**: Runs every 30 minutes
  - Performs health checks on all environments
  - Monitors for performance degradation
  - Checks error logs for anomalies

See the [GitHub Actions Setup](docs/GITHUB_ACTIONS_SETUP.md) documentation and the `.github/workflows` directory for detailed workflow configurations.

### Deployment

Refer to the [Docker Compose Deployment Guide](kubernetes/README.md) for detailed deployment instructions.

## API Endpoints

- `POST /whatsapp/webhook` - Twilio webhook for incoming WhatsApp messages

## Documentation

- [Quick Start Guide](QUICKSTART.md) - Guide for new developers and LLMs to quickly understand the project
- [Version History](VERSION.md) - Record of version changes and release information
- [Implementation Details](docs/IMPLEMENTATION.md) - Detailed architecture and implementation information
- [Phase 3 Plan](docs/PHASE_3_PLAN.md) - Core functionality implementation plan
- [Phase 4 Plan](docs/PHASE_4_PLAN.md) - Testing and security implementation plan
- [Phase 4 Summary](docs/PHASE_4_SUMMARY.md) - Summary of testing and security implementation
- [Phase 5 Plan](docs/PHASE_5_PLAN.md) - Production deployment and operational excellence plan
- [Phase 5 Progress](docs/PHASE_5_PROGRESS.md) - Current progress on Phase 5 implementation
- [GitHub Actions Setup](docs/GITHUB_ACTIONS_SETUP.md) - CI/CD pipeline implementation details
- [Security Assessment Plan](test/security/security-assessment-plan.md) - Comprehensive security assessment methodology
- [Penetration Testing Guide](test/security/penetration-testing-guide.md) - Guide for security testing
- [Regression Test Plan](test/regression/regression-test-plan.md) - Framework for regression testing
- [Docker Compose Deployment Guide](kubernetes/README.md) - Guide for deploying with Docker Compose

## License

This project is proprietary and confidential.