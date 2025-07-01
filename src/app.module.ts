import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import securityConfig from './config/security.config';
import { validationSchema } from './config/env.validation';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { RedisModule } from './modules/redis/redis.module';
import { FlashApiModule } from './modules/flash-api/flash-api.module';
import { GeminiAiModule } from './modules/gemini-ai/gemini-ai.module';
import { EventsModule } from './modules/events/events.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MetricsMiddleware } from './common/middleware/metrics.middleware';
import { CryptoModule } from './common/crypto/crypto.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, securityConfig],
      envFilePath: ['.env', `.env.${process.env.NODE_ENV || 'development'}`],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),

    // Core modules
    CryptoModule,
    WhatsappModule,
    RedisModule,
    FlashApiModule,
    GeminiAiModule,
    EventsModule,
    AuthModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply metrics middleware to all routes
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
