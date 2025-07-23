import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as amqp from 'amqplib';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface EventPayload {
  id?: string;
  type: string;
  source: string;
  timestamp?: Date;
  data: any;
  metadata?: {
    correlationId?: string;
    userId?: string;
    sessionId?: string;
    instanceId?: string;
    retryCount?: number;
    priority?: 'low' | 'normal' | 'high';
  };
}

export interface EventDispatchOptions {
  async?: boolean;
  persistent?: boolean;
  priority?: 'low' | 'normal' | 'high';
  ttl?: number;
  delay?: number;
  retryable?: boolean;
  maxRetries?: number;
}

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private readonly eventStats = new Map<string, { count: number; lastSeen: Date }>();
  private readonly eventHandlers = new Map<string, Set<(event: EventPayload) => Promise<void>>>();
  private readonly queuePrefix = 'events:';
  private readonly deadLetterQueue = 'events:dead-letter';

  private amqpConnection: amqp.Connection | null = null;
  private amqpChannel: amqp.Channel | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.setupEventInterceptor();
    this.startStatsReporter();
    this.initializeAmqp();
  }

  /**
   * Dispatch an event with various routing options
   */
  async dispatch(
    event: EventPayload,
    options: EventDispatchOptions = {},
  ): Promise<void> {
    // Ensure event has required fields
    event.id = event.id || uuidv4();
    event.timestamp = event.timestamp || new Date();

    // Update statistics
    this.updateEventStats(event.type);

    try {
      // Local event emission (always synchronous for internal handlers)
      this.eventEmitter.emit(event.type, event);

      // Async processing based on options
      if (options.async) {
        // Queue the event for async processing
        await this.queueEvent(event, options);
      }

      // Persistent storage if requested
      if (options.persistent) {
        await this.persistEvent(event, options.ttl);
      }

      // RabbitMQ publishing for external consumers
      if (this.shouldPublishToRabbitMQ(event.type)) {
        await this.publishToRabbitMQ(event, options);
      }

      this.logger.debug(`Event dispatched: ${event.type} (${event.id})`);
    } catch (error) {
      this.logger.error(`Failed to dispatch event ${event.type}:`, error);
      
      // Store in dead letter queue if dispatch fails
      if (options.retryable) {
        await this.storeInDeadLetter(event, error);
      }
      
      throw error;
    }
  }

  /**
   * Register a handler for specific event types
   */
  registerHandler(
    eventType: string,
    handler: (event: EventPayload) => Promise<void>,
  ): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    
    this.eventHandlers.get(eventType)!.add(handler);
    
    // Also register with EventEmitter2
    this.eventEmitter.on(eventType, async (event: EventPayload) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`Handler error for ${eventType}:`, error);
      }
    });
    
    this.logger.log(`Registered handler for event type: ${eventType}`);
  }

  /**
   * Batch dispatch multiple events
   */
  async batchDispatch(
    events: EventPayload[],
    options: EventDispatchOptions = {},
  ): Promise<void> {
    const startTime = Date.now();
    const results = await Promise.allSettled(
      events.map(event => this.dispatch(event, options)),
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    this.logger.log(
      `Batch dispatch completed: ${successful} successful, ${failed} failed (${Date.now() - startTime}ms)`,
    );

    if (failed > 0) {
      const errors = results
        .filter(r => r.status === 'rejected')
        .map((r: any) => r.reason);
      throw new Error(`Batch dispatch partially failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Get event statistics
   */
  getEventStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.eventStats.forEach((value, key) => {
      stats[key] = {
        count: value.count,
        lastSeen: value.lastSeen.toISOString(),
        rate: this.calculateEventRate(key),
      };
    });

    return {
      eventTypes: stats,
      totalEvents: Array.from(this.eventStats.values()).reduce((sum, stat) => sum + stat.count, 0),
      activeHandlers: this.eventHandlers.size,
      queueSizes: {}, // Will be populated by queue monitor
    };
  }

  /**
   * Clear old events from persistent storage
   */
  async cleanupOldEvents(olderThanHours: number = 24): Promise<number> {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    const pattern = `${this.queuePrefix}persistent:*`;
    
    let deleted = 0;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      const event = await this.redis.get(key);
      if (event) {
        try {
          const parsed = JSON.parse(event);
          if (new Date(parsed.timestamp).getTime() < cutoffTime) {
            await this.redis.del(key);
            deleted++;
          }
        } catch {
          // Invalid event, delete it
          await this.redis.del(key);
          deleted++;
        }
      }
    }

    this.logger.log(`Cleaned up ${deleted} old events`);
    return deleted;
  }

  /**
   * Queue event for async processing
   */
  private async queueEvent(
    event: EventPayload,
    options: EventDispatchOptions,
  ): Promise<void> {
    const queueName = this.getQueueName(event.type, options.priority);
    const serialized = JSON.stringify(event);

    if (options.delay) {
      // Use Redis sorted set for delayed events
      const score = Date.now() + options.delay;
      await this.redis.zadd(`${queueName}:delayed`, score, serialized);
    } else {
      // Immediate processing
      await this.redis.lpush(queueName, serialized);
    }

    // Set expiry if TTL is specified
    if (options.ttl) {
      await this.redis.expire(queueName, options.ttl);
    }
  }

  /**
   * Persist event for replay capability
   */
  private async persistEvent(event: EventPayload, ttl?: number): Promise<void> {
    const key = `${this.queuePrefix}persistent:${event.id}`;
    const serialized = JSON.stringify(event);

    if (ttl) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }

    // Also store in sorted set for time-based queries
    await this.redis.zadd(
      `${this.queuePrefix}timeline`,
      event.timestamp!.getTime(),
      event.id!,
    );
  }

  /**
   * Initialize AMQP connection
   */
  private async initializeAmqp(): Promise<void> {
    try {
      const rabbitmqUrl = this.configService.get<string>('rabbitmq.url');
      if (!rabbitmqUrl) {
        this.logger.warn('RabbitMQ URL not configured, skipping AMQP initialization');
        return;
      }

      const connection = await amqp.connect(rabbitmqUrl);
      this.amqpConnection = connection as any;
      this.amqpChannel = await connection.createChannel();
      
      // Setup exchange
      const exchange = this.configService.get('rabbitmq.exchangeName', 'pulse.events');
      await this.amqpChannel.assertExchange(exchange, 'topic', { durable: true });
      
      this.logger.log('AMQP connection established');
    } catch (error) {
      this.logger.error('Failed to initialize AMQP connection:', error);
    }
  }

  /**
   * Publish event to RabbitMQ
   */
  private async publishToRabbitMQ(
    event: EventPayload,
    options: EventDispatchOptions,
  ): Promise<void> {
    if (!this.amqpChannel) {
      this.logger.debug('AMQP channel not available, skipping RabbitMQ publish');
      return;
    }

    const exchange = this.configService.get('rabbitmq.exchangeName', 'pulse.events');
    const routingKey = `event.${event.type}`;

    const message = Buffer.from(JSON.stringify(event));
    const publishOptions: amqp.Options.Publish = {
      persistent: options.persistent !== false,
      priority: this.getPriorityValue(options.priority),
      timestamp: event.timestamp!.getTime(),
      messageId: event.id,
      correlationId: event.metadata?.correlationId,
    };

    this.amqpChannel.publish(exchange, routingKey, message, publishOptions);
  }

  /**
   * Store failed events in dead letter queue
   */
  private async storeInDeadLetter(event: EventPayload, error: Error): Promise<void> {
    const deadLetterEvent = {
      ...event,
      metadata: {
        ...event.metadata,
        error: error.message,
        errorStack: error.stack,
        failedAt: new Date(),
        retryCount: (event.metadata?.retryCount || 0) + 1,
      },
    };

    await this.redis.lpush(this.deadLetterQueue, JSON.stringify(deadLetterEvent));
    
    // Keep only last 1000 dead letter events
    await this.redis.ltrim(this.deadLetterQueue, 0, 999);
  }

  /**
   * Setup interceptor for all events
   */
  private setupEventInterceptor(): void {
    // Intercept all events for monitoring
    this.eventEmitter.onAny((eventName: string | string[], ...values: any[]) => {
      const event = Array.isArray(eventName) ? eventName.join('.') : eventName;
      if (typeof event === 'string') {
        this.updateEventStats(event);
      }
    });
  }

  /**
   * Update event statistics
   */
  private updateEventStats(eventType: string): void {
    const current = this.eventStats.get(eventType) || { count: 0, lastSeen: new Date() };
    current.count++;
    current.lastSeen = new Date();
    this.eventStats.set(eventType, current);
  }

  /**
   * Calculate event rate per minute
   */
  private calculateEventRate(eventType: string): number {
    const stat = this.eventStats.get(eventType);
    if (!stat) return 0;

    const ageMinutes = (Date.now() - stat.lastSeen.getTime()) / 60000;
    if (ageMinutes === 0) return stat.count;
    
    return Math.round(stat.count / Math.max(ageMinutes, 1));
  }

  /**
   * Determine if event should be published to RabbitMQ
   */
  private shouldPublishToRabbitMQ(eventType: string): boolean {
    const publishableTypes = [
      'message.sent',
      'message.received',
      'payment.completed',
      'user.registered',
      'session.created',
      'session.expired',
    ];

    return publishableTypes.some(type => eventType.startsWith(type));
  }

  /**
   * Get queue name based on event type and priority
   */
  private getQueueName(eventType: string, priority?: string): string {
    const baseName = `${this.queuePrefix}${eventType}`;
    return priority && priority !== 'normal' ? `${baseName}:${priority}` : baseName;
  }

  /**
   * Convert priority string to numeric value
   */
  private getPriorityValue(priority?: string): number {
    switch (priority) {
      case 'high': return 10;
      case 'low': return 1;
      default: return 5;
    }
  }

  /**
   * Start periodic stats reporter
   */
  private startStatsReporter(): void {
    setInterval(() => {
      const stats = this.getEventStats();
      if (stats.totalEvents > 0) {
        this.logger.debug('Event statistics:', stats);
      }
    }, 60000); // Report every minute
  }

  /**
   * Process delayed events
   */
  async processDelayedEvents(): Promise<void> {
    const now = Date.now();
    const queues = await this.redis.keys(`${this.queuePrefix}*:delayed`);

    for (const queue of queues) {
      // Get all events that should be processed now
      const events = await this.redis.zrangebyscore(queue, '-inf', now);
      
      if (events.length > 0) {
        // Remove from delayed queue
        await this.redis.zremrangebyscore(queue, '-inf', now);
        
        // Move to active queue
        const activeQueue = queue.replace(':delayed', '');
        const pipeline = this.redis.pipeline();
        
        for (const event of events) {
          pipeline.lpush(activeQueue, event);
        }
        
        await pipeline.exec();
        
        this.logger.debug(`Moved ${events.length} delayed events to active queue`);
      }
    }
  }
}