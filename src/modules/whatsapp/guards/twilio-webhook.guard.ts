import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { Observable } from 'rxjs';

@Injectable()
export class TwilioWebhookGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers['x-twilio-signature'] as string;
    
    if (!signature) {
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const isValid = this.validateTwilioRequest(
      signature,
      request.url,
      request.body,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }

    return true;
  }

  private validateTwilioRequest(
    signature: string,
    url: string,
    params: Record<string, any>,
  ): boolean {
    // Get the auth token from config
    const authToken = this.configService.get<string>('twilio.webhookAuthToken');
    
    if (!authToken) {
      throw new UnauthorizedException('Twilio webhook auth token not configured');
    }

    // Convert the app URL to a full URL
    const appUrl = this.configService.get<string>('app_url');
    const fullUrl = url.startsWith('http') ? url : `${appUrl}${url}`;

    // Build the signature string
    const data = Object.keys(params)
      .sort()
      .reduce((str, key) => {
        return str + key + params[key];
      }, fullUrl);

    // Compare signatures
    const hmac = crypto.createHmac('sha1', authToken);
    const calculatedSignature = Buffer.from(hmac.update(data).digest('hex'), 'hex').toString('base64');
    
    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature),
    );
  }
}