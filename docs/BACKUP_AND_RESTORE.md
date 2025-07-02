# Backup and Restore Guide

This guide covers backup strategies and restore procedures for Pulse in production.

## Automated Backups

The deployment script sets up automated daily backups at 3 AM server time.

### What Gets Backed Up

1. **WhatsApp Sessions** (`/opt/pulse/whatsapp-sessions/`)
   - Critical for maintaining WhatsApp connection
   - Contains authentication data

2. **Environment Configuration** (`/opt/pulse/.env`)
   - All API keys and configuration
   - Database passwords

3. **Redis Data** (snapshot)
   - User sessions
   - Cached data
   - Rate limiting data

### Backup Location

Backups are stored in `/opt/pulse/backups/` as compressed archives:
```
pulse_backup_20240115_030000.tar.gz
```

## Manual Backup

To create a backup manually:

```bash
/opt/pulse/scripts/backup.sh
```

This will create a timestamped backup in `/opt/pulse/backups/`.

## Restore Procedures

### 1. Full System Restore

If you need to restore to a new server:

```bash
# 1. Run the deployment script on the new server
curl -sSL https://raw.githubusercontent.com/lnflash/pulse/admin-panel/scripts/quick-install.sh | sudo bash

# 2. Stop the services
cd /opt/pulse
docker compose -f docker-compose.production.yml down

# 3. Copy backup to new server (from your local machine)
scp pulse_backup_20240115_030000.tar.gz root@new-server:/opt/pulse/backups/

# 4. Extract the backup
cd /opt/pulse/backups
tar -xzf pulse_backup_20240115_030000.tar.gz

# 5. Restore WhatsApp sessions
cp -r pulse_backup_20240115_030000/whatsapp-sessions/* /opt/pulse/whatsapp-sessions/

# 6. Restore environment file
cp pulse_backup_20240115_030000/.env /opt/pulse/.env

# 7. Restore Redis data (optional - only if you need session continuity)
docker compose -f /opt/pulse/docker-compose.production.yml up -d redis
docker cp pulse_backup_20240115_030000/redis_dump.rdb pulse-redis:/data/dump.rdb
docker restart pulse-redis

# 8. Start all services
docker compose -f /opt/pulse/docker-compose.production.yml up -d

# 9. Verify WhatsApp connection
docker logs pulse-app
```

### 2. WhatsApp Session Only Restore

If WhatsApp disconnects and won't reconnect:

```bash
# 1. Stop the app
docker stop pulse-app

# 2. Restore WhatsApp session from backup
cd /opt/pulse/backups
tar -xzf pulse_backup_LATEST.tar.gz
cp -r pulse_backup_*/whatsapp-sessions/* /opt/pulse/whatsapp-sessions/

# 3. Start the app
docker start pulse-app

# 4. Check logs
docker logs -f pulse-app
```

### 3. Configuration Restore

If configuration is lost or corrupted:

```bash
# 1. Extract .env from backup
cd /opt/pulse/backups
tar -xzf pulse_backup_LATEST.tar.gz pulse_backup_*/.env

# 2. Review the configuration
cat pulse_backup_*/.env

# 3. Restore it
cp pulse_backup_*/.env /opt/pulse/.env

# 4. Restart services
cd /opt/pulse
docker compose -f docker-compose.production.yml restart
```

## Backup Best Practices

### 1. Offsite Backups

Set up automatic offsite backups to S3 or another cloud provider:

```bash
# Add to crontab
0 4 * * * aws s3 cp /opt/pulse/backups/pulse_backup_$(date +\%Y\%m\%d)_*.tar.gz s3://your-backup-bucket/pulse/
```

### 2. Backup Retention

The script keeps only the last 7 backups locally. For compliance:
- Keep daily backups for 7 days
- Keep weekly backups for 4 weeks
- Keep monthly backups for 12 months

### 3. Test Restores

Regularly test your restore procedures:
- Monthly: Test configuration restore
- Quarterly: Test full system restore
- Document restore times for planning

## Disaster Recovery

### Scenario 1: Server Failure

**Recovery Time Objective (RTO)**: 30 minutes

1. Provision new VPS
2. Update DNS records
3. Run deployment script
4. Restore from latest backup
5. Verify all services

### Scenario 2: Data Corruption

**Recovery Point Objective (RPO)**: 24 hours

1. Identify corruption time
2. Find clean backup before corruption
3. Stop services
4. Restore from clean backup
5. Verify data integrity

### Scenario 3: WhatsApp Ban

**Prevention is key**:
- Use dedicated number
- Follow WhatsApp Business Policy
- Limit message frequency
- Avoid spam-like behavior

**If banned**:
1. Have backup numbers ready
2. Update .env with new number
3. Restart with fresh WhatsApp session
4. Notify users of number change

## Monitoring Backups

### Check Backup Status

```bash
# List recent backups
ls -lah /opt/pulse/backups/

# Check backup cron job
grep pulse /etc/cron.d/pulse

# View backup logs
tail -f /opt/pulse/logs/backup.log
```

### Backup Alerts

Add monitoring for failed backups:

```bash
# Add to monitoring script
if [ $(find /opt/pulse/backups -name "pulse_backup_$(date +%Y%m%d)_*.tar.gz" -mtime -1 | wc -l) -eq 0 ]; then
    echo "WARNING: No backup created today!"
    # Send alert
fi
```

## Important Notes

1. **WhatsApp Sessions**: These are tied to the phone number. You cannot restore a session to a different number.

2. **Redis Data**: Contains temporary data. Only restore if you need session continuity.

3. **Secrets**: After restore, verify all secrets in .env are complete and not corrupted.

4. **DNS**: If restoring to a new server, update DNS records immediately.

5. **SSL Certificates**: These are server-specific. Run `certbot --nginx` on new server.

## Recovery Checklist

- [ ] Backup available and verified
- [ ] New server provisioned (if needed)
- [ ] DNS updated (if new server)
- [ ] Services stopped
- [ ] Data restored
- [ ] Configuration verified
- [ ] Services started
- [ ] WhatsApp connected
- [ ] Health checks passing
- [ ] User notification sent (if needed)