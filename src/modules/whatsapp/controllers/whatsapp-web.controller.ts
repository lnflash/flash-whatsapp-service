import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
  Query,
  Body,
} from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppWebService } from '../services/whatsapp-web.service';
import { SendTestMessageDto } from '../dto/send-test-message.dto';

@Controller('whatsapp-web')
export class WhatsAppWebController {
  private readonly logger = new Logger(WhatsAppWebController.name);

  constructor(private readonly whatsAppWebService: WhatsAppWebService) {}

  /**
   * Get WhatsApp Web status
   */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  getStatus() {
    const isReady = this.whatsAppWebService.isClientReady();
    const info = this.whatsAppWebService.getClientInfo();

    return {
      status: isReady ? 'connected' : 'disconnected',
      ready: isReady,
      info: info
        ? {
            phoneNumber: info.wid?.user,
            name: info.pushname,
            platform: info.platform,
          }
        : null,
      service: 'Pulse - WhatsApp Web.js Prototype',
    };
  }

  /**
   * Get QR code for authentication
   */
  @Get('qr')
  async getQRCode(@Res() res: Response) {
    try {
      const qrCode = await this.whatsAppWebService.getQRCode();

      if (!qrCode) {
        return res.status(200).json({
          status: 'already_authenticated',
          message: 'WhatsApp Web is already authenticated',
        });
      }

      // Generate QR code image using a service
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;

      return res.status(200).json({
        status: 'pending_authentication',
        qrCode: qrCode,
        qrImageUrl: qrImageUrl,
        message: 'Scan this QR code with WhatsApp',
      });
    } catch (error) {
      this.logger.error('Error getting QR code:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to generate QR code',
      });
    }
  }

  /**
   * Logout from WhatsApp Web
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    try {
      await this.whatsAppWebService.logout();
      return {
        status: 'success',
        message: 'Logged out successfully',
      };
    } catch (error) {
      this.logger.error('Error during logout:', error);
      return {
        status: 'error',
        message: 'Failed to logout',
      };
    }
  }

  /**
   * Send a test message
   */
  @Post('test-message')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(@Body() dto: SendTestMessageDto) {
    try {
      // Remove any non-numeric characters from phone number
      const phoneNumber = dto.to.replace(/\D/g, '');

      await this.whatsAppWebService.sendMessage(phoneNumber, dto.message || 'Hello from Pulse!');

      return {
        status: 'success',
        message: 'Test message sent successfully',
        to: phoneNumber,
      };
    } catch (error) {
      this.logger.error('Error sending test message:', error);
      return {
        status: 'error',
        message: error.message || 'Failed to send test message',
      };
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return {
      status: 'ok',
      service: 'Pulse WhatsApp Web.js Prototype',
      timestamp: new Date().toISOString(),
      ready: this.whatsAppWebService.isClientReady(),
    };
  }
}
