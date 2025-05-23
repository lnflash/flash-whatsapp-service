import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { RedisModule } from './modules/redis/redis.module';
import { FlashApiModule } from './modules/flash-api/flash-api.module';
import { MapleAiModule } from './modules/maple-ai/maple-ai.module';
import { EventsModule } from './modules/events/events.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MetricsMiddleware } from './common/middleware/metrics.middleware';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    
    // Core modules
    WhatsappModule,
    RedisModule,
    FlashApiModule,
    MapleAiModule,
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