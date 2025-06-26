import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './controllers/whatsapp.controller';
import { WhatsappService } from './services/whatsapp.service';
import { CommandParserService } from './services/command-parser.service';
import { WhatsAppCloudService } from './services/whatsapp-cloud.service';
import { RateLimiterGuard } from '../../common/guards/rate-limiter.guard';
import { BalanceTemplate } from './templates/balance-template';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { GeminiAiModule } from '../gemini-ai/gemini-ai.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    AuthModule,
    FlashApiModule,
    GeminiAiModule,
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsAppCloudService,
    CommandParserService,
    RateLimiterGuard,
    BalanceTemplate,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}