export interface MessageDto {
  to: string;
  from?: string;
  text?: string;
  type?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'sticker';
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  metadata?: Record<string, any>;
  timestamp?: Date;
  messageId?: string;
  replyTo?: string;
  mentions?: string[];
}