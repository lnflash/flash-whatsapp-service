import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);

  /**
   * Generate a QR code buffer for the given data
   */
  async generateQrCode(data: string): Promise<Buffer> {
    try {
      const options = {
        type: 'png' as const,
        width: 512,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M' as const,
      };

      const buffer = await QRCode.toBuffer(data, options);
      return buffer;
    } catch (error) {
      this.logger.error(`Error generating QR code: ${error.message}`, error.stack);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate a QR code with Lightning invoice URI format
   */
  async generateLightningQrCode(paymentRequest: string): Promise<Buffer> {
    // Lightning invoices should be prefixed with "lightning:"
    const lightningUri = `lightning:${paymentRequest.toLowerCase()}`;
    return this.generateQrCode(lightningUri);
  }

  /**
   * Generate a QR code with Bitcoin address URI format
   */
  async generateBitcoinQrCode(address: string, amount?: number, label?: string): Promise<Buffer> {
    let bitcoinUri = `bitcoin:${address}`;

    const params: string[] = [];
    if (amount) {
      params.push(`amount=${amount}`);
    }
    if (label) {
      params.push(`label=${encodeURIComponent(label)}`);
    }

    if (params.length > 0) {
      bitcoinUri += '?' + params.join('&');
    }

    return this.generateQrCode(bitcoinUri);
  }
}
