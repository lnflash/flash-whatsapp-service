import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Controllers - Comment out Cloud API controller for prototype
// import { WhatsappController } from './controllers/whatsapp.controller';
import { WhatsAppWebController } from './controllers/whatsapp-web.controller';

// Services
import { WhatsappService } from './services/whatsapp.service';
import { CommandParserService } from './services/command-parser.service';
// import { WhatsAppCloudService } from './services/whatsapp-cloud.service';
import { WhatsAppWebService } from './services/whatsapp-web.service';

// Guards and Templates
import { RateLimiterGuard } from '../../common/guards/rate-limiter.guard';
import { BalanceTemplate } from './templates/balance-template';

// Module imports
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
  controllers: [
    // WhatsappController,    // Cloud API Controller (disabled for prototype)
    WhatsAppWebController,    // WhatsApp Web.js Controller
  ],
  providers: [
    WhatsappService,
    // WhatsAppCloudService,  // Cloud API Service (disabled for prototype)
    WhatsAppWebService,       // WhatsApp Web.js Service
    CommandParserService,
    RateLimiterGuard,
    BalanceTemplate,
  ],
  exports: [WhatsappService, WhatsAppWebService],
})
export class WhatsappModule {}