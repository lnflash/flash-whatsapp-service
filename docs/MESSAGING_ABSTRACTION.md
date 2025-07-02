# Messaging Platform Abstraction Layer

## Overview

This document details the implementation plan for abstracting the messaging layer in Pulse, enabling support for multiple messaging platforms beyond WhatsApp.

## Architecture Design

### Core Principles

1. **Platform Agnostic**: Business logic should not know which messaging platform is being used
2. **Extensible**: Adding new platforms should require minimal changes to existing code
3. **Type Safe**: Strong TypeScript interfaces for all messaging operations
4. **Testable**: Easy to mock and test messaging functionality
5. **Backward Compatible**: Existing WhatsApp functionality must continue working

## Implementation Guide

### Step 1: Create Core Interfaces

Create `src/modules/messaging/interfaces/messaging-platform.interface.ts`:

```typescript
export interface MessagingPlatform {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionStatus(): ConnectionStatus;
  
  // Message handling
  sendMessage(to: string, message: MessageContent): Promise<MessageResult>;
  sendMedia(to: string, media: MediaMessage): Promise<MessageResult>;
  sendInteractive(to: string, interactive: InteractiveMessage): Promise<MessageResult>;
  
  // Message parsing
  parseIncomingMessage(payload: any): IncomingMessage;
  
  // Platform-specific features
  getFeatures(): PlatformFeatures;
  
  // Event handling
  on(event: MessagingEvent, handler: EventHandler): void;
  off(event: MessagingEvent, handler: EventHandler): void;
}

export interface ConnectionStatus {
  connected: boolean;
  platform: string;
  lastConnected?: Date;
  error?: string;
}

export interface MessageContent {
  text?: string;
  mentions?: string[];
  replyTo?: string;
  formatting?: MessageFormatting;
}

export interface MediaMessage {
  type: 'image' | 'video' | 'audio' | 'document';
  url?: string;
  data?: Buffer;
  caption?: string;
  mimeType?: string;
}

export interface InteractiveMessage {
  type: 'buttons' | 'list' | 'template';
  body: string;
  footer?: string;
  action: any; // Platform-specific action data
}

export interface IncomingMessage {
  id: string;
  from: string;
  to: string;
  timestamp: Date;
  type: MessageType;
  content: MessageContent;
  media?: MediaMessage;
  isGroup: boolean;
  groupId?: string;
  platform: string;
  raw?: any; // Original platform message
}

export interface PlatformFeatures {
  supportsMedia: boolean;
  supportsGroups: boolean;
  supportsReactions: boolean;
  supportsEditing: boolean;
  supportsThreads: boolean;
  supportsVoice: boolean;
  supportsLocation: boolean;
  supportsButtons: boolean;
  supportsTemplates: boolean;
  maxMessageLength: number;
  maxMediaSize: number;
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
}

export enum MessagingEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_FAILED = 'message_failed',
  QR_CODE = 'qr_code',
  ERROR = 'error',
}
```

### Step 2: Create DTOs

Create `src/modules/messaging/dto/messaging.dto.ts`:

```typescript
import { IsString, IsOptional, IsEnum, IsBoolean, IsDate } from 'class-validator';
import { MessageType } from '../interfaces/messaging-platform.interface';

export class IncomingMessageDto {
  @IsString()
  id: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsDate()
  timestamp: Date;

  @IsEnum(MessageType)
  type: MessageType;

  @IsString()
  @IsOptional()
  text?: string;

  @IsBoolean()
  isGroup: boolean;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsString()
  platform: string;
}

export class SendMessageDto {
  @IsString()
  to: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  platform?: string;
}
```

### Step 3: Create WhatsApp Implementation

