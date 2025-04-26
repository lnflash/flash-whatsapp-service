# Flash WhatsApp Bot Service: Quick Start Guide

This document provides guidance for LLMs (Large Language Models) to quickly understand and continue work on the Flash WhatsApp Bot Service.

## Project Overview

The Flash WhatsApp Bot Service enables secure communication between Flash users and the Flash platform via WhatsApp, providing account management, notifications, and AI-powered customer support. It's built using NestJS, integrates with Twilio for WhatsApp messaging, and leverages various other services like Redis and RabbitMQ.

## Current Status

The project has completed the following phases:
- ✅ Phase 1: Foundation & Infrastructure
- ✅ Phase 2: Account Security & Linking
- ✅ Phase 3: Core Functionality
- ✅ Phase 4: Testing & Security
- 🔄 Phase 5: Production Deployment & Operational Excellence (In Progress)

## Repository Structure

- `src/`: Source code organized in modules
  - `modules/`: Core functionality modules (e.g., whatsapp, auth, flash-api)
  - `common/`: Shared utilities, filters, and middleware
  - `config/`: Application configuration
- `test/`: Test files including integration, security, and regression tests
- `docs/`: Project documentation
- `kubernetes/`: Docker Compose deployment configurations
- `.github/workflows/`: GitHub Actions CI/CD configuration
- `scripts/`: Utility scripts

## Key Files for Context

- `README.md`: Main project documentation
- `docs/IMPLEMENTATION.md`: Detailed implementation plan and status
- `docs/PHASE_5_PLAN.md`: Comprehensive plan for the current phase
- `docs/PHASE_5_PROGRESS.md`: Current progress on Phase 5
- `docs/GITHUB_ACTIONS_SETUP.md`: CI/CD pipeline documentation
- `kubernetes/README.md`: Docker Compose deployment guide

## Core Technologies

- **Backend Framework**: NestJS with TypeScript
- **Messaging**: Twilio WhatsApp Business API
- **Data Storage**: Redis for session management
- **Message Queue**: RabbitMQ for event handling
- **AI Integration**: Maple AI for customer support
- **CI/CD**: GitHub Actions
- **Deployment**: Docker Compose
- **Monitoring**: Prometheus & custom metrics

## Current Focus: Phase 5

The current focus is on Phase 5 (Production Deployment & Operational Excellence), including:

1. CI/CD pipeline implementation with GitHub Actions (completed)
2. Docker Compose deployment configuration (completed)
3. Monitoring and observability setup (partially completed)
4. Operational documentation (in progress)
5. Infrastructure provisioning (in progress)

## Getting Started

To continue work on this project, follow these steps:

1. **Understand the architecture**:
   - Review the documentation in `docs/` directory
   - Focus on `IMPLEMENTATION.md` and `PHASE_5_PLAN.md`

2. **Set up the development environment**:
   ```bash
   # Install dependencies
   npm install

   # Start the service in development mode
   npm run start:dev

   # Run tests
   npm test
   ```

3. **Review current Phase 5 progress**:
   - Check `docs/PHASE_5_PROGRESS.md` for current status
   - Review `docs/PHASE_5_CHECKLIST.md` for pending tasks

4. **Continue implementation**:
   - Follow the guidance in `docs/PHASE_5_PLAN.md`
   - Focus on incomplete items in the Phase 5 checklist
   - Document your progress in `docs/PHASE_5_PROGRESS.md`

## Key Features

The service supports the following key features:

1. **Account linking**: Secure linking of WhatsApp numbers to Flash accounts
2. **Balance checking**: Real-time balance information with MFA
3. **Notifications**: Payment notifications via WhatsApp
4. **AI support**: Customer support via Maple AI integration

## Testing

The project includes several types of tests:

```bash
# Run unit tests
npm test

# Run E2E and integration tests
npm run test:e2e

# Run all tests (unit, integration, security)
./scripts/run-all-tests.sh

# Run security scans
./scripts/security-scan.sh
```

## GitHub Actions CI/CD

The project uses GitHub Actions for CI/CD with the following workflows:

- `ci.yml`: Builds, tests, and scans the code
- `cd.yml`: Deploys to staging and production environments
- `security-scan.yml`: Runs comprehensive security scans
- `monitoring.yml`: Monitors service health and performance

## Next Steps for Phase 5

The following items need attention to complete Phase 5:

1. Set up production Redis and RabbitMQ clusters
2. Implement log aggregation and analysis
3. Create operational runbooks and procedures
4. Execute performance testing and optimization
5. Implement backup and disaster recovery procedures

## Available Documentation

For more details, refer to:

- `docs/IMPLEMENTATION.md`: Full implementation details
- `docs/PHASE_5_PLAN.md`: Phase 5 planning document
- `docs/PHASE_5_PROGRESS.md`: Current progress report
- `docs/GITHUB_ACTIONS_SETUP.md`: CI/CD pipeline documentation
- `kubernetes/README.md`: Docker Compose deployment guide