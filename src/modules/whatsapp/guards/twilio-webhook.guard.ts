import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

@Injectable()
export class TwilioWebhookGuard implements CanActivate {
  private readonly authToken: string;

  constructor(private readonly configService: ConfigService) {
    this.authToken = this.configService.get<string>('twilio.authToken') || '';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Get the webhook URL
    const webhookUrl = `${request.protocol}://${request.get('host')}${request.originalUrl}`;
    
    // Get the signature from Twilio
    const twilioSignature = request.headers['x-twilio-signature'];
    
    if (!twilioSignature) {
      throw new UnauthorizedException('Missing Twilio signature');
    }

    // Validate the request came from Twilio
    const isValid = twilio.validateRequest(
      this.authToken,
      twilioSignature,
      webhookUrl,
      request.body
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }

    return true;
  }
}