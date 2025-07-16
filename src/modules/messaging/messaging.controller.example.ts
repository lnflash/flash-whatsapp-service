import { Controller, Post, Body } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { SendMessageDto, SendMediaDto } from './dto/messaging.dto';

/**
 * Example controller showing how to use the messaging abstraction
 * This demonstrates platform-agnostic messaging
 */
@Controller('api/messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('send-message')
  async sendMessage(@Body() dto: SendMessageDto) {
    // Platform agnostic - works with any messaging platform
    await this.messagingService.sendMessage(dto.to, dto.message);
    return { success: true };
  }

  @Post('send-media')
  async sendMedia(@Body() dto: SendMediaDto) {
    await this.messagingService.sendMedia(dto.to, {
      type: dto.type,
      url: dto.url,
      caption: dto.caption,
    });
    return { success: true };
  }

  @Post('send-notification')
  async sendNotification(@Body() body: { to: string; message: string; actions?: any[] }) {
    await this.messagingService.sendNotification(body.to, {
      message: body.message,
      actions: body.actions,
    });
    return { success: true };
  }

  @Post('status')
  async getStatus() {
    const status = this.messagingService.getConnectionStatus();
    const features = this.messagingService.getFeatures();

    return {
      status,
      features,
      ready: this.messagingService.isConnected(),
    };
  }
}
