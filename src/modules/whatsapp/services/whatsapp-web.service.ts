import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { WhatsappService } from './whatsapp.service';

@Injectable()
export class WhatsAppWebService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppWebService.name);
  private client: Client;
  private isReady = false;
  private processedMessages = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
  ) {
    // Initialize WhatsApp Web client with persistent session
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './whatsapp-sessions',
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      },
      // Increase timeout for slower systems
      authTimeoutMs: 60000,
    });

    this.setupEventHandlers();
  }

  async onModuleInit() {
    try {
      this.logger.log('Initializing WhatsApp Web client...');
      await this.client.initialize();
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp Web client:', error);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.client) {
        await this.client.destroy();
        this.logger.log('WhatsApp Web client destroyed');
      }
    } catch (error) {
      this.logger.error('Error destroying WhatsApp Web client:', error);
    }
  }

  private setupEventHandlers() {
    // QR Code generation for authentication
    this.client.on('qr', (qr) => {
      this.logger.log('QR Code received, scan with WhatsApp:');
      qrcode.generate(qr, { small: true });

      // Also log the QR string for alternative display methods
      this.logger.log(`QR String: ${qr}`);
    });

    // Authentication success
    this.client.on('authenticated', () => {
      this.logger.log('WhatsApp Web authenticated successfully');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      this.logger.error('WhatsApp Web authentication failed:', msg);
    });

    // Client ready
    this.client.on('ready', () => {
      this.logger.log('WhatsApp Web client is ready!');
      this.isReady = true;

      // Log the connected phone number
      const info = this.client.info;
      this.logger.log(`Connected as: ${info.pushname} (${info.wid.user})`);
    });

    // Disconnection
    this.client.on('disconnected', (reason) => {
      this.logger.warn('WhatsApp Web client disconnected:', reason);
      this.isReady = false;

      // Attempt to reinitialize after disconnection
      setTimeout(() => {
        this.logger.log('Attempting to reconnect...');
        this.client.initialize().catch((err) => {
          this.logger.error('Reconnection failed:', err);
        });
      }, 5000);
    });

    // Message handling
    this.client.on('message', async (msg: Message) => {
      try {
        // Ignore group messages and status updates
        if (!msg.from.endsWith('@c.us')) {
          return;
        }

        // Ignore messages from self
        if (msg.fromMe) {
          return;
        }

        // Ignore empty messages
        if (!msg.body || msg.body.trim() === '') {
          this.logger.debug(`Ignoring empty message from ${msg.from}`);
          return;
        }

        // Check if we've already processed this message
        const messageKey = `${msg.id._serialized}`;
        if (this.processedMessages.has(messageKey)) {
          this.logger.debug(`Skipping duplicate message: ${messageKey}`);
          return;
        }

        // Mark message as processed
        this.processedMessages.add(messageKey);

        // Clean up old message IDs after 5 minutes
        setTimeout(
          () => {
            this.processedMessages.delete(messageKey);
          },
          5 * 60 * 1000,
        );

        this.logger.log(`Received message from ${msg.from}: "${msg.body}"`);

        // Process the message using our existing WhatsApp service
        const response = await this.whatsappService.processCloudMessage({
          from: msg.from.replace('@c.us', ''),
          text: msg.body,
          messageId: msg.id._serialized,
          timestamp: msg.timestamp.toString(),
          name: (await msg.getContact()).pushname,
        });

        // Send response if we have one
        if (response) {
          // Check if response is an object with text and media
          if (typeof response === 'object' && 'text' in response && 'media' in response) {
            // Send image with caption
            if (response.media) {
              await this.sendImage(msg.from, response.media, response.text);
            } else {
              // Just send text if no media
              await this.sendMessage(msg.from, response.text);
            }
          } else if (typeof response === 'string') {
            // Simple text response
            await this.sendMessage(msg.from, response);
          }

          // Mark message as read
          await msg.getChat().then((chat) => chat.sendSeen());
        }
      } catch (error) {
        this.logger.error('Error processing message:', error);

        // Send error message to user
        try {
          await this.sendMessage(
            msg.from,
            "I'm sorry, I encountered an error processing your message. Please try again.",
          );
        } catch (sendError) {
          this.logger.error('Failed to send error message:', sendError);
        }
      }
    });

    // Message acknowledgment updates
    this.client.on('message_ack', (msg, ack) => {
      /*
        ACK VALUES:
        -1 = Error
         0 = Pending
         1 = Sent
         2 = Received
         3 = Read
         4 = Played
      */
      if (ack === -1) {
        this.logger.error(`Message ${msg.id._serialized} failed to send`);
      }
    });

    // Handle incoming calls (reject them)
    this.client.on('call', async (call) => {
      this.logger.log(`Incoming ${call.isVideo ? 'video' : 'audio'} call from ${call.from}`);
      await call.reject();

      // Send a message explaining we don't support calls
      if (call.from) {
        await this.sendMessage(
          call.from,
          "Sorry, I'm a text-based assistant and cannot handle voice or video calls. Please send me a text message instead!",
        );
      }
    });

    // Loading screen
    this.client.on('loading_screen', (percent, message) => {
      this.logger.log(`Loading: ${percent}% - ${message}`);
    });

    // State changes
    this.client.on('change_state', (state) => {
      this.logger.log(`State changed to: ${state}`);
    });
  }

  /**
   * Send a text message
   */
  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp Web client is not ready');
    }

    try {
      // Ensure the number has @c.us suffix
      const chatId = to.includes('@') ? to : `${to}@c.us`;

      await this.client.sendMessage(chatId, message);
      this.logger.log(`Message sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send a message with buttons (not supported in whatsapp-web.js)
   * Fallback to regular text message with options
   */
  async sendInteractiveMessage(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<void> {
    // whatsapp-web.js doesn't support buttons, so we create a text-based menu
    const buttonText = buttons.map((btn, index) => `${index + 1}. ${btn.title}`).join('\n');

    const fullMessage = `${body}\n\nPlease reply with the number of your choice:\n${buttonText}`;

    await this.sendMessage(to, fullMessage);
  }

  /**
   * Send an image with optional caption
   */
  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp Web client is not ready');
    }

    try {
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');

      // Ensure the number has @c.us suffix
      const chatId = to.includes('@') ? to : `${to}@c.us`;

      // Create media from buffer
      const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'qrcode.png');

      // Send the image with optional caption
      await this.client.sendMessage(chatId, media, { caption });
      this.logger.log(`Image sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send image to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Get QR code for authentication
   */
  async getQRCode(): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.isReady) {
        resolve(null);
        return;
      }

      const qrHandler = (qr: string) => {
        this.client.off('qr', qrHandler);
        resolve(qr);
      };

      const readyHandler = () => {
        this.client.off('ready', readyHandler);
        this.client.off('qr', qrHandler);
        resolve(null);
      };

      this.client.on('qr', qrHandler);
      this.client.on('ready', readyHandler);

      // Timeout after 30 seconds
      setTimeout(() => {
        this.client.off('qr', qrHandler);
        this.client.off('ready', readyHandler);
        resolve(null);
      }, 30000);
    });
  }

  /**
   * Check if the client is ready and authenticated
   */
  isClientReady(): boolean {
    return this.isReady;
  }

  /**
   * Get client info
   */
  getClientInfo(): any {
    if (!this.isReady) {
      return null;
    }
    return this.client.info;
  }

  /**
   * Logout from WhatsApp Web
   */
  async logout(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.isReady = false;
      this.logger.log('Logged out from WhatsApp Web');
    }
  }
}
