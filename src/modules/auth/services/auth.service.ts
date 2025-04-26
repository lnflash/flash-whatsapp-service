import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SessionService } from './session.service';
import { OtpService } from './otp.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { AccountLinkRequestDto } from '../dto/account-link-request.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { UserSession } from '../interfaces/user-session.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService,
    private readonly flashApiService: FlashApiService,
  ) {}

  /**
   * Start the account linking process
   */
  async initiateAccountLinking(linkRequest: AccountLinkRequestDto): Promise<{ sessionId: string; otpSent: boolean }> {
    try {
      const { whatsappId, phoneNumber } = linkRequest;
      
      // Check if the user exists in Flash API
      const userExists = await this.flashApiService.verifyUserAccount(phoneNumber);
      
      if (!userExists) {
        throw new BadRequestException('No Flash account found with this phone number');
      }
      
      // Check if there's an existing session
      let session = await this.sessionService.getSessionByWhatsappId(whatsappId);
      
      if (session && session.isVerified) {
        // Already verified
        return { sessionId: session.sessionId, otpSent: false };
      }
      
      // Create or update session
      if (!session) {
        session = await this.sessionService.createSession(whatsappId, phoneNumber);
      } else {
        session = await this.sessionService.updateSession(session.sessionId, { phoneNumber });
      }
      
      if (!session) {
        throw new Error('Failed to create or update session');
      }
      
      // Generate and send OTP
      const otp = await this.otpService.generateOtp(phoneNumber, session.sessionId);
      
      // In a real implementation, we would send this OTP via the Flash API or SMS
      this.logger.log(`Generated OTP for account linking: ${otp} (This would be sent to the user's Flash app)`);
      
      return { sessionId: session.sessionId, otpSent: true };
    } catch (error) {
      this.logger.error(`Error initiating account linking: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify an OTP code for account linking
   */
  async verifyAccountLinking(verifyDto: VerifyOtpDto): Promise<UserSession> {
    try {
      const { sessionId, otpCode } = verifyDto;
      
      // Verify session exists
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired session');
      }
      
      // Verify OTP
      const isValid = await this.otpService.verifyOtp(sessionId, otpCode);
      if (!isValid) {
        throw new UnauthorizedException('Invalid or expired OTP code');
      }
      
      // Get user ID from Flash API using phone number
      const flashUserId = await this.getFlashUserId(session.phoneNumber);
      
      // Update session
      const updatedSession = await this.sessionService.updateSession(sessionId, {
        flashUserId,
        isVerified: true,
        mfaVerified: true,
        mfaExpiresAt: new Date(Date.now() + 300000), // 5 minutes
      });
      
      if (!updatedSession) {
        throw new Error('Failed to update session after verification');
      }
      
      return updatedSession;
    } catch (error) {
      this.logger.error(`Error verifying account linking: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get the Flash user ID from phone number
   */
  private async getFlashUserId(phoneNumber: string): Promise<string> {
    try {
      // This is a placeholder - in real implementation, we would call the Flash API
      // to get the actual user ID associated with the phone number
      const query = `
        query GetUserByPhone($phoneNumber: String!) {
          userByPhone(phoneNumber: $phoneNumber) {
            id
          }
        }
      `;
      
      const variables = { phoneNumber };
      
      // Mock response for development
      // const result = await this.flashApiService.executeQuery<{ userByPhone: { id: string } }>(query, variables);
      // return result.userByPhone.id;
      
      // Simulate API call for now
      return `user_${Date.now().toString().slice(-6)}`;
    } catch (error) {
      this.logger.error(`Error getting Flash user ID: ${error.message}`, error.stack);
      throw new Error('Failed to retrieve user information');
    }
  }

  /**
   * Validate MFA for a sensitive operation
   */
  async validateMfa(sessionId: string): Promise<boolean> {
    try {
      return this.sessionService.isMfaValidated(sessionId);
    } catch (error) {
      this.logger.error(`Error validating MFA: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Request MFA verification for a session
   */
  async requestMfaVerification(sessionId: string): Promise<{ otpSent: boolean }> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      
      if (!session) {
        throw new UnauthorizedException('Invalid or expired session');
      }
      
      if (!session.isVerified || !session.flashUserId) {
        throw new UnauthorizedException('Account not linked');
      }
      
      // Generate and send OTP
      const otp = await this.otpService.generateOtp(session.phoneNumber, sessionId);
      
      // In a real implementation, we would send this OTP via the Flash API or SMS
      this.logger.log(`Generated MFA OTP: ${otp} (This would be sent to the user's Flash app)`);
      
      return { otpSent: true };
    } catch (error) {
      this.logger.error(`Error requesting MFA verification: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify MFA OTP
   */
  async verifyMfa(verifyDto: VerifyOtpDto): Promise<{ verified: boolean }> {
    try {
      const { sessionId, otpCode } = verifyDto;
      
      // Verify session exists
      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired session');
      }
      
      if (!session.isVerified || !session.flashUserId) {
        throw new UnauthorizedException('Account not linked');
      }
      
      // Verify OTP
      const isValid = await this.otpService.verifyOtp(sessionId, otpCode);
      if (!isValid) {
        throw new UnauthorizedException('Invalid or expired OTP code');
      }
      
      // Update MFA status
      await this.sessionService.setMfaVerified(sessionId, true);
      
      return { verified: true };
    } catch (error) {
      this.logger.error(`Error verifying MFA: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(sessionId: string, consentGiven: boolean): Promise<UserSession | null> {
    try {
      return this.sessionService.setConsent(sessionId, consentGiven);
    } catch (error) {
      this.logger.error(`Error recording consent: ${error.message}`, error.stack);
      throw error;
    }
  }
}