import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { OtpService } from './otp.service';
import { FlashApiService } from '../../flash-api/flash-api.service';
import { AccountLinkRequestDto } from '../dto/account-link-request.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { UserSession } from '../interfaces/user-session.interface';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let _sessionService: SessionService;
  let _otpService: OtpService;
  let flashApiService: FlashApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: SessionService,
          useValue: {
            getSessionByWhatsappId: jest.fn(),
            createSession: jest.fn(),
            updateSession: jest.fn(),
            getSession: jest.fn(),
            setMfaVerified: jest.fn(),
            setConsent: jest.fn(),
            isMfaValidated: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            generateOtp: jest.fn(),
            verifyOtp: jest.fn(),
          },
        },
        {
          provide: FlashApiService,
          useValue: {
            initiatePhoneVerification: jest.fn(),
            validatePhoneVerification: jest.fn(),
            getUserDetails: jest.fn(),
            executeQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _sessionService = module.get<SessionService>(SessionService);
    _otpService = module.get<OtpService>(OtpService);
    flashApiService = module.get<FlashApiService>(FlashApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateAccountLinking', () => {
    it('should initiate account linking for a new user', async () => {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
      };

      // Mock Flash API initiatePhoneVerification to return success
      jest.spyOn(flashApiService, 'initiatePhoneVerification').mockResolvedValue({ success: true });

      // Mock _sessionService to return null (no existing session)
      jest.spyOn(_sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Mock session creation
      const mockSession: UserSession = {
        sessionId: 'test_session_id',
        whatsappId: linkRequest.whatsappId,
        phoneNumber: linkRequest.phoneNumber,
        isVerified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };
      jest.spyOn(_sessionService, 'createSession').mockResolvedValue(mockSession);

      const result = await service.initiateAccountLinking(linkRequest);

      expect(result).toEqual({
        sessionId: 'test_session_id',
        otpSent: true,
      });

      // Verify the correct services were called
      expect(flashApiService.initiatePhoneVerification).toHaveBeenCalledWith(
        linkRequest.phoneNumber,
      );
      expect(_sessionService.getSessionByWhatsappId).toHaveBeenCalledWith(linkRequest.whatsappId);
      expect(_sessionService.createSession).toHaveBeenCalledWith(
        linkRequest.whatsappId,
        linkRequest.phoneNumber,
      );
    });

    it('should reject linking if Flash API fails to send verification code', async () => {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
      };

      // Mock Flash API initiatePhoneVerification to return failure
      jest.spyOn(flashApiService, 'initiatePhoneVerification').mockResolvedValue({
        success: false,
        errors: [{ message: 'Failed to send verification code' }],
      });

      // Mock _sessionService to return null (no existing session)
      jest.spyOn(_sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);

      // Mock session creation
      const mockSession: UserSession = {
        sessionId: 'test_session_id',
        whatsappId: linkRequest.whatsappId,
        phoneNumber: linkRequest.phoneNumber,
        isVerified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };
      jest.spyOn(_sessionService, 'createSession').mockResolvedValue(mockSession);

      await expect(service.initiateAccountLinking(linkRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return existing session if already verified', async () => {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
      };

      // Mock _sessionService to return existing verified session
      const existingSession: UserSession = {
        sessionId: 'existing_session_id',
        whatsappId: linkRequest.whatsappId,
        phoneNumber: linkRequest.phoneNumber,
        flashUserId: 'flash_123',
        isVerified: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };
      jest.spyOn(_sessionService, 'getSessionByWhatsappId').mockResolvedValue(existingSession);

      const result = await service.initiateAccountLinking(linkRequest);

      expect(result).toEqual({
        sessionId: 'existing_session_id',
        otpSent: false,
      });
    });
  });

  describe('verifyAccountLinking', () => {
    it('should verify account linking with valid OTP', async () => {
      const verifyDto: VerifyOtpDto = {
        sessionId: 'test_session_id',
        otpCode: '123456',
      };

      // Mock session retrieval
      const mockSession: UserSession = {
        sessionId: verifyDto.sessionId,
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
        isVerified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };
      jest.spyOn(_sessionService, 'getSession').mockResolvedValue(mockSession);

      // Mock Flash API validatePhoneVerification to return auth token
      jest.spyOn(flashApiService, 'validatePhoneVerification').mockResolvedValue({
        authToken: 'test_auth_token',
      });

      // Mock Flash API getUserDetails
      jest.spyOn(flashApiService, 'getUserDetails').mockResolvedValue({
        id: 'flash_123',
        phone: mockSession.phoneNumber,
        username: 'testuser',
      });

      // Mock session update
      const updatedSession: UserSession = {
        ...mockSession,
        flashUserId: 'flash_123',
        flashAuthToken: 'test_auth_token',
        isVerified: true,
        mfaVerified: true,
        mfaExpiresAt: new Date(Date.now() + 300000),
      };
      jest.spyOn(_sessionService, 'updateSession').mockResolvedValue(updatedSession);

      const result = await service.verifyAccountLinking(verifyDto);

      expect(result).toEqual(updatedSession);

      // Verify the correct services were called
      expect(_sessionService.getSession).toHaveBeenCalledWith(verifyDto.sessionId);
      expect(flashApiService.validatePhoneVerification).toHaveBeenCalledWith(
        mockSession.phoneNumber,
        verifyDto.otpCode,
      );
      expect(flashApiService.getUserDetails).toHaveBeenCalledWith('test_auth_token');
      expect(_sessionService.updateSession).toHaveBeenCalledWith(
        verifyDto.sessionId,
        expect.objectContaining({
          flashUserId: 'flash_123',
          flashAuthToken: 'test_auth_token',
          isVerified: true,
          mfaVerified: true,
        }),
      );
    });

    it('should reject verification with invalid OTP', async () => {
      const verifyDto: VerifyOtpDto = {
        sessionId: 'test_session_id',
        otpCode: '654321',
      };

      // Mock session retrieval
      const mockSession: UserSession = {
        sessionId: verifyDto.sessionId,
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
        isVerified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: false,
        consentGiven: false,
      };
      jest.spyOn(_sessionService, 'getSession').mockResolvedValue(mockSession);

      // Mock Flash API validatePhoneVerification to return error
      jest.spyOn(flashApiService, 'validatePhoneVerification').mockResolvedValue({
        errors: [{ message: 'Invalid or expired verification code' }],
      });

      await expect(service.verifyAccountLinking(verifyDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateMfa', () => {
    it('should check if MFA is validated', async () => {
      const sessionId = 'test_session_id';

      // Mock MFA validation check
      jest.spyOn(_sessionService, 'isMfaValidated').mockResolvedValue(true);

      const result = await service.validateMfa(sessionId);

      expect(result).toBe(true);
      expect(_sessionService.isMfaValidated).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('recordConsent', () => {
    it('should record user consent', async () => {
      const sessionId = 'test_session_id';
      const consentGiven = true;

      // Mock consent recording
      const mockSession: UserSession = {
        sessionId,
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
        flashUserId: 'flash_123',
        isVerified: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        lastActivity: new Date(),
        mfaVerified: true,
        consentGiven: true,
        consentTimestamp: new Date(),
      };
      jest.spyOn(_sessionService, 'setConsent').mockResolvedValue(mockSession);

      const result = await service.recordConsent(sessionId, consentGiven);

      expect(result).toEqual(mockSession);
      expect(_sessionService.setConsent).toHaveBeenCalledWith(sessionId, consentGiven);
    });
  });
});
