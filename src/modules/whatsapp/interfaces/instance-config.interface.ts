export interface InstanceConfiguration {
  phoneNumber: string;
  enabled: boolean;
  description?: string;
  sessionPath?: string;
  webhookUrl?: string; // Optional webhook for instance-specific events
  settings?: {
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectInterval?: number; // in seconds
  };
}

export interface InstanceMessage {
  instancePhone: string;
  message: any; // WhatsApp Web.js message object
  timestamp: Date;
}

export interface InstanceEvent {
  type: 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'message' | 'error';
  instancePhone: string;
  data: any;
  timestamp: Date;
}
