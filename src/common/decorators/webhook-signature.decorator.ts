import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

export interface WebhookSignatureOptions {
  headerName?: string;
  secret?: string;
  algorithm?: string;
  tolerance?: number;
}

/**
 * Decorator for validating webhook signatures
 */
export const WebhookSignature = createParamDecorator(
  (options: WebhookSignatureOptions = {}, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();

    const {
      headerName = 'x-webhook-signature',
      secret = process.env.WEBHOOK_SECRET,
      algorithm = 'sha256',
      tolerance = 300, // 5 minutes
    } = options;

    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const signature = request.headers[headerName] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    // Parse signature format: t=timestamp,v1=signature
    const elements = signature.split(',').reduce(
      (acc, element) => {
        const [key, value] = element.split('=');
        acc[key] = value;
        return acc;
      },
      {} as Record<string, string>,
    );

    const timestamp = parseInt(elements.t || '0', 10);
    const providedSignature = elements.v1;

    if (!timestamp || !providedSignature) {
      throw new UnauthorizedException('Invalid signature format');
    }

    // Check timestamp tolerance
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - timestamp > tolerance) {
      throw new UnauthorizedException('Webhook signature expired');
    }

    // Reconstruct payload
    const rawBody = request.body ? JSON.stringify(request.body) : '';
    const payload = `${timestamp}.${rawBody}`;

    // Calculate expected signature
    const expectedSignature = crypto.createHmac(algorithm, secret).update(payload).digest('hex');

    // Timing-safe comparison
    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return {
      timestamp,
      signature: providedSignature,
      valid: true,
    };
  },
);
