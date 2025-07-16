import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import { MESSAGING_PLATFORM } from './messaging.constants';
import {
  MessagingPlatform,
  ConnectionStatus,
  MessageContent,
  MessageResult,
  MediaMessage,
  InteractiveMessage,
  IncomingMessage,
  PlatformFeatures,
  MessagingEvent,
  EventHandler,
  MessageType,
} from './interfaces/messaging-platform.interface';

// Mock implementation of MessagingPlatform
class MockMessagingPlatform implements MessagingPlatform {
  private connected = false;
  private eventHandlers = new Map<MessagingEvent, Set<EventHandler>>();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      platform: 'mock',
      lastConnected: this.connected ? new Date() : undefined,
    };
  }

  async sendMessage(to: string, content: MessageContent): Promise<MessageResult> {
    return {
      success: true,
      messageId: 'mock-message-id',
      timestamp: new Date(),
    };
  }

  async sendMedia(to: string, media: MediaMessage): Promise<MessageResult> {
    return {
      success: true,
      messageId: 'mock-media-id',
      timestamp: new Date(),
    };
  }

  async sendInteractive(to: string, interactive: InteractiveMessage): Promise<MessageResult> {
    return {
      success: true,
      messageId: 'mock-interactive-id',
      timestamp: new Date(),
    };
  }

  parseIncomingMessage(payload: any): IncomingMessage {
    return {
      id: 'mock-id',
      from: 'mock-from',
      to: 'mock-to',
      timestamp: new Date(),
      type: MessageType.TEXT,
      content: { text: 'mock message' },
      isGroup: false,
      platform: 'mock',
      raw: payload,
    };
  }

  getFeatures(): PlatformFeatures {
    return {
      supportsMedia: true,
      supportsGroups: true,
      supportsReactions: false,
      supportsEditing: false,
      supportsThreads: false,
      supportsVoice: true,
      supportsLocation: true,
      supportsButtons: true,
      supportsTemplates: false,
      maxMessageLength: 4096,
      maxMediaSize: 16 * 1024 * 1024,
    };
  }

  on(event: MessagingEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: MessagingEvent, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }
}

