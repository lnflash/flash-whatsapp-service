import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../../src/modules/auth/services/session.service';
import { FlashApiService } from '../../src/modules/flash-api/flash-api.service';
import { BalanceService } from '../../src/modules/flash-api/services/balance.service';
import { RedisService } from '../../src/modules/redis/redis.service';

describe('Balance Check Flow (Integration)', () => {
  let app: INestApplication;
  let sessionService: SessionService;
  let balanceService: BalanceService;
  let _flashApiService: FlashApiService;
  let redisService: RedisService;
  let _configService: ConfigService;

  beforeAll(async () => {
    // Create a test module with real services but mocked external dependencies
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FlashApiService)
      .useValue({
        executeQuery: jest.fn().mockImplementation((query, variables) => {
          // Mock responses based on the query
          if (query.includes('getAccountBalance')) {
            if (variables.userId === 'flash-user-123') {
              return {
                balance: {
                  btc: '0.00123456',
                  sats: '123456',
                  fiat: {
                    jmd: '1234.56',
                    usd: '50.23',
                  },
                },
              };
            } else if (variables.userId === 'zero-balance-user') {
              return {
                balance: {
                  btc: '0.00000000',
                  sats: '0',
                  fiat: {
                    jmd: '0.00',
                    usd: '0.00',
                  },
                },
              };
            }
            return null;
          }
          return null;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // Get service instances
    sessionService = moduleFixture.get<SessionService>(SessionService);
    balanceService = moduleFixture.get<BalanceService>(BalanceService);
    _flashApiService = moduleFixture.get<FlashApiService>(FlashApiService);
    redisService = moduleFixture.get<RedisService>(RedisService);
    _configService = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Create test sessions before each test
    const phoneNumber = '+18765551234';
    const whatsappId = '18765551234';

    // Delete any existing sessions
    const existingSessionId = await redisService.get(`whatsapp:${whatsappId}`);
    if (existingSessionId) {
      await sessionService.deleteSession(existingSessionId);
    }

    // Create a verified test session
    await sessionService.createSession(whatsappId, phoneNumber, 'flash-user-123');

    // Create a session with no balance
    await sessionService.createSession('18765550000', '+18765550000', 'zero-balance-user');

    // Create an unverified session
    await sessionService.createSession('18765559999', '+18765559999');
  });

  describe('Webhook - Balance Check Flow', () => {
    it('should return balance for verified user', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Simulate a "balance" command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: 'balance',
          ProfileName: 'Test User',
          WaId: '18765551234',
        })
        .expect(200)
        .expect((res) => {
          // Check that the response contains balance information
          expect(res.body.message).toContain('123,456 sats');
          expect(res.body.message).toContain('JMD 1,234.56');
        });

      // Verify that the balance was cached
      const cacheKey = `balance:flash-user-123`;
      const cachedBalance = await redisService.get(cacheKey);
      expect(cachedBalance).toBeTruthy();
    });

    it('should handle zero balance properly', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Simulate a "balance" command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765550000',
          Body: 'balance',
          ProfileName: 'Zero Balance User',
          WaId: '18765550000',
        })
        .expect(200)
        .expect((res) => {
          // Check that the response appropriately shows zero balance
          expect(res.body.message).toContain('0 sats');
          expect(res.body.message).toContain('JMD 0.00');
        });
    });

    it('should reject balance check for unverified user', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Simulate a "balance" command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765559999',
          Body: 'balance',
          ProfileName: 'Unverified User',
          WaId: '18765559999',
        })
        .expect(200)
        .expect((res) => {
          // Check that the response contains a message about linking
          expect(res.body.message).toContain('need to link');
        });
    });

    it('should rate limit balance check requests', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Set low rate limit for testing
      const rateLimit = 3;
      const rateLimitKey = `rate-limit:balance:18765551234`;

      // Simulate reaching the rate limit
      await redisService.set(rateLimitKey, String(rateLimit), 60);

      // Simulate a "balance" command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: 'balance',
          ProfileName: 'Test User',
          WaId: '18765551234',
        })
        .expect(200)
        .expect((res) => {
          // Check that the response contains a rate limit message
          expect(res.body.message).toContain('too many requests');
        });
    });

    it('should use cached balance when available', async () => {
      // Mock Twilio webhook signature validation
      const mockSignature = 'valid-signature';

      // Set a cached balance
      const cacheKey = `balance:flash-user-123`;
      const cachedBalance = JSON.stringify({
        btc: '0.00654321',
        sats: '654321',
        fiat: {
          jmd: '6543.21',
          usd: '265.43',
        },
      });
      await redisService.set(cacheKey, cachedBalance, 300);

      // Create a spy on the balance service
      const balanceServiceSpy = jest.spyOn(balanceService, 'getUserBalance');

      // Simulate a "balance" command from WhatsApp
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: 'balance',
          ProfileName: 'Test User',
          WaId: '18765551234',
        })
        .expect(200)
        .expect((res) => {
          // Check that the response contains the cached balance
          expect(res.body.message).toContain('654,321 sats');
          expect(res.body.message).toContain('JMD 6,543.21');
        });

      // Verify that the balance service was not called (used cache)
      expect(balanceServiceSpy).not.toHaveBeenCalled();
    });
  });
});
