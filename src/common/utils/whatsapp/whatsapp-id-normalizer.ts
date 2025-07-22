import { Injectable, Logger } from '@nestjs/common';

/**
 * Utility service to handle WhatsApp ID format normalization
 * WhatsApp uses different ID formats in different contexts:
 * - @c.us (regular chat/DM format)
 * - @lid (privacy-focused format in groups)
 * - @s.whatsapp.net (server format)
 * - @g.us (group format)
 */
@Injectable()
export class WhatsAppIdNormalizer {
  private readonly logger = new Logger(WhatsAppIdNormalizer.name);

  /**
   * Extract the phone number from any WhatsApp ID format
   */
  extractPhoneNumber(whatsappId: string): string {
    return whatsappId.replace(/@c\.us|@lid|@s\.whatsapp\.net|@g\.us/g, '');
  }

  /**
   * Get all possible WhatsApp ID formats for a given ID
   * This is useful when searching for existing data that might be stored
   * under a different format
   */
  getPossibleFormats(whatsappId: string): string[] {
    // If it's a group ID, return as-is
    if (whatsappId.includes('@g.us')) {
      return [whatsappId];
    }

    const phoneNumber = this.extractPhoneNumber(whatsappId);
    const formats: string[] = [
      whatsappId, // Original format
      `${phoneNumber}@c.us`,
      `${phoneNumber}@lid`,
      `${phoneNumber}@s.whatsapp.net`,
    ];

    // If phone number doesn't start with country code, try adding common ones
    // This handles cases where WhatsApp strips the country code in @lid format
    if (!phoneNumber.startsWith('1') && phoneNumber.length === 10) {
      // US/Canada numbers
      const withUS = `1${phoneNumber}`;
      formats.push(`${withUS}@c.us`, `${withUS}@lid`, `${withUS}@s.whatsapp.net`);
    } else if (!phoneNumber.startsWith('1') && phoneNumber.length === 11) {
      // Might be missing country code for Caribbean/other regions
      const withCaribbean = `1${phoneNumber}`;
      formats.push(
        `${withCaribbean}@c.us`,
        `${withCaribbean}@lid`,
        `${withCaribbean}@s.whatsapp.net`,
      );
    }

    // Remove duplicates
    return formats.filter((id, index, self) => self.indexOf(id) === index);
  }

  /**
   * Normalize a WhatsApp ID to the standard @c.us format
   * This is useful when storing new data
   */
  normalize(whatsappId: string): string {
    // If it's a group ID, return as-is
    if (whatsappId.includes('@g.us')) {
      return whatsappId;
    }

    const phoneNumber = this.extractPhoneNumber(whatsappId);
    return `${phoneNumber}@c.us`;
  }

  /**
   * Check if two WhatsApp IDs refer to the same user
   */
  isSameUser(id1: string, id2: string): boolean {
    const phone1 = this.extractPhoneNumber(id1);
    const phone2 = this.extractPhoneNumber(id2);
    return phone1 === phone2 && !id1.includes('@g.us') && !id2.includes('@g.us');
  }

  /**
   * Check if the WhatsApp ID is in @lid format
   */
  isLidFormat(whatsappId: string): boolean {
    return whatsappId.includes('@lid');
  }
}
