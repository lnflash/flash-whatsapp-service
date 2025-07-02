import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RedisService } from '../src/modules/redis/redis.service';
import { WhatsAppWebService } from '../src/modules/whatsapp/services/whatsapp-web.service';
import { EventsService } from '../src/modules/events/events.service';
import { SubscriptionService } from '../src/modules/flash-api/services/subscription.service';
import { SpeechService } from '../src/modules/speech/speech.service';
import { GeminiAiService } from '../src/modules/gemini-ai/gemini-ai.service';
import {
  MockRedisService,
  MockWhatsAppWebService,
  MockEventsService,
  MockSubscriptionService,
  MockSpeechService,
  MockGeminiAiService,
} from './setup-e2e';

/**
 * Creates a test application with all external services mocked
 */
export async function createTestApplication(): Promise<{
  app: INestApplication;
  moduleRef: TestingModule;
}> {
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

  return { app, moduleRef: moduleFixture };
}
