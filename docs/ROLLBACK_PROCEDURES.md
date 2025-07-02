# Rollback Procedures

This guide covers how to safely rollback Pulse deployments when issues arise.

## Pre-Deployment Preparation

Before any deployment:

1. **Create a backup**
   ```bash
   /opt/pulse/scripts/backup.sh
   ```

2. **Note current version**
   ```bash
   cd /opt/pulse
   git rev-parse HEAD > last-known-good.txt
   ```

3. **Test health endpoint**
   ```bash
   curl https://your-domain.com/health/detailed
   ```

## Quick Rollback (< 5 minutes)

If you notice issues immediately after deployment:

```bash
# 1. Stop the application
cd /opt/pulse
docker compose -f docker-compose.production.yml stop app

# 2. Rollback to previous Git commit
git checkout $(cat last-known-good.txt)

# 3. Rebuild with previous version
docker compose -f docker-compose.production.yml build app

# 4. Start the application
docker compose -f docker-compose.production.yml up -d app

# 5. Verify rollback
docker logs -f pulse-app
curl https://your-domain.com/health/detailed
```

## Full Rollback Procedure

For more complex issues requiring full rollback:

### 1. Assess the Situation

```bash
# Check service status
docker compose -f docker-compose.production.yml ps

# Check error logs
docker logs pulse-app --tail 100 | grep -i error

# Check system resources
htop
df -h
```

### 2. Preserve Evidence

```bash
# Save logs for debugging
docker logs pulse-app > /opt/pulse/logs/failed-deployment-$(date +%Y%m%d-%H%M%S).log

# Save current configuration
cp /opt/pulse/.env /opt/pulse/.env.failed-$(date +%Y%m%d-%H%M%S)
```

### 3. Execute Rollback

```bash
# Stop all services
cd /opt/pulse
docker compose -f docker-compose.production.yml down

# Restore from backup
cd /opt/pulse/backups
tar -xzf pulse_backup_LATEST.tar.gz

# Restore code to last known good version
cd /opt/pulse
git fetch
git checkout $(cat last-known-good.txt)

# Restore configuration if needed
cp /opt/pulse/backups/pulse_backup_*/.env /opt/pulse/.env

# Restore WhatsApp session if needed
cp -r /opt/pulse/backups/pulse_backup_*/whatsapp-sessions/* /opt/pulse/whatsapp-sessions/

# Rebuild everything
docker compose -f docker-compose.production.yml build

# Start services
docker compose -f docker-compose.production.yml up -d
```

### 4. Verify Rollback

```bash
# Check all services are running
docker compose -f docker-compose.production.yml ps

# Test health endpoints
curl https://your-domain.com/health
curl https://your-domain.com/health/detailed

# Check WhatsApp connection
docker logs pulse-app | grep -i "ready\|connected"

# Test core functionality
# Send a test message through WhatsApp
```

## Rollback Scenarios

### Scenario 1: Code Bug in New Release

**Symptoms**: Application crashes, errors in logs

**Rollback Steps**:
1. Stop application only
2. Git checkout previous version
3. Rebuild and restart application
4. Keep Redis/RabbitMQ running

**Time**: ~5 minutes

### Scenario 2: Database Schema Issue

**Symptoms**: Redis errors, data corruption

**Rollback Steps**:
1. Stop all services
2. Restore Redis backup
3. Rollback code
4. Start all services

**Time**: ~10 minutes

### Scenario 3: Configuration Error

**Symptoms**: Service won't start, connection errors

**Rollback Steps**:
1. Stop affected service
2. Restore .env from backup
3. Restart service

**Time**: ~3 minutes

### Scenario 4: WhatsApp Session Corrupted

**Symptoms**: QR code loop, can't connect

**Rollback Steps**:
1. Stop application
2. Clear session directory
3. Restore session from backup
4. Restart application

**Time**: ~5 minutes

### Scenario 5: Complete System Failure

**Symptoms**: Multiple services down, system unstable

**Rollback Steps**:
1. Full backup restore
2. Complete rebuild
3. May require DNS update if server changed

**Time**: ~30 minutes

## Rollback Decision Matrix

| Issue Severity | User Impact | Rollback Type | Max Time |
|---------------|------------|---------------|----------|
| Critical | All users affected | Immediate | 5 min |
| High | Most users affected | Quick | 10 min |
| Medium | Some features broken | Planned | 30 min |
| Low | Minor issues | Next window | 2 hours |

## Post-Rollback Actions

### 1. Communication
- Notify team of rollback
- Update status page
- Inform affected users if needed

### 2. Investigation
- Analyze what went wrong
- Review deployment process
- Document lessons learned

### 3. Fix Forward
- Create hotfix branch
- Test thoroughly in staging
- Plan careful re-deployment

## Rollback Automation Script

Create `/opt/pulse/scripts/rollback.sh`:

```bash
#!/bin/bash

# Pulse Quick Rollback Script

set -e

echo "Starting Pulse rollback..."

# Check if last-known-good exists
if [ ! -f /opt/pulse/last-known-good.txt ]; then
    echo "ERROR: No last-known-good.txt found!"
    echo "Manual rollback required."
    exit 1
fi

LAST_GOOD=$(cat /opt/pulse/last-known-good.txt)
echo "Rolling back to commit: $LAST_GOOD"

# Stop application
cd /opt/pulse
docker compose -f docker-compose.production.yml stop app

# Rollback code
git checkout $LAST_GOOD

# Rebuild
docker compose -f docker-compose.production.yml build app

# Start
docker compose -f docker-compose.production.yml up -d app

# Wait for startup
echo "Waiting for application to start..."
sleep 30

# Check health
if curl -f https://localhost:3000/health > /dev/null 2>&1; then
    echo "Rollback successful! Application is healthy."
else
    echo "WARNING: Health check failed after rollback!"
fi

echo "Rollback complete. Check logs: docker logs -f pulse-app"
```

Make it executable:
```bash
chmod +x /opt/pulse/scripts/rollback.sh
```

## Prevention Best Practices

1. **Always Test First**
   - Deploy to staging environment
   - Run smoke tests
   - Check for breaking changes

2. **Gradual Rollout**
   - Deploy during low-traffic periods
   - Monitor for 30 minutes post-deployment
   - Have team ready for rollback

3. **Version Documentation**
   - Tag releases in Git
   - Document changes clearly
   - Note any migration steps

4. **Backup Before Deploy**
   - Automated pre-deployment backup
   - Verify backup is complete
   - Test restore procedure quarterly

## Emergency Contacts

Document your emergency contacts:
- DevOps Lead: [Phone/Email]
- Backend Lead: [Phone/Email]
- WhatsApp Expert: [Phone/Email]
- Infrastructure Support: [Phone/Email]

## Rollback Metrics

Track these for each rollback:
- Time to detect issue
- Time to decision
- Time to execute rollback
- Total downtime
- Users affected
- Root cause

This helps improve deployment processes and reduce future rollbacks.