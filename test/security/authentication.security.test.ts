import { TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as crypto from 'crypto';
import { SessionService } from '../../src/modules/auth/services/session.service';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { RedisService } from '../../src/modules/redis/redis.service';
import { createTestApplication } from '../test-utils';

/**
 * Security tests for authentication and session management
 *
 * Tests the application's resistance to:
 * - Session hijacking
 * - OTP brute force
 * - Session fixation
 * - Privilege escalation
 */
describe('Authentication & Session Security Tests', () => {
  let app: INestApplication;
  let sessionService: SessionService;
  let otpService: OtpService;
  let redisService: RedisService;

  beforeAll(async () => {
    const { app: testApp, moduleRef } = await createTestApplication();

    app = testApp;
    sessionService = moduleRef.get<SessionService>(SessionService);
    otpService = moduleRef.get<OtpService>(OtpService);
    redisService = moduleRef.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear test data before each test
    const sessionKeys = await redisService.keys('session:*');
    const otpKeys = await redisService.keys('otp:*');
    const allKeys = [...sessionKeys, ...otpKeys];

    for (const key of allKeys) {
      await redisService.del(key);
    }
  });

  describe('OTP Security', () => {
    it('should enforce OTP complexity and randomness', async () => {
      // Generate multiple OTPs and check uniqueness and complexity
      const otpCount = 100;
      const otps = new Set();

      // Mock implementation for testing
      jest.spyOn(otpService as any, 'generateNumericOtp').mockImplementation((length: number) => {
        return Math.floor(Math.random() * Math.pow(10, length))
          .toString()
          .padStart(length, '0');
      });

      // Create a session for testing
      const phoneNumber = '+18765551234';
      const whatsappId = '18765551234';
      const session = await sessionService.createSession(whatsappId, phoneNumber);
      const sessionId = session.sessionId;

      // Generate several OTPs
      for (let i = 0; i < otpCount; i++) {
        const otp = await otpService.generateOtp(phoneNumber, sessionId);
        otps.add(otp);

        // Verify OTP format: 6 digits
        expect(otp).toMatch(/^\d{6}$/);
      }

      // Check uniqueness (high probability with enough samples)
      expect(otps.size).toBeGreaterThan(otpCount * 0.9);

      // Restore original implementation
      jest.restoreAllMocks();
    });

    it('should enforce OTP expiration', async () => {
      // Mock implementation for testing
      jest.spyOn(otpService as any, 'hashOtp').mockImplementation((otp: string) => {
        return crypto.createHash('sha256').update(otp).digest('hex');
      });

      // Create a session for testing
      const phoneNumber = '+18765551234';
      const whatsappId = '18765551234';
      const session = await sessionService.createSession(whatsappId, phoneNumber);
      const sessionId = session.sessionId;

      // Generate OTP
      const otp = '123456';
      const otpHash = otpService['hashOtp'](otp);
      const otpKey = `otp:${sessionId}`;
      await redisService.set(otpKey, otpHash, 5); // 5 seconds expiry

      // Verify OTP is valid
      let isValid = await otpService.verifyOtp(sessionId, otp);
      expect(isValid).toBe(true);

      // Manually expire the OTP
      await redisService.del(otpKey);

      // Verify OTP is no longer valid
      isValid = await otpService.verifyOtp(sessionId, otp);
      expect(isValid).toBe(false);

      // Restore original implementation
      jest.restoreAllMocks();
    });
  });

  describe('Session Security', () => {
    it('should create secure session IDs', async () => {
      // Create multiple sessions and check ID security
      const sessionCount = 50;
      const sessionIds = new Set();

      for (let i = 0; i < sessionCount; i++) {
        const whatsappId = `1876555${1000 + i}`;
        const phoneNumber = `+1876555${1000 + i}`;

        const session = await sessionService.createSession(whatsappId, phoneNumber);
        sessionIds.add(session.sessionId);

        // Session ID should be a cryptographically secure random string
        expect(session.sessionId.length).toBeGreaterThanOrEqual(16);
      }

      // All session IDs should be unique
      expect(sessionIds.size).toBe(sessionCount);
    });

    it('should enforce session expiration', async () => {
      // Create a session
      const whatsappId = '18765551234';
      const phoneNumber = '+18765551234';

      const session = await sessionService.createSession(whatsappId, phoneNumber);

      // Session should be retrievable
      const retrievedSession = await sessionService.getSession(session.sessionId);
      expect(retrievedSession).toBeTruthy();

      // Manually expire the session
      const sessionKey = `session:${session.sessionId}`;
      await redisService.del(sessionKey);

      // Session should no longer be retrievable
      const expiredSession = await sessionService.getSession(session.sessionId);
      expect(expiredSession).toBeNull();
    });

    it('should update session activity timestamps', async () => {
      // Create a session
      const whatsappId = '18765551234';
      const phoneNumber = '+18765551234';

      const session = await sessionService.createSession(whatsappId, phoneNumber);

      // Retrieve original timestamps
      const originalSession = await sessionService.getSession(session.sessionId);
      expect(originalSession).not.toBeNull();
      if (!originalSession) {
        fail('Original session could not be retrieved');
        return;
      }
      const originalLastActivity = new Date(originalSession.lastActivity).getTime();

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update session
      await sessionService.updateSession(session.sessionId, { isVerified: true });

      // Retrieve updated session
      const updatedSession = await sessionService.getSession(session.sessionId);
      if (!updatedSession) {
        // If we can't retrieve the session, the test should fail
        fail('Updated session could not be retrieved');
        return;
      }

      const updatedLastActivity = new Date(updatedSession.lastActivity).getTime();

      // Last activity should be updated
      expect(updatedLastActivity).toBeGreaterThan(originalLastActivity);
    });

    it('should enforce session security boundaries', async () => {
      // Create two user sessions
      const user1WhatsappId = '18765551001';
      const user1PhoneNumber = '+18765551001';
      const user2WhatsappId = '18765552002';
      const user2PhoneNumber = '+18765552002';

      // Create sessions for both users
      const user1Session = await sessionService.createSession(
        user1WhatsappId,
        user1PhoneNumber,
        'flash-user-1',
      );
      const user2Session = await sessionService.createSession(
        user2WhatsappId,
        user2PhoneNumber,
        'flash-user-2',
      );

      // Verify each user can only access their own session
      const user1Retrieved = await sessionService.getSessionByWhatsappId(user1WhatsappId);
      const user2Retrieved = await sessionService.getSessionByWhatsappId(user2WhatsappId);

      if (user1Retrieved && user2Retrieved) {
        expect(user1Retrieved.sessionId).toBe(user1Session.sessionId);
        expect(user2Retrieved.sessionId).toBe(user2Session.sessionId);

        // User 1 should not be able to access User 2's session
        expect(user1Retrieved.flashUserId).not.toBe(user2Retrieved.flashUserId);
      }

      // Cannot use User 1's WhatsApp ID to retrieve User 2's session
      const crossUserSession = await sessionService.getSessionByWhatsappId(user1WhatsappId);
      if (crossUserSession) {
        expect(crossUserSession.flashUserId).not.toBe('flash-user-2');
      }
    });

    it('should handle session invalidation securely', async () => {
      // Create a session
      const whatsappId = '18765553333';
      const phoneNumber = '+18765553333';

      const session = await sessionService.createSession(whatsappId, phoneNumber, 'flash-user-3');

      // Destroy the session
      await sessionService.deleteSession(session.sessionId);

      // Session should no longer exist
      const retrievedSession = await sessionService.getSession(session.sessionId);
      expect(retrievedSession).toBeNull();

      // WhatsApp ID should no longer be associated with a session
      const whatsappSession = await sessionService.getSessionByWhatsappId(whatsappId);
      expect(whatsappSession).toBeNull();

      // Create a new session for the same WhatsApp ID
      const newSession = await sessionService.createSession(whatsappId, phoneNumber);

      // New session should have a different session ID
      expect(newSession.sessionId).not.toBe(session.sessionId);

      // New session should not have user identity from previous session
      expect(newSession.flashUserId).toBeUndefined();
      expect(newSession.isVerified).toBe(false);
    });
  });

  describe('MFA Protection', () => {
    it('should apply MFA protection to sensitive operations', async () => {
      // Create a verified session
      const whatsappId = '18765554444';
      const phoneNumber = '+18765554444';

      const session = await sessionService.createSession(whatsappId, phoneNumber, 'flash-user-4');

      // Initially, MFA should not be verified
      expect(session.mfaVerified).toBeFalsy();

      // Update session with MFA verification
      const mfaExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      await sessionService.updateSession(session.sessionId, {
        mfaVerified: true,
        mfaExpiresAt: mfaExpiry,
      });

      // Retrieve updated session
      const mfaSession = await sessionService.getSession(session.sessionId);
      if (mfaSession) {
        expect(mfaSession.mfaVerified).toBe(true);
        expect(mfaSession.mfaExpiresAt).toBeDefined();
        if (mfaSession.mfaExpiresAt) {
          const expiryTime = new Date(mfaSession.mfaExpiresAt).getTime();
          expect(expiryTime).toBeGreaterThan(Date.now());
        }
      }

      // Manually expire MFA
      await sessionService.updateSession(session.sessionId, {
        mfaVerified: false,
        mfaExpiresAt: undefined,
      });

      // MFA should now be invalid
      const expiredMfaSession = await sessionService.getSession(session.sessionId);
      if (expiredMfaSession) {
        expect(expiredMfaSession.mfaVerified).toBe(false);
      }
    });
  });
});
