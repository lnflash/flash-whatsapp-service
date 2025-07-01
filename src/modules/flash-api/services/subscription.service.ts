import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, Client } from 'graphql-ws';
import * as WebSocket from 'ws';
import { MY_LN_UPDATES_SUBSCRIPTION } from '../graphql/subscriptions';

interface WebSocketCloseEvent {
  code?: number;
  reason?: string;
}

interface LnUpdateResult {
  data?: {
    myUpdates?: {
      update?: {
        __typename?: string;
        paymentHash?: string;
        status?: string;
      };
    };
  };
}

@Injectable()
export class SubscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionService.name);
  private client: Client | null = null;
  private subscriptions = new Map<string, () => void>(); // subscriptionId -> unsubscribe function
  private readonly wsUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Use the dedicated WebSocket endpoint
    const apiUrl = this.configService.get<string>(
      'flashApi.url',
      'https://api.flashapp.me/graphql',
    );

    // Determine WebSocket URL based on environment
    if (apiUrl.includes('api.flashapp.me')) {
      // Production
      this.wsUrl = 'wss://ws.flashapp.me/graphql';
    } else if (apiUrl.includes('staging')) {
      // Staging
      this.wsUrl = 'wss://ws.staging.flashapp.me/graphql';
    } else if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      // Local development
      this.wsUrl = 'ws://localhost:4002/graphqlws';
    } else {
      // Fallback: try to convert API URL
      this.wsUrl = apiUrl.replace('https://api.', 'wss://ws.').replace('http://', 'ws://');
    }

    this.logger.log(`WebSocket URL configured: ${this.wsUrl}`);
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to GraphQL WebSocket with authentication
   */
  async connect(authToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client = createClient({
          url: this.wsUrl,
          webSocketImpl: WebSocket.WebSocket || WebSocket,
          connectionParams: async () => ({
            Authorization: `Bearer ${authToken}`,
          }),
          on: {
            connected: () => {
              this.logger.log('WebSocket connection established');
            },
            error: (error) => {
              this.logger.error('WebSocket error:', error);
              reject(error);
            },
            closed: (event: WebSocketCloseEvent) => {
              this.logger.warn(`WebSocket closed: ${event?.code} - ${event?.reason}`);

              // Don't try to reconnect for certain error codes
              if (event?.code === 4400 || event?.code === 4401 || event?.code === 4403) {
                this.logger.error(
                  'WebSocket closed with unrecoverable error. Disabling WebSocket subscriptions.',
                );
                this.logger.log('Push notifications will continue working via RabbitMQ events.');
              }
            },
          },
          retryAttempts: 3,
          shouldRetry: (errOrCloseEvent) => {
            // Don't retry for certain error codes
            const code = (errOrCloseEvent as any)?.code;
            if (code === 4400 || code === 4401 || code === 4403) {
              return false;
            }
            return true;
          },
        });

        // The client is created, resolve immediately
        // graphql-ws handles connection internally
        resolve();
      } catch (error) {
        this.logger.error('Failed to create WebSocket client:', error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to Lightning updates for a specific user
   */
  async subscribeLnUpdates(
    userId: string,
    authToken: string,
    callback: (paymentHash: string, status: string) => void,
  ): Promise<string> {
    if (!this.client) {
      await this.connect(authToken);
    }

    const subscriptionId = `ln-updates-${userId}`;

    try {
      const unsubscribe = this.client!.subscribe(
        {
          query: MY_LN_UPDATES_SUBSCRIPTION,
          variables: {},
        },
        {
          next: (result: LnUpdateResult) => {
            const update = result.data?.myUpdates?.update;

            // Check if we have a valid update with paymentHash and status
            if (update && update.paymentHash && update.status) {
              this.logger.log(
                `Lightning payment update: [HASH:${update.paymentHash.substring(0, 8)}...] - ${update.status}`,
              );
              callback(update.paymentHash, update.status);
            } else if (update && Object.keys(update).length === 0) {
              // Empty update object - this is just a heartbeat
            }
          },
          error: (error) => {
            this.logger.error(`Subscription error for ${subscriptionId}:`, error);
          },
          complete: () => {
            this.logger.log(`Subscription ${subscriptionId} completed`);
            this.subscriptions.delete(subscriptionId);
          },
        },
      );

      this.subscriptions.set(subscriptionId, unsubscribe);
      this.logger.log(`Subscribed to Lightning updates for user ${userId}`);
      return subscriptionId;
    } catch (error) {
      this.logger.error(`Failed to subscribe for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(subscriptionId: string): void {
    const unsubscribe = this.subscriptions.get(subscriptionId);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(subscriptionId);
      this.logger.log(`Unsubscribed from ${subscriptionId}`);
    }
  }

  /**
   * Disconnect WebSocket
   */
  async disconnect(): Promise<void> {
    // Unsubscribe all active subscriptions
    for (const [subscriptionId, unsubscribe] of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions.clear();

    // Dispose the client
    if (this.client) {
      await this.client.dispose();
      this.client = null;
    }

    this.logger.log('WebSocket disconnected');
  }
}
