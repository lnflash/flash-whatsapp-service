#!/bin/bash

# Script to set up GitHub Actions and required dependencies for Phase 5

echo "=== Setting up GitHub Actions and dependencies for Phase 5 ==="

# Install prom-client for metrics
echo "Installing prom-client for metrics..."
npm install --save prom-client

# Ensure promethes annotations are added for Kubernetes
echo "Adding Prometheus annotations to Kubernetes manifests..."

# Make the GitHub Actions directory if it doesn't exist
mkdir -p .github/workflows

# Set executable permissions on shell scripts
echo "Setting executable permissions on shell scripts..."
chmod +x scripts/*.sh

# Add files to git
echo "Adding GitHub Actions workflows to git..."
git add .github/
git add kubernetes/
git add scripts/setup-github-actions.sh
git add src/common/middleware/metrics.middleware.ts

echo ""
echo "=== Setup Complete ==="
echo ""
echo "The following steps are required to complete the GitHub Actions setup:"
echo ""
echo "1. Add the following secrets to your GitHub repository:"
echo "   - DOCKER_USERNAME: Your Docker Hub username"
echo "   - DOCKER_PASSWORD: Your Docker Hub password"
echo "   - KUBECONFIG_STAGING: Base64 encoded kubeconfig for staging environment"
echo "   - KUBECONFIG_PRODUCTION: Base64 encoded kubeconfig for production environment"
echo "   - SLACK_BOT_TOKEN: Slack bot token for notifications"
echo "   - SONAR_TOKEN: SonarCloud token for code quality analysis"
echo "   - SNYK_TOKEN: Snyk token for security scanning"
echo "   - GCP_SA_KEY: Google Cloud service account key for log access"
echo ""
echo "2. Push the changes to GitHub:"
echo "   git commit -m \"Add GitHub Actions workflows for CI/CD\""
echo "   git push origin main"
echo ""
echo "3. Configure branch protection rules in your GitHub repository settings"
echo ""
echo "4. Set up Docker Hub repository named 'flashapp/whatsapp-service'"
echo ""
echo "=== GitHub Actions Setup Guide ==="