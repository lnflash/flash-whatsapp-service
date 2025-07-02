# Pulse Deployment Examples

## Quick Start Deployments

### 1. Docker (Simplest)

```bash
# One-line deployment
docker run -d \
  -p 3000:3000 \
  -v pulse-data:/data \
  -e FLASH_API_KEY=your_key_here \
  --name pulse \
  --restart unless-stopped \
  lnflash/pulse:latest

# Check logs
docker logs -f pulse

# Scan QR code when it appears
```

### 2. Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  pulse:
    image: lnflash/pulse:latest
    container_name: pulse
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - FLASH_API_KEY=${FLASH_API_KEY}
      - DOMAIN_NAME=${DOMAIN_NAME:-localhost}
      - ENABLE_ADMIN_PANEL=true
    volumes:
      - ./data:/data
      - ./whatsapp-sessions:/app/whatsapp-sessions
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Deploy:
```bash
# Create .env file
echo "FLASH_API_KEY=your_key_here" > .env

# Start
docker compose up -d

# View QR code
docker compose logs pulse
```

### 3. Umbrel App Store

```bash
# SSH into your Umbrel
ssh umbrel@umbrel.local

# Install from Umbrel app store (when available)
# Or manually:
cd ~/umbrel/app-data
git clone https://github.com/lnflash/pulse-umbrel.git pulse
cd pulse
docker compose up -d
```

### 4. Start9 Embassy

```yaml
# manifest.yaml for Start9
id: pulse
title: "Pulse Lightning Bot"
version: 1.0.0
release-notes: "Initial release"
license: mit
wrapper-repo: https://github.com/lnflash/pulse-start9
upstream-repo: https://github.com/lnflash/pulse
support-site: https://github.com/lnflash/pulse/issues
marketing-site: https://pulse.sh
build: ["docker"]
```

### 5. Railway (Cloud)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/lnflash/pulse)

Or manually:
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway new

# Deploy
railway up

# Set environment variables
railway vars set FLASH_API_KEY=your_key_here

# Get deployment URL
railway open
```

### 6. Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Create app
flyctl launch --image lnflash/pulse:latest

# Set secrets
flyctl secrets set FLASH_API_KEY=your_key_here

# Deploy
flyctl deploy

# View logs
flyctl logs
```

### 7. Google Cloud Run

```bash
# Deploy with Cloud Run button
# Or use gcloud CLI:

# Authenticate
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Deploy
gcloud run deploy pulse \
  --image lnflash/pulse:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars FLASH_API_KEY=your_key_here

# Get URL
gcloud run services describe pulse --format='value(status.url)'
```

### 8. DigitalOcean App Platform

```yaml
# app.yaml
name: pulse
services:
- name: web
  image:
    registry_type: DOCKER_HUB
    registry: lnflash
    repository: pulse
    tag: latest
  http_port: 3000
  instance_count: 1
  instance_size_slug: basic-xxs
  health_check:
    http_path: /health
  envs:
  - key: FLASH_API_KEY
    value: your_key_here
    type: SECRET
```

Deploy:
```bash
doctl apps create --spec app.yaml
```

### 9. Kubernetes (k8s)

```yaml
# pulse-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pulse
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pulse
  template:
    metadata:
      labels:
        app: pulse
    spec:
      containers:
      - name: pulse
        image: lnflash/pulse:latest
        ports:
        - containerPort: 3000
        env:
        - name: FLASH_API_KEY
          valueFrom:
            secretKeyRef:
              name: pulse-secrets
              key: flash-api-key
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: pulse-data
---
apiVersion: v1
kind: Service
metadata:
  name: pulse
spec:
  selector:
    app: pulse
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

Deploy:
```bash
# Create secret
kubectl create secret generic pulse-secrets \
  --from-literal=flash-api-key=your_key_here

# Apply configuration
kubectl apply -f pulse-deployment.yaml

# Get external IP
kubectl get service pulse
```

### 10. Raspberry Pi / Home Server

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Create directory
mkdir ~/pulse
cd ~/pulse

# Create docker-compose.yml
cat > docker-compose.yml << EOF
version: '3.8'
services:
  pulse:
    image: lnflash/pulse:latest
    container_name: pulse
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - FLASH_API_KEY=your_key_here
    volumes:
      - ./data:/data
EOF

# Start
docker compose up -d
```

## Advanced Deployments

### Multi-Region Setup