describe('MessagingService', () => {
  let service: MessagingService;
  let mockPlatform: MockMessagingPlatform;

  beforeEach(async () => {
    mockPlatform = new MockMessagingPlatform();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        {
          provide: MESSAGING_PLATFORM,
          useValue: mockPlatform,
        },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize the platform on module init', async () => {
      const connectSpy = jest.spyOn(mockPlatform, 'connect');
      await service.onModuleInit();
      expect(connectSpy).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect the platform on module destroy', async () => {
      const disconnectSpy = jest.spyOn(mockPlatform, 'disconnect');
      await service.onModuleDestroy();
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send a text message', async () => {
      const sendMessageSpy = jest.spyOn(mockPlatform, 'sendMessage');
      await service.sendMessage('+1234567890', 'Hello, world!');
      
      expect(sendMessageSpy).toHaveBeenCalledWith('+1234567890', {
        text: 'Hello, world!',
      });
    });

    it('should send a message with content object', async () => {
      const sendMessageSpy = jest.spyOn(mockPlatform, 'sendMessage');
      const content: MessageContent = {
        text: 'Hello with mentions',
        mentions: ['user1', 'user2'],
      };
      
      await service.sendMessage('+1234567890', content);
      expect(sendMessageSpy).toHaveBeenCalledWith('+1234567890', content);
    });

    it('should throw error if message fails', async () => {
      jest.spyOn(mockPlatform, 'sendMessage').mockResolvedValueOnce({
        success: false,
        error: 'Failed to send',
      });

      await expect(service.sendMessage('+1234567890', 'Test')).rejects.toThrow(
        'Failed to send message: Failed to send',
      );
    });
  });

  describe('sendMedia', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send media', async () => {
      const sendMediaSpy = jest.spyOn(mockPlatform, 'sendMedia');
      const media: MediaMessage = {
        type: 'image',
        url: 'https://example.com/image.jpg',
        caption: 'Test image',
      };

      await service.sendMedia('+1234567890', media);
      expect(sendMediaSpy).toHaveBeenCalledWith('+1234567890', media);
    });

    it('should throw error if media send fails', async () => {
      jest.spyOn(mockPlatform, 'sendMedia').mockResolvedValueOnce({
        success: false,
        error: 'Media too large',
      });

      const media: MediaMessage = {
        type: 'image',
        url: 'https://example.com/image.jpg',
      };

      await expect(service.sendMedia('+1234567890', media)).rejects.toThrow(
        'Failed to send media: Media too large',
      );
    });
  });

  describe('sendInteractive', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send interactive message', async () => {
      const sendInteractiveSpy = jest.spyOn(mockPlatform, 'sendInteractive');
      const interactive: InteractiveMessage = {
        type: 'buttons',
        body: 'Choose an option',
        action: {
          buttons: [
            { id: '1', title: 'Option 1' },
            { id: '2', title: 'Option 2' },
          ],
        },
      };

      await service.sendInteractive('+1234567890', interactive);
      expect(sendInteractiveSpy).toHaveBeenCalledWith('+1234567890', interactive);
    });
  });

  describe('sendNotification', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should send notification as interactive message when buttons are supported', async () => {
      const sendInteractiveSpy = jest.spyOn(mockPlatform, 'sendInteractive');
      const notification = {
        message: 'Payment received',
        footer: 'Thank you',
        actions: [
          { id: 'view', title: 'View Details' },
          { id: 'dismiss', title: 'Dismiss' },
        ],
      };

      await service.sendNotification('+1234567890', notification);
      
      expect(sendInteractiveSpy).toHaveBeenCalledWith('+1234567890', {
        type: 'buttons',
        body: notification.message,
        footer: notification.footer,
        action: notification.actions,
      });
    });

    it('should fallback to text message when buttons are not supported', async () => {
      jest.spyOn(mockPlatform, 'getFeatures').mockReturnValueOnce({
        ...mockPlatform.getFeatures(),
        supportsButtons: false,
      });

      const sendMessageSpy = jest.spyOn(mockPlatform, 'sendMessage');
      const notification = {
        message: 'Payment received',
        actions: [{ id: 'view', title: 'View Details' }],
      };

      await service.sendNotification('+1234567890', notification);
      
      expect(sendMessageSpy).toHaveBeenCalledWith('+1234567890', {
        text: notification.message,
      });
    });
  });

  describe('connection status', () => {
    it('should return connection status', () => {
      const status = service.getConnectionStatus();
      expect(status).toEqual({
        connected: false,
        platform: 'mock',
        lastConnected: undefined,
      });
    });

    it('should return connected after initialization', async () => {
      await service.onModuleInit();
      const status = service.getConnectionStatus();
      expect(status.connected).toBe(true);
      expect(status.platform).toBe('mock');
    });

    it('should check if connected', async () => {
      expect(service.isConnected()).toBe(false);
      await service.onModuleInit();
      expect(service.isConnected()).toBe(true);
    });
  });

  describe('platform features', () => {
    it('should return platform features', () => {
      const features = service.getFeatures();
      expect(features).toMatchObject({
        supportsMedia: true,
        supportsGroups: true,
        supportsButtons: true,
        maxMessageLength: 4096,
      });
    });
  });

  describe('event handling', () => {
    it('should register event handlers', () => {
      const handler = jest.fn();
      const onSpy = jest.spyOn(mockPlatform, 'on');
      
      service.on(MessagingEvent.MESSAGE_RECEIVED, handler);
      expect(onSpy).toHaveBeenCalledWith(MessagingEvent.MESSAGE_RECEIVED, handler);
    });

    it('should unregister event handlers', () => {
      const handler = jest.fn();
      const offSpy = jest.spyOn(mockPlatform, 'off');
      
      service.off(MessagingEvent.MESSAGE_RECEIVED, handler);
      expect(offSpy).toHaveBeenCalledWith(MessagingEvent.MESSAGE_RECEIVED, handler);
    });
  });
});