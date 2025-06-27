import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './services/notification.service';
import { PaymentEventListener } from './events/payment-event.listener';
import { RedisModule } from '../redis/redis.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EventsModule } from '../events/events.module';
import { AuthModule } from '../auth/auth.module';
import { FlashApiModule } from '../flash-api/flash-api.module';

@Module({
  imports: [ConfigModule, RedisModule, WhatsappModule, EventsModule, AuthModule, FlashApiModule],
  providers: [NotificationService, PaymentEventListener],
  exports: [NotificationService],
})
export class NotificationsModule {}
