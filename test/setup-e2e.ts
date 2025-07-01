import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RedisService } from '../src/modules/redis/redis.service';
import { WhatsAppWebService } from '../src/modules/whatsapp/services/whatsapp-web.service';
import { EventsService } from '../src/modules/events/events.service';
import { SubscriptionService } from '../src/modules/flash-api/services/subscription.service';
import { SpeechService } from '../src/modules/speech/speech.service';
import { GeminiAiService } from '../src/modules/gemini-ai/gemini-ai.service';

// Mock Redis Client
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  scan: jest.fn().mockResolvedValue(['0', []]),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

// Mock Redis Service
export class MockRedisService {
  private client = mockRedisClient;

  async onModuleInit() {
    // No-op for tests
  }

  async onModuleDestroy() {
    // No-op for tests
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.client.set(key, value);
    if (ttl) {
      await this.client.expire(key, ttl);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async setEncrypted(key: string, value: any, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  async getEncrypted(key: string): Promise<any> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  getMockClient() {
    return mockRedisClient;
  }
}

export async function createTestApp(): Promise<INestApplication> {
  // Set test environment variables before importing anything
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.REDIS_PASSWORD = '';
  process.env.REDIS_DB = '1';
  process.env.JWT_SECRET = 'test_jwt_secret_min_32_chars_for_testing_only';
  process.env.ENCRYPTION_KEY = 'test_encryption_key_min_32_chars_for_testing';
  process.env.ENCRYPTION_SALT = 'test_salt_16char';
  process.env.HASH_SALT = 'test_hash_16char';
  process.env.SESSION_SECRET = 'test_session_secret_min_32_chars_for_testing';
  process.env.WEBHOOK_SECRET = 'test_webhook_secret_min_32_chars_for_testing';
  process.env.ENABLE_INTRALEDGER_POLLING = 'false';
  process.env.ENABLE_WEBSOCKET_NOTIFICATIONS = 'false';
  process.env.LOG_LEVEL = 'error';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RedisService)
    .useClass(MockRedisService)
    .overrideProvider(WhatsAppWebService)
    .useClass(MockWhatsAppWebService)
    .overrideProvider(EventsService)
    .useClass(MockEventsService)
    .overrideProvider(SubscriptionService)
    .useClass(MockSubscriptionService)
    .overrideProvider(SpeechService)
    .useClass(MockSpeechService)
    .overrideProvider(GeminiAiService)
    .useClass(MockGeminiAiService)
    .compile();

  const app = moduleFixture.createNestApplication();

  // Apply the same middleware as in the main application
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  return app;
}

// Mock WhatsApp Web Service
export class MockWhatsAppWebService {
  async onModuleInit() {
    // No-op for tests
  }

  async onModuleDestroy() {
    // No-op for tests
  }

  async sendMessage(to: string, message: string): Promise<void> {
    // No-op for tests
  }

  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<void> {
    // No-op for tests
  }

  async sendVoiceNote(to: string, audioBuffer: Buffer): Promise<void> {
    // No-op for tests
  }

  isClientReady(): boolean {
    return false; // WhatsApp not connected in tests
  }

  getStatus() {
    return { connected: false };
  }
}

// Mock Events Service (RabbitMQ)
export class MockEventsService {
  async onModuleInit() {
    // No-op for tests
  }

  async onModuleDestroy() {
    // No-op for tests
  }

  async emit(pattern: string, data: any): Promise<void> {
    // No-op for tests
  }

  async subscribe(pattern: string, callback: Function): Promise<void> {
    // No-op for tests
  }

  async subscribeToEvents(
    callback: (eventType: string, data: any) => Promise<void>,
  ): Promise<void> {
    // No-op for tests - matches the signature expected by PaymentEventListener
  }
}

// Mock Subscription Service (WebSocket)
export class MockSubscriptionService {
  async subscribe(eventType: string, callback: Function): Promise<string> {
    return 'mock-subscription-id';
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // No-op for tests
  }

  async enableWebSocketSubscriptions(authToken: string): Promise<void> {
    // No-op for tests
  }
}

// Mock Speech Service
export class MockSpeechService {
  isAvailable(): boolean {
    return false;
  }

  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    return null;
  }
}

// Mock Gemini AI Service
export class MockGeminiAiService {
  async processQuery(query: string, context?: any): Promise<string> {
    return 'Mock AI response';
  }
}

export { mockRedisClient };