Create `src/modules/whatsapp/services/whatsapp-messaging.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { 
  MessagingPlatform, 
  ConnectionStatus, 
  MessageContent,
  IncomingMessage,
  PlatformFeatures,
  MessagingEvent
} from '../../messaging/interfaces/messaging-platform.interface';
import { WhatsappWebService } from './whatsapp-web.service';

@Injectable()
export class WhatsAppMessagingService implements MessagingPlatform {
  private readonly logger = new Logger(WhatsAppMessagingService.name);
  private eventHandlers = new Map<MessagingEvent, Set<EventHandler>>();

  constructor(
    private readonly whatsappWebService: WhatsappWebService,
  ) {
    this.setupEventForwarding();
  }

  async connect(): Promise<void> {
    await this.whatsappWebService.initialize();
  }

  async disconnect(): Promise<void> {
    await this.whatsappWebService.disconnect();
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.whatsappWebService.isReady(),
      platform: 'whatsapp',
      lastConnected: this.whatsappWebService.getLastConnectedTime(),
    };
  }

  async sendMessage(to: string, content: MessageContent): Promise<MessageResult> {
    // Convert to WhatsApp format
    const whatsappNumber = this.formatPhoneNumber(to);
    
    try {
      const result = await this.whatsappWebService.sendMessage(
        whatsappNumber,
        content.text || '',
        content.mentions,
      );
      
      return {
        success: true,
        messageId: result.id,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendMedia(to: string, media: MediaMessage): Promise<MessageResult> {
    const whatsappNumber = this.formatPhoneNumber(to);
    
    try {
      const result = await this.whatsappWebService.sendMedia(
        whatsappNumber,
        media.url || media.data,
        media.caption,
      );
      
      return {
        success: true,
        messageId: result.id,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to send media: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  parseIncomingMessage(whatsappMessage: any): IncomingMessage {
    return {
      id: whatsappMessage.id._serialized,
      from: whatsappMessage.from,
      to: whatsappMessage.to,
      timestamp: new Date(whatsappMessage.timestamp * 1000),
      type: this.mapMessageType(whatsappMessage.type),
      content: {
        text: whatsappMessage.body,
        mentions: whatsappMessage.mentionedIds,
      },
      isGroup: whatsappMessage.from.includes('@g.us'),
      groupId: whatsappMessage.from.includes('@g.us') ? whatsappMessage.from : undefined,
      platform: 'whatsapp',
      raw: whatsappMessage,
    };
  }

  getFeatures(): PlatformFeatures {
    return {
      supportsMedia: true,
      supportsGroups: true,
      supportsReactions: true,
      supportsEditing: false,
      supportsThreads: false,
      supportsVoice: true,
      supportsLocation: true,
      supportsButtons: true,
      supportsTemplates: false,
      maxMessageLength: 4096,
      maxMediaSize: 16 * 1024 * 1024, // 16MB
    };
  }

  private formatPhoneNumber(number: string): string {
    // WhatsApp specific formatting
    return number.replace(/\D/g, '') + '@c.us';
  }

  private mapMessageType(whatsappType: string): MessageType {
    const typeMap = {
      'chat': MessageType.TEXT,
      'image': MessageType.IMAGE,
      'video': MessageType.VIDEO,
      'ptt': MessageType.AUDIO,
      'audio': MessageType.AUDIO,
      'document': MessageType.DOCUMENT,
      'location': MessageType.LOCATION,
      'vcard': MessageType.CONTACT,
      'sticker': MessageType.STICKER,
    };
    
    return typeMap[whatsappType] || MessageType.TEXT;
  }

  private setupEventForwarding() {
    // Forward WhatsApp events to generic events
    this.whatsappWebService.on('ready', () => {
      this.emit(MessagingEvent.CONNECTED, {});
    });

    this.whatsappWebService.on('message', (msg) => {
      const parsed = this.parseIncomingMessage(msg);
      this.emit(MessagingEvent.MESSAGE_RECEIVED, parsed);
    });

    this.whatsappWebService.on('qr', (qr) => {
      this.emit(MessagingEvent.QR_CODE, { qr });
    });
  }

  on(event: MessagingEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);
  }

  off(event: MessagingEvent, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: MessagingEvent, data: any): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }
}
```

### Step 4: Update Module Configuration

Update `src/modules/whatsapp/whatsapp.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebService } from './services/whatsapp-web.service';
import { WhatsAppMessagingService } from './services/whatsapp-messaging.service';
import { MESSAGING_PLATFORM } from '../messaging/messaging.constants';

@Module({
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsappWebService,
    WhatsAppMessagingService,
    {
      provide: MESSAGING_PLATFORM,
      useClass: WhatsAppMessagingService,
    },
  ],
  exports: [MESSAGING_PLATFORM],
})
export class WhatsappModule {}
```

### Step 5: Create Messaging Module

Create `src/modules/messaging/messaging.module.ts`:

```typescript
import { Module, DynamicModule, Type } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingPlatform } from './interfaces/messaging-platform.interface';
import { MESSAGING_PLATFORM } from './messaging.constants';

@Module({})
export class MessagingModule {
  static forRoot(platformClass: Type<MessagingPlatform>): DynamicModule {
    return {
      module: MessagingModule,
      providers: [
        MessagingService,
        {
          provide: MESSAGING_PLATFORM,
          useClass: platformClass,
        },
      ],
      exports: [MessagingService, MESSAGING_PLATFORM],
    };
  }
}
```

### Step 6: Create Unified Messaging Service

Create `src/modules/messaging/messaging.service.ts`:

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import { MESSAGING_PLATFORM } from './messaging.constants';
import { MessagingPlatform, IncomingMessage } from './interfaces/messaging-platform.interface';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @Inject(MESSAGING_PLATFORM) private readonly platform: MessagingPlatform,
  ) {
    this.setupMessageHandling();
  }

  async sendMessage(to: string, message: string): Promise<void> {
    const result = await this.platform.sendMessage(to, { text: message });
    
    if (!result.success) {
      throw new Error(`Failed to send message: ${result.error}`);
    }
  }

  async sendNotification(to: string, notification: any): Promise<void> {
    // Format notification based on platform capabilities
    const features = this.platform.getFeatures();
    
    if (features.supportsButtons && notification.actions) {
      await this.platform.sendInteractive(to, {
        type: 'buttons',
        body: notification.message,
        action: notification.actions,
      });
    } else {
      await this.sendMessage(to, notification.message);
    }
  }

  private setupMessageHandling() {
    this.platform.on('message_received', (message: IncomingMessage) => {
      this.logger.log(`Received message from ${message.from}: ${message.content.text}`);
      // Route to appropriate handler based on platform
      this.routeMessage(message);
    });
  }

  private async routeMessage(message: IncomingMessage) {
    // Platform-agnostic message routing
    // This is where commands are parsed and handled
  }
}
```

### Step 7: Refactor Controllers

Update controllers to use the abstraction:

```typescript
import { Controller, Post, Body, Inject } from '@nestjs/common';
import { MessagingService } from '../messaging/messaging.service';

@Controller('api')
export class ApiController {
  constructor(
    private readonly messagingService: MessagingService,
  ) {}

  @Post('send-message')
  async sendMessage(@Body() dto: SendMessageDto) {
    // Platform agnostic - works with any messaging platform
    await this.messagingService.sendMessage(dto.to, dto.message);
    return { success: true };
  }
}
```

## Adding New Platforms

### Example: Telegram Implementation

Create `src/modules/telegram/services/telegram-messaging.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { MessagingPlatform } from '../../messaging/interfaces/messaging-platform.interface';

@Injectable()
export class TelegramMessagingService implements MessagingPlatform {
  private bot: Telegraf;

  constructor(
    @ConfigService() private config: ConfigService,
  ) {
    this.bot = new Telegraf(this.config.get('TELEGRAM_BOT_TOKEN'));
  }

  async connect(): Promise<void> {
    await this.bot.launch();
  }

  async sendMessage(to: string, content: MessageContent): Promise<MessageResult> {
    try {
      const result = await this.bot.telegram.sendMessage(to, content.text);
      return {
        success: true,
        messageId: result.message_id.toString(),
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Implement other interface methods...
}
```

## Migration Strategy

### Phase 1: Preparation (Week 1-2)
1. Create interfaces and DTOs
2. Implement WhatsApp adapter
3. Add comprehensive tests

### Phase 2: Refactoring (Week 3-4)
1. Update all services to use abstraction
2. Update controllers
3. Ensure backward compatibility

### Phase 3: Testing (Week 5)
1. Integration testing
2. Performance testing
3. User acceptance testing

### Phase 4: New Platforms (Week 6+)
1. Implement Telegram
2. Implement SMS fallback
3. Add platform selection logic

## Best Practices

1. **Always use the abstraction** - Never import platform-specific services directly
2. **Handle platform differences** - Check features before using platform-specific functionality
3. **Graceful degradation** - Fallback to basic text when advanced features aren't available
4. **Comprehensive logging** - Log platform-specific details for debugging
5. **Error handling** - Wrap platform calls in try-catch blocks

## Testing Strategy

### Unit Tests
```typescript
describe('MessagingService', () => {
  let service: MessagingService;
  let mockPlatform: MockMessagingPlatform;

  beforeEach(() => {
    mockPlatform = new MockMessagingPlatform();
    service = new MessagingService(mockPlatform);
  });

  it('should send message through platform', async () => {
    await service.sendMessage('+1234567890', 'Test message');
    expect(mockPlatform.sendMessage).toHaveBeenCalledWith(
      '+1234567890',
      { text: 'Test message' }
    );
  });
});
```

## Configuration

### Environment Variables
```bash
# Platform selection
MESSAGING_PLATFORM=whatsapp # whatsapp, telegram, sms, multi

# WhatsApp config
WHATSAPP_SESSION_NAME=pulse

# Telegram config
TELEGRAM_BOT_TOKEN=your_bot_token

# SMS config
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# Multi-platform config
PRIMARY_PLATFORM=whatsapp
FALLBACK_PLATFORMS=telegram,sms
```

## Monitoring

### Metrics to Track
1. Messages sent/received per platform
2. Platform availability/uptime
3. Message delivery success rate
4. Platform-specific errors
5. Feature usage by platform

## Future Enhancements

1. **Platform Auto-Detection**: Automatically detect which platform a user prefers
2. **Cross-Platform Sync**: Sync conversations across platforms
3. **Platform Bridges**: Allow users on different platforms to communicate
4. **AI Platform Selection**: Use AI to choose the best platform for each message
5. **Platform Analytics**: Detailed analytics per platform