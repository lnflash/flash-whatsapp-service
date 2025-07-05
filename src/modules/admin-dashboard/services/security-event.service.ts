import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

export enum SecurityEventType {
  LOGIN_ATTEMPT = 'login_attempt',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  TOTP_SETUP = 'totp_setup',
  TOTP_VERIFIED = 'totp_verified',
  TOTP_FAILED = 'totp_failed',
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  SESSION_REVOKED = 'session_revoked',
  PERMISSION_DENIED = 'permission_denied',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  CONFIGURATION_CHANGE = 'configuration_change',
  BULK_OPERATION = 'bulk_operation',
}

export enum SecurityEventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  details: Record<string, any>;
  timestamp: Date;
  hash?: string; // For tamper detection
}

export interface SecurityEventFilter {
  types?: SecurityEventType[];
  severities?: SecurityEventSeverity[];
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<SecurityEventSeverity, number>;
  topIpAddresses: Array<{ ip: string; count: number }>;
  suspiciousActivities: number;
  failedLogins: number;
  successfulLogins: number;
}

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);
  private readonly maxEventsStored = 100000;
  private readonly eventTTL = 90 * 24 * 60 * 60; // 90 days

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Log a security event
   */
  async logEvent(eventData: Partial<SecurityEvent>): Promise<SecurityEvent> {
    const event: SecurityEvent = {
      id: this.generateEventId(),
      severity: this.determineSeverity(eventData.type!),
      timestamp: new Date(),
      ipAddress: eventData.ipAddress || 'unknown',
      ...eventData,
    } as SecurityEvent;

    // Generate hash for tamper detection
    event.hash = this.generateEventHash(event);

    // Store event
    await this.storeEvent(event);

    // Emit event for real-time monitoring
    this.eventEmitter.emit('security.event', event);

    // Check for suspicious patterns
    await this.analyzeSuspiciousActivity(event);

    // Log critical events
    if (event.severity === SecurityEventSeverity.CRITICAL) {
      this.logger.error(`Critical security event: ${event.type}`, event);
    }

    return event;
  }

  /**
   * Query security events
   */
  async queryEvents(filter: SecurityEventFilter): Promise<SecurityEvent[]> {
    const events = await this.getAllEvents();
    
    return events
      .filter(event => this.matchesFilter(event, filter))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, filter.limit || 1000);
  }

  /**
   * Get security metrics
   */
  async getMetrics(timeRange: { start: Date; end: Date }): Promise<SecurityMetrics> {
    const events = await this.getAllEvents();
    const filteredEvents = events.filter(
      e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end,
    );

    const metrics: SecurityMetrics = {
      totalEvents: filteredEvents.length,
      eventsByType: {} as Record<SecurityEventType, number>,
      eventsBySeverity: {} as Record<SecurityEventSeverity, number>,
      topIpAddresses: [],
      suspiciousActivities: 0,
      failedLogins: 0,
      successfulLogins: 0,
    };

    // Count events by type
    const typeCount = new Map<SecurityEventType, number>();
    const severityCount = new Map<SecurityEventSeverity, number>();
    const ipCount = new Map<string, number>();

    filteredEvents.forEach(event => {
      // Type counting
      typeCount.set(event.type, (typeCount.get(event.type) || 0) + 1);
      
      // Severity counting
      severityCount.set(event.severity, (severityCount.get(event.severity) || 0) + 1);
      
      // IP counting
      ipCount.set(event.ipAddress, (ipCount.get(event.ipAddress) || 0) + 1);
      
      // Specific metrics
      if (event.type === SecurityEventType.SUSPICIOUS_ACTIVITY) {
        metrics.suspiciousActivities++;
      }
      if (event.type === SecurityEventType.LOGIN_FAILURE) {
        metrics.failedLogins++;
      }
      if (event.type === SecurityEventType.LOGIN_SUCCESS) {
        metrics.successfulLogins++;
      }
    });

    // Convert maps to objects
    metrics.eventsByType = Object.fromEntries(typeCount) as any;
    metrics.eventsBySeverity = Object.fromEntries(severityCount) as any;
    
    // Get top IPs
    metrics.topIpAddresses = Array.from(ipCount.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return metrics;
  }

  /**
   * Detect anomalies in security events
   */
  async detectAnomalies(): Promise<Array<{
    type: string;
    description: string;
    severity: SecurityEventSeverity;
    events: SecurityEvent[];
  }>> {
    const anomalies = [];
    const recentEvents = await this.getRecentEvents(60 * 60 * 1000); // Last hour

    // Check for brute force attempts
    const failedLogins = recentEvents.filter(
      e => e.type === SecurityEventType.LOGIN_FAILURE,
    );
    const failedLoginsByIp = this.groupBy(failedLogins, 'ipAddress');
    
    for (const [ip, events] of Object.entries(failedLoginsByIp)) {
      if (events.length > 10) {
        anomalies.push({
          type: 'brute_force',
          description: `Possible brute force attack from IP ${ip}`,
          severity: SecurityEventSeverity.CRITICAL,
          events,
        });
      }
    }

    // Check for rapid session creation
    const sessionCreations = recentEvents.filter(
      e => e.type === SecurityEventType.SESSION_CREATED,
    );
    if (sessionCreations.length > 50) {
      anomalies.push({
        type: 'session_flood',
        description: 'Abnormal number of sessions created',
        severity: SecurityEventSeverity.WARNING,
        events: sessionCreations,
      });
    }

    // Check for permission denied patterns
    const permissionDenied = recentEvents.filter(
      e => e.type === SecurityEventType.PERMISSION_DENIED,
    );
    const deniedByUser = this.groupBy(permissionDenied, 'userId');
    
    for (const [userId, events] of Object.entries(deniedByUser)) {
      if (events.length > 20) {
        anomalies.push({
          type: 'privilege_escalation_attempt',
          description: `User ${userId} attempting unauthorized actions`,
          severity: SecurityEventSeverity.ERROR,
          events,
        });
      }
    }

    return anomalies;
  }

  /**
   * Export security events for audit
   */
  async exportEvents(
    filter: SecurityEventFilter,
    format: 'json' | 'csv',
  ): Promise<string> {
    const events = await this.queryEvents(filter);

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else {
      // CSV format
      const headers = [
        'ID',
        'Type',
        'Severity',
        'Timestamp',
        'User ID',
        'Session ID',
        'IP Address',
        'User Agent',
        'Details',
      ];
      
      const rows = events.map(event => [
        event.id,
        event.type,
        event.severity,
        event.timestamp.toISOString(),
        event.userId || '',
        event.sessionId || '',
        event.ipAddress,
        event.userAgent || '',
        JSON.stringify(event.details),
      ]);

      return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');
    }
  }

  /**
   * Private helper methods
   */
  private async storeEvent(event: SecurityEvent): Promise<void> {
    const key = `security:event:${event.id}`;
    await this.redisService.set(key, JSON.stringify(event), this.eventTTL);

    // Add to sorted set for efficient querying
    const score = event.timestamp.getTime();
    await this.redisService.zadd('security:events:timeline', score, event.id);

    // Maintain event count limit
    const count = await this.redisService.zcard('security:events:timeline');
    if (count > this.maxEventsStored) {
      // Remove oldest events
      const toRemove = count - this.maxEventsStored;
      const oldestIds = await this.redisService.zrange(
        'security:events:timeline',
        0,
        toRemove - 1,
      );
      
      for (const id of oldestIds) {
        await this.redisService.delete(`security:event:${id}`);
      }
      
      await this.redisService.zremrangebyrank(
        'security:events:timeline',
        0,
        toRemove - 1,
      );
    }
  }

  private async getAllEvents(): Promise<SecurityEvent[]> {
    const eventIds = await this.redisService.zrevrange(
      'security:events:timeline',
      0,
      -1,
    );
    
    const events: SecurityEvent[] = [];
    
    for (const id of eventIds) {
      const eventData = await this.redisService.get(`security:event:${id}`);
      if (eventData) {
        const event = JSON.parse(eventData);
        event.timestamp = new Date(event.timestamp);
        events.push(event);
      }
    }

    return events;
  }

  private async getRecentEvents(timeWindowMs: number): Promise<SecurityEvent[]> {
    const now = Date.now();
    const startTime = now - timeWindowMs;
    
    const eventIds = await this.redisService.zrevrangebyscore(
      'security:events:timeline',
      now,
      startTime,
    );

    const events: SecurityEvent[] = [];
    
    for (const id of eventIds) {
      const eventData = await this.redisService.get(`security:event:${id}`);
      if (eventData) {
        const event = JSON.parse(eventData);
        event.timestamp = new Date(event.timestamp);
        events.push(event);
      }
    }

    return events;
  }

  private matchesFilter(event: SecurityEvent, filter: SecurityEventFilter): boolean {
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }
    
    if (filter.severities && !filter.severities.includes(event.severity)) {
      return false;
    }
    
    if (filter.userId && event.userId !== filter.userId) {
      return false;
    }
    
    if (filter.sessionId && event.sessionId !== filter.sessionId) {
      return false;
    }
    
    if (filter.ipAddress && event.ipAddress !== filter.ipAddress) {
      return false;
    }
    
    if (filter.startDate && event.timestamp < filter.startDate) {
      return false;
    }
    
    if (filter.endDate && event.timestamp > filter.endDate) {
      return false;
    }

    return true;
  }

  private determineSeverity(type: SecurityEventType): SecurityEventSeverity {
    const severityMap: Record<SecurityEventType, SecurityEventSeverity> = {
      [SecurityEventType.LOGIN_ATTEMPT]: SecurityEventSeverity.INFO,
      [SecurityEventType.LOGIN_SUCCESS]: SecurityEventSeverity.INFO,
      [SecurityEventType.LOGIN_FAILURE]: SecurityEventSeverity.WARNING,
      [SecurityEventType.TOTP_SETUP]: SecurityEventSeverity.INFO,
      [SecurityEventType.TOTP_VERIFIED]: SecurityEventSeverity.INFO,
      [SecurityEventType.TOTP_FAILED]: SecurityEventSeverity.WARNING,
      [SecurityEventType.SESSION_CREATED]: SecurityEventSeverity.INFO,
      [SecurityEventType.SESSION_EXPIRED]: SecurityEventSeverity.INFO,
      [SecurityEventType.SESSION_REVOKED]: SecurityEventSeverity.WARNING,
      [SecurityEventType.PERMISSION_DENIED]: SecurityEventSeverity.WARNING,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: SecurityEventSeverity.WARNING,
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: SecurityEventSeverity.CRITICAL,
      [SecurityEventType.DATA_ACCESS]: SecurityEventSeverity.INFO,
      [SecurityEventType.DATA_MODIFICATION]: SecurityEventSeverity.WARNING,
      [SecurityEventType.CONFIGURATION_CHANGE]: SecurityEventSeverity.ERROR,
      [SecurityEventType.BULK_OPERATION]: SecurityEventSeverity.WARNING,
    };

    return severityMap[type] || SecurityEventSeverity.INFO;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateEventHash(event: SecurityEvent): string {
    const content = JSON.stringify({
      id: event.id,
      type: event.type,
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      timestamp: event.timestamp,
    });

    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  private async analyzeSuspiciousActivity(event: SecurityEvent): Promise<void> {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      // Multiple failed logins from same IP
      async () => {
        if (event.type === SecurityEventType.LOGIN_FAILURE) {
          const recentFailures = await this.getRecentEvents(5 * 60 * 1000);
          const sameIpFailures = recentFailures.filter(
            e => e.type === SecurityEventType.LOGIN_FAILURE && 
                 e.ipAddress === event.ipAddress,
          );
          
          if (sameIpFailures.length > 5) {
            await this.logEvent({
              type: SecurityEventType.SUSPICIOUS_ACTIVITY,
              ipAddress: event.ipAddress,
              details: {
                reason: 'Multiple failed login attempts',
                failureCount: sameIpFailures.length,
              },
            });
          }
        }
      },
      
      // Rapid session creation
      async () => {
        if (event.type === SecurityEventType.SESSION_CREATED && event.userId) {
          const recentSessions = await this.getRecentEvents(60 * 1000);
          const userSessions = recentSessions.filter(
            e => e.type === SecurityEventType.SESSION_CREATED && 
                 e.userId === event.userId,
          );
          
          if (userSessions.length > 3) {
            await this.logEvent({
              type: SecurityEventType.SUSPICIOUS_ACTIVITY,
              userId: event.userId,
              ipAddress: event.ipAddress,
              details: {
                reason: 'Rapid session creation',
                sessionCount: userSessions.length,
              },
            });
          }
        }
      },
    ];

    // Run all pattern checks
    await Promise.all(suspiciousPatterns.map(check => check()));
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((result, item) => {
      const group = String(item[key]);
      if (!result[group]) {
        result[group] = [];
      }
      result[group].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }
}