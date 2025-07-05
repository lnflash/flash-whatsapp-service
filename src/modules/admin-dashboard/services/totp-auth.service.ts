import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';

export interface TOTPSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface TOTPDevice {
  id: string;
  name: string;
  lastUsed: Date;
  trusted: boolean;
}

@Injectable()
export class TOTPAuthService {
  private readonly issuerName: string;
  private readonly backupCodeCount = 10;
  private readonly codeLength = 8;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
  ) {
    this.issuerName = this.configService.get<string>('APP_NAME', 'Flash Admin');
  }

  /**
   * Generate TOTP secret and QR code for user setup
   */
  async setupTOTP(userId: string, phoneNumber: string): Promise<TOTPSetup> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      length: 32,
      name: `${this.issuerName} (${phoneNumber})`,
      issuer: this.issuerName,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store encrypted secret and backup codes
    await this.storeTOTPSecret(userId, secret.base32, backupCodes);

    return {
      secret: secret.base32,
      qrCode: await qrCode,
      backupCodes,
    };
  }

  /**
   * Verify TOTP token
   */
  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const secret = await this.getTOTPSecret(userId);
    
    if (!secret) {
      throw new UnauthorizedException('TOTP not set up for this user');
    }

    // Check if it's a backup code
    const isBackupCode = await this.verifyBackupCode(userId, token);
    if (isBackupCode) {
      return true;
    }

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps for clock drift
    });

    if (verified) {
      // Record successful verification
      await this.recordTOTPUsage(userId);
    }

    return verified;
  }

  /**
   * Enable TOTP after successful verification
   */
  async enableTOTP(userId: string, verificationToken: string): Promise<void> {
    const verified = await this.verifyTOTP(userId, verificationToken);
    
    if (!verified) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.redisService.set(`totp:enabled:${userId}`, 'true');
  }

  /**
   * Disable TOTP (requires recent authentication)
   */
  async disableTOTP(userId: string, verificationToken: string): Promise<void> {
    const verified = await this.verifyTOTP(userId, verificationToken);
    
    if (!verified) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.removeTOTPSecret(userId);
    await this.redisService.delete(`totp:enabled:${userId}`);
  }

  /**
   * Check if user has TOTP enabled
   */
  async isTOTPEnabled(userId: string): Promise<boolean> {
    const enabled = await this.redisService.get(`totp:enabled:${userId}`);
    return enabled === 'true';
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: string, verificationToken: string): Promise<string[]> {
    const verified = await this.verifyTOTP(userId, verificationToken);
    
    if (!verified) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const backupCodes = this.generateBackupCodes();
    const secret = await this.getTOTPSecret(userId);
    
    if (!secret) {
      throw new BadRequestException('TOTP not set up');
    }

    await this.storeTOTPSecret(userId, secret, backupCodes);
    
    return backupCodes;
  }

  /**
   * Register trusted device
   */
  async registerTrustedDevice(
    userId: string,
    deviceId: string,
    deviceName: string,
  ): Promise<void> {
    const device: TOTPDevice = {
      id: deviceId,
      name: deviceName,
      lastUsed: new Date(),
      trusted: true,
    };

    await this.redisService.set(
      `totp:device:${userId}:${deviceId}`,
      JSON.stringify(device),
      30 * 24 * 60 * 60, // 30 days
    );
  }

  /**
   * Check if device is trusted
   */
  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    const deviceData = await this.redisService.get(`totp:device:${userId}:${deviceId}`);
    
    if (!deviceData) {
      return false;
    }

    const device: TOTPDevice = JSON.parse(deviceData);
    return device.trusted;
  }

  /**
   * Get user's trusted devices
   */
  async getTrustedDevices(userId: string): Promise<TOTPDevice[]> {
    const pattern = `totp:device:${userId}:*`;
    const devices: TOTPDevice[] = [];
    
    const keys = await this.redisService.keys(pattern);
    
    for (const key of keys) {
      const deviceData = await this.redisService.get(key);
      if (deviceData) {
        devices.push(JSON.parse(deviceData));
      }
    }

    return devices.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
  }

  /**
   * Revoke trusted device
   */
  async revokeTrustedDevice(userId: string, deviceId: string): Promise<void> {
    await this.redisService.delete(`totp:device:${userId}:${deviceId}`);
  }

  /**
   * Private helper methods
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < this.backupCodeCount; i++) {
      const code = crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .match(/.{4}/g)
        ?.join('-') || '';
      codes.push(code);
    }

    return codes;
  }

  private async storeTOTPSecret(
    userId: string,
    secret: string,
    backupCodes: string[],
  ): Promise<void> {
    // Encrypt sensitive data
    const encryptedSecret = this.encrypt(secret);
    const hashedBackupCodes = backupCodes.map(code => this.hashBackupCode(code));

    const data = {
      secret: encryptedSecret,
      backupCodes: hashedBackupCodes,
      createdAt: new Date(),
    };

    await this.redisService.set(`totp:secret:${userId}`, JSON.stringify(data));
  }

  private async getTOTPSecret(userId: string): Promise<string | null> {
    const data = await this.redisService.get(`totp:secret:${userId}`);
    
    if (!data) {
      return null;
    }

    const parsed = JSON.parse(data);
    return this.decrypt(parsed.secret);
  }

  private async removeTOTPSecret(userId: string): Promise<void> {
    await this.redisService.delete(`totp:secret:${userId}`);
    
    // Remove all trusted devices
    const pattern = `totp:device:${userId}:*`;
    const keys = await this.redisService.keys(pattern);
    
    for (const key of keys) {
      await this.redisService.delete(key);
    }
  }

  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const data = await this.redisService.get(`totp:secret:${userId}`);
    
    if (!data) {
      return false;
    }

    const parsed = JSON.parse(data);
    const hashedCode = this.hashBackupCode(code);
    const index = parsed.backupCodes.indexOf(hashedCode);

    if (index === -1) {
      return false;
    }

    // Remove used backup code
    parsed.backupCodes.splice(index, 1);
    await this.redisService.set(`totp:secret:${userId}`, JSON.stringify(parsed));

    return true;
  }

  private hashBackupCode(code: string): string {
    return crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');
  }

  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(
      this.configService.get<string>('ENCRYPTION_KEY', ''),
      'hex',
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(
      this.configService.get<string>('ENCRYPTION_KEY', ''),
      'hex',
    );
    
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async recordTOTPUsage(userId: string): Promise<void> {
    const key = `totp:usage:${userId}`;
    const usage = {
      lastUsed: new Date(),
      count: 1,
    };

    const existing = await this.redisService.get(key);
    if (existing) {
      const parsed = JSON.parse(existing);
      usage.count = parsed.count + 1;
    }

    await this.redisService.set(key, JSON.stringify(usage));
  }
}