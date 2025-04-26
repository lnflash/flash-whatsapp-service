# GitHub Actions Setup for CI/CD

This document provides an overview of the GitHub Actions workflows set up for the Flash WhatsApp Bot Service as part of Phase 5 (Production Deployment & Operational Excellence).

## Workflows Overview

We have implemented four key GitHub Actions workflows:

1. **CI (Continuous Integration)** - `ci.yml`
2. **CD (Continuous Deployment)** - `cd.yml`
3. **Security Scanning** - `security-scan.yml`
4. **Monitoring** - `monitoring.yml`

## CI Workflow

The CI workflow is triggered on:
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop` branches

Key features:
- Sets up Redis and RabbitMQ service containers for testing
- Installs dependencies with `npm ci`
- Runs linting and TypeScript compilation
- Executes unit tests
- Runs E2E and integration tests
- Includes security scans (npm audit and OWASP Dependency Check)
- Scans for secrets using Gitleaks

## CD Workflow

The CD workflow is triggered on:
- Push to `main` branch
- Tag creation with the pattern `v*` (e.g., `v1.0.0`)
- Manual dispatch with environment selection

Key features:
- Builds Docker images with proper tagging
- Implements a staging environment for main branch commits
- Deploys to production only for tagged releases or manual approval
- Uses Docker Compose for deployment with minimal downtime
- Includes automated rollback on failure
- Sends Slack notifications on successful deployments

## Security Scanning Workflow

The Security Scanning workflow is triggered:
- Weekly on a schedule (Sunday at midnight)
- On manual dispatch for on-demand security assessment

Key features:
- Runs npm audit for dependency vulnerabilities
- Executes OWASP Dependency Check
- Scans for secrets in the codebase
- Performs SonarQube analysis for code quality
- Runs Snyk security scanning
- Sends notifications on detected issues

## Monitoring Workflow

The Monitoring workflow runs:
- Every 30 minutes
- On manual dispatch for on-demand checks

Key features:
- Performs health checks on staging and production environments
- Monitors for performance degradation
- Checks error logs for anomalies
- Sends alerts on detected issues

## Required Secrets

To properly use these workflows, the following secrets must be configured in the GitHub repository:

| Secret | Description |
|--------|-------------|
| `DOCKER_USERNAME` | Docker Hub username for image publishing |
| `DOCKER_PASSWORD` | Docker Hub password or token |
| `SSH_PRIVATE_KEY_STAGING` | SSH private key for staging server deployment |
| `SSH_PRIVATE_KEY_PRODUCTION` | SSH private key for production server deployment |
| `SERVER_HOST_STAGING` | Hostname/IP for staging server |
| `SERVER_HOST_PRODUCTION` | Hostname/IP for production server |
| `SLACK_BOT_TOKEN` | Slack bot token for notifications |
| `SONAR_TOKEN` | SonarCloud token for code quality analysis |
| `SNYK_TOKEN` | Snyk token for security scanning |
| `GCP_SA_KEY` | Google Cloud service account key for log access |

## Docker Compose Configuration

The deployment uses Docker Compose files:

- `docker-compose.yml` - Local development configuration
- `docker-compose.production.yml` - Production environment configuration
- `docker-compose.staging.yml` - Staging environment configuration

The Docker Compose deployment includes:
- Health checks for all services
- Resource limits configuration
- Volume mounts for persistent data
- Environment-specific configurations

## Metrics and Monitoring

The application exposes the following metrics:
- HTTP request count, latency, and error rates
- Memory and CPU usage
- Application-specific metrics

These metrics are exposed at the `/metrics` endpoint and collected by Prometheus.

## Getting Started

To set up the GitHub Actions workflows, run:

```bash
./scripts/setup-github-actions.sh
```

This script will:
- Install required dependencies
- Set up GitHub Actions directories and files
- Make scripts executable
- Provide guidance on setting up GitHub repository secrets

## Best Practices

1. **Branch Protection Rules**
   - Require status checks to pass before merging
   - Require pull request reviews before merging
   - Require signed commits

2. **Deployment Process**
   - Use feature branches for development
   - Merge to `develop` for testing
   - Create a release branch for production
   - Tag releases with semantic versioning

3. **Security**
   - Regular security scans
   - Dependency updates
   - Secrets rotation

4. **Monitoring**
   - Set up alerts for critical issues
   - Regular review of logs and metrics
   - Incident response plan