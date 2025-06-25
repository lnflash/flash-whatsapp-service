# Docker Compose Deployment Guide

This directory contains deployment configurations for the Flash WhatsApp Bot Service using Docker Compose.

## Files

- `docker-compose.yml`: Local development configuration
- `docker-compose.production.yml`: Production environment configuration
- `docker-compose.test.yml`: Test environment configuration
- `.env.example`: Example environment variables file

## Environment Setup

The service requires several environment variables to be configured. Create environment files for each environment:

### Production Environment

Create a `.env.production` file with the following variables:

```
# Redis configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>

# RabbitMQ configuration
RABBITMQ_URL=amqp://user:password@rabbitmq:5672

# Flash API credentials
FLASH_API_KEY=<flash-api-key>

# Twilio credentials
TWILIO_ACCOUNT_SID=<twilio-account-sid>
TWILIO_AUTH_TOKEN=<twilio-auth-token>

# Maple AI credentials
MAPLE_AI_API_KEY=<maple-ai-api-key>

# JWT Secret
JWT_SECRET=<jwt-secret>

# Service configuration
NODE_ENV=production
PORT=3000
```

### Test Environment

Create a `.env.test` file with similar variables but appropriate for test.

## Deployment

### Test Deployment

```bash
# Deploy to test
docker-compose -f docker-compose.yml -f docker-compose.test.yml --env-file .env.test up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.test.yml logs -f
```

### Production Deployment

```bash
# Deploy to production
docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.production.yml logs -f
```

However, it's recommended to use the CI/CD pipeline for automated deployments rather than manual commands.

## Monitoring

The service exposes various metrics for monitoring:

- HTTP request count, latency, and error rates
- Memory and CPU usage
- RabbitMQ message processing rates
- Redis connection pool metrics

Metrics are available at the `/metrics` endpoint.

## Health Checks

The service exposes a `/health` endpoint that reports the status of all dependencies (Redis, RabbitMQ, Flash API, etc.). Docker Compose uses this endpoint for health checks.

## Scaling

For scaling in production, you can:

1. Use Docker Compose's `--scale` option:

```bash
docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d --scale app=3
```

2. For more advanced scaling, consider using Docker Swarm mode:

```bash
# Initialize swarm
docker swarm init

# Deploy as a stack
docker stack deploy -c docker-compose.yml -c docker-compose.production.yml flash-whatsapp

# Scale the service
docker service scale flash-whatsapp_app=3
```

## Backup and Restore

### Redis Data Backup

```bash
# Connect to Redis container
docker-compose exec redis redis-cli

# Trigger a backup
SAVE

# Exit
exit

# Copy backup file to host
docker cp flash-whatsapp-redis:/data/dump.rdb ./redis-backup.rdb
```

### RabbitMQ Backup

```bash
# Export RabbitMQ definitions
docker-compose exec rabbitmq rabbitmqctl export_definitions /tmp/rabbitmq-definitions.json

# Copy to host
docker cp flash-whatsapp-rabbitmq:/tmp/rabbitmq-definitions.json ./rabbitmq-backup.json
```

## Rolling Updates

For minimal downtime updates:

```bash
# Pull new images
docker-compose -f docker-compose.yml -f docker-compose.production.yml pull

# Update one service at a time
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-deps --scale app=3 app
```