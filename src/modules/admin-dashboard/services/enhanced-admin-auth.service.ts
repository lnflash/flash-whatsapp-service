import { Injectable, UnauthorizedException, Logger, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from '../../auth/services/otp.service';
import { SessionService } from '../../auth/services/session.service';
import { WhatsAppWebService } from '../../whatsapp/services/whatsapp-web.service';
import { TOTPAuthService } from './totp-auth.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { SecurityEventService } from './security-event.service';
import { RBACService } from './rbac.service';
import {
  AdminLoginDto,
  AdminVerifyOtpDto,
  AdminSessionDto,
  AdminTOTPVerifyDto,
} from '../dto/admin-auth.dto';
import { UserRole, Permission } from '../types/auth.types';
import { SecurityEventType } from './security-event.service';

export interface EnhancedAdminUser {
  id: string;
  phoneNumber: string;
  role: UserRole;
  permissions: Permission[];
  totpEnabled: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

@Injectable()
export class EnhancedAdminAuthService {
  private readonly logger = new Logger(EnhancedAdminAuthService.name);
  private readonly adminConfig: Map<string, AdminConfig>;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly sessionService: SessionService,
    private readonly whatsappWebService: WhatsAppWebService,
    private readonly totpService: TOTPAuthService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    private readonly securityEventService: SecurityEventService,
    private readonly rbacService: RBACService,
  ) {
    // Load admin configuration from environment
    this.adminConfig = this.loadAdminConfig();
  }

  /**
   * Initiate login with phone number
   */
  async initiateLogin(loginDto: AdminLoginDto): Promise<{ message: string; sessionId: string }> {
    const { phoneNumber, deviceFingerprint } = loginDto;
    const ipAddress = loginDto.ipAddress || 'unknown';
    const userAgent = loginDto.userAgent || 'unknown';

    try {
      // Validate and clean phone number
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);

      // Check if admin exists
      const adminConfig = this.getAdminConfig(cleanNumber);
      if (!adminConfig) {
        await this.securityEventService.logEvent({
          type: SecurityEventType.LOGIN_FAILURE,
          ipAddress,
          userAgent,
          details: { reason: 'unauthorized_phone', phoneNumber: cleanNumber },
        });
        throw new UnauthorizedException('This phone number is not authorized for admin access');
      }

      // Check rate limiting
      const isRateLimited = await this.checkRateLimit(cleanNumber, ipAddress);
      if (isRateLimited) {
        await this.securityEventService.logEvent({
          type: SecurityEventType.RATE_LIMIT_EXCEEDED,
          ipAddress,
          userAgent,
          details: { phoneNumber: cleanNumber },
        });
        throw new ForbiddenException('Too many login attempts. Please try again later.');
      }

      // Create temporary session
      const sessionId = await this.createTempSession(cleanNumber, deviceFingerprint, ipAddress);

      // Generate and send OTP
      const otp = await this.otpService.generateOtp(cleanNumber, sessionId);
      await this.sendOTP(cleanNumber, otp);

      // Log login attempt
      await this.securityEventService.logEvent({
        type: SecurityEventType.LOGIN_ATTEMPT,
        ipAddress,
        userAgent,
        sessionId,
        details: { phoneNumber: cleanNumber },
      });

      return {
        message: 'Verification code sent to your WhatsApp',
        sessionId,
      };
    } catch (error) {
      this.logger.error(`Login initiation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify OTP and proceed with authentication
   */
  async verifyOtp(verifyDto: AdminVerifyOtpDto): Promise<AdminSessionDto | Partial<AdminSessionDto>> {
    const { sessionId, otp, deviceFingerprint } = verifyDto;

    // Get temp session
    const tempSession = await this.getTempSession(sessionId);
    if (!tempSession) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { phoneNumber, ipAddress } = tempSession;

    try {
      // Verify OTP
      const isValid = await this.otpService.verifyOtp(sessionId, otp);
      if (!isValid) {
        await this.securityEventService.logEvent({
          type: SecurityEventType.LOGIN_FAILURE,
          ipAddress,
          sessionId,
          details: { reason: 'invalid_otp' },
        });
        throw new UnauthorizedException('Invalid or expired verification code');
      }

      // Get admin user
      const adminUser = await this.getOrCreateAdminUser(phoneNumber);

      // Check if TOTP is enabled
      const totpEnabled = await this.totpService.isTOTPEnabled(adminUser.id);

      // Check if device is trusted (skip TOTP for trusted devices)
      let isTrustedDevice = false;
      if (deviceFingerprint) {
        const fingerprintObj = typeof deviceFingerprint === 'string' 
          ? JSON.parse(deviceFingerprint) 
          : deviceFingerprint;
        const deviceId = await this.deviceFingerprintService.generateDeviceId(fingerprintObj);
        isTrustedDevice = await this.totpService.isDeviceTrusted(adminUser.id, deviceId);
      }

      if (totpEnabled && !isTrustedDevice) {
        // Return partial session requiring TOTP
        return {
          sessionId,
          totpRequired: true,
          message: 'Please enter your authenticator code',
        };
      }

      // Complete authentication
      return this.completeAuthentication(adminUser, deviceFingerprint, ipAddress);
    } catch (error) {
      this.logger.error(`OTP verification failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify TOTP and complete authentication
   */
  async verifyTOTP(verifyDto: AdminTOTPVerifyDto): Promise<AdminSessionDto> {
    const { sessionId, totpCode, token, deviceFingerprint, trustDevice } = verifyDto;
    const actualToken = totpCode || token;

    // Get temp session
    const tempSession = await this.getTempSession(sessionId);
    if (!tempSession) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { phoneNumber, ipAddress } = tempSession;

    try {
      // Get admin user
      const adminUser = await this.getOrCreateAdminUser(phoneNumber);

      // Verify TOTP
      if (!actualToken) {
        throw new UnauthorizedException('TOTP code is required');
      }
      const isValid = await this.totpService.verifyTOTP(adminUser.id, actualToken);
      if (!isValid) {
        await this.securityEventService.logEvent({
          type: SecurityEventType.TOTP_FAILED,
          userId: adminUser.id,
          ipAddress,
          sessionId,
        });
        throw new UnauthorizedException('Invalid authenticator code');
      }

      // Trust device if requested
      if (trustDevice && deviceFingerprint) {
        const fingerprintObj = typeof deviceFingerprint === 'string' 
          ? JSON.parse(deviceFingerprint) 
          : deviceFingerprint;
        const deviceId = await this.deviceFingerprintService.generateDeviceId(fingerprintObj);
        const deviceName = this.deviceFingerprintService.getDeviceName(fingerprintObj);
        await this.totpService.registerTrustedDevice(adminUser.id, deviceId, deviceName);
      }

      // Log successful TOTP verification
      await this.securityEventService.logEvent({
        type: SecurityEventType.TOTP_VERIFIED,
        userId: adminUser.id,
        ipAddress,
        sessionId,
      });

      // Complete authentication
      return this.completeAuthentication(adminUser, deviceFingerprint, ipAddress);
    } catch (error) {
      this.logger.error(`TOTP verification failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Setup TOTP for admin user
   */
  async setupTOTP(userId: string, phoneNumber: string): Promise<any> {
    const setup = await this.totpService.setupTOTP(userId, phoneNumber);

    await this.securityEventService.logEvent({
      type: SecurityEventType.TOTP_SETUP,
      userId,
      details: { phoneNumber },
    });

    return setup;
  }

  /**
   * Complete authentication and create session
   */
  private async completeAuthentication(
    adminUser: EnhancedAdminUser,
    deviceFingerprint: any,
    ipAddress: string,
  ): Promise<AdminSessionDto> {
    // Create JWT tokens
    const payload = {
      userId: adminUser.id,
      phoneNumber: adminUser.phoneNumber,
      role: adminUser.role,
      type: 'admin-dashboard',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '30d',
    });

    // Create admin session
    const session = await this.createAdminSession(
      adminUser,
      accessToken,
      refreshToken,
      deviceFingerprint,
      ipAddress,
    );

    // Update last login
    await this.updateLastLogin(adminUser.id);

    // Log successful login
    await this.securityEventService.logEvent({
      type: SecurityEventType.LOGIN_SUCCESS,
      userId: adminUser.id,
      sessionId: session.id,
      ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400,
      phoneNumber: adminUser.phoneNumber,
      user: adminUser,
      sessionId: session.id,
    };
  }

  /**
   * Validate token with enhanced security checks
   */
  async validateToken(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'admin-dashboard') {
        return null;
      }

      // Get admin user
      const adminUser = await this.getAdminUser(payload.userId);
      if (!adminUser) {
        return null;
      }

      // Check if user still has admin access
      const adminConfig = this.getAdminConfig(adminUser.phoneNumber);
      if (!adminConfig) {
        return null;
      }

      return {
        ...payload,
        permissions: adminUser.permissions,
      };
    } catch {
      return null;
    }
  }

  /**
   * Helper methods
   */
  private loadAdminConfig(): Map<string, AdminConfig> {
    const adminConfig = new Map<string, AdminConfig>();
    
    // Load from environment variable
    const adminPhones = this.configService.get<string>('ADMIN_PHONE_NUMBERS', '').split(',');
    const adminRoles = this.configService.get<string>('ADMIN_ROLES', '').split(',');

    adminPhones.forEach((phone, index) => {
      const cleanPhone = phone.trim();
      if (cleanPhone) {
        adminConfig.set(cleanPhone, {
          phoneNumber: cleanPhone,
          role: (adminRoles[index]?.trim() as UserRole) || UserRole.ADMIN,
        });
      }
    });

    return adminConfig;
  }

  private getAdminConfig(phoneNumber: string): AdminConfig | undefined {
    return this.adminConfig.get(phoneNumber);
  }

  private async getOrCreateAdminUser(phoneNumber: string): Promise<EnhancedAdminUser> {
    const adminConfig = this.getAdminConfig(phoneNumber);
    if (!adminConfig) {
      throw new UnauthorizedException('Not authorized');
    }

    // Check if user exists
    let adminUser = await this.getAdminUserByPhone(phoneNumber);
    
    if (!adminUser) {
      // Create new admin user
      adminUser = await this.createAdminUser(phoneNumber, adminConfig.role);
    }

    // Get permissions for role
    const permissions = await this.rbacService.getPermissionsForRole(adminUser.role);
    
    return {
      ...adminUser,
      permissions,
    };
  }

  private async getAdminUser(userId: string): Promise<EnhancedAdminUser | null> {
    const userData = await this.sessionService.get(`admin:user:${userId}`);
    return userData ? JSON.parse(userData) : null;
  }

  private async getAdminUserByPhone(phoneNumber: string): Promise<EnhancedAdminUser | null> {
    const userId = await this.sessionService.get(`admin:phone:${phoneNumber}`);
    return userId ? this.getAdminUser(userId) : null;
  }

  private async createAdminUser(phoneNumber: string, role: UserRole): Promise<EnhancedAdminUser> {
    const userId = this.generateUserId();
    const adminUser: EnhancedAdminUser = {
      id: userId,
      phoneNumber,
      role,
      permissions: [],
      totpEnabled: false,
      createdAt: new Date(),
    };

    // Store user
    await this.sessionService.set(`admin:user:${userId}`, JSON.stringify(adminUser));
    await this.sessionService.set(`admin:phone:${phoneNumber}`, userId);

    return adminUser;
  }

  private async updateLastLogin(userId: string): Promise<void> {
    const adminUser = await this.getAdminUser(userId);
    if (adminUser) {
      adminUser.lastLoginAt = new Date();
      await this.sessionService.set(`admin:user:${userId}`, JSON.stringify(adminUser));
    }
  }

  private async checkRateLimit(phoneNumber: string, ipAddress: string): Promise<boolean> {
    const phoneKey = `ratelimit:login:phone:${phoneNumber}`;
    const ipKey = `ratelimit:login:ip:${ipAddress}`;

    const [phoneAttempts, ipAttempts] = await Promise.all([
      this.sessionService.incr(phoneKey),
      this.sessionService.incr(ipKey),
    ]);

    // Set expiry if first attempt
    if (phoneAttempts === 1) {
      await this.sessionService.expire(phoneKey, 300); // 5 minutes
    }
    if (ipAttempts === 1) {
      await this.sessionService.expire(ipKey, 300); // 5 minutes
    }

    // Check limits
    return phoneAttempts > 5 || ipAttempts > 10;
  }

  private async sendOTP(phoneNumber: string, otp: string): Promise<void> {
    if (!this.whatsappWebService.isClientReady()) {
      this.logger.warn('WhatsApp not connected, OTP not sent via WhatsApp');
      return;
    }

    const message =
      `🔐 *Admin Dashboard Login*\n\n` +
      `Your verification code is: *${otp}*\n\n` +
      `This code expires in 5 minutes.\n` +
      `If you didn't request this, please ignore.`;

    try {
      await this.whatsappWebService.sendMessage(`${phoneNumber}@c.us`, message);
    } catch (error) {
      this.logger.error('Failed to send OTP via WhatsApp:', error);
    }
  }

  private cleanPhoneNumber(phoneNumber: string): string {
    let cleaned = phoneNumber.replace(/\D/g, '');
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    return cleaned;
  }

  private generateUserId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private async createTempSession(
    phoneNumber: string,
    deviceFingerprint: any,
    ipAddress: string,
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    await this.sessionService.set(
      `admin:temp:${sessionId}`,
      {
        phoneNumber,
        deviceFingerprint,
        ipAddress,
        createdAt: Date.now(),
      },
      300, // 5 minutes
    );
    return sessionId;
  }

  private async getTempSession(sessionId: string): Promise<any> {
    return this.sessionService.get(`admin:temp:${sessionId}`);
  }

  private async createAdminSession(
    user: EnhancedAdminUser,
    accessToken: string,
    refreshToken: string,
    deviceFingerprint: any,
    ipAddress: string,
  ): Promise<any> {
    const sessionId = this.generateSessionId();
    const deviceId = await this.deviceFingerprintService.generateDeviceId(deviceFingerprint);
    
    const session = {
      id: sessionId,
      userId: user.id,
      phoneNumber: user.phoneNumber,
      accessToken,
      refreshToken,
      deviceId,
      ipAddress,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    await this.sessionService.set(
      `admin:session:${sessionId}`,
      session,
      2592000, // 30 days
    );

    await this.securityEventService.logEvent({
      type: SecurityEventType.SESSION_CREATED,
      userId: user.id,
      sessionId,
      ipAddress,
    });

    return session;
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

interface AdminConfig {
  phoneNumber: string;
  role: UserRole;
}