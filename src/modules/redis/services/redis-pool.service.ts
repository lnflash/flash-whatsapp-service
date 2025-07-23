import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Cluster } from 'ioredis';

export interface RedisPoolConfig {
  enablePool: boolean;
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  connectionName?: string;
  enableReadReplicas?: boolean;
  sentinels?: Array<{ host: string; port: number }>;
}

export interface PoolStats {
  total: number;
  active: number;
  idle: number;
  waiting: number;
}

@Injectable()
export class RedisPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPoolService.name);
  private pool: Redis[] = [];
  private activeConnections = new Set<Redis>();
  private waitingQueue: Array<(client: Redis) => void> = [];
  private config: RedisPoolConfig;
  private isShuttingDown = false;

  constructor(private configService: ConfigService) {
    this.config = {
      enablePool: this.configService.get<boolean>('redis.pool.enabled', true),
      minConnections: this.configService.get<number>('redis.pool.min', 2),
      maxConnections: this.configService.get<number>('redis.pool.max', 10),
      acquireTimeout: this.configService.get<number>('redis.pool.acquireTimeout', 3000),
      idleTimeout: this.configService.get<number>('redis.pool.idleTimeout', 30000),
      connectionName: this.configService.get<string>('redis.pool.connectionName', 'pulse-pool'),
      enableReadReplicas: this.configService.get<boolean>('redis.pool.enableReadReplicas', false),
      sentinels: this.configService.get('redis.sentinels'),
    };
  }

  async onModuleInit() {
    if (!this.config.enablePool) {
      this.logger.log('Redis connection pooling is disabled');
      return;
    }

    try {
      await this.initializePool();
    } catch (error) {
      this.logger.error('Failed to initialize Redis pool, disabling pooling:', error);
      this.config.enablePool = false;
      // Don't throw error to allow application to start without pooling
    }
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    await this.destroyPool();
  }

  /**
   * Initialize the connection pool
   */
  private async initializePool(): Promise<void> {
    this.logger.log(
      `Initializing Redis connection pool with ${this.config.minConnections}-${this.config.maxConnections} connections`,
    );

    try {
      // Create minimum connections
      const connectionPromises = [];
      for (let i = 0; i < this.config.minConnections; i++) {
        connectionPromises.push(this.createConnection(i));
      }

      const connections = await Promise.all(connectionPromises);
      this.pool.push(...connections);

      this.logger.log(`Redis pool initialized with ${this.pool.length} connections`);

      // Start idle connection cleanup
      this.startIdleConnectionCleanup();
    } catch (error) {
      this.logger.error('Failed to initialize Redis pool:', error);
      throw error;
    }
  }

  /**
   * Create a new Redis connection
   */
  private async createConnection(index: number): Promise<Redis> {
    const redisConfig = this.configService.get('redis');
    
    const options: any = {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      connectionName: `${this.config.connectionName}-${index}`,
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          this.logger.error(`Redis connection ${index} failed after ${times} attempts`);
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    };

    // Add Sentinel support if configured
    if (this.config.sentinels && this.config.sentinels.length > 0) {
      options.sentinels = this.config.sentinels;
      options.name = redisConfig.sentinelName || 'mymaster';
    }

    const client = new Redis(options);

    // Set up event handlers
    client.on('error', (err) => {
      this.logger.error(`Redis pool connection ${index} error:`, err);
    });

    client.on('connect', () => {
      this.logger.debug(`Redis pool connection ${index} connected`);
    });

    client.on('ready', () => {
      this.logger.debug(`Redis pool connection ${index} ready`);
    });

    client.on('close', () => {
      this.logger.debug(`Redis pool connection ${index} closed`);
      this.handleConnectionClose(client);
    });

    // Wait for connection to be ready
    try {
      await new Promise<void>((resolve, reject) => {
        if (client.status === 'ready') {
          resolve();
        } else {
          client.once('ready', () => resolve());
          client.once('error', (err) => reject(err));
          
          // Timeout after 5 seconds
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        }
      });
      
      // Test the connection
      await client.ping();
    } catch (error) {
      this.logger.error(`Failed to establish Redis connection ${index}:`, error);
      client.disconnect();
      throw error;
    }
    
    return client;
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<Redis> {
    if (this.isShuttingDown) {
      throw new Error('Redis pool is shutting down');
    }

    const startTime = Date.now();

    while (true) {
      // Try to get an idle connection
      const idleConnection = this.getIdleConnection();
      if (idleConnection) {
        this.activeConnections.add(idleConnection);
        return idleConnection;
      }

      // Check if we can create a new connection
      if (this.pool.length < this.config.maxConnections) {
        try {
          const newConnection = await this.createConnection(this.pool.length);
          this.pool.push(newConnection);
          this.activeConnections.add(newConnection);
          return newConnection;
        } catch (error) {
          this.logger.error('Failed to create new connection:', error);
        }
      }

      // Check timeout
      if (Date.now() - startTime > this.config.acquireTimeout) {
        throw new Error(`Failed to acquire Redis connection within ${this.config.acquireTimeout}ms`);
      }

      // Wait for a connection to become available
      await this.waitForConnection();
    }
  }

  /**
   * Release a connection back to the pool
   */
  release(client: Redis): void {
    if (!this.activeConnections.has(client)) {
      this.logger.warn('Attempting to release a connection that is not in the active set');
      return;
    }

    this.activeConnections.delete(client);

    // Notify waiting consumers
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift()!;
      this.activeConnections.add(client);
      resolve(client);
    }
  }

  /**
   * Execute a function with a pooled connection
   */
  async withConnection<T>(fn: (client: Redis) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    try {
      return await fn(client);
    } finally {
      this.release(client);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      total: this.pool.length,
      active: this.activeConnections.size,
      idle: this.pool.length - this.activeConnections.size,
      waiting: this.waitingQueue.length,
    };
  }

  /**
   * Health check for the pool
   */
  async healthCheck(): Promise<{ healthy: boolean; stats: PoolStats; errors: string[] }> {
    const stats = this.getStats();
    const errors: string[] = [];

    // Check minimum connections
    if (stats.total < this.config.minConnections) {
      errors.push(`Pool has ${stats.total} connections, minimum is ${this.config.minConnections}`);
    }

    // Check connection health
    const healthChecks = await Promise.allSettled(
      this.pool.map(async (client, index) => {
        try {
          await client.ping();
          return { index, healthy: true };
        } catch (error) {
          return { index, healthy: false, error };
        }
      }),
    );

    healthChecks.forEach((result) => {
      if (result.status === 'fulfilled' && !result.value.healthy) {
        errors.push(`Connection ${result.value.index} is unhealthy`);
      }
    });

    return {
      healthy: errors.length === 0,
      stats,
      errors,
    };
  }

  /**
   * Get an idle connection from the pool
   */
  private getIdleConnection(): Redis | null {
    for (const client of this.pool) {
      if (!this.activeConnections.has(client) && client.status === 'ready') {
        return client;
      }
    }
    return null;
  }

  /**
   * Wait for a connection to become available
   */
  private waitForConnection(): Promise<Redis> {
    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  /**
   * Handle connection close event
   */
  private handleConnectionClose(client: Redis): void {
    // Remove from pool
    const index = this.pool.indexOf(client);
    if (index !== -1) {
      this.pool.splice(index, 1);
    }

    // Remove from active connections
    this.activeConnections.delete(client);

    // Try to maintain minimum connections
    if (!this.isShuttingDown && this.pool.length < this.config.minConnections) {
      this.createConnection(this.pool.length)
        .then((newClient) => {
          this.pool.push(newClient);
          this.logger.debug('Replaced closed connection in pool');
        })
        .catch((error) => {
          this.logger.error('Failed to replace closed connection:', error);
        });
    }
  }

  /**
   * Start idle connection cleanup timer
   */
  private startIdleConnectionCleanup(): void {
    setInterval(() => {
      if (this.isShuttingDown) return;

      const stats = this.getStats();
      
      // Remove excess idle connections
      if (stats.idle > this.config.minConnections && stats.total > this.config.minConnections) {
        const toRemove = Math.min(
          stats.idle - this.config.minConnections,
          stats.total - this.config.minConnections,
        );

        for (let i = 0; i < toRemove; i++) {
          const idleConnection = this.getIdleConnection();
          if (idleConnection) {
            const index = this.pool.indexOf(idleConnection);
            if (index !== -1) {
              this.pool.splice(index, 1);
              idleConnection.quit();
              this.logger.debug('Removed idle connection from pool');
            }
          }
        }
      }
    }, this.config.idleTimeout);
  }

  /**
   * Destroy the connection pool
   */
  private async destroyPool(): Promise<void> {
    this.logger.log('Destroying Redis connection pool...');

    // Reject all waiting requests
    this.waitingQueue.forEach((resolve) => {
      resolve(null as any);
    });
    this.waitingQueue = [];

    // Close all connections
    const closePromises = this.pool.map((client) => client.quit());
    await Promise.allSettled(closePromises);

    this.pool = [];
    this.activeConnections.clear();

    this.logger.log('Redis connection pool destroyed');
  }
}