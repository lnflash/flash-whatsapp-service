# Production Error Tracking Setup

This guide covers comprehensive error tracking and monitoring for Pulse in production.

## Error Tracking Services

### Option 1: Sentry (Recommended)

Sentry provides comprehensive error tracking with excellent NestJS integration.

#### Installation

```bash
npm install --save @sentry/node @sentry/integrations @sentry/tracing
```

#### Configuration

1. **Add to environment variables**:
```bash
# .env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0
SENTRY_SAMPLE_RATE=1.0
SENTRY_TRACES_SAMPLE_RATE=0.1
```

2. **Create Sentry module** (`src/modules/sentry/sentry.module.ts`):
```typescript
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { SentryService } from './sentry.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'SENTRY_OPTIONS',
      useFactory: (configService: ConfigService) => ({
        dsn: configService.get<string>('SENTRY_DSN'),
        environment: configService.get<string>('SENTRY_ENVIRONMENT'),
        release: configService.get<string>('SENTRY_RELEASE'),
        sampleRate: configService.get<number>('SENTRY_SAMPLE_RATE', 1.0),
        tracesSampleRate: configService.get<number>('SENTRY_TRACES_SAMPLE_RATE', 0.1),
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Express({ tracing: true }),
        ],
      }),
      inject: [ConfigService],
    },
    SentryService,
  ],
  exports: [SentryService],
})
export class SentryModule {}
```

3. **Create Sentry interceptor** (`src/common/interceptors/sentry.interceptor.ts`):
```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(null, (exception) => {
        Sentry.captureException(exception);
      }),
    );
  }
}
```

### Option 2: Custom Error Logging

If you prefer to use your own logging infrastructure:

