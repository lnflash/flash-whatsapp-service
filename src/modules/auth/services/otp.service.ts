import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpExpiry: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.otpExpiry = this.configService.get<number>('security.mfaExpiry') || 300; // Default 5 minutes
  }

  /**
   * Generate a new OTP for a given phone number
   */
  async generateOtp(phoneNumber: string, sessionId: string): Promise<string> {
    try {
      // Generate a 6-digit numeric OTP
      const otp = this.generateNumericOtp(6);

      // Store the OTP in Redis with expiry
      const otpKey = `otp:${sessionId}`;
      const otpHash = this.hashOtp(otp);

      await this.redisService.setEncrypted(otpKey, { hash: otpHash }, this.otpExpiry);

      this.logger.log(`Generated OTP for session ${sessionId}`);

      return otp;
    } catch (error) {
      this.logger.error(`Error generating OTP: ${error.message}`, error.stack);
      throw new Error('Failed to generate OTP');
    }
  }

  /**
   * Verify an OTP for a given session
   */
  async verifyOtp(sessionId: string, otpCode: string): Promise<boolean> {
    try {
      const otpKey = `otp:${sessionId}`;
      const storedOtpData = await this.redisService.getEncrypted(otpKey);

      if (!storedOtpData || !storedOtpData.hash) {
        this.logger.warn(`No OTP found for session ${sessionId}`);
        return false;
      }

      // Hash the provided OTP and compare with stored hash
      const providedOtpHash = this.hashOtp(otpCode);
      const isValid = storedOtpData.hash === providedOtpHash;

      if (isValid) {
        // Delete the OTP to prevent reuse
        await this.redisService.del(otpKey);
        this.logger.log(`OTP verified successfully for session ${sessionId}`);
      } else {
        this.logger.warn(`Invalid OTP provided for session ${sessionId}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error(`Error verifying OTP: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generate a numeric OTP of specified length
   */
  private generateNumericOtp(length: number): string {
    // Generate a secure random set of digits
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;

    const randomBytes = crypto.randomBytes(4);
    const randomNumber = min + (randomBytes.readUInt32BE(0) % (max - min + 1));

    // Ensure exact length by padding with leading zeros if necessary
    return randomNumber.toString().padStart(length, '0');
  }

  /**
   * Hash an OTP for secure storage
   */
  private hashOtp(otp: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(otp + this.configService.get<string>('security.jwtSecret'));
    return hash.digest('hex');
  }
}
