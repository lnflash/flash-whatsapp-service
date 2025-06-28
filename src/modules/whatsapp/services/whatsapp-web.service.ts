import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { WhatsappService } from './whatsapp.service';
import { QrCodeService } from './qr-code.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class WhatsAppWebService
  implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(WhatsAppWebService.name);
  private client: Client;
  private isReady = false;
  private processedMessages = new Set<string>();
  private reconnectingAdminNumber: string | null = null;
  private serverStartTime = new Date();
  private startupGracePeriod = 5000; // 5 seconds grace period
  private isInGracePeriod = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
    private readonly qrCodeService: QrCodeService,
    private readonly redisService: RedisService,
  ) {
    this.logger.log('WhatsAppWebService constructor called');
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
      this.logger.log('Session path: ./whatsapp-sessions');
      this.logger.log(`Server start time: ${this.serverStartTime.toISOString()}`);

      // Set grace period to ignore messages during startup
      setTimeout(() => {
        this.isInGracePeriod = false;
        this.logger.log('Startup grace period ended, now accepting messages');
      }, this.startupGracePeriod);

      // Check if session exists
      const fs = require('fs');
      if (fs.existsSync('./whatsapp-sessions/session')) {
        this.logger.log('Existing session found, attempting to restore...');
      } else {
        this.logger.log('No existing session found, will need QR code scan');
      }

      await this.client.initialize();
      this.logger.log('WhatsApp client initialize() called successfully');
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp Web client:', error);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Module destroy called, cleaning up WhatsApp client...');
    await this.cleanup();
  }

  async beforeApplicationShutdown(signal?: string) {
    this.logger.log(`Application shutdown signal received: ${signal}`);
    await this.cleanup();
  }

  private async cleanup() {
    try {
      if (this.client) {
        this.isReady = false;
        // Remove all listeners to prevent memory leaks
        this.client.removeAllListeners();
        await this.client.destroy();
        this.logger.log('WhatsApp Web client destroyed successfully');
      }
    } catch (error) {
      this.logger.error('Error destroying WhatsApp Web client:', error);
    }
  }

  private setupEventHandlers() {
    this.logger.log(`Setting up event handlers on client...`);

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
    this.client.on('ready', async () => {
      this.logger.log('🟢 WhatsApp Web client is ready!');
      this.isReady = true;

      // Log the connected phone number
      const info = this.client.info;
      this.logger.log(`✅ Connected as: ${info.pushname} (${info.wid.user})`);
      this.logger.log('✅ Bot is now ready to receive messages');
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
        // Log ALL available properties on the message object
        this.logger.debug('=== INCOMING MESSAGE DEBUG ===');
        this.logger.debug(`Client ready state: ${this.isReady}`);
        this.logger.debug(`Message type: ${msg.type}`);
        this.logger.debug(`From: ${msg.from}`);
        this.logger.debug(`Body: ${msg.body}`);
        this.logger.debug(`Has vCards: ${!!msg.vCards}`);
        this.logger.debug(`vCards count: ${msg.vCards?.length || 0}`);
        this.logger.debug(`Message timestamp: ${msg.timestamp}`);

        // Ignore messages during startup grace period
        if (this.isInGracePeriod) {
          this.logger.debug('Ignoring message during startup grace period');
          return;
        }

        // Ignore messages from before server startup
        if (msg.timestamp && msg.timestamp * 1000 < this.serverStartTime.getTime()) {
          this.logger.debug(
            `Ignoring old message from before server startup: ${msg.id._serialized} (${new Date(msg.timestamp * 1000).toISOString()})`,
          );
          return;
        }

        // Ignore group messages and status updates
        if (!msg.from.endsWith('@c.us')) {
          return;
        }

        // Check if client is ready
        if (!this.isReady) {
          this.logger.warn('Received message but client is not ready yet');
          return;
        }

        // Ignore messages from self
        if (msg.fromMe) {
          this.logger.debug('Ignoring message from self');
          return;
        }

        // Ignore empty messages (unless it's a vCard)
        if ((!msg.body || msg.body.trim() === '') && msg.type !== 'vcard') {
          this.logger.debug(`Ignoring empty message from ${msg.from}`);
          return;
        }

        // Check if we've already processed this message (persistent check)
        const messageKey = `${msg.id._serialized}`;
        const processedKey = `processed_msg:${messageKey}`;
        const isProcessed = await this.redisService.get(processedKey);

        if (isProcessed || this.processedMessages.has(messageKey)) {
          this.logger.debug(`Skipping duplicate message: ${messageKey}`);
          return;
        }

        // Mark message as processed (both in memory and Redis)
        this.processedMessages.add(messageKey);
        await this.redisService.set(processedKey, '1', 86400); // 24 hour TTL

        // Clean up old message IDs after 5 minutes
        setTimeout(
          () => {
            this.processedMessages.delete(messageKey);
          },
          5 * 60 * 1000,
        );

        // Enhanced logging to capture all message types
        this.logger.log(`📨 Received message from ${msg.from}: "${msg.body}"`);
        this.logger.debug(`Message type: ${msg.type}`);
        this.logger.debug(`Has media: ${msg.hasMedia}`);
        this.logger.debug(`Message data keys: ${Object.keys(msg).join(', ')}`);

        // Check for vCard (contact sharing)
        if (msg.type === 'vcard' || msg.vCards?.length > 0) {
          this.logger.log('📇 CONTACT VCARD RECEIVED!');
          this.logger.log(`vCards count: ${msg.vCards?.length || 0}`);

          if (msg.vCards && msg.vCards.length > 0) {
            msg.vCards.forEach((vcard, index) => {
              this.logger.log(`\n=== vCard ${index + 1} ===`);
              this.logger.log(`Raw vCard data:\n${vcard}`);

              // Parse vCard data
              const lines = vcard.split('\n');
              const contactInfo: any = {};

              lines.forEach((line) => {
                if (line.startsWith('FN:')) {
                  contactInfo.fullName = line.substring(3);
                } else if (line.startsWith('N:')) {
                  contactInfo.name = line.substring(2);
                } else if (line.startsWith('TEL')) {
                  const phoneMatch = line.match(/TEL[^:]*:(.+)/);
                  if (phoneMatch) {
                    if (!contactInfo.phones) contactInfo.phones = [];
                    contactInfo.phones.push(phoneMatch[1]);
                  }
                } else if (line.startsWith('EMAIL')) {
                  const emailMatch = line.match(/EMAIL[^:]*:(.+)/);
                  if (emailMatch) {
                    contactInfo.email = emailMatch[1];
                  }
                }
              });

              this.logger.log(`Parsed contact info: ${JSON.stringify(contactInfo, null, 2)}`);
            });
          }

          // Process the shared contact
          if (msg.vCards && msg.vCards.length > 0) {
            const vcard = msg.vCards[0]; // Process first contact
            const lines = vcard.split('\n');
            let fullName = '';
            let phoneNumber = '';

            lines.forEach((line) => {
              if (line.startsWith('FN:')) {
                fullName = line.substring(3).trim();
              } else if (line.startsWith('TEL')) {
                const phoneMatch = line.match(/TEL[^:]*:(.+)/);
                if (phoneMatch) {
                  phoneNumber = phoneMatch[1].trim();
                }
              }
            });

            if (fullName && phoneNumber) {
              // Check if there's a pending request for this contact
              const pendingResponse = await this.whatsappService.checkAndProcessPendingRequest(
                msg.from.replace('@c.us', ''),
                fullName,
                phoneNumber,
              );

              if (pendingResponse) {
                // There was a pending request, it's been processed
                if (typeof pendingResponse === 'string') {
                  await this.sendMessage(msg.from, pendingResponse);
                } else if (typeof pendingResponse === 'object' && 'text' in pendingResponse) {
                  if (pendingResponse.media) {
                    await this.sendImage(msg.from, pendingResponse.media, pendingResponse.text);
                  } else {
                    await this.sendMessage(msg.from, pendingResponse.text);
                  }
                }
              } else {
                // No pending request, just save the contact
                const response = await this.whatsappService.processCloudMessage({
                  from: msg.from.replace('@c.us', ''),
                  text: `contacts add ${fullName.replace(/\s+/g, '_')} ${phoneNumber}`,
                  messageId: msg.id._serialized,
                  timestamp: msg.timestamp.toString(),
                  name: (await msg.getContact()).pushname,
                });

                if (response) {
                  // Send the response
                  if (typeof response === 'string') {
                    await this.sendMessage(msg.from, response);
                  } else if (typeof response === 'object' && 'text' in response) {
                    if (response.media) {
                      await this.sendImage(msg.from, response.media, response.text);
                    } else {
                      await this.sendMessage(msg.from, response.text);
                    }
                  }
                }
              }
            } else {
              await this.sendMessage(
                msg.from,
                '❌ Unable to save contact. Missing name or phone number.',
              );
            }
          }
          return;
        }

        // Log other message types for debugging
        if (msg.type !== 'chat') {
          this.logger.log(`Non-chat message type received: ${msg.type}`);
          this.logger.debug(`Full message object: ${JSON.stringify(msg, null, 2)}`);
        }

        // Process regular text messages
        const response = await this.whatsappService.processCloudMessage({
          from: msg.from.replace('@c.us', ''),
          text: msg.body,
          messageId: msg.id._serialized,
          timestamp: msg.timestamp.toString(),
          name: (await msg.getContact()).pushname,
        });

        // Send response if we have one
        if (response) {
          this.logger.debug(
            `Response type: ${typeof response}, has text: ${typeof response === 'object' && 'text' in response}, has media: ${typeof response === 'object' && 'media' in response}`,
          );

          // Check if response is an object with text property
          if (typeof response === 'object' && 'text' in response) {
            // Send image with caption if media is present
            if (response.media) {
              await this.sendImage(msg.from, response.media, response.text);
            } else {
              // Just send text if no media
              await this.sendMessage(msg.from, response.text);
            }
          } else if (typeof response === 'string') {
            // Simple text response
            await this.sendMessage(msg.from, response);
          } else {
            this.logger.warn(`Unexpected response format: ${JSON.stringify(response)}`);
          }

          // Mark message as read
          await msg.getChat().then((chat) => chat.sendSeen());
        } else {
          this.logger.warn('No response generated for message');
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
   * Disconnect the current WhatsApp session
   */
  async disconnect(logout: boolean = true): Promise<void> {
    try {
      this.logger.log('Disconnecting WhatsApp session...');

      if (this.client) {
        this.isReady = false;
        if (logout) {
          await this.client.logout();
          this.logger.log('WhatsApp session logged out successfully');
        } else {
          // Just mark as not ready without logging out
          this.logger.log('WhatsApp session disconnected (session preserved)');
        }
      }
    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp session:', error);
      throw error;
    }
  }

  /**
   * Clear the session data and prepare for reconnection
   */
  async clearSession(): Promise<void> {
    try {
      this.logger.log('Clearing WhatsApp session data...');

      // First disconnect if connected (with logout to clear session)
      if (this.isReady) {
        await this.disconnect(true);
      }

      // Clear the session directory
      const fs = require('fs').promises;
      const path = require('path');
      const sessionPath = path.join(process.cwd(), 'whatsapp-sessions');

      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        this.logger.log('Session data cleared successfully');
      } catch (err) {
        this.logger.warn('Session directory may not exist:', err);
      }

      // Destroy and recreate the client
      await this.cleanup();

      // Reinitialize with fresh client
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
        authTimeoutMs: 60000,
      });

      this.setupEventHandlers();
      this.logger.log('WhatsApp client recreated, ready for new connection');
    } catch (error) {
      this.logger.error('Error clearing session:', error);
      throw error;
    }
  }

  /**
   * Reconnect with a new number (requires QR scan)
   */
  async reconnect(): Promise<void> {
    try {
      this.logger.log('Initiating WhatsApp reconnection...');

      // Clear existing session first
      await this.clearSession();

      // Initialize the client to generate new QR
      await this.client.initialize();
      this.logger.log('WhatsApp client initialized, scan QR code to connect new number');
    } catch (error) {
      this.logger.error('Error reconnecting WhatsApp:', error);
      throw error;
    }
  }

  /**
   * Prepare for reconnection (sends message before disconnecting)
   */
  async prepareReconnect(whatsappId: string): Promise<void> {
    try {
      // Store admin number for welcome message after reconnection
      this.reconnectingAdminNumber = whatsappId.replace('@c.us', '');

      const reconnectMessage = `🔄 *WhatsApp Reconnection Initiated*\n\n1. I'll generate and send you the QR code\n2. Open WhatsApp on your NEW phone/number\n3. Go to Settings → Linked Devices\n4. Tap "Link a Device"\n5. Scan the QR code I send you\n\n⚠️ *IMPORTANT REMINDER:*\nAfter connecting the new number, I'll send a welcome message to confirm the connection.\n\n⏱️ Generating QR code now...`;

      // Send message if client is ready
      if (this.isReady) {
        await this.sendMessage(whatsappId, reconnectMessage);
        // Wait to ensure message is sent
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Store the current client for sending QR
      const oldClient = this.client;
      const wasReady = this.isReady;

      // Create a new client WITHOUT destroying the old one yet
      const newClient = new Client({
        authStrategy: new LocalAuth({
          dataPath: './whatsapp-sessions-new', // Temporary new session path
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
        authTimeoutMs: 60000,
      });

      // Set up QR handler on new client
      let qrCodeSent = false;
      const qrHandler = async (qr: string) => {
        if (!qrCodeSent && wasReady && oldClient) {
          qrCodeSent = true;
          try {
            // Generate QR code image
            const qrCodeBuffer = await this.qrCodeService.generateQrCode(qr);

            // Send via old client which is still connected
            const { MessageMedia } = await import('whatsapp-web.js');
            const chatId = whatsappId.includes('@') ? whatsappId : `${whatsappId}@c.us`;
            const media = new MessageMedia(
              'image/png',
              qrCodeBuffer.toString('base64'),
              'qrcode.png',
            );
            await oldClient.sendMessage(chatId, media, {
              caption:
                '📱 Scan this QR code with WhatsApp on your NEW device\n\n⏱️ This code expires in 60 seconds!\n\n🔌 I will disconnect the old session once you scan this.',
            });
            this.logger.log('QR code sent to admin via existing connection');

            // Give time for the QR to be sent before we start cleanup
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (error) {
            this.logger.error('Failed to send QR code:', error);
          }
        }
      };

      // Store reference to this service for use in handlers
      const whatsappWebService = this;

      // Set up ready handler to switch clients
      const readyHandler = async () => {
        this.logger.log('New client is ready, switching over...');

        // Get the new client info for welcome message
        const info = newClient.info;
        this.logger.log(`✅ New connection established as: ${info.pushname} (${info.wid.user})`);

        // Switch to the new client FIRST before sending messages
        whatsappWebService.client = newClient;
        whatsappWebService.isReady = true;

        // Wait for client to stabilize after switching
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Send welcome message using the service method (not direct client)
        if (whatsappWebService.reconnectingAdminNumber) {
          try {
            const welcomeMessage = `🎉 *Reconnection Successful!*\n\n✅ Bot is now connected to the new number: ${info.wid.user}\n✅ Bot name: ${info.pushname || 'Pulse'}\n\n📱 *Important Reminders:*\n• The old number is no longer connected\n• All messages should now be sent to this new number\n• Your admin privileges have been maintained\n\nType \`admin status\` to verify the connection.`;

            await whatsappWebService.sendMessage(
              whatsappWebService.reconnectingAdminNumber,
              welcomeMessage,
            );
            this.logger.log(
              `Welcome message sent to admin: ${whatsappWebService.reconnectingAdminNumber}`,
            );

            // Clear the admin number after sending
            whatsappWebService.reconnectingAdminNumber = null;
          } catch (error) {
            this.logger.error('Failed to send welcome message to admin:', error);
          }
        }

        // Clean up the old client AFTER everything is working
        if (oldClient) {
          // Delay cleanup to ensure smooth transition
          setTimeout(async () => {
            try {
              oldClient.removeAllListeners();
              await oldClient.destroy();
              this.logger.log('Old client destroyed');
            } catch (error) {
              this.logger.error('Error destroying old client:', error);
            }
          }, 5000);
        }

        // Remove old session directory and rename new one
        const fs = require('fs').promises;
        const path = require('path');
        try {
          await fs.rm(path.join(process.cwd(), 'whatsapp-sessions'), {
            recursive: true,
            force: true,
          });
          await fs.rename(
            path.join(process.cwd(), 'whatsapp-sessions-new'),
            path.join(process.cwd(), 'whatsapp-sessions'),
          );
          this.logger.log('Session directories switched');
        } catch (error) {
          this.logger.error('Error switching session directories:', error);
        }

        // Clean up temporary handlers first
        newClient.off('qr', qrHandler);
        newClient.off('ready', readyHandler);

        // Re-setup all event handlers on the new client BEFORE we start using it
        whatsappWebService.setupEventHandlers();

        // Test the new client by getting its state
        try {
          const state = await newClient.getState();
          this.logger.log(
            `✅ Client switch complete, bot is ready to receive messages. State: ${state}`,
          );
        } catch (error) {
          this.logger.error('Error checking client state:', error);
          this.logger.log('✅ Client switch complete, bot is ready to receive messages');
        }
      };

      newClient.on('qr', qrHandler);
      newClient.on('ready', readyHandler);

      // Initialize the new client
      await newClient.initialize();
      this.logger.log('New WhatsApp client initialized, waiting for QR scan...');

      // Clean up handlers after timeout
      setTimeout(() => {
        newClient.off('qr', qrHandler);
        newClient.off('ready', readyHandler);
      }, 65000);
    } catch (error) {
      this.logger.error('Error preparing reconnection:', error);
      throw error;
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): { connected: boolean; number?: string; name?: string } {
    if (!this.isReady || !this.client) {
      return { connected: false };
    }

    try {
      const info = this.client.info;
      return {
        connected: true,
        number: info?.wid?.user || 'Unknown',
        name: info?.pushname || 'Unknown',
      };
    } catch (error) {
      return { connected: false };
    }
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

      // Check if client is properly initialized
      if (!this.client) {
        throw new Error('WhatsApp client is not initialized');
      }

      await this.client.sendMessage(chatId, message);
      this.logger.log(`Message sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}:`, error);
      // Log more details about the error
      if (error.message && error.message.includes('Evaluation failed')) {
        this.logger.error(
          'This appears to be a puppeteer context error. The client may need reinitialization.',
        );
      }
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
      try {
        await this.client.logout();
        this.isReady = false;
        this.logger.log('Logged out from WhatsApp Web');
      } catch (error) {
        this.logger.error('Error during logout:', error);
        // Force cleanup if logout fails
        await this.cleanup();
      }
    }
  }
}