```yaml
# docker-compose.multi-region.yml
version: '3.8'

services:
  pulse-us:
    image: lnflash/pulse:latest
    environment:
      - REGION=us-east-1
      - REDIS_URL=redis://redis-us:6379
    deploy:
      placement:
        constraints:
          - node.labels.region == us-east

  pulse-eu:
    image: lnflash/pulse:latest
    environment:
      - REGION=eu-west-1
      - REDIS_URL=redis://redis-eu:6379
    deploy:
      placement:
        constraints:
          - node.labels.region == eu-west

  pulse-asia:
    image: lnflash/pulse:latest
    environment:
      - REGION=ap-southeast-1
      - REDIS_URL=redis://redis-asia:6379
    deploy:
      placement:
        constraints:
          - node.labels.region == ap-southeast
```

### High Availability Setup

```yaml
# docker-compose.ha.yml
version: '3.8'

services:
  pulse:
    image: lnflash/pulse:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - pulse

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

volumes:
  redis-data:
```

### Development Setup

```bash
# Clone repository
git clone https://github.com/lnflash/pulse.git
cd pulse

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env

# Run in development mode
npm run start:dev

# Run with Docker in dev mode
docker compose -f docker-compose.dev.yml up
```

## Platform-Specific Installers

### macOS (Homebrew)

```bash
# Add tap (when available)
brew tap lnflash/pulse

# Install
brew install pulse

# Start service
brew services start pulse

# View QR code
pulse qr
```

### Linux (Snap)

```bash
# Install from Snap Store (when available)
sudo snap install pulse

# Connect interfaces
sudo snap connect pulse:network
sudo snap connect pulse:network-bind

# View configuration
snap get pulse

# Set API key
snap set pulse flash-api-key=your_key_here

# View logs
snap logs pulse
```

### Windows (Chocolatey)

```powershell
# Install Chocolatey if not present
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

# Install Pulse (when available)
choco install pulse

# Configure
pulse config set flash-api-key your_key_here

# Start
pulse start
```

## Monitoring & Management

### Health Checks

```bash
# Docker
docker exec pulse wget -q --spider http://localhost:3000/health && echo "Healthy" || echo "Unhealthy"

# Kubernetes
kubectl exec -it pulse-pod -- wget -q --spider http://localhost:3000/health

# Direct
curl -f http://localhost:3000/health || echo "Service is down"
```

### Logging

```bash
# Docker logs
docker logs -f pulse --tail 100

# Docker Compose logs
docker compose logs -f pulse

# Kubernetes logs
kubectl logs -f deployment/pulse

# Journal logs (systemd)
journalctl -u pulse -f
```

### Metrics

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'pulse'
    static_configs:
      - targets: ['pulse:3000']
    metrics_path: '/metrics'
```

## Troubleshooting

### Common Issues

1. **QR Code not appearing**
```bash
# Check logs
docker logs pulse | grep -i qr

# Restart container
docker restart pulse
```

2. **Connection issues**
```bash
# Check network
docker exec pulse ping -c 4 web.whatsapp.com

# Check DNS
docker exec pulse nslookup web.whatsapp.com
```

3. **Session issues**
```bash
# Clear session
docker exec pulse rm -rf /app/whatsapp-sessions/*

# Restart
docker restart pulse
```

## Security Best Practices

1. **Use secrets management**
```bash
# Docker Swarm secrets
echo "your_key_here" | docker secret create flash_api_key -

# Kubernetes secrets
kubectl create secret generic pulse-secrets \
  --from-literal=flash-api-key=your_key_here
```

2. **Network isolation**
```yaml
networks:
  pulse-net:
    driver: bridge
    internal: true
```

3. **Read-only filesystem**
```yaml
services:
  pulse:
    image: lnflash/pulse:latest
    read_only: true
    tmpfs:
      - /tmp
      - /app/whatsapp-sessions
```

## Backup & Restore

### Backup
```bash
# Docker volumes
docker run --rm -v pulse-data:/data -v $(pwd):/backup alpine tar czf /backup/pulse-backup.tar.gz -C /data .

# Kubernetes
kubectl exec pulse-pod -- tar czf - /data | gzip > pulse-backup.tar.gz
```

### Restore
```bash
# Docker volumes
docker run --rm -v pulse-data:/data -v $(pwd):/backup alpine tar xzf /backup/pulse-backup.tar.gz -C /data

# Kubernetes
kubectl exec -i pulse-pod -- tar xzf - -C /data < pulse-backup.tar.gz
```