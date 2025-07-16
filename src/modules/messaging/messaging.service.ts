import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MESSAGING_PLATFORM } from './messaging.constants';
import {
  MessagingPlatform,
  IncomingMessage,
  MessagingEvent,
  MessageContent,
  MediaMessage,
  InteractiveMessage,
  ConnectionStatus,
  PlatformFeatures,
} from './interfaces/messaging-platform.interface';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);

  constructor(@Inject(MESSAGING_PLATFORM) private readonly platform: MessagingPlatform) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async initialize(): Promise<void> {
    try {
      this.setupMessageHandling();
      await this.platform.connect();
      this.logger.log(`Messaging platform connected: ${this.getConnectionStatus().platform}`);
    } catch (error) {
      this.logger.error('Failed to initialize messaging platform:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.platform.disconnect();
      this.logger.log('Messaging platform disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting messaging platform:', error);
    }
  }

  async sendMessage(to: string, message: string | MessageContent): Promise<void> {
    const content: MessageContent = typeof message === 'string' ? { text: message } : message;

    const result = await this.platform.sendMessage(to, content);

    if (!result.success) {
      throw new Error(`Failed to send message: ${result.error}`);
    }
  }

  async sendMedia(to: string, media: MediaMessage): Promise<void> {
    const result = await this.platform.sendMedia(to, media);

    if (!result.success) {
      throw new Error(`Failed to send media: ${result.error}`);
    }
  }

  async sendInteractive(to: string, interactive: InteractiveMessage): Promise<void> {
    const result = await this.platform.sendInteractive(to, interactive);

    if (!result.success) {
      throw new Error(`Failed to send interactive message: ${result.error}`);
    }
  }

  async sendNotification(to: string, notification: any): Promise<void> {
    // Format notification based on platform capabilities
    const features = this.platform.getFeatures();

    if (features.supportsButtons && notification.actions) {
      await this.sendInteractive(to, {
        type: 'buttons',
        body: notification.message,
        footer: notification.footer,
        action: notification.actions,
      });
    } else {
      await this.sendMessage(to, notification.message);
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return this.platform.getConnectionStatus();
  }

  getFeatures(): PlatformFeatures {
    return this.platform.getFeatures();
  }

  isConnected(): boolean {
    return this.getConnectionStatus().connected;
  }

  on(event: MessagingEvent, handler: (data: any) => void | Promise<void>): void {
    this.platform.on(event, handler);
  }

  off(event: MessagingEvent, handler: (data: any) => void | Promise<void>): void {
    this.platform.off(event, handler);
  }

  private setupMessageHandling() {
    this.platform.on(MessagingEvent.MESSAGE_RECEIVED, async (message: IncomingMessage) => {
      try {
        this.logger.debug(
          `Received message from ${message.from}: ${message.content.text?.substring(0, 50)}...`,
        );
        // Message routing will be handled by WhatsApp service for now
        // In future, this will route to a platform-agnostic command processor
      } catch (error) {
        this.logger.error('Error handling message:', error);
      }
    });

    this.platform.on(MessagingEvent.CONNECTED, () => {
      this.logger.log('Messaging platform connected');
    });

    this.platform.on(MessagingEvent.DISCONNECTED, (data) => {
      this.logger.warn('Messaging platform disconnected:', data);
    });

    this.platform.on(MessagingEvent.ERROR, (error) => {
      this.logger.error('Messaging platform error:', error);
    });
  }
}
