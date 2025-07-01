import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cryptoNode from 'crypto'; // Import as cryptoNode to avoid confusion
import { AppModule } from '../../src/app.module';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/modules/auth/services/auth.service';
import { SessionService } from '../../src/modules/auth/services/session.service';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { FlashApiService } from '../../src/modules/flash-api/flash-api.service';
import { RedisService } from '../../src/modules/redis/redis.service';

describe('Account Linking Flow (Integration)', () => {
  let app: INestApplication;
  let _authService: AuthService;
  let sessionService: SessionService;
  let otpService: OtpService;
  let _flashApiService: FlashApiService;
  let redisService: RedisService;
  let configService: ConfigService;

  beforeAll(async () => {
    // Create a test module with real services but mocked external dependencies
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FlashApiService)
      .useValue({
        executeQuery: jest.fn().mockImplementation((query, variables) => {
          // Mock responses based on the query
          if (query.includes('getAccountByPhoneNumber')) {
            if (variables.phoneNumber === '+18765551234') {
              return { account: { id: 'flash-user-123', phoneNumber: '+18765551234' } };
            }
            return null;
          }
          return null;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // Get service instances
    _authService = moduleFixture.get<AuthService>(AuthService);
    sessionService = moduleFixture.get<SessionService>(SessionService);
    otpService = moduleFixture.get<OtpService>(OtpService);
    _flashApiService = moduleFixture.get<FlashApiService>(FlashApiService);
    redisService = moduleFixture.get<RedisService>(RedisService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Webhook - Account Linking Flow', () => {
    it('should initiate account linking for a valid phone number', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Create initial session
      const whatsappId = '18765551234';
      const phoneNumber = '+18765551234';
      const session = await sessionService.createSession(whatsappId, phoneNumber);

      // Simulate a "link" command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: 'link',
          ProfileName: 'Test User',
          WaId: '18765551234',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('verification code');
        });

      // Verify OTP was generated
      const otpKey = `otp:${session.sessionId}`;
      const storedOtp = await redisService.get(otpKey);
      expect(storedOtp).toBeTruthy();
    });

    it('should reject account linking for an invalid phone number', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Create initial session
      const whatsappId = '19999999999';
      const phoneNumber = '+19999999999';
      await sessionService.createSession(whatsappId, phoneNumber);

      // Simulate a "link" command from WhatsApp with invalid number
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+19999999999', // Number not in Flash system
          Body: 'link',
          ProfileName: 'Test User',
          WaId: '19999999999',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('not found');
        });
    });

    it('should verify OTP and complete account linking', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // First, generate a real OTP
      const phoneNumber = '+18765551234';
      const whatsappId = '18765551234';
      const session = await sessionService.createSession(whatsappId, phoneNumber);
      const otp = '123456'; // Test OTP

      // Store the OTP in Redis manually for testing
      const otpKey = `otp:${session.sessionId}`;
      const otpHash = cryptoNode
        .createHash('sha256')
        .update(otp + configService.get<string>('security.jwtSecret', 'test-secret'))
        .digest('hex');

      await redisService.set(otpKey, otpHash, 300); // 5 minutes expiry

      // Override the verify method for testing
      jest.spyOn(otpService, 'verifyOtp').mockImplementation(async () => true);

      // Simulate a verification command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM987654321',
          From: `whatsapp:${phoneNumber}`,
          Body: `verify ${otp}`,
          ProfileName: 'Test User',
          WaId: whatsappId,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('successfully linked');
        });

      // Verify session was updated
      const updatedSession = await sessionService.getSessionByWhatsappId(whatsappId);
      expect(updatedSession).toBeTruthy();
      expect(updatedSession?.phoneNumber).toBe(phoneNumber);
      expect(updatedSession?.isVerified).toBe(true);
    });

    it('should reject verification with invalid OTP', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Override the verify method for testing
      jest.spyOn(otpService, 'verifyOtp').mockImplementation(async () => false);

      // Simulate a verification command with wrong OTP
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: 'verify 999999', // Wrong OTP
          ProfileName: 'Test User',
          WaId: '18765551234',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid');
        });

      // Reset mock
      jest.restoreAllMocks();
    });

    it('should unlink account when requested', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // First ensure we have a session
      const phoneNumber = '+18765551234';
      const whatsappId = '18765551234';

      // Create a test session if one doesn't exist
      let session = await sessionService.getSessionByWhatsappId(whatsappId);
      if (!session) {
        await sessionService.createSession(whatsappId, phoneNumber, 'flash-user-123');
      }

      // Simulate an unlink command
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: `whatsapp:${phoneNumber}`,
          Body: 'unlink',
          ProfileName: 'Test User',
          WaId: whatsappId,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('unlinked');
        });

      // Verify session was deleted
      session = await sessionService.getSessionByWhatsappId(whatsappId);
      expect(session).toBeNull();
    });
  });
});