1. **Enhanced error logger** (`src/common/logging/error-logger.service.ts`):
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ErrorLoggerService {
  private readonly logger = new Logger(ErrorLoggerService.name);
  private readonly errorLogPath: string;

  constructor(private configService: ConfigService) {
    this.errorLogPath = this.configService.get<string>(
      'ERROR_LOG_PATH',
      '/var/log/pulse/errors'
    );
  }

  async logError(error: any, context?: any): Promise<void> {
    const errorData = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      code: error.code,
      context,
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    };

    // Log to console
    this.logger.error(JSON.stringify(errorData));

    // Log to file
    try {
      const filename = `error-${new Date().toISOString().split('T')[0]}.log`;
      const filepath = path.join(this.errorLogPath, filename);
      await fs.appendFile(filepath, JSON.stringify(errorData) + '\n');
    } catch (writeError) {
      this.logger.error('Failed to write error to file:', writeError);
    }
  }
}
```

## Error Monitoring Dashboard

### Grafana Dashboard Configuration

Create a Grafana dashboard for error monitoring:

```json
{
  "dashboard": {
    "title": "Pulse Error Monitoring",
    "panels": [
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(pulse_errors_total[5m])"
          }
        ]
      },
      {
        "title": "Error Types",
        "targets": [
          {
            "expr": "sum by (error_type) (pulse_errors_total)"
          }
        ]
      },
      {
        "title": "Critical Errors",
        "targets": [
          {
            "expr": "pulse_critical_errors_total"
          }
        ]
      }
    ]
  }
}
```

## Alert Configuration

### 1. Critical Error Alerts

Configure alerts for critical errors that need immediate attention:

```yaml
# prometheus-alerts.yml
groups:
  - name: pulse_errors
    rules:
      - alert: HighErrorRate
        expr: rate(pulse_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: CriticalError
        expr: pulse_critical_errors_total > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Critical error occurred"
          description: "Critical error in {{ $labels.module }}"

      - alert: WhatsAppDisconnected
        expr: pulse_whatsapp_connected == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "WhatsApp disconnected"
          description: "WhatsApp has been disconnected for 5 minutes"
```

### 2. Notification Channels

Configure multiple notification channels:

```bash
# Slack webhook
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourcompany.com
SMTP_PASS=your-password
ALERT_EMAIL=devops@yourcompany.com

# PagerDuty (for critical alerts)
PAGERDUTY_API_KEY=your-api-key
PAGERDUTY_SERVICE_ID=your-service-id
```

## Error Categories

Define and track specific error categories:

```typescript
export enum ErrorCategory {
  WHATSAPP_CONNECTION = 'whatsapp_connection',
  PAYMENT_PROCESSING = 'payment_processing',
  API_INTEGRATION = 'api_integration',
  DATABASE_ERROR = 'database_error',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown',
}
```

## Error Analysis Tools

### 1. Error Analysis Script

Create `/opt/pulse/scripts/analyze-errors.sh`:

```bash
#!/bin/bash

# Analyze error patterns from logs

ERROR_LOG_DIR="/var/log/pulse"
REPORT_FILE="/tmp/error-analysis-$(date +%Y%m%d).txt"

echo "Error Analysis Report - $(date)" > $REPORT_FILE
echo "================================" >> $REPORT_FILE

# Count errors by type
echo -e "\n## Errors by Type:" >> $REPORT_FILE
grep -h "error" $ERROR_LOG_DIR/*.log | \
  jq -r '.error_type // .message' 2>/dev/null | \
  sort | uniq -c | sort -rn | head -20 >> $REPORT_FILE

# Most frequent error messages
echo -e "\n## Most Frequent Errors:" >> $REPORT_FILE
grep -h "error" $ERROR_LOG_DIR/*.log | \
  jq -r '.message' 2>/dev/null | \
  sort | uniq -c | sort -rn | head -10 >> $REPORT_FILE

# Errors by hour
echo -e "\n## Errors by Hour (last 24h):" >> $REPORT_FILE
grep -h "error" $ERROR_LOG_DIR/*.log | \
  jq -r '.timestamp' 2>/dev/null | \
  cut -d'T' -f2 | cut -d':' -f1 | \
  sort | uniq -c >> $REPORT_FILE

# Critical errors
echo -e "\n## Critical Errors:" >> $REPORT_FILE
grep -h "critical" $ERROR_LOG_DIR/*.log | \
  jq '.' 2>/dev/null | head -10 >> $REPORT_FILE

cat $REPORT_FILE
```

### 2. Real-time Error Monitoring

Create a real-time error monitor:

```typescript
// src/modules/monitoring/error-monitor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ErrorMonitorService {
  private readonly logger = new Logger(ErrorMonitorService.name);

  constructor(private redisService: RedisService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkErrorRates() {
    const errorCount = await this.redisService.getClient().get('error:count:minute');
    
    if (parseInt(errorCount || '0') > 100) {
      this.logger.error(`High error rate detected: ${errorCount} errors/minute`);
      // Send alert
    }
  }

  async trackError(error: any) {
    const client = this.redisService.getClient();
    
    // Increment counters
    await client.incr('error:count:total');
    await client.incr('error:count:minute');
    await client.expire('error:count:minute', 60);
    
    // Store error details
    const errorKey = `error:${Date.now()}`;
    await client.setex(errorKey, 86400, JSON.stringify({
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }));
  }
}
```

## Production Error Handling Best Practices

### 1. Sanitize Error Messages

Never expose sensitive information in error messages:

```typescript
// Bad
throw new Error(`Database connection failed: ${connectionString}`);

// Good
throw new Error('Database connection failed');
logger.error('DB connection failed', { host: dbHost }); // Log separately
```

### 2. Error Recovery Strategies

Implement automatic recovery for common errors:

```typescript
class ServiceWithRecovery {
  async performOperation() {
    let retries = 3;
    while (retries > 0) {
      try {
        return await this.riskyOperation();
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await this.wait(1000 * (4 - retries)); // Exponential backoff
      }
    }
  }
}
```

### 3. Error Aggregation

Group similar errors to avoid alert fatigue:

```typescript
class ErrorAggregator {
  private errorCounts = new Map<string, number>();
  
  trackError(error: Error) {
    const key = this.getErrorKey(error);
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);
    
    if (count === 10) {
      this.sendAggregatedAlert(key, count);
    }
  }
}
```

## Monitoring Integration

### 1. Health Check Integration

Add error metrics to health checks:

```typescript
async detailedHealthCheck() {
  const errorRate = await this.getErrorRate();
  const criticalErrors = await this.getCriticalErrorCount();
  
  return {
    status: criticalErrors > 0 ? 'degraded' : 'healthy',
    errors: {
      rate: errorRate,
      critical: criticalErrors,
      recent: await this.getRecentErrors(),
    },
  };
}
```

### 2. Metrics Export

Export error metrics for Prometheus:

```typescript
// /metrics endpoint
pulse_errors_total{type="whatsapp"} 42
pulse_errors_total{type="payment"} 17
pulse_critical_errors_total 3
pulse_error_rate_per_minute 0.5
```

## Testing Error Handling

### 1. Error Injection Testing

Test your error handling in production:

```bash
# Inject test errors
curl -X POST https://your-domain.com/admin/test/error \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type": "payment", "severity": "warning"}'
```

### 2. Chaos Engineering

Periodically test error recovery:
- Disconnect Redis
- Block API endpoints
- Simulate high load
- Kill WhatsApp session

## Error Budget

Define acceptable error rates:

- 99.9% uptime = 43 minutes downtime/month
- Error rate budget: 0.1% of requests
- Critical errors: 0 tolerance
- Payment errors: < 0.01%

Track against these budgets and adjust as needed.

## Quick Reference

### Common Error Patterns

| Error | Cause | Solution |
|-------|-------|----------|
| ECONNREFUSED | Service down | Check service health |
| ETIMEDOUT | Network issue | Retry with backoff |
| ENOMEM | Out of memory | Scale up or optimize |
| Rate limited | Too many requests | Implement queuing |
| Session expired | Auth timeout | Auto-refresh tokens |

### Emergency Contacts

- On-call Engineer: [Phone]
- DevOps Lead: [Phone/Email]
- Sentry/Monitoring: [Dashboard URL]

---

Remember: Good error tracking helps you fix issues before users notice them!