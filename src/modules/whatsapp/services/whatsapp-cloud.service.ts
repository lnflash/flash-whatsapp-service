import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface CloudWebhookMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'order';
          image?: {
            caption?: string;
            id: string;
            mime_type: string;
          };
          interactive?: {
            type: string;
            button_reply?: {
              id: string;
              title: string;
            };
            list_reply?: {
              id: string;
              title: string;
            };
          };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{
            code: number;
            title: string;
          }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

@Injectable()
export class WhatsAppCloudService {
  private readonly logger = new Logger(WhatsAppCloudService.name);
  private readonly apiVersion = 'v18.0';
  private readonly baseUrl = 'https://graph.facebook.com';
  private axiosInstance: AxiosInstance;
  
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly verifyToken: string;
  private readonly appSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.phoneNumberId = this.configService.get<string>('whatsappCloud.phoneNumberId') || '';
    this.accessToken = this.configService.get<string>('whatsappCloud.accessToken') || '';
    this.verifyToken = this.configService.get<string>('whatsappCloud.verifyToken') || '';
    this.appSecret = this.configService.get<string>('whatsappCloud.appSecret') || '';

    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.error('WhatsApp Cloud API configuration is incomplete');
    }

    this.axiosInstance = axios.create({
      baseURL: `${this.baseUrl}/${this.apiVersion}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      error => {
        this.logger.error('WhatsApp Cloud API error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  /**
   * Verify webhook signature from Meta
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.appSecret) {
      this.logger.warn('App secret not configured, skipping signature verification');
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(`sha256=${expectedSignature}`)
    );
  }

  /**
   * Handle webhook verification challenge from Meta
   */
  handleVerificationChallenge(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }
    
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
  }

  /**
   * Send a text message
   */
  async sendTextMessage(to: string, message: string): Promise<any> {
    try {
      const response = await this.axiosInstance.post(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        }
      );

      this.logger.log(`Message sent successfully to ${to}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data?.error?.message || 'Failed to send message',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Send an interactive message with buttons
   */
  async sendInteractiveMessage(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<any> {
    try {
      const response = await this.axiosInstance.post(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: body,
            },
            action: {
              buttons: buttons.map(button => ({
                type: 'reply',
                reply: {
                  id: button.id,
                  title: button.title,
                },
              })),
            },
          },
        }
      );

      this.logger.log(`Interactive message sent successfully to ${to}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send interactive message to ${to}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data?.error?.message || 'Failed to send interactive message',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Send a template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en',
    components?: any[]
  ): Promise<any> {
    try {
      const response = await this.axiosInstance.post(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode,
            },
            components: components,
          },
        }
      );

      this.logger.log(`Template message sent successfully to ${to}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send template message to ${to}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data?.error?.message || 'Failed to send template message',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Mark a message as read
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    try {
      await this.axiosInstance.post(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }
      );

      this.logger.debug(`Message ${messageId} marked as read`);
    } catch (error) {
      this.logger.error(`Failed to mark message as read:`, error.response?.data || error.message);
      // Don't throw error for read receipts
    }
  }

  /**
   * Get media URL
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    try {
      const response = await this.axiosInstance.get(`/${mediaId}`);
      return response.data.url;
    } catch (error) {
      this.logger.error(`Failed to get media URL:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data?.error?.message || 'Failed to get media',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Download media
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    try {
      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        responseType: 'arraybuffer',
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(`Failed to download media:`, error.message);
      throw new HttpException('Failed to download media', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Upload media
   */
  async uploadMedia(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('file', blob);
      formData.append('messaging_product', 'whatsapp');

      const response = await this.axiosInstance.post(
        `/${this.phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      return response.data.id;
    } catch (error) {
      this.logger.error(`Failed to upload media:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data?.error?.message || 'Failed to upload media',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Parse incoming webhook message
   */
  parseWebhookMessage(body: CloudWebhookMessage): {
    messageId?: string;
    from?: string;
    text?: string;
    type?: string;
    timestamp?: string;
    name?: string;
  } | null {
    if (body.object !== 'whatsapp_business_account') {
      return null;
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    
    if (change?.field !== 'messages') {
      return null;
    }

    const message = change.value.messages?.[0];
    const contact = change.value.contacts?.[0];

    if (!message) {
      return null;
    }

    return {
      messageId: message.id,
      from: message.from,
      text: message.text?.body,
      type: message.type,
      timestamp: message.timestamp,
      name: contact?.profile?.name,
    };
  }

  /**
   * Check if service is properly configured
   */
  isConfigured(): boolean {
    return !!(this.phoneNumberId && this.accessToken && this.verifyToken);
  }
}