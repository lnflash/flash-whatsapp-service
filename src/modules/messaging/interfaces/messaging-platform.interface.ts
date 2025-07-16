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

export interface MessageFormatting {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  codeBlock?: boolean;
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

export interface MessageResult {
  success: boolean;
  messageId?: string;
  timestamp?: Date;
  error?: string;
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

export type EventHandler = (data: any) => void | Promise<void>;
