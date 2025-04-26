# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the Flash WhatsApp Bot Service to production and staging environments.

## Files

- `deployment.yaml`: Production environment deployment configuration
- `staging.yaml`: Staging environment deployment configuration
- `config.yaml`: ConfigMaps for both environments
- `secrets-example.yaml`: Example of how to create the required secrets

## Setting up Secrets

The service requires several secrets to be configured in each environment. Here's how to create them:

### Production Environment

```bash
# Redis credentials
kubectl create secret generic flash-whatsapp-redis \
  --namespace=flash-production \
  --from-literal=host=redis.production.svc.cluster.local \
  --from-literal=port=6379 \
  --from-literal=password=<redis-password>

# RabbitMQ credentials
kubectl create secret generic flash-whatsapp-rabbitmq \
  --namespace=flash-production \
  --from-literal=url=amqp://user:password@rabbitmq.production.svc.cluster.local:5672

# Flash API credentials
kubectl create secret generic flash-whatsapp-api \
  --namespace=flash-production \
  --from-literal=api_key=<flash-api-key>

# Twilio credentials
kubectl create secret generic flash-whatsapp-twilio \
  --namespace=flash-production \
  --from-literal=account_sid=<twilio-account-sid> \
  --from-literal=auth_token=<twilio-auth-token>

# Maple AI credentials
kubectl create secret generic flash-whatsapp-maple \
  --namespace=flash-production \
  --from-literal=api_key=<maple-ai-api-key>

# JWT Secret
kubectl create secret generic flash-whatsapp-jwt \
  --namespace=flash-production \
  --from-literal=secret=<jwt-secret>
```

### Staging Environment

```bash
# Redis credentials
kubectl create secret generic flash-whatsapp-redis-staging \
  --namespace=flash-staging \
  --from-literal=host=redis.staging.svc.cluster.local \
  --from-literal=port=6379 \
  --from-literal=password=<redis-password>

# RabbitMQ credentials
kubectl create secret generic flash-whatsapp-rabbitmq-staging \
  --namespace=flash-staging \
  --from-literal=url=amqp://user:password@rabbitmq.staging.svc.cluster.local:5672

# Flash API credentials
kubectl create secret generic flash-whatsapp-api-staging \
  --namespace=flash-staging \
  --from-literal=api_key=<flash-api-key>

# Twilio credentials
kubectl create secret generic flash-whatsapp-twilio-staging \
  --namespace=flash-staging \
  --from-literal=account_sid=<twilio-account-sid> \
  --from-literal=auth_token=<twilio-auth-token>

# Maple AI credentials
kubectl create secret generic flash-whatsapp-maple-staging \
  --namespace=flash-staging \
  --from-literal=api_key=<maple-ai-api-key>

# JWT Secret
kubectl create secret generic flash-whatsapp-jwt-staging \
  --namespace=flash-staging \
  --from-literal=secret=<jwt-secret>
```

## Deployment

To deploy to the staging environment:

```bash
kubectl apply -f kubernetes/config.yaml
kubectl apply -f kubernetes/staging.yaml
```

To deploy to the production environment:

```bash
kubectl apply -f kubernetes/config.yaml
kubectl apply -f kubernetes/deployment.yaml
```

However, it's recommended to use the CI/CD pipeline for automated deployments rather than manual kubectl commands.

## Monitoring

The deployment includes Prometheus annotations for metrics scraping. The following metrics are exposed:

- HTTP request count, latency, and error rates
- Memory and CPU usage
- RabbitMQ message processing rates
- Redis connection pool metrics

Metrics are available at the `/metrics` endpoint.

## Health Checks

The service exposes a `/health` endpoint that reports the status of all dependencies (Redis, RabbitMQ, Flash API, etc.). This endpoint is used by Kubernetes liveness and readiness probes.

## Scaling

The service can be scaled horizontally by adjusting the `replicas` value in the deployment manifest. The recommended approach is to use the Horizontal Pod Autoscaler (HPA):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: flash-whatsapp-service
  namespace: flash-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flash-whatsapp-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Blue-Green Deployments

The CD pipeline implements a blue-green deployment strategy. See the GitHub Actions workflow files for details on how this is implemented.