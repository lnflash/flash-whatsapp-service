import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { EventPayload, EventDispatcherService } from './event-dispatcher.service';

export interface ReplayOptions {
  startTime?: Date;
  endTime?: Date;
  eventTypes?: string[];
  filter?: (event: EventPayload) => boolean;
  speed?: number; // Replay speed multiplier (1 = real-time, 2 = 2x speed, etc.)
  dryRun?: boolean;
  batchSize?: number;
}

export interface ReplayProgress {
  totalEvents: number;
  processedEvents: number;
  skippedEvents: number;
  failedEvents: number;
  startedAt: Date;
  estimatedCompletion: Date | null;
  currentEvent: EventPayload | null;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
}

export interface ReplayResult {
  success: boolean;
  eventsProcessed: number;
  eventsFailed: number;
  eventsSkipped: number;
  duration: number;
  errors: Array<{ event: EventPayload; error: string }>;
}

@Injectable()
export class EventReplayService {
  private readonly logger = new Logger(EventReplayService.name);
  private readonly eventPrefix = 'events:persistent:';
  private readonly replayHistoryKey = 'replay:history';
  private currentReplay: ReplayProgress | null = null;
  private replayAbortController: AbortController | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventDispatcher: EventDispatcherService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Replay events based on criteria
   */
  async replayEvents(options: ReplayOptions = {}): Promise<ReplayResult> {
    if (this.currentReplay?.status === 'running') {
      throw new Error('A replay is already in progress');
    }

    const startTime = Date.now();
    const result: ReplayResult = {
      success: true,
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsSkipped: 0,
      duration: 0,
      errors: [],
    };

    this.replayAbortController = new AbortController();

    try {
      // Get events to replay
      const events = await this.getEventsForReplay(options);
      
      this.logger.log(
        `Starting event replay: ${events.length} events found ` +
        `(types: ${options.eventTypes?.join(', ') || 'all'})`,
      );

      // Initialize progress
      this.currentReplay = {
        totalEvents: events.length,
        processedEvents: 0,
        skippedEvents: 0,
        failedEvents: 0,
        startedAt: new Date(),
        estimatedCompletion: null,
        currentEvent: null,
        status: 'running',
      };

      // Emit replay started event
      this.eventEmitter.emit('replay.started', {
        options,
        totalEvents: events.length,
      });

      // Process events in batches
      const batchSize = options.batchSize || 100;
      for (let i = 0; i < events.length; i += batchSize) {
        if (this.replayAbortController.signal.aborted) {
          this.logger.warn('Event replay aborted');
          break;
        }

        const batch = events.slice(i, i + batchSize);
        await this.processBatch(batch, options, result);

        // Update progress
        this.updateProgress();
      }

      // Mark as completed
      this.currentReplay.status = 'completed';
      result.duration = Date.now() - startTime;
      result.success = result.eventsFailed === 0;

      // Save replay history
      await this.saveReplayHistory(result, options);

      // Emit completion event
      this.eventEmitter.emit('replay.completed', result);

      this.logger.log(
        `Event replay completed: ${result.eventsProcessed} processed, ` +
        `${result.eventsSkipped} skipped, ${result.eventsFailed} failed ` +
        `(${result.duration}ms)`,
      );

      return result;
    } catch (error) {
      this.logger.error('Event replay failed:', error);
      
      if (this.currentReplay) {
        this.currentReplay.status = 'failed';
      }
      
      result.success = false;
      result.duration = Date.now() - startTime;
      
      // Emit failure event
      this.eventEmitter.emit('replay.failed', { error: error.message, result });
      
      throw error;
    } finally {
      this.replayAbortController = null;
    }
  }

  /**
   * Pause current replay
   */
  pauseReplay(): boolean {
    if (this.currentReplay?.status === 'running') {
      this.currentReplay.status = 'paused';
      this.logger.log('Event replay paused');
      return true;
    }
    return false;
  }

  /**
   * Resume paused replay
   */
  resumeReplay(): boolean {
    if (this.currentReplay?.status === 'paused') {
      this.currentReplay.status = 'running';
      this.logger.log('Event replay resumed');
      return true;
    }
    return false;
  }

  /**
   * Abort current replay
   */
  abortReplay(): boolean {
    if (this.replayAbortController && this.currentReplay?.status === 'running') {
      this.replayAbortController.abort();
      this.currentReplay.status = 'failed';
      this.logger.warn('Event replay aborted by user');
      return true;
    }
    return false;
  }

  /**
   * Get current replay progress
   */
  getReplayProgress(): ReplayProgress | null {
    return this.currentReplay ? { ...this.currentReplay } : null;
  }

  /**
   * Get replay history
   */
  async getReplayHistory(limit: number = 10): Promise<any[]> {
    const history = await this.redis.lrange(this.replayHistoryKey, 0, limit - 1);
    return history.map(item => JSON.parse(item));
  }

  /**
   * Replay a specific event by ID
   */
  async replayEventById(eventId: string, options: ReplayOptions = {}): Promise<void> {
    const event = await this.getEventById(eventId);
    
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    this.logger.log(`Replaying single event: ${event.type} (${event.id})`);

    if (options.dryRun) {
      this.logger.log('Dry run - event would be replayed:', event);
      return;
    }

    // Dispatch the event
    await this.eventDispatcher.dispatch(event, {
      async: true,
      persistent: false, // Don't re-persist
    });
  }

