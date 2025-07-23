import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval, Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as amqp from 'amqplib';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { MetricsService } from '../../common/services/metrics.service';

export interface QueueHealth {
  name: string;
  size: number;
  processingRate: number;
  errorRate: number;
  avgProcessingTime: number;
  oldestMessage: Date | null;
  status: 'healthy' | 'degraded' | 'critical';
  consumers: number;
  lastChecked: Date;
}

export interface QueueAlert {
  queue: string;
  level: 'warning' | 'error' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export interface QueueThresholds {
  maxSize: number;
  maxAge: number; // milliseconds
  minProcessingRate: number;
  maxErrorRate: number;
  maxProcessingTime: number;
}

@Injectable()
export class QueueMonitorService implements OnModuleInit {
  private readonly logger = new Logger(QueueMonitorService.name);
  private readonly queueStats = new Map<string, QueueHealth>();
  private readonly queueMetrics = new Map<string, any>();
  private readonly alerts: QueueAlert[] = [];
  private readonly defaultThresholds: QueueThresholds = {
    maxSize: 1000,
    maxAge: 300000, // 5 minutes
    minProcessingRate: 0.1, // messages per second
    maxErrorRate: 0.05, // 5%
    maxProcessingTime: 5000, // 5 seconds
  };
  private readonly customThresholds = new Map<string, QueueThresholds>();
  private monitoringEnabled = true;

  private amqpConnection: amqp.Connection | null = null;
  private amqpChannel: amqp.Channel | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRedis() private readonly redis: Redis,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    await this.initializeAmqp();
    await this.initializeMonitoring();
    this.startHealthChecks();
  }

  /**
   * Monitor a specific queue
   */
  async monitorQueue(queueName: string, thresholds?: Partial<QueueThresholds>): Promise<void> {
    if (thresholds) {
      this.customThresholds.set(queueName, {
        ...this.defaultThresholds,
        ...thresholds,
      });
    }

    // Initialize queue stats
    this.queueStats.set(queueName, {
      name: queueName,
      size: 0,
      processingRate: 0,
      errorRate: 0,
      avgProcessingTime: 0,
      oldestMessage: null,
      status: 'healthy',
      consumers: 0,
      lastChecked: new Date(),
    });

    this.logger.log(`Started monitoring queue: ${queueName}`);
  }

  /**
   * Stop monitoring a queue
   */
  stopMonitoringQueue(queueName: string): void {
    this.queueStats.delete(queueName);
    this.queueMetrics.delete(queueName);
    this.customThresholds.delete(queueName);

    this.logger.log(`Stopped monitoring queue: ${queueName}`);
  }

  /**
   * Get health status for all monitored queues
   */
  getQueueHealth(): Record<string, QueueHealth> {
    const health: Record<string, QueueHealth> = {};

    this.queueStats.forEach((stats, name) => {
      health[name] = { ...stats };
    });

    return health;
  }

  /**
   * Get health status for a specific queue
   */
  getQueueHealthByName(queueName: string): QueueHealth | null {
    return this.queueStats.get(queueName) || null;
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 100): QueueAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(olderThanHours: number = 24): number {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const beforeCount = this.alerts.length;

    this.alerts.splice(
      0,
      this.alerts.findIndex((alert) => alert.timestamp > cutoff),
    );

    const removed = beforeCount - this.alerts.length;
    if (removed > 0) {
      this.logger.log(`Cleared ${removed} old alerts`);
    }

    return removed;
  }

  /**
   * Enable/disable monitoring
   */
  setMonitoringEnabled(enabled: boolean): void {
    this.monitoringEnabled = enabled;
    this.logger.log(`Queue monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Perform health check on all queues
   */
  @Interval(10000) // Every 10 seconds
  private async performHealthChecks(): Promise<void> {
    if (!this.monitoringEnabled) return;

    const queues = Array.from(this.queueStats.keys());

    for (const queueName of queues) {
      try {
        await this.checkQueueHealth(queueName);
      } catch (error) {
        this.logger.error(`Health check failed for ${queueName}:`, error);
      }
    }
  }

  /**
   * Collect queue metrics
   */
  @Interval(60000) // Every minute
  private async collectMetrics(): Promise<void> {
    if (!this.monitoringEnabled) return;

    const metrics: Record<string, any> = {
      timestamp: new Date(),
      queues: {},
    };

    this.queueStats.forEach((stats, name) => {
      metrics.queues[name] = {
        size: stats.size,
        processingRate: stats.processingRate,
        errorRate: stats.errorRate,
        avgProcessingTime: stats.avgProcessingTime,
        status: stats.status,
        consumers: stats.consumers,
      };

      // Send metrics to metrics service
      this.metricsService.recordMetric('queue.size', stats.size, { queue: name });
      this.metricsService.recordMetric('queue.processing_rate', stats.processingRate, {
        queue: name,
      });
      this.metricsService.recordMetric('queue.error_rate', stats.errorRate, { queue: name });
    });

    // Store metrics snapshot
    const key = `queue:metrics:${Date.now()}`;
    await this.redis.setex(key, 86400, JSON.stringify(metrics)); // Keep for 24 hours
  }

  /**
   * Generate health report
   */
  @Cron('0 * * * *') // Every hour
  private async generateHealthReport(): Promise<void> {
    if (!this.monitoringEnabled) return;

    const report = {
      timestamp: new Date(),
      summary: {
        totalQueues: this.queueStats.size,
        healthy: 0,
        degraded: 0,
        critical: 0,
      },
      queues: [] as any[],
      recentAlerts: this.getAlerts(50),
    };

    this.queueStats.forEach((stats) => {
      switch (stats.status) {
        case 'healthy':
          report.summary.healthy++;
          break;
        case 'degraded':
          report.summary.degraded++;
          break;
        case 'critical':
          report.summary.critical++;
          break;
      }

      report.queues.push({
        name: stats.name,
        status: stats.status,
        metrics: {
          size: stats.size,
          processingRate: stats.processingRate,
          errorRate: `${(stats.errorRate * 100).toFixed(2)}%`,
          avgProcessingTime: `${stats.avgProcessingTime}ms`,
        },
      });
    });

    // Emit report event
    this.eventEmitter.emit('queue.health.report', report);

    // Log summary
    this.logger.log(
      `Queue health report: ${report.summary.healthy} healthy, ` +
        `${report.summary.degraded} degraded, ${report.summary.critical} critical`,
    );
  }

  /**
   * Check health of a specific queue
   */
  private async checkQueueHealth(queueName: string): Promise<void> {
    const stats = this.queueStats.get(queueName);
    if (!stats) return;

    const thresholds = this.customThresholds.get(queueName) || this.defaultThresholds;

    // Get queue metrics from Redis
    const queueSize = await this.getRedisQueueSize(queueName);
    const metrics = await this.getQueueMetrics(queueName);

    // Update stats
    stats.size = queueSize;
    stats.processingRate = metrics.processingRate;
    stats.errorRate = metrics.errorRate;
    stats.avgProcessingTime = metrics.avgProcessingTime;
    stats.oldestMessage = metrics.oldestMessage;
    stats.consumers = await this.getConsumerCount(queueName);
    stats.lastChecked = new Date();

    // Determine health status
    const issues: string[] = [];

    if (queueSize > thresholds.maxSize) {
      issues.push(`Queue size (${queueSize}) exceeds threshold (${thresholds.maxSize})`);
      this.createAlert(
        queueName,
        'error',
        'Queue size exceeded',
        'size',
        queueSize,
        thresholds.maxSize,
      );
    }

    if (stats.oldestMessage) {
      const age = Date.now() - stats.oldestMessage.getTime();
      if (age > thresholds.maxAge) {
        issues.push(`Oldest message age (${age}ms) exceeds threshold (${thresholds.maxAge}ms)`);
        this.createAlert(
          queueName,
          'warning',
          'Message age exceeded',
          'age',
          age,
          thresholds.maxAge,
        );
      }
    }

    if (stats.processingRate < thresholds.minProcessingRate && queueSize > 0) {
      issues.push(
        `Processing rate (${stats.processingRate}) below threshold (${thresholds.minProcessingRate})`,
      );
      this.createAlert(
        queueName,
        'warning',
        'Low processing rate',
        'processingRate',
        stats.processingRate,
        thresholds.minProcessingRate,
      );
    }

    if (stats.errorRate > thresholds.maxErrorRate) {
      issues.push(`Error rate (${stats.errorRate}) exceeds threshold (${thresholds.maxErrorRate})`);
      this.createAlert(
        queueName,
        'error',
        'High error rate',
        'errorRate',
        stats.errorRate,
        thresholds.maxErrorRate,
      );
    }

    // Update status based on issues
    if (issues.length === 0) {
      stats.status = 'healthy';
    } else if (issues.length === 1 || queueSize < thresholds.maxSize * 2) {
      stats.status = 'degraded';
    } else {
      stats.status = 'critical';
    }

    // Emit status change event if changed
    const previousStatus = this.queueMetrics.get(queueName)?.previousStatus;
    if (previousStatus && previousStatus !== stats.status) {
      this.eventEmitter.emit('queue.status.changed', {
        queue: queueName,
        previousStatus,
        currentStatus: stats.status,
        issues,
      });
    }

    // Store current status
    this.queueMetrics.set(queueName, {
      ...metrics,
      previousStatus: stats.status,
    });
  }

  /**
   * Get Redis queue size
   */
  private async getRedisQueueSize(queueName: string): Promise<number> {
    try {
      // Check various Redis data structures
      const listSize = await this.redis.llen(queueName);
      const setSize = await this.redis.scard(queueName);
      const zsetSize = await this.redis.zcard(queueName);

      return Math.max(listSize, setSize, zsetSize);
    } catch (error) {
      this.logger.error(`Failed to get queue size for ${queueName}:`, error);
      return 0;
    }
  }

  /**
   * Get queue metrics from Redis
   */
  private async getQueueMetrics(queueName: string): Promise<any> {
    const metricsKey = `queue:metrics:${queueName}`;
    const now = Date.now();

    try {
      const rawMetrics = await this.redis.get(metricsKey);
      const metrics = rawMetrics ? JSON.parse(rawMetrics) : {};

      // Calculate rates based on stored metrics
      const processingRate = this.calculateRate(
        metrics.processed || 0,
        metrics.lastProcessed || now,
        now,
      );

      const errorRate = metrics.processed > 0 ? (metrics.errors || 0) / metrics.processed : 0;

      const avgProcessingTime =
        metrics.totalProcessingTime > 0 && metrics.processed > 0
          ? metrics.totalProcessingTime / metrics.processed
          : 0;

      // Get oldest message
      const oldestTimestamp = await this.redis.lindex(queueName, -1);
      let oldestMessage = null;

      if (oldestTimestamp) {
        try {
          const parsed = JSON.parse(oldestTimestamp);
          oldestMessage = parsed.timestamp ? new Date(parsed.timestamp) : null;
        } catch {
          // Not JSON, might be a timestamp string
          const timestamp = parseInt(oldestTimestamp);
          if (!isNaN(timestamp)) {
            oldestMessage = new Date(timestamp);
          }
        }
      }

      return {
        processingRate,
        errorRate,
        avgProcessingTime,
        oldestMessage,
      };
    } catch (error) {
      this.logger.error(`Failed to get metrics for ${queueName}:`, error);
      return {
        processingRate: 0,
        errorRate: 0,
        avgProcessingTime: 0,
        oldestMessage: null,
      };
    }
  }

  /**
   * Get consumer count for a queue
   */
  private async getConsumerCount(queueName: string): Promise<number> {
    try {
      // This would vary based on your queue implementation
      // For RabbitMQ, you'd query the management API
      // For Redis-based queues, you might track consumers separately
      const consumerKey = `queue:consumers:${queueName}`;
      const consumers = await this.redis.scard(consumerKey);
      return consumers;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate rate per second
   */
  private calculateRate(count: number, lastTime: number, currentTime: number): number {
    const timeDiff = (currentTime - lastTime) / 1000; // seconds
    return timeDiff > 0 ? count / timeDiff : 0;
  }

  /**
   * Create an alert
   */
  private createAlert(
    queue: string,
    level: 'warning' | 'error' | 'critical',
    message: string,
    metric: string,
    value: number,
    threshold: number,
  ): void {
    const alert: QueueAlert = {
      queue,
      level,
      message,
      metric,
      value,
      threshold,
      timestamp: new Date(),
    };

    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    // Emit alert event
    this.eventEmitter.emit('queue.alert', alert);

    // Log based on level
    const logMessage = `Queue alert [${queue}]: ${message} (${value} vs ${threshold})`;
    switch (level) {
      case 'warning':
        this.logger.warn(logMessage);
        break;
      case 'error':
        this.logger.error(logMessage);
        break;
      case 'critical':
        this.logger.error(`CRITICAL: ${logMessage}`);
        break;
    }
  }

  /**
   * Initialize AMQP connection
   */
  private async initializeAmqp(): Promise<void> {
    try {
      const rabbitmqUrl = this.configService.get<string>('rabbitmq.url');
      if (!rabbitmqUrl) {
        this.logger.warn('RabbitMQ URL not configured, AMQP monitoring will be limited');
        return;
      }

      const connection = await amqp.connect(rabbitmqUrl);
      this.amqpConnection = connection as any;
      this.amqpChannel = await connection.createChannel();
      this.logger.log('AMQP connection established for queue monitoring');
    } catch (error) {
      this.logger.error('Failed to initialize AMQP connection:', error);
    }
  }

  /**
   * Initialize monitoring for default queues
   */
  private async initializeMonitoring(): Promise<void> {
    const defaultQueues = [
      'events:message.sent',
      'events:message.received',
      'events:payment.completed',
      'whatsapp:outgoing',
      'whatsapp:incoming',
    ];

    for (const queue of defaultQueues) {
      await this.monitorQueue(queue);
    }

    this.logger.log(`Initialized monitoring for ${defaultQueues.length} default queues`);
  }

  /**
   * Start health check processes
   */
  private startHealthChecks(): void {
    // Perform initial health check after a delay
    setTimeout(() => {
      this.performHealthChecks();
    }, 5000);
  }
}
