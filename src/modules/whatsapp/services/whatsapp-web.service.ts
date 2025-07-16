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
import { SupportModeService } from './support-mode.service';
import { SpeechService } from '../../speech/speech.service';
import { SessionService } from '../../auth/services/session.service';
import { ChromeCleanupUtil } from '../../../common/utils/chrome-cleanup.util';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as dns from 'dns/promises';

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
  private lastConnectedTime: Date | undefined;
  private eventEmitter = new EventTarget();

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
    private readonly qrCodeService: QrCodeService,
    private readonly redisService: RedisService,
    private readonly supportModeService: SupportModeService,
    private readonly speechService: SpeechService,
    private readonly sessionService: SessionService,
  ) {
    // Initialize WhatsApp Web client with persistent session
    const puppeteerConfig: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
      // Increase browser launch timeout
      timeout: 60000,
      // Don't use the default viewport
      defaultViewport: null,
    };

    // Use system Chrome if available
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    if (executablePath && require('fs').existsSync(executablePath)) {
      puppeteerConfig.executablePath = executablePath;
      this.logger.log(`Using system Chrome at: ${executablePath}`);
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'pulse-bot',
        dataPath: './whatsapp-sessions',
      }),
      puppeteer: puppeteerConfig,
      // Increase timeout for slower systems
      authTimeoutMs: 60000,
    });

    this.setupEventHandlers();
  }

  async onModuleInit() {
    // Skip initialization in test environment
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_WHATSAPP_WEB === 'true') {
      this.logger.log('WhatsApp Web initialization skipped for testing');
      return;
    }

    try {
      // Set grace period to ignore messages during startup
      setTimeout(() => {
        this.isInGracePeriod = false;
      }, this.startupGracePeriod);

      // Clean up any stuck Chrome processes before initialization
      this.logger.log('Cleaning up any stuck Chrome processes...');
      await ChromeCleanupUtil.cleanup();

      // Check if session exists
      // Session check happens during client initialization

      this.logger.log('Initializing WhatsApp Web client...');
      await this.client.initialize();
      this.logger.log('WhatsApp Web client initialized successfully');

      // Wait a bit for page to stabilize
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp Web client:', error);
      this.logger.error('Stack trace:', error.stack);

      // Check for specific Puppeteer protocol errors
      if (
        error.message &&
        error.message.includes('Protocol error') &&
        error.message.includes('Target closed')
      ) {
        this.logger.error('Chrome browser crashed or failed to start properly.');
        this.logger.log(
          'This is often due to missing dependencies or resource constraints in Docker.',
        );

        // Try to clean up any stuck processes
        await ChromeCleanupUtil.cleanup();
      }

      // Check for specific network errors
      if (error.message && error.message.includes('ERR_ADDRESS_UNREACHABLE')) {
        this.logger.error(
          'Network connectivity issue detected. Please check your internet connection.',
        );
        this.logger.log('Attempting to resolve DNS for web.whatsapp.com...');

        // Try a simple DNS resolution test
        try {
          const addresses = await dns.resolve4('web.whatsapp.com');
          this.logger.log(`DNS resolution successful: ${addresses.join(', ')}`);
        } catch (dnsError) {
          this.logger.error('DNS resolution failed:', dnsError);
        }
      }

      // Retry initialization after a delay
      setTimeout(async () => {
        this.logger.log('Retrying WhatsApp Web client initialization...');
        try {
          await this.client.initialize();
          this.logger.log('WhatsApp Web client initialized successfully on retry');
        } catch (retryError) {
          this.logger.error('Failed to initialize WhatsApp Web client on retry:', retryError);

          // If it's still a protocol error, don't keep retrying
          if (retryError.message && retryError.message.includes('Protocol error')) {
            this.logger.error(
              'Chrome continues to crash. Please check Docker logs and system resources.',
            );
          }
        }
      }, 10000); // Retry after 10 seconds
    }
  }

  async onModuleDestroy() {
    await this.cleanup();
  }

  async beforeApplicationShutdown(_signal?: string) {
    await this.cleanup();
  }

  private async cleanup() {
    try {
      if (this.client) {
        this.isReady = false;
        // Remove all listeners to prevent memory leaks
        this.client.removeAllListeners();
        // Don't destroy the client on normal shutdown to preserve session
        // Only destroy when explicitly logging out
      }
    } catch (error) {
      this.logger.error('Error during WhatsApp Web client cleanup:', error);
    }
  }

  private setupEventHandlers() {
    // QR Code generation for authentication
    this.client.on('qr', (qr) => {
      this.logger.log('📱 QR Code generated - waiting for scan...');
      qrcode.generate(qr, { small: true });

      // Also log the QR string for alternative display methods
      this.logger.debug('QR code data available for alternative display');

      // Emit QR event for messaging abstraction
      this.emit('qr', qr);
    });

    // Authentication success
    this.client.on('authenticated', async () => {
      this.logger.log('✅ WhatsApp Web authenticated successfully');

      // In headless environments, sometimes the ready event doesn't fire immediately
      // Set a fallback timer, but give the normal ready event a chance first
      setTimeout(() => {
        if (!this.isReady) {
          this.logger.warn('⚠️ Ready event not fired after authentication, forcing ready state...');
          this.isReady = true;

          // Try to get client info
          try {
            const info = this.client.info;
            if (info) {
              this.logger.log(`📞 Connected phone: ${info.wid?.user || 'Unknown'}`);
              this.logger.log(`👤 Bot name: ${info.pushname || 'Unknown'}`);
            }
          } catch (e) {
            this.logger.debug('Client info not available yet');
          }

          this.logger.log('✅ WhatsApp Web client is READY (forced)!');
          this.logger.log('🎉 Bot is now accepting messages');
        }
      }, 10000); // Wait 10 seconds for normal ready event
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      this.logger.error('WhatsApp Web authentication failed:', msg);
    });

    // Client ready
    this.client.on('ready', async () => {
      this.isReady = true;
      this.lastConnectedTime = new Date();
      const info = this.client.info;

      this.logger.log('🚀 WhatsApp Web client is READY!');
      this.logger.log(`📞 Connected phone: ${info?.wid?.user || 'Unknown'}`);
      this.logger.log(`👤 Bot name: ${info?.pushname || 'Unknown'}`);
      this.logger.log('✅ Now accepting messages');

      // Log the actual state when ready fires
      try {
        const state = await this.client.getState();
        this.logger.log(`📊 Client state on ready: ${state}`);
      } catch (e) {
        this.logger.error('Could not get state on ready:', e.message);
      }

      // Emit ready event for messaging abstraction
      this.emit('ready', {});
    });

    // Remote session saved (might indicate successful connection)
    this.client.on('remote_session_saved', () => {
      this.logger.log('💾 Remote session saved successfully');
    });

    // Disconnection
    this.client.on('disconnected', (reason) => {
      this.logger.warn('WhatsApp Web client disconnected:', reason);
      this.isReady = false;

      // Emit disconnected event for messaging abstraction
      this.emit('disconnected', { reason });

      // Attempt to reinitialize after disconnection
      setTimeout(() => {
        this.client.initialize().catch((err) => {
          this.logger.error('Reconnection failed:', err);
        });
      }, 5000);
    });

    // Message handling
    this.client.on('message', async (msg: Message) => {
      this.logger.debug(`📥 Raw message received from ${msg.from}: "${msg.body}"`);

      // Emit message event for messaging abstraction
      this.emit('message', msg);

      let responseTarget: string = msg.from; // Default to sender

      try {
        // Ignore messages during startup grace period
        if (this.isInGracePeriod) {
          this.logger.debug('⏳ Ignoring message - still in grace period');
          return;
        }

        // Ignore messages from before server startup
        if (msg.timestamp && msg.timestamp * 1000 < this.serverStartTime.getTime()) {
          return;
        }

        // Ignore status updates but allow group messages
        if (!msg.from.endsWith('@c.us') && !msg.from.endsWith('@g.us')) {
          return;
        }

        // For group messages, we'll need to handle them differently
        const isGroupMessage = msg.from.endsWith('@g.us');

        // For group messages, only respond if mentioned or message starts with "!"
        if (isGroupMessage) {
          const botInfo = await this.client.info;
          const botId = botInfo.wid._serialized;
          const isMentioned = msg.mentionedIds?.some((id) => id === botId);
          const startsWithBang = msg.body.trim().startsWith('!');

          if (!isMentioned && !startsWithBang) {
            // Ignore group messages that don't mention us or start with !
            return;
          }

          // If message starts with !, remove the ! prefix
          if (startsWithBang) {
            msg.body = msg.body.trim().substring(1).trim();
          }
        }

        // Check if client is ready
        if (!this.isReady) {
          this.logger.warn('Received message but client is not ready yet');
          return;
        }

        // Ignore messages from self
        if (msg.fromMe) {
          return;
        }

        // Ignore empty messages (unless it's a vCard or audio)
        if ((!msg.body || msg.body.trim() === '') && msg.type !== 'vcard' && msg.type !== 'ptt') {
          return;
        }

        // Check if we've already processed this message (persistent check)
        const messageKey = `${msg.id._serialized}`;
        const processedKey = `processed_msg:${messageKey}`;
        const isProcessed = await this.redisService.get(processedKey);

        if (isProcessed || this.processedMessages.has(messageKey)) {
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

        // Check for vCard (contact sharing)
        if (msg.type === 'vcard' || msg.vCards?.length > 0) {
          if (msg.vCards && msg.vCards.length > 0) {
            msg.vCards.forEach((vcard) => {
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
                  if (pendingResponse.voice) {
                    await this.sendVoiceNote(msg.from, pendingResponse.voice);
                    await this.sendMessage(msg.from, pendingResponse.text);
                  } else if (pendingResponse.media) {
                    await this.sendImage(msg.from, pendingResponse.media, pendingResponse.text);
                  } else {
                    await this.sendMessage(msg.from, pendingResponse.text);
                  }
                }
              } else {
                // No pending request, just save the contact
                const response = await this.whatsappService.processCloudMessage({
                  from:
                    isGroupMessage && msg.author
                      ? msg.author.replace(/@c\.us|@lid|@s\.whatsapp\.net/g, '')
                      : msg.from.replace('@c.us', ''),
                  text: `contacts add ${fullName.replace(/\s+/g, '_')} ${phoneNumber}`,
                  messageId: msg.id._serialized,
                  timestamp: msg.timestamp.toString(),
                  name: (await msg.getContact()).pushname,
                  whatsappId: isGroupMessage && msg.author ? msg.author : msg.from,
                  isGroup: isGroupMessage,
                  groupId: isGroupMessage ? msg.from : undefined,
                });

                if (response) {
                  // Send the response
                  if (typeof response === 'string') {
                    await this.sendMessage(msg.from, response);
                  } else if (typeof response === 'object' && 'text' in response) {
                    if (response.voice) {
                      await this.sendVoiceNote(msg.from, response.voice);
                      await this.sendMessage(msg.from, response.text);
                    } else if (response.media) {
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

        // Handle voice messages (PTT - Push To Talk)
        if (msg.type === 'ptt') {
          // Check if speech service is available
          if (!this.speechService?.isAvailable()) {
            await this.sendMessage(
              msg.from,
              '🎤 Voice messages are not currently available. Please type your command instead.',
            );
            return;
          }

          try {
            // Download the audio
            const media = await msg.downloadMedia();
            if (!media) {
              this.logger.error('Failed to download voice message');
              await this.sendMessage(
                msg.from,
                '❌ Unable to process voice message. Please try typing your command.',
              );
              return;
            }

            // Convert base64 to buffer
            const audioBuffer = Buffer.from(media.data, 'base64');

            // Transcribe the audio
            const transcribedText = await this.speechService.speechToText(
              audioBuffer,
              media.mimetype,
            );

            if (!transcribedText) {
              await this.sendMessage(
                msg.from,
                "🎤 I couldn't understand that. Please speak clearly or type your command.",
              );
              return;
            }

            // Process the transcribed text as a regular message
            const response = await this.whatsappService.processCloudMessage({
              from:
                isGroupMessage && msg.author
                  ? msg.author.replace(/@c\.us|@lid|@s\.whatsapp\.net/g, '')
                  : msg.from.replace('@c.us', ''),
              text: transcribedText,
              messageId: msg.id._serialized,
              timestamp: msg.timestamp.toString(),
              name: (await msg.getContact()).pushname,
              isVoiceCommand: true, // Flag to indicate this came from voice
              whatsappId: isGroupMessage && msg.author ? msg.author : msg.from,
              isGroup: isGroupMessage,
              groupId: isGroupMessage ? msg.from : undefined,
            });

            // Send response
            if (response) {
              // Add a prefix to show this was transcribed
              const prefix = `🎤 *I heard: "${transcribedText}"*\n\n`;

              if (typeof response === 'object' && 'text' in response) {
                const textWithPrefix = prefix + response.text;

                if (response.voice) {
                  await this.sendVoiceNote(responseTarget, response.voice);
                  // Only send text if not in voice-only mode
                  if (response.text && response.text.trim() !== '') {
                    await this.sendMessage(responseTarget, textWithPrefix);
                  }
                } else if (response.media) {
                  await this.sendImage(responseTarget, response.media, textWithPrefix);
                } else {
                  await this.sendMessage(responseTarget, textWithPrefix);
                }
              } else if (typeof response === 'string') {
                await this.sendMessage(responseTarget, prefix + response);
              }
            }
          } catch (error) {
            this.logger.error('Error processing voice message:', error);
            await this.sendMessage(
              responseTarget,
              '❌ Error processing voice message. Please try typing your command.',
            );
          }
          return;
        }

        // Log other message types for debugging (placeholder)

        // Check if this is a message from support
        const supportPhone =
          this.configService.get<string>('SUPPORT_PHONE_NUMBER') || '18762909250';
        const fromNumber = msg.from.replace('@c.us', '');
        // Remove + prefix from support phone for comparison since env var doesn't have +
        const cleanSupportPhone = supportPhone.replace(/^\+/, '');

        if (fromNumber === cleanSupportPhone || fromNumber === supportPhone) {
          // This is a message from support, route it to the user
          const result = await this.supportModeService.routeMessage(msg.from, msg.body, true);
          if (!result.routed) {
            this.logger.warn('Support message could not be routed');
          }
          return;
        }

        // Log incoming message
        const contact = await msg.getContact();
        let phoneNumber: string;

        if (isGroupMessage) {
          // For group messages, extract sender from author field
          // Handle different ID formats (@c.us, @lid, etc)
          if (msg.author) {
            phoneNumber = msg.author.replace(/@c\.us|@lid|@s\.whatsapp\.net/g, '');
          } else {
            phoneNumber = 'unknown';
          }
          responseTarget = msg.from; // Send response back to the group
          this.logger.log(`📨 Group message from ${msg.author} in ${msg.from}: "${msg.body}"`);
        } else {
          // For direct messages
          phoneNumber = msg.from.replace('@c.us', '');
          responseTarget = msg.from; // Send response back to the individual
          this.logger.log(
            `📨 Incoming message from ${phoneNumber} (${contact.pushname || 'No name'}): "${msg.body}"`,
          );
        }

        // Process regular text messages
        let response = await this.whatsappService.processCloudMessage({
          from: phoneNumber,
          text: msg.body,
          messageId: msg.id._serialized,
          timestamp: msg.timestamp.toString(),
          name: contact.pushname,
          whatsappId: isGroupMessage && msg.author ? msg.author : msg.from,
          isGroup: isGroupMessage,
          groupId: isGroupMessage ? msg.from : undefined,
        });

        // Send response if we have one
        if (response) {
          // For group messages, check if this is a sensitive command that should be sent as DM
          const sensitiveCommands = [
            'link',
            'verify',
            'unlink',
            'balance',
            'history',
            'send',
            'receive',
            'pay',
          ];
          const commandMatch = msg.body
            .trim()
            .toLowerCase()
            .match(/^(\w+)/);
          const command = commandMatch ? commandMatch[1] : '';
          let shouldSendDM = isGroupMessage && sensitiveCommands.includes(command);

          if (shouldSendDM) {
            // Check if we can send DM to this user
            if (msg.author && msg.author.includes('@lid')) {
              // @lid format users can't receive DMs - respond in group with privacy warning
              this.logger.warn(
                `Cannot send DM to @lid format: ${msg.author}. Responding in group with privacy notice.`,
              );
              responseTarget = msg.from;

              // Add privacy notice to the response
              if (typeof response === 'string') {
                response = `⚠️ *Privacy Notice*: This response contains sensitive information. Consider using the bot in a private chat.\n\n${response}`;
              } else if (typeof response === 'object' && 'text' in response) {
                response.text = `⚠️ *Privacy Notice*: This response contains sensitive information. Consider using the bot in a private chat.\n\n${response.text}`;
              }
            } else {
              // Try to send as DM for regular users
              try {
                // First check if we have a session for this user
                const userSession = await this.sessionService.getSessionByWhatsappId(phoneNumber);

                if (userSession && userSession.whatsappId) {
                  // Use the session's WhatsApp ID
                  responseTarget = userSession.whatsappId.includes('@')
                    ? userSession.whatsappId
                    : userSession.whatsappId + '@c.us';
                } else {
                  // Construct standard WhatsApp DM address
                  responseTarget = phoneNumber + '@c.us';
                }

                this.logger.log(
                  `🔒 Sending private response to ${responseTarget} for sensitive command: ${command}`,
                );

                // Send a brief acknowledgment to the group
                const displayName = contact.pushname || phoneNumber;
                await this.sendMessage(
                  msg.from,
                  `✅ @${displayName} I've sent you a private message with the response.`,
                );
              } catch (error) {
                this.logger.error(`Error sending DM: ${error.message}`);
                // Fallback to group response with privacy notice
                responseTarget = msg.from;

                if (typeof response === 'string') {
                  response = `⚠️ *Privacy Notice*: Unable to send DM. This response contains sensitive information.\n\n${response}`;
                } else if (typeof response === 'object' && 'text' in response) {
                  response.text = `⚠️ *Privacy Notice*: Unable to send DM. This response contains sensitive information.\n\n${response.text}`;
                }
              }
            }
          }

          this.logger.log(
            `💬 Sending response to ${shouldSendDM ? 'DM' : isGroupMessage ? 'group' : phoneNumber}...`,
          );

          // Check if response is an object with text property
          if (typeof response === 'object' && 'text' in response) {
            // Send voice note if voice buffer is present
            if (response.voice) {
              this.logger.log(`🎤 Sending voice note to ${phoneNumber}`);

              // For voice-only mode or long responses, send a placeholder immediately
              const isVoiceOnly =
                (response as any).voiceOnly === true ||
                !response.text ||
                response.text.trim() === '';
              const responseLength = response.text ? response.text.length : 0;
              const isLongResponse = responseLength > 500;

              if (isVoiceOnly || isLongResponse) {
                // Send placeholder text immediately
                const placeholder = isVoiceOnly
                  ? '🎤 *Voice message incoming...*\n\n_Processing your response. The voice note will arrive shortly._'
                  : `📝 *Response ready*\n\n_Generating voice note (${Math.ceil(responseLength / 1000)}k characters)..._`;

                await this.sendMessage(responseTarget, placeholder);
                this.logger.log(`📨 Sent placeholder message for voice generation`);
              }

              // Send the voice note
              await this.sendVoiceNote(responseTarget, response.voice);

              // Send text if not voice-only mode and not already sent placeholder
              if (!isVoiceOnly && !isLongResponse && response.text.trim() !== '') {
                await this.sendMessage(responseTarget, response.text);
              }
            }
            // Send image with caption if media is present
            else if (response.media) {
              this.logger.log(
                `🖼️ Sending image with caption to ${isGroupMessage ? 'group' : phoneNumber}`,
              );
              await this.sendImage(responseTarget, response.media, response.text);
            } else {
              // Just send text if no media
              this.logger.log(
                `📤 Sending text message to ${isGroupMessage ? 'group' : phoneNumber}: "${response.text.substring(0, 50)}${response.text.length > 50 ? '...' : ''}"`,
              );
              await this.sendMessage(responseTarget, response.text);
            }
          } else if (typeof response === 'string') {
            // Simple text response
            this.logger.log(
              `📤 Sending text message to ${isGroupMessage ? 'group' : phoneNumber}: "${response.substring(0, 50)}${response.length > 50 ? '...' : ''}"`,
            );
            await this.sendMessage(responseTarget, response);
          } else {
            this.logger.warn(`Unexpected response format: ${JSON.stringify(response)}`);
          }

          // Mark message as read
          await msg.getChat().then((chat) => chat.sendSeen());
          this.logger.log(
            `✅ Response sent successfully to ${isGroupMessage ? `group (from ${phoneNumber})` : phoneNumber}`,
          );
        } else {
          this.logger.warn(`⚠️ No response generated for message from ${phoneNumber}`);
        }
      } catch (error) {
        this.logger.error('Error processing message:', error);

        // Send error message to user
        try {
          await this.sendMessage(
            responseTarget || msg.from,
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
    let lastLoadingPercent = '';
    let loadingStuckCount = 0;
    let loading100Count = 0;

    this.client.on('loading_screen', (percent, message) => {
      this.logger.log(`⏳ Loading: ${percent}% - ${message}`);

      // Check if loading reached 100%
      if (percent === '100' && !this.isReady) {
        loading100Count++;

        // If at 100% for multiple events but not ready
        if (loading100Count >= 3) {
          this.logger.warn(
            '⚠️ WhatsApp at 100% loading but ready event not fired, forcing ready state...',
          );

          this.isReady = true;

          try {
            const info = this.client.info;
            this.logger.log('🚀 WhatsApp Web client is READY (forced from 100% loading)!');
            this.logger.log(`📞 Connected phone: ${info?.wid?.user || 'Unknown'}`);
            this.logger.log(`👤 Bot name: ${info?.pushname || 'Unknown'}`);
          } catch (e) {
            this.logger.debug('Client info not available:', e.message);
          }

          this.logger.log('✅ Now accepting messages');
        }
      }

      // Check if loading is stuck at 99%
      if (percent === '99' && percent === lastLoadingPercent) {
        loadingStuckCount++;

        // If stuck at 99% for 3 consecutive events, force ready state
        if (loadingStuckCount >= 3 && !this.isReady) {
          this.logger.warn('⚠️ WhatsApp stuck at 99% loading, forcing ready state...');
          this.isReady = true;

          setTimeout(async () => {
            try {
              const info = this.client.info;
              this.logger.log('🚀 WhatsApp Web client is READY (forced from stuck loading)!');
              this.logger.log(`📞 Connected phone: ${info?.wid?.user || 'Unknown'}`);
              this.logger.log(`👤 Bot name: ${info?.pushname || 'Unknown'}`);
              this.logger.log('✅ Now accepting messages');

              // Also log the client state
              const state = await this.client.getState();
              this.logger.log(`📊 Client state: ${state}`);
            } catch (error) {
              this.logger.error('Error getting client info:', error);
            }
          }, 2000); // Wait 2 seconds before checking client info
        }
      } else {
        loadingStuckCount = 0;
      }

      lastLoadingPercent = percent;
    });

    // State changes
    this.client.on('change_state', (state) => {
      this.logger.log(`🔄 WhatsApp state changed: ${state}`);
    });
  }

  /**
   * Disconnect the current WhatsApp session
   */
  async disconnect(logout: boolean = true): Promise<void> {
    try {
      if (this.client) {
        this.isReady = false;
        if (logout) {
          await this.client.logout();
        } else {
          // Just mark as not ready without logging out
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
      // Send notification message before clearing if we're connected
      if (this.isReady && this.client) {
        try {
          // Get admin numbers
          const adminNumbers = process.env.ADMIN_PHONE_NUMBERS?.split(',') || [];
          const clearMessage =
            `⚠️ *Session Clear Initiated*\n\n` +
            `The WhatsApp connection will be terminated after this message.\n\n` +
            `To reconnect:\n` +
            `1. Make sure the bot is running\n` +
            `2. Send \`admin reconnect\` from any admin number\n` +
            `3. Scan the QR code to authenticate\n\n` +
            `Clearing session now...`;

          // Send message to all admins
          for (const adminNumber of adminNumbers) {
            const chatId = adminNumber.includes('@') ? adminNumber : `${adminNumber}@c.us`;
            try {
              await this.client.sendMessage(chatId, clearMessage);
            } catch (err) {
              this.logger.warn(
                `Failed to send clear notification to ${adminNumber}: ${err.message}`,
              );
            }
          }

          // Wait a moment to ensure messages are sent
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          this.logger.warn('Failed to send clear session notifications:', error);
        }
      }

      // First disconnect if connected (with logout to clear session)
      if (this.isReady) {
        await this.disconnect(true);
      }

      // Clear the session directory
      const sessionPath = path.join(process.cwd(), 'whatsapp-sessions');

      try {
        await fsPromises.rm(sessionPath, { recursive: true, force: true });
        this.logger.log('WhatsApp session data cleared');
      } catch (err) {
        this.logger.warn('Session directory may not exist:', err);
      }

      // Destroy and recreate the client
      await this.cleanup();

      // Clean up any Chrome processes before creating new client
      await ChromeCleanupUtil.cleanup();

      // Mark client as not ready since we cleared the session
      this.isReady = false;

      // Create new client instance but don't initialize yet
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'pulse-bot',
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
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
          ],
        },
        authTimeoutMs: 60000,
      });

      this.setupEventHandlers();

      this.logger.log(
        'WhatsApp client recreated. Use "admin reconnect" to authenticate with a new number.',
      );
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
      // Clear existing session first
      await this.clearSession();

      // Initialize the client to generate new QR
      await this.client.initialize();
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

            // Give time for the QR to be sent before we start cleanup
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (error) {
            this.logger.error('Failed to send QR code:', error);
          }
        }
      };

      // Store reference to this service for use in handlers

      // Set up ready handler to switch clients
      const readyHandler = async () => {
        // Get the new client info for welcome message
        const info = newClient.info;

        // Switch to the new client FIRST before sending messages
        this.client = newClient;
        this.isReady = true;

        // Wait for client to stabilize after switching
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Send welcome message using the service method (not direct client)
        if (this.reconnectingAdminNumber) {
          try {
            const welcomeMessage = `🎉 *Reconnection Successful!*\n\n✅ Bot is now connected to the new number: ${info.wid.user}\n✅ Bot name: ${info.pushname || 'Pulse'}\n\n📱 *Important Reminders:*\n• The old number is no longer connected\n• All messages should now be sent to this new number\n• Your admin privileges have been maintained\n\nType \`admin status\` to verify the connection.`;

            await this.sendMessage(this.reconnectingAdminNumber, welcomeMessage);

            // Clear the admin number after sending
            this.reconnectingAdminNumber = null;
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
            } catch (error) {
              this.logger.error('Error destroying old client:', error);
            }
          }, 5000);
        }

        // Remove old session directory and rename new one
        try {
          await fsPromises.rm(path.join(process.cwd(), 'whatsapp-sessions'), {
            recursive: true,
            force: true,
          });
          await fsPromises.rename(
            path.join(process.cwd(), 'whatsapp-sessions-new'),
            path.join(process.cwd(), 'whatsapp-sessions'),
          );
        } catch (error) {
          this.logger.error('Error switching session directories:', error);
        }

        // Clean up temporary handlers first
        newClient.off('qr', qrHandler);
        newClient.off('ready', readyHandler);

        // Re-setup all event handlers on the new client BEFORE we start using it
        this.setupEventHandlers();

        // Test the new client by getting its state
        try {
          const _state = await newClient.getState();
        } catch (error) {
          this.logger.error('Error checking client state:', error);
        }
      };

      newClient.on('qr', qrHandler);
      newClient.on('ready', readyHandler);

      // Initialize the new client
      await newClient.initialize();

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
    } catch {
      return { connected: false };
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(to: string, message: string, mentions?: string[]): Promise<any> {
    if (!this.isReady) {
      this.logger.error('WhatsApp Web client is not ready');
      throw new Error('WhatsApp Web client is not ready');
    }

    try {
      // Double-check the client state
      let state;
      try {
        state = await this.client.getState();
      } catch (stateError) {
        this.logger.warn('Could not get client state, attempting to send anyway...');
      }

      if (state && state !== 'CONNECTED') {
        this.logger.error(`Cannot send message, client state is: ${state}`);
        this.isReady = false; // Reset ready state
        throw new Error(`WhatsApp client is not connected (state: ${state})`);
      }

      // Ensure the number has @c.us suffix
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      const phoneNumber = to.replace('@c.us', '');

      // Check if client is properly initialized
      if (!this.client) {
        this.logger.error('WhatsApp client is not initialized');
        throw new Error('WhatsApp client is not initialized');
      }

      const result = await this.client.sendMessage(chatId, message, { mentions });
      this.logger.debug(`✉️ Message delivered to ${phoneNumber}`);
      return result;
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
    } catch (error) {
      this.logger.error(`Failed to send image to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send a voice message
   */
  async sendVoiceMessage(to: string, audioBuffer: Buffer): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp Web client is not ready');
    }

    try {
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');

      // Ensure the number has @c.us suffix
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      const phoneNumber = to.replace('@c.us', '');

      // Create media from buffer
      // Use audio/ogg for voice messages
      const media = new MessageMedia('audio/ogg', audioBuffer.toString('base64'), 'voice.ogg');

      // Send the voice message with sendAsDocument: false to send as voice note
      await this.client.sendMessage(chatId, media, { sendAudioAsVoice: true });
      this.logger.debug(`🎤 Voice message delivered to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to send voice message to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send voice note
   */
  async sendVoiceNote(to: string, audioBuffer: Buffer): Promise<void> {
    if (!this.isReady) {
      throw new Error('WhatsApp Web client is not ready');
    }

    try {
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');

      // Ensure the number has @c.us suffix
      const chatId = to.includes('@') ? to : `${to}@c.us`;

      // Create media from buffer - using audio/ogg for voice notes
      const media = new MessageMedia('audio/ogg', audioBuffer.toString('base64'), 'voice-note.ogg');

      // Send as voice note
      await this.client.sendMessage(chatId, media, {
        sendAudioAsVoice: true,
      });
    } catch (error) {
      this.logger.error(`Failed to send voice note to ${to}:`, error);
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
        // Clean up Chrome processes after logout
        await ChromeCleanupUtil.cleanup();
      } catch (error) {
        this.logger.error('Error during logout:', error);
        // Force cleanup if logout fails
        await this.cleanup();
        // Clean up Chrome processes
        await ChromeCleanupUtil.cleanup();
      }
    }
  }

  /**
   * Get last connected time
   */
  getLastConnectedTime(): Date | undefined {
    return this.lastConnectedTime;
  }

  /**
   * Check if client is ready
   */
  isClientReady(): boolean {
    return this.isReady;
  }

  /**
   * Send media (generic method for messaging abstraction)
   */
  async sendMedia(to: string, media: Buffer | string, caption?: string): Promise<any> {
    if (!this.isReady) {
      throw new Error('WhatsApp Web client is not ready');
    }

    try {
      // Import MessageMedia from whatsapp-web.js
      const { MessageMedia } = await import('whatsapp-web.js');

      // Ensure the number has @c.us suffix
      const chatId = to.includes('@') ? to : `${to}@c.us`;

      let messageMedia;
      if (typeof media === 'string') {
        // Assume it's a URL or file path
        messageMedia = await MessageMedia.fromUrl(media);
      } else {
        // It's a buffer
        messageMedia = new MessageMedia('image/png', media.toString('base64'), 'media.png');
      }

      // Send the media with optional caption
      const result = await this.client.sendMessage(chatId, messageMedia, { caption });
      return result;
    } catch (error) {
      this.logger.error(`Failed to send media to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Event emitter methods for messaging abstraction
   */
  on(event: string, handler: Function): void {
    this.eventEmitter.addEventListener(event, handler as any);
  }

  off(event: string, handler: Function): void {
    this.eventEmitter.removeEventListener(event, handler as any);
  }

  private emit(event: string, data: any): void {
    this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
}