  /**
   * Get events for replay based on criteria
   */
  private async getEventsForReplay(options: ReplayOptions): Promise<EventPayload[]> {
    const events: EventPayload[] = [];
    
    // Get event IDs from timeline
    const startScore = options.startTime ? options.startTime.getTime() : '-inf';
    const endScore = options.endTime ? options.endTime.getTime() : '+inf';
    
    const eventIds = await this.redis.zrangebyscore(
      'events:timeline',
      startScore,
      endScore,
    );

    // Fetch events
    for (const eventId of eventIds) {
      const event = await this.getEventById(eventId);
      
      if (event) {
        // Apply filters
        if (options.eventTypes && !options.eventTypes.includes(event.type)) {
          continue;
        }
        
        if (options.filter && !options.filter(event)) {
          continue;
        }
        
        events.push(event);
      }
    }

    // Sort by timestamp
    events.sort((a, b) => 
      new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );

    return events;
  }

  /**
   * Get event by ID
   */
  private async getEventById(eventId: string): Promise<EventPayload | null> {
    const key = `${this.eventPrefix}${eventId}`;
    const data = await this.redis.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Failed to parse event ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Process a batch of events
   */
  private async processBatch(
    events: EventPayload[],
    options: ReplayOptions,
    result: ReplayResult,
  ): Promise<void> {
    for (const event of events) {
      if (this.replayAbortController?.signal.aborted) {
        break;
      }

      // Wait if paused
      while (this.currentReplay?.status === 'paused') {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.currentReplay!.currentEvent = event;

      try {
        // Calculate delay based on replay speed
        if (options.speed && options.speed !== 0) {
          const nextEventIndex = events.indexOf(event) + 1;
          if (nextEventIndex < events.length) {
            const currentTime = new Date(event.timestamp!).getTime();
            const nextTime = new Date(events[nextEventIndex].timestamp!).getTime();
            const delay = (nextTime - currentTime) / options.speed;
            
            if (delay > 0 && delay < 60000) { // Max 1 minute delay
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        if (options.dryRun) {
          this.logger.debug(`Dry run - would replay: ${event.type} (${event.id})`);
        } else {
          // Replay the event
          await this.eventDispatcher.dispatch(event, {
            async: true,
            persistent: false,
          });
        }

        result.eventsProcessed++;
        this.currentReplay!.processedEvents++;
      } catch (error) {
        this.logger.error(`Failed to replay event ${event.id}:`, error);
        result.eventsFailed++;
        result.errors.push({
          event,
          error: error instanceof Error ? error.message : String(error),
        });
        this.currentReplay!.failedEvents++;
      }
    }
  }

  /**
   * Update replay progress
   */
  private updateProgress(): void {
    if (!this.currentReplay) return;

    const { totalEvents, processedEvents, startedAt } = this.currentReplay;
    const elapsed = Date.now() - startedAt.getTime();
    const rate = processedEvents / (elapsed / 1000); // events per second

    if (rate > 0 && processedEvents < totalEvents) {
      const remaining = totalEvents - processedEvents;
      const estimatedTime = remaining / rate * 1000;
      this.currentReplay.estimatedCompletion = new Date(Date.now() + estimatedTime);
    }

    // Emit progress update
    this.eventEmitter.emit('replay.progress', { ...this.currentReplay });
  }

  /**
   * Save replay history
   */
  private async saveReplayHistory(
    result: ReplayResult,
    options: ReplayOptions,
  ): Promise<void> {
    const historyEntry = {
      timestamp: new Date(),
      result,
      options: {
        startTime: options.startTime,
        endTime: options.endTime,
        eventTypes: options.eventTypes,
        speed: options.speed,
        dryRun: options.dryRun,
      },
    };

    await this.redis.lpush(this.replayHistoryKey, JSON.stringify(historyEntry));
    
    // Keep only last 100 entries
    await this.redis.ltrim(this.replayHistoryKey, 0, 99);
  }

  /**
   * Export events to file
   */
  async exportEvents(
    options: ReplayOptions & { format?: 'json' | 'csv' },
  ): Promise<string> {
    const events = await this.getEventsForReplay(options);
    const format = options.format || 'json';

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else if (format === 'csv') {
      // Convert to CSV
      const headers = ['id', 'type', 'source', 'timestamp', 'data'];
      const rows = events.map(event => [
        event.id,
        event.type,
        event.source,
        event.timestamp?.toISOString(),
        JSON.stringify(event.data),
      ]);

      return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Import events from data
   */
  async importEvents(
    data: string,
    format: 'json' | 'csv' = 'json',
  ): Promise<number> {
    let events: EventPayload[] = [];

    if (format === 'json') {
      events = JSON.parse(data);
    } else if (format === 'csv') {
      // Parse CSV
      const lines = data.split('\n');
      const headers = lines[0].split(',');
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, ''));
        const event: any = {};
        
        headers.forEach((header, index) => {
          const value = values[index];
          if (header === 'data') {
            event[header] = JSON.parse(value);
          } else if (header === 'timestamp') {
            event[header] = new Date(value);
          } else {
            event[header] = value;
          }
        });
        
        events.push(event as EventPayload);
      }
    }

    // Validate and store events
    let imported = 0;
    for (const event of events) {
      if (event.id && event.type && event.source) {
        const key = `${this.eventPrefix}${event.id}`;
        await this.redis.set(key, JSON.stringify(event));
        
        // Add to timeline
        if (event.timestamp) {
          await this.redis.zadd(
            'events:timeline',
            new Date(event.timestamp).getTime(),
            event.id,
          );
        }
        
        imported++;
      }
    }

    this.logger.log(`Imported ${imported} events`);
    return imported;
  }
}