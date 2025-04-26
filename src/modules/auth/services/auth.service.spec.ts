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
  let sessionService: SessionService;
  let otpService: OtpService;
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
            verifyUserAccount: jest.fn(),
            executeQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    sessionService = module.get<SessionService>(SessionService);
    otpService = module.get<OtpService>(OtpService);
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
      
      // Mock Flash API verifyUserAccount to return true
      jest.spyOn(flashApiService, 'verifyUserAccount').mockResolvedValue(true);
      
      // Mock sessionService to return null (no existing session)
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(null);
      
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
      jest.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);
      
      // Mock OTP generation
      jest.spyOn(otpService, 'generateOtp').mockResolvedValue('123456');
      
      const result = await service.initiateAccountLinking(linkRequest);
      
      expect(result).toEqual({
        sessionId: 'test_session_id',
        otpSent: true,
      });
      
      // Verify the correct services were called
      expect(flashApiService.verifyUserAccount).toHaveBeenCalledWith(linkRequest.phoneNumber);
      expect(sessionService.getSessionByWhatsappId).toHaveBeenCalledWith(linkRequest.whatsappId);
      expect(sessionService.createSession).toHaveBeenCalledWith(linkRequest.whatsappId, linkRequest.phoneNumber);
      expect(otpService.generateOtp).toHaveBeenCalledWith(linkRequest.phoneNumber, mockSession.sessionId);
    });

    it('should reject linking if no Flash account exists', async () => {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
      };
      
      // Mock Flash API verifyUserAccount to return false
      jest.spyOn(flashApiService, 'verifyUserAccount').mockResolvedValue(false);
      
      await expect(service.initiateAccountLinking(linkRequest)).rejects.toThrow(BadRequestException);
    });

    it('should return existing session if already verified', async () => {
      const linkRequest: AccountLinkRequestDto = {
        whatsappId: '18765551234',
        phoneNumber: '+18765551234',
      };
      
      // Mock Flash API verifyUserAccount to return true
      jest.spyOn(flashApiService, 'verifyUserAccount').mockResolvedValue(true);
      
      // Mock sessionService to return existing verified session
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
      jest.spyOn(sessionService, 'getSessionByWhatsappId').mockResolvedValue(existingSession);
      
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
      jest.spyOn(sessionService, 'getSession').mockResolvedValue(mockSession);
      
      // Mock OTP verification
      jest.spyOn(otpService, 'verifyOtp').mockResolvedValue(true);
      
      // Mock session update
      const updatedSession: UserSession = {
        ...mockSession,
        flashUserId: 'flash_123',
        isVerified: true,
        mfaVerified: true,
        mfaExpiresAt: new Date(Date.now() + 300000),
      };
      jest.spyOn(sessionService, 'updateSession').mockResolvedValue(updatedSession);
      
      const result = await service.verifyAccountLinking(verifyDto);
      
      expect(result).toEqual(updatedSession);
      
      // Verify the correct services were called
      expect(sessionService.getSession).toHaveBeenCalledWith(verifyDto.sessionId);
      expect(otpService.verifyOtp).toHaveBeenCalledWith(verifyDto.sessionId, verifyDto.otpCode);
      expect(sessionService.updateSession).toHaveBeenCalledWith(
        verifyDto.sessionId,
        expect.objectContaining({
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
      jest.spyOn(sessionService, 'getSession').mockResolvedValue(mockSession);
      
      // Mock OTP verification to fail
      jest.spyOn(otpService, 'verifyOtp').mockResolvedValue(false);
      
      await expect(service.verifyAccountLinking(verifyDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateMfa', () => {
    it('should check if MFA is validated', async () => {
      const sessionId = 'test_session_id';
      
      // Mock MFA validation check
      jest.spyOn(sessionService, 'isMfaValidated').mockResolvedValue(true);
      
      const result = await service.validateMfa(sessionId);
      
      expect(result).toBe(true);
      expect(sessionService.isMfaValidated).toHaveBeenCalledWith(sessionId);
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
      jest.spyOn(sessionService, 'setConsent').mockResolvedValue(mockSession);
      
      const result = await service.recordConsent(sessionId, consentGiven);
      
      expect(result).toEqual(mockSession);
      expect(sessionService.setConsent).toHaveBeenCalledWith(sessionId, consentGiven);
    });
  });
});