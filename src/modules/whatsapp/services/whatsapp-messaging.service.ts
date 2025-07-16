import { Injectable, Logger } from '@nestjs/common';
import {
  MessagingPlatform,
  ConnectionStatus,
  MessageContent,
  IncomingMessage,
  PlatformFeatures,
  MessagingEvent,
  EventHandler,
  MediaMessage,
  InteractiveMessage,
  MessageResult,
  MessageType,
} from '../../messaging/interfaces/messaging-platform.interface';
import { WhatsAppWebService } from './whatsapp-web.service';

@Injectable()
export class WhatsAppMessagingService implements MessagingPlatform {
  private readonly logger = new Logger(WhatsAppMessagingService.name);
  private eventHandlers = new Map<MessagingEvent, Set<EventHandler>>();

  constructor(private readonly whatsappWebService: WhatsAppWebService) {
    this.setupEventForwarding();
  }

  async connect(): Promise<void> {
    // WhatsApp Web service initializes automatically on module init
    // Just check if it's ready
    if (!this.whatsappWebService.isClientReady()) {
      throw new Error('WhatsApp Web service is not ready');
    }
  }

  async disconnect(): Promise<void> {
    await this.whatsappWebService.disconnect();
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.whatsappWebService.isClientReady(),
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
      if (!media.url && !media.data) {
        throw new Error('Media must have either url or data');
      }
      
      const result = await this.whatsappWebService.sendMedia(
        whatsappNumber,
        media.url || media.data!,
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

  async sendInteractive(to: string, interactive: InteractiveMessage): Promise<MessageResult> {
    // WhatsApp Web.js doesn't support interactive messages natively
    // Fall back to text message
    return this.sendMessage(to, { text: interactive.body });
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

  on(event: MessagingEvent, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: MessagingEvent, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private formatPhoneNumber(number: string): string {
    // WhatsApp specific formatting
    // If already formatted, return as is
    if (number.includes('@')) {
      return number;
    }
    // Remove all non-digits and add WhatsApp suffix
    return number.replace(/\D/g, '') + '@c.us';
  }

  private mapMessageType(whatsappType: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      chat: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      ptt: MessageType.AUDIO,
      audio: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
      location: MessageType.LOCATION,
      vcard: MessageType.CONTACT,
      sticker: MessageType.STICKER,
    };

    return typeMap[whatsappType] || MessageType.TEXT;
  }

  private setupEventForwarding() {
    // Forward WhatsApp events to generic events
    this.whatsappWebService.on('ready', () => {
      this.emit(MessagingEvent.CONNECTED, {});
    });

    this.whatsappWebService.on('message', (msg: any) => {
      const parsed = this.parseIncomingMessage(msg);
      this.emit(MessagingEvent.MESSAGE_RECEIVED, parsed);
    });

    this.whatsappWebService.on('qr', (qr: string) => {
      this.emit(MessagingEvent.QR_CODE, { qr });
    });

    this.whatsappWebService.on('disconnected', (reason: any) => {
      this.emit(MessagingEvent.DISCONNECTED, { reason });
    });
  }

  private emit(event: MessagingEvent, data: any): void {
    this.eventHandlers.get(event)?.forEach((handler) => {
      Promise.resolve(handler(data)).catch((error) => {
        this.logger.error(`Error in event handler for ${event}:`, error);
      });
    });
  }
}
