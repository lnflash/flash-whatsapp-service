import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { MY_LN_UPDATES_SUBSCRIPTION } from '../graphql/subscriptions';

interface SubscriptionMessage {
  id?: string;
  type: string;
  payload?: any;
}

@Injectable()
export class SubscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionService.name);
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, (data: any) => void>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly wsUrl: string;
  private authToken: string | null = null;

  constructor(private readonly configService: ConfigService) {
    // Use the dedicated WebSocket endpoint
    const apiUrl = this.configService.get<string>('flashApi.url', 'https://api.flashapp.me/graphql');
    
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
    this.disconnect();
  }

  /**
   * Connect to GraphQL WebSocket with authentication
   */
  async connect(authToken: string): Promise<void> {
    this.authToken = authToken;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'User-Agent': 'Flash-WhatsApp-Service/1.0',
            'Sec-WebSocket-Protocol': 'graphql-ws',
          },
        });

        this.ws.on('open', () => {
          this.logger.log('WebSocket connection opened');
          // Send connection init
          this.send({
            type: 'connection_init',
            payload: {
              Authorization: `Bearer ${authToken}`,
            },
          });
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as SubscriptionMessage;
            this.handleMessage(message);
            
            if (message.type === 'connection_ack') {
              this.logger.log('WebSocket connection acknowledged');
              resolve();
            }
          } catch (error) {
            this.logger.error('Error parsing WebSocket message:', error);
          }
        });

        this.ws.on('error', (error) => {
          this.logger.error('WebSocket error:', error);
          this.logger.error(`Failed to connect to: ${this.wsUrl}`);
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          this.logger.warn(`WebSocket closed: ${code} - ${reason}`);
          this.handleReconnect();
        });
      } catch (error) {
        this.logger.error('Failed to create WebSocket connection:', error);
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(authToken);
    }

    const subscriptionId = `ln-updates-${userId}`;
    
    // Store callback
    this.subscriptions.set(subscriptionId, (data) => {
      const update = data?.myUpdates?.update;
      if (update?.paymentHash && update?.status) {
        callback(update.paymentHash, update.status);
      }
    });

    // Send subscription
    this.send({
      id: subscriptionId,
      type: 'start',
      payload: {
        query: MY_LN_UPDATES_SUBSCRIPTION,
        variables: {},
      },
    });

    this.logger.log(`Subscribed to Lightning updates for user ${userId}`);
    return subscriptionId;
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(subscriptionId: string): void {
    if (this.subscriptions.has(subscriptionId)) {
      this.subscriptions.delete(subscriptionId);
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          id: subscriptionId,
          type: 'stop',
        });
      }
      
      this.logger.log(`Unsubscribed from ${subscriptionId}`);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: SubscriptionMessage): void {
    switch (message.type) {
      case 'data':
        if (message.id && this.subscriptions.has(message.id)) {
          const callback = this.subscriptions.get(message.id);
          if (callback && message.payload?.data) {
            callback(message.payload.data);
          }
        }
        break;
        
      case 'error':
        this.logger.error(`Subscription error:`, message.payload);
        break;
        
      case 'complete':
        this.logger.log(`Subscription ${message.id} completed`);
        if (message.id) {
          this.subscriptions.delete(message.id);
        }
        break;
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(message: SubscriptionMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.logger.warn('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (!this.authToken) {
      this.logger.warn('Cannot reconnect: No auth token available');
      return;
    }

    const delay = 5000; // 5 seconds
    this.logger.log(`Attempting to reconnect in ${delay}ms...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(this.authToken!);
        // Resubscribe to all active subscriptions
        for (const [id, callback] of this.subscriptions) {
          this.logger.log(`Resubscribing to ${id}`);
          // Re-send subscription
          this.send({
            id,
            type: 'start',
            payload: {
              query: MY_LN_UPDATES_SUBSCRIPTION,
              variables: {},
            },
          });
        }
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
        this.handleReconnect(); // Try again
      }
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    this.logger.log('WebSocket disconnected');
  }
}