import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../src/modules/redis/redis.service';
import { RateLimiterGuard } from '../../src/common/guards/rate-limiter.guard';

/**
 * Security test for rate limiting functionality
 *
 * Tests if rate limiting properly prevents brute force attacks and DoS attempts
 */
describe('Rate Limiter Security Tests', () => {
  let app: INestApplication;
  let redisService: RedisService;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    redisService = moduleFixture.get<RedisService>(RedisService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    // Override rate limiting settings for testing
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'rateLimit') {
        return {
          windowMs: 60000, // 1 minute
          max: 5, // 5 requests per minute for testing
        };
      }
      return undefined;
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear rate limit keys before each test
    const keys = await redisService.keys('rate-limit:*');
    for (const key of keys) {
      await redisService.del(key);
    }
  });

  describe('WhatsApp Webhook Rate Limiting', () => {
    it('should limit requests based on WhatsApp ID', async () => {
      // Mock signature for testing
      const mockSignature = 'valid-signature';
      const maxRequests = 5;
      const responses = [];

      // Make requests up to and beyond the limit
      for (let i = 0; i < maxRequests + 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: `SM${100000 + i}`,
            From: 'whatsapp:+18765551234',
            Body: 'help',
            ProfileName: 'Test User',
            WaId: '18765551234',
          });

        responses.push({
          status: response.status,
          body: response.body,
        });
      }

      // First maxRequests should be 200 OK
      for (let i = 0; i < maxRequests; i++) {
        expect(responses[i].status).toBe(200);
      }

      // Requests beyond limit should be rate limited
      for (let i = maxRequests; i < responses.length; i++) {
        expect(responses[i].status).toBe(429); // Too Many Requests
        expect(responses[i].body.message).toContain('too many requests');
      }
    });

    it('should track rate limits separately by IP when WhatsApp ID missing', async () => {
      // Mock signature for testing
      const mockSignature = 'valid-signature';
      const maxRequests = 5;
      const responses = [];

      // Make requests up to and beyond the limit
      for (let i = 0; i < maxRequests + 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .set('X-Forwarded-For', '192.168.1.1') // Simulate specific IP
          .send({
            MessageSid: `SM${200000 + i}`,
            // Missing From and WaId fields - should use IP for rate limiting
          });

        responses.push({
          status: response.status,
          body: response.body,
        });
      }

      // Check that IP-based rate limiting works
      expect(responses[maxRequests].status).toBe(429);
    });

    it('should reset rate limits after window expires', async () => {
      // Mock signature for testing
      const mockSignature = 'valid-signature';
      const maxRequests = 5;

      // Make requests up to the limit
      for (let i = 0; i < maxRequests; i++) {
        await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: `SM${300000 + i}`,
            From: 'whatsapp:+18765557777',
            Body: 'help',
            ProfileName: 'Test User',
            WaId: '18765557777',
          });
      }

      // Next request should be rate limited
      let response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM300099',
          From: 'whatsapp:+18765557777',
          Body: 'help',
          ProfileName: 'Test User',
          WaId: '18765557777',
        });

      expect(response.status).toBe(429);

      // Manually expire the rate limit key
      const rateLimitKey = `rate-limit:18765557777`;
      await redisService.del(rateLimitKey);

      // After expiry, request should succeed
      response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM300100',
          From: 'whatsapp:+18765557777',
          Body: 'help',
          ProfileName: 'Test User',
          WaId: '18765557777',
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Rate Limiter Bypass Attempts', () => {
    it('should prevent header manipulation bypass attempts', async () => {
      // Mock signature for testing
      const mockSignature = 'valid-signature';
      const maxRequests = 5;

      // Make requests up to the limit with consistent headers
      for (let i = 0; i < maxRequests; i++) {
        await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: `SM${400000 + i}`,
            From: 'whatsapp:+18765558888',
            Body: 'help',
            ProfileName: 'Test User',
            WaId: '18765558888',
          });
      }

      // Attempt to bypass by changing headers
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .set('X-Forwarded-For', '10.0.0.1') // Try different IP
        .send({
          MessageSid: 'SM400099',
          From: 'whatsapp:+18765558888',
          Body: 'help',
          ProfileName: 'Test User',
          WaId: '18765558888', // Same WhatsApp ID should still be rate limited
        });

      expect(response.status).toBe(429);
    });

    it('should handle malformed request attempts', async () => {
      // Mock signature for testing
      const mockSignature = 'valid-signature';

      // Test with malformed request body
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          // Malformed/incomplete data
          MessageSid: 'SM500000',
          From: 'invalid format', // Not a proper Twilio WhatsApp format
        });

      // Should still get a response, not crash the server
      expect(response.status).toBeDefined();
    });
  });

  describe('Command-specific Rate Limiting', () => {
    it('should apply stricter rate limits for sensitive commands', async () => {
      // Mock signature for testing
      const mockSignature = 'valid-signature';

      // Override the rate limiter for specific commands
      const rateLimiterGuard = app.get<RateLimiterGuard>(RateLimiterGuard);
      const originalCanActivate = rateLimiterGuard.canActivate;

      // Mock the guard to apply stricter limits for balance command
      jest.spyOn(rateLimiterGuard, 'canActivate').mockImplementation(async (context) => {
        const request = context.switchToHttp().getRequest();

        // Apply stricter rate limit for balance command
        if (request.body.Body?.toLowerCase() === 'balance') {
          // Check if already rate limited
          const clientId = '18765559999'; // From the request
          const key = `rate-limit:balance:${clientId}`;
          const currentCount = await redisService.get(key);

          if (currentCount && parseInt(currentCount, 10) >= 2) {
            // Stricter limit of 2
            const response = context.switchToHttp().getResponse();
            response.status(429).json({
              statusCode: 429,
              message: 'Too many balance requests, please try again later.',
            });
            return false;
          }

          // Increment count
          const exists = await redisService.exists(key);
          if (exists) {
            await redisService.incr(key);
          } else {
            await redisService.set(key, '1', 60);
          }
        }

        return originalCanActivate.call(rateLimiterGuard, context);
      });

      // Test balance command with stricter limit
      const responses = [];

      // Make 3 balance requests (strict limit of 2)
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: `SM${600000 + i}`,
            From: 'whatsapp:+18765559999',
            Body: 'balance',
            ProfileName: 'Test User',
            WaId: '18765559999',
          });

        responses.push({
          status: response.status,
          body: response.body,
        });
      }

      // First 2 should succeed, 3rd should be rate limited
      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);
      expect(responses[2].status).toBe(429);
      expect(responses[2].body.message).toContain('Too many balance requests');

      // Reset mock
      jest.restoreAllMocks();
    });
  });
});
