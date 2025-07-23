import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { MessageDto } from '../dto/message.dto';

interface BatchedMessage {
  message: MessageDto;
  timestamp: Date;
  retryCount: number;
  priority: 'low' | 'normal' | 'high';
}

interface MessageBatch {
  to: string;
  messages: BatchedMessage[];
  lastUpdated: Date;
  size: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  maxBatchWaitTime: number; // milliseconds
  priorityMultiplier: Map<string, number>;
  enableSmartBatching: boolean;
}

@Injectable()
export class MessageBatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(MessageBatcherService.name);
  private readonly batches = new Map<string, MessageBatch>();
  private readonly batchConfig: BatchConfig;
  private readonly stats = {
    totalBatched: 0,
    totalSent: 0,
    totalFailed: 0,
    avgBatchSize: 0,
    maxBatchSize: 0,
  };
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.batchConfig = {
      maxBatchSize: this.configService.get('whatsapp.batching.maxSize', 10),
      maxBatchWaitTime: this.configService.get('whatsapp.batching.maxWaitTime', 5000),
      priorityMultiplier: new Map([
        ['high', 3],
        ['normal', 1],
        ['low', 0.5],
      ]),
      enableSmartBatching: this.configService.get('whatsapp.batching.smart', true),
    };

    this.startAutoFlush();
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    // Flush all remaining batches
    this.flushAllBatches();
  }

  /**
   * Add a message to the batch
   */
  async addMessage(
    message: MessageDto,
    options: {
      priority?: 'low' | 'normal' | 'high';
      immediate?: boolean;
    } = {},
  ): Promise<void> {
    const priority = options.priority || 'normal';
    const to = message.to;

    // Send immediately if requested or high priority
    if (options.immediate || priority === 'high') {
      await this.sendSingleMessage(message);
      return;
    }

    // Get or create batch for this recipient
    let batch = this.batches.get(to);
    if (!batch) {
      batch = {
        to,
        messages: [],
        lastUpdated: new Date(),
        size: 0,
      };
      this.batches.set(to, batch);
    }

    // Add message to batch
    const batchedMessage: BatchedMessage = {
      message,
      timestamp: new Date(),
      retryCount: 0,
      priority,
    };

    batch.messages.push(batchedMessage);
    batch.lastUpdated = new Date();
    batch.size = this.calculateBatchSize(batch);

    this.stats.totalBatched++;

    // Check if batch should be sent
    if (this.shouldFlushBatch(batch)) {
      await this.flushBatch(to);
    }
  }

  /**
   * Force flush a specific batch
   */
  async flushBatch(to: string): Promise<void> {
    const batch = this.batches.get(to);
    if (!batch || batch.messages.length === 0) {
      return;
    }

    this.batches.delete(to);

    try {
      // Sort messages by priority
      const sortedMessages = this.sortMessagesByPriority(batch.messages);

      // Combine messages if smart batching is enabled
      if (this.batchConfig.enableSmartBatching && sortedMessages.length > 1) {
        const combinedMessage = this.combineMessages(sortedMessages);
        await this.sendBatchedMessage(to, combinedMessage);
      } else {
        // Send messages individually
        for (const batchedMsg of sortedMessages) {
          await this.sendSingleMessage(batchedMsg.message);
        }
      }

      // Update statistics
      this.updateStats(batch.messages.length, true);

      this.logger.debug(`Flushed batch for ${to}: ${batch.messages.length} messages`);
    } catch (error) {
      this.logger.error(`Failed to flush batch for ${to}:`, error);

      // Re-queue failed messages
      await this.requeueFailedMessages(batch.messages);

      this.updateStats(batch.messages.length, false);
    }
  }

  /**
   * Flush all pending batches
   */
  async flushAllBatches(): Promise<void> {
    const batchKeys = Array.from(this.batches.keys());

    this.logger.log(`Flushing ${batchKeys.length} batches...`);

    const results = await Promise.allSettled(batchKeys.map((to) => this.flushBatch(to)));

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Batch flush completed: ${successful} successful, ${failed} failed`);
  }

  /**
   * Get batch statistics
   */
  getStats(): Record<string, any> {
    const currentBatches = Array.from(this.batches.values());

    return {
      ...this.stats,
      activeBatches: this.batches.size,
      pendingMessages: currentBatches.reduce((sum, b) => sum + b.messages.length, 0),
      oldestBatch:
        currentBatches.length > 0
          ? Math.min(...currentBatches.map((b) => b.lastUpdated.getTime()))
          : null,
      batchSizes: currentBatches.map((b) => ({
        to: b.to,
        size: b.messages.length,
        age: Date.now() - b.lastUpdated.getTime(),
      })),
    };
  }

  /**
   * Check if batch should be flushed
   */
  private shouldFlushBatch(batch: MessageBatch): boolean {
    // Check size limit
    if (batch.messages.length >= this.batchConfig.maxBatchSize) {
      return true;
    }

    // Check time limit
    const age = Date.now() - batch.lastUpdated.getTime();
    if (age >= this.batchConfig.maxBatchWaitTime) {
      return true;
    }

    // Check priority - flush if high priority messages are waiting
    const hasHighPriority = batch.messages.some((m) => m.priority === 'high');
    if (hasHighPriority && batch.messages.length > 1) {
      return true;
    }

    // Smart batching: flush if batch has good diversity
    if (this.batchConfig.enableSmartBatching) {
      const diversity = this.calculateBatchDiversity(batch);
      if (diversity > 0.7 && batch.messages.length >= 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sort messages by priority
   */
  private sortMessagesByPriority(messages: BatchedMessage[]): BatchedMessage[] {
    return messages.sort((a, b) => {
      const priorityA = this.batchConfig.priorityMultiplier.get(a.priority) || 1;
      const priorityB = this.batchConfig.priorityMultiplier.get(b.priority) || 1;
      return priorityB - priorityA;
    });
  }

  /**
   * Combine multiple messages into one
   */
  private combineMessages(messages: BatchedMessage[]): MessageDto {
    const combinedText = messages
      .map((m, index) => {
        const prefix = messages.length > 1 ? `${index + 1}. ` : '';
        return prefix + m.message.text;
      })
      .join('\n\n');

    return {
      ...messages[0].message,
      text: combinedText,
      metadata: {
        ...messages[0].message.metadata,
        batchedCount: messages.length,
        batchedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Send a single message
   */
  private async sendSingleMessage(message: MessageDto): Promise<void> {
    this.eventEmitter.emit('message.send', {
      type: 'message.send',
      source: 'MessageBatcherService',
      data: message,
      metadata: {
        batched: false,
      },
    });

    this.stats.totalSent++;
  }

  /**
   * Send a batched message
   */
  private async sendBatchedMessage(to: string, message: MessageDto): Promise<void> {
    this.eventEmitter.emit('message.send.batch', {
      type: 'message.send.batch',
      source: 'MessageBatcherService',
      data: {
        to,
        message,
      },
      metadata: {
        batched: true,
        batchSize: message.metadata?.batchedCount || 1,
      },
    });

    this.stats.totalSent += message.metadata?.batchedCount || 1;
  }

  /**
   * Re-queue failed messages
   */
  private async requeueFailedMessages(messages: BatchedMessage[]): Promise<void> {
    for (const msg of messages) {
      if (msg.retryCount < 3) {
        msg.retryCount++;
        msg.priority = 'high'; // Elevate priority for retries

        // Re-add to batch with delay
        setTimeout(() => {
          this.addMessage(msg.message, { priority: msg.priority });
        }, 1000 * msg.retryCount);
      } else {
        // Move to dead letter queue
        this.eventEmitter.emit('message.failed', {
          type: 'message.failed',
          source: 'MessageBatcherService',
          data: msg,
          metadata: {
            reason: 'Max retries exceeded',
          },
        });

        this.stats.totalFailed++;
      }
    }
  }

  /**
   * Calculate batch size for memory management
   */
  private calculateBatchSize(batch: MessageBatch): number {
    return batch.messages.reduce((size, msg) => {
      return size + JSON.stringify(msg.message).length;
    }, 0);
  }

  /**
   * Calculate batch diversity for smart batching
   */
  private calculateBatchDiversity(batch: MessageBatch): number {
    if (batch.messages.length < 2) return 0;

    const types = new Set(batch.messages.map((m) => m.message.type || 'text'));
    const priorities = new Set(batch.messages.map((m) => m.priority));

    const typeDiversity = types.size / batch.messages.length;
    const priorityDiversity = priorities.size / 3; // 3 priority levels

    return (typeDiversity + priorityDiversity) / 2;
  }

  /**
   * Update statistics
   */
  private updateStats(batchSize: number, success: boolean): void {
    if (success) {
      const currentAvg = this.stats.avgBatchSize;
      const totalBatches = Math.floor(this.stats.totalSent / (currentAvg || 1));
      this.stats.avgBatchSize = (currentAvg * totalBatches + batchSize) / (totalBatches + 1);
      this.stats.maxBatchSize = Math.max(this.stats.maxBatchSize, batchSize);
    }
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.checkAndFlushOldBatches();
    }, 1000); // Check every second
  }

  /**
   * Check and flush old batches
   */
  @Interval(5000) // Also run as scheduled task
  private async checkAndFlushOldBatches(): Promise<void> {
    const now = Date.now();
    const toFlush: string[] = [];

    this.batches.forEach((batch, to) => {
      const age = now - batch.lastUpdated.getTime();
      if (age >= this.batchConfig.maxBatchWaitTime) {
        toFlush.push(to);
      }
    });

    if (toFlush.length > 0) {
      this.logger.debug(`Auto-flushing ${toFlush.length} old batches`);
      await Promise.all(toFlush.map((to) => this.flushBatch(to)));
    }
  }

  /**
   * Clear all batches (for testing or emergency)
   */
  clearAllBatches(): void {
    const count = this.batches.size;
    this.batches.clear();
    this.logger.warn(`Cleared ${count} batches without sending`);
  }
}
