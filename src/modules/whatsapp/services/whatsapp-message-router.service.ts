import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WhatsAppInstanceManager } from './whatsapp-instance-manager.service';
import { WhatsappService } from './whatsapp.service';
import { InstanceMessage } from '../interfaces/instance-config.interface';
import { Message } from 'whatsapp-web.js';

@Injectable()
export class WhatsAppMessageRouter {
  private readonly logger = new Logger(WhatsAppMessageRouter.name);

  constructor(
    private readonly instanceManager: WhatsAppInstanceManager,
    private readonly whatsappService: WhatsappService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handle incoming messages from any instance
   */
  @OnEvent('whatsapp.message')
  async handleIncomingMessage(payload: { phoneNumber: string; message: Message }) {
    const { phoneNumber, message } = payload;

    try {
      this.logger.debug(`Routing message from instance ${phoneNumber}: ${message.body}`);

      // Extract message data
      const messageData = {
        from: message.from,
        text: message.body,
        messageId: (message.id as any)._serialized,
        timestamp: new Date((message.timestamp as any) * 1000).toISOString(),
        name: (message as any)._data?.notifyName || undefined,
        isVoiceCommand: message.hasMedia && message.type === 'ptt',
        whatsappId: message.from,
        isGroup: message.from.endsWith('@g.us'),
        groupId: message.from.endsWith('@g.us') ? message.from : undefined,
        instancePhone: phoneNumber, // Add instance identifier
      };

      // Process message through the main WhatsApp service
      const response = await this.whatsappService.processCloudMessage(messageData);

      // Send response back through the correct instance
      if (response) {
        await this.sendResponse(phoneNumber, message.from, response);
      }
    } catch (error) {
      this.logger.error(`Error handling message from instance ${phoneNumber}:`, error);

      // Send error message back to user
      try {
        await this.sendResponse(
          phoneNumber,
          message.from,
          '❌ Sorry, an error occurred processing your message. Please try again.',
        );
      } catch (sendError) {
        this.logger.error(`Failed to send error message:`, sendError);
      }
    }
  }

  /**
   * Send a message through a specific instance
   */
  async sendMessage(
    instancePhone: string,
    recipient: string,
    content: string | { text: string; media?: Buffer; voice?: Buffer },
  ): Promise<boolean> {
    const instance = this.instanceManager.getInstance(instancePhone);

    if (!instance || instance.status !== 'ready') {
      this.logger.error(`Instance ${instancePhone} not ready for sending`);
      return false;
    }

    try {
      const client = instance.client;

      if (typeof content === 'string') {
        // Send text message
        await client.sendMessage(recipient, content);
      } else {
        // Handle complex content (text + media/voice)
        if (content.text) {
          await client.sendMessage(recipient, content.text);
        }

        if (content.voice) {
          // Send voice message
          const media = new MessageMedia(
            'audio/ogg; codecs=opus',
            content.voice.toString('base64'),
          );
          await client.sendMessage(recipient, media, { sendAudioAsVoice: true });
        } else if (content.media) {
          // Send regular media
          const media = new MessageMedia('image/png', content.media.toString('base64'));
          await client.sendMessage(recipient, media);
        }
      }

      this.logger.debug(`Message sent through instance ${instancePhone} to ${recipient}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending message through instance ${instancePhone}:`, error);
      return false;
    }
  }

  /**
   * Send a response through the appropriate instance
   */
  private async sendResponse(
    instancePhone: string,
    recipient: string,
    response: string | { text: string; media?: Buffer; voice?: Buffer; voiceOnly?: boolean },
  ): Promise<void> {
    if (typeof response === 'string') {
      await this.sendMessage(instancePhone, recipient, response);
    } else {
      if (response.voiceOnly && response.voice) {
        // Voice only - don't send text
        await this.sendMessage(instancePhone, recipient, { text: '', voice: response.voice });
      } else {
        // Send full response
        await this.sendMessage(instancePhone, recipient, response);
      }
    }
  }

  /**
   * Find the best instance to send a message
   * This can be extended with load balancing logic
   */
  async findBestInstance(recipient?: string): Promise<string | null> {
    const instances = this.instanceManager.getAllInstances();

    // Filter ready instances
    const readyInstances = instances.filter((i) => i.status === 'ready');

    if (readyInstances.length === 0) {
      return null;
    }

    // For now, return the first ready instance
    // This can be enhanced with:
    // - Round-robin selection
    // - Least recently used
    // - Load-based selection
    // - Geographic/number-based routing
    return readyInstances[0].phoneNumber;
  }

  /**
   * Broadcast a message to all instances
   */
  async broadcastMessage(
    recipient: string,
    content: string | { text: string; media?: Buffer; voice?: Buffer },
  ): Promise<{ instance: string; success: boolean }[]> {
    const instances = this.instanceManager.getAllInstances();
    const results: { instance: string; success: boolean }[] = [];

    for (const instance of instances) {
      if (instance.status === 'ready') {
        const success = await this.sendMessage(instance.phoneNumber, recipient, content);
        results.push({ instance: instance.phoneNumber, success });
      }
    }

    return results;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    const instances = this.instanceManager.getAllInstances();

    return {
      totalInstances: instances.length,
      readyInstances: instances.filter((i) => i.status === 'ready').length,
      messagesRouted: {
        // These would be tracked with counters in production
        total: 0,
        byInstance: {},
      },
    };
  }
}

// Import MessageMedia from whatsapp-web.js
import { MessageMedia } from 'whatsapp-web.js';
