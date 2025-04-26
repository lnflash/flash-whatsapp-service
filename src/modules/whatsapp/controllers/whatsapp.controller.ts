import { Controller, Post, Body, UseGuards, Logger, HttpCode } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';
import { IncomingMessageDto } from '../dto/incoming-message.dto';
import { TwilioWebhookGuard } from '../guards/twilio-webhook.guard';
import { RateLimiterGuard } from '../../../common/guards/rate-limiter.guard';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  @UseGuards(TwilioWebhookGuard, RateLimiterGuard)
  @HttpCode(200)
  async handleIncomingMessage(@Body() messageData: IncomingMessageDto): Promise<{ message: string }> {
    try {
      this.logger.log(`Received webhook from Twilio, MessageSid: ${messageData.MessageSid}`);
      
      const responseMessage = await this.whatsappService.processIncomingMessage(messageData);
      
      return {
        message: responseMessage,
      };
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`, error.stack);
      
      // Return a friendly error message
      return {
        message: "We're sorry, but we're having trouble processing your message right now. Please try again later.",
      };
    }
  }
}