import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly encryptionKey: Buffer;
  private readonly saltLength = 32;

  constructor(private readonly configService: ConfigService) {
    // Get encryption key from env or generate a secure one
    const keyString = this.configService.get<string>('ENCRYPTION_KEY');
    if (!keyString || keyString.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }

    // Derive a proper key from the string using PBKDF2
    const salt = this.configService.get<string>('ENCRYPTION_SALT') || 'flash-connect-salt';
    this.encryptionKey = crypto.pbkdf2Sync(keyString, salt, 100000, 32, 'sha256');
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(data: string): string {
    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      // Encrypt the data
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

      // Get the auth tag
      const authTag = cipher.getAuthTag();

      // Combine IV + authTag + encrypted data
      const combined = Buffer.concat([iv, authTag, encrypted]);

      // Return base64 encoded
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data encrypted with AES-256-GCM
   */
  decrypt(encryptedData: string): string {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const iv = combined.slice(0, 16);
      const authTag = combined.slice(16, 32);
      const encrypted = combined.slice(32);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt the data
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data + this.configService.get<string>('HASH_SALT', 'default-salt'))
      .digest('hex');
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate OTP
   */
  generateOTP(length: number = 6): string {
    const digits = '0123456789';
    let otp = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      otp += digits[randomBytes[i] % 10];
    }

    return otp;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Create HMAC signature
   */
  createHmac(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHmac(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHmac(data, secret);
    return this.secureCompare(signature, expectedSignature);
  }
}
