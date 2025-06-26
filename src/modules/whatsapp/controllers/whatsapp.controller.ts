import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  UseGuards, 
  Logger, 
  HttpCode, 
  HttpException,
  HttpStatus,
  Headers,
  Req,
  BadRequestException
} from '@nestjs/common';
import { Request } from 'express';
import { WhatsappService } from '../services/whatsapp.service';
import { WhatsAppCloudService, CloudWebhookMessage } from '../services/whatsapp-cloud.service';
import { RateLimiterGuard } from '../../../common/guards/rate-limiter.guard';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly whatsAppCloudService: WhatsAppCloudService,
  ) {}

  /**
   * Webhook verification endpoint for WhatsApp Cloud API
   * GET request sent by Meta when setting up the webhook
   */
  @Get('webhook')
  @HttpCode(200)
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    try {
      this.logger.log('Received webhook verification request');
      return this.whatsAppCloudService.handleVerificationChallenge(mode, token, challenge);
    } catch (error) {
      this.logger.error('Webhook verification failed:', error.message);
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  /**
   * Main webhook endpoint for WhatsApp Cloud API
   * POST requests with message updates
   */
  @Post('webhook')
  @UseGuards(RateLimiterGuard)
  @HttpCode(200)
  async handleWebhook(
    @Body() body: CloudWebhookMessage,
    @Headers('x-hub-signature-256') signature: string,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    try {
      // Verify webhook signature
      const rawBody = JSON.stringify(body);
      if (signature && !this.whatsAppCloudService.verifyWebhookSignature(rawBody, signature)) {
        this.logger.error('Invalid webhook signature');
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      this.logger.log('Received webhook from WhatsApp Cloud API');
      this.logger.debug('Webhook body:', JSON.stringify(body, null, 2));

      // Parse the incoming message
      const messageData = this.whatsAppCloudService.parseWebhookMessage(body);
      
      if (!messageData) {
        this.logger.log('No message data found in webhook, possibly a status update');
        return { status: 'ok' };
      }

      // Mark message as read
      if (messageData.messageId) {
        await this.whatsAppCloudService.markMessageAsRead(messageData.messageId);
      }

      // Process the message
      if (messageData.text && messageData.from) {
        const response = await this.whatsappService.processCloudMessage({
          from: messageData.from,
          text: messageData.text,
          messageId: messageData.messageId || '',
          timestamp: messageData.timestamp || Date.now().toString(),
          name: messageData.name,
        });

        // Send the response back to the user
        if (response) {
          await this.whatsAppCloudService.sendTextMessage(messageData.from, response);
        }
      }

      return { status: 'ok' };
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`, error.stack);
      
      // WhatsApp expects a 200 response even on errors to prevent retries
      return { status: 'error' };
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(200)
  healthCheck(): { status: string; service: string; configured: boolean } {
    return {
      status: 'ok',
      service: 'Flash Connect WhatsApp Integration',
      configured: this.whatsAppCloudService.isConfigured(),
    };
  }
}