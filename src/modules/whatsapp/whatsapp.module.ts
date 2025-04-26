import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './controllers/whatsapp.controller';
import { WhatsappService } from './services/whatsapp.service';
import { CommandParserService } from './services/command-parser.service';
import { TwilioWebhookGuard } from './guards/twilio-webhook.guard';
import { RateLimiterGuard } from '../../common/guards/rate-limiter.guard';
import { BalanceTemplate } from './templates/balance-template';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { MapleAiModule } from '../maple-ai/maple-ai.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    AuthModule,
    FlashApiModule,
    MapleAiModule,
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    CommandParserService,
    TwilioWebhookGuard,
    RateLimiterGuard,
    BalanceTemplate,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}