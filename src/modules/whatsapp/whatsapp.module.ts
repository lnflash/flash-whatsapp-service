import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Controllers - Comment out Cloud API controller for prototype
// import { WhatsappController } from './controllers/whatsapp.controller';
import { WhatsAppWebController } from './controllers/whatsapp-web.controller';

// Services
import { WhatsappService } from './services/whatsapp.service';
import { CommandParserService } from './services/command-parser.service';
import { CommandValidatorService } from './services/command-validator.service';
// import { WhatsAppCloudService } from './services/whatsapp-cloud.service';
import { WhatsAppWebService } from './services/whatsapp-web.service';
import { QrCodeService } from './services/qr-code.service';
import { InvoiceTrackerService } from './services/invoice-tracker.service';
import { SupportModeService } from './services/support-mode.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { PaymentConfirmationService } from './services/payment-confirmation.service';
import { UserVoiceSettingsService } from './services/user-voice-settings.service';

// Guards and Templates
import { RateLimiterGuard } from '../../common/guards/rate-limiter.guard';
import { BalanceTemplate } from './templates/balance-template';

// Module imports
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { GeminiAiModule } from '../gemini-ai/gemini-ai.module';
import { EventsModule } from '../events/events.module';
import { TtsModule } from '../tts/tts.module';
import { SpeechModule } from '../speech/speech.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    AuthModule,
    FlashApiModule,
    GeminiAiModule,
    EventsModule,
    TtsModule,
    SpeechModule,
  ],
  controllers: [
    // WhatsappController,    // Cloud API Controller (disabled for prototype)
    WhatsAppWebController, // WhatsApp Web.js Controller
  ],
  providers: [
    WhatsappService,
    // WhatsAppCloudService,  // Cloud API Service (disabled for prototype)
    WhatsAppWebService, // WhatsApp Web.js Service
    CommandParserService,
    CommandValidatorService,
    RateLimiterGuard,
    BalanceTemplate,
    QrCodeService,
    InvoiceTrackerService,
    SupportModeService,
    AdminSettingsService,
    PaymentConfirmationService,
    UserVoiceSettingsService,
  ],
  exports: [WhatsappService, WhatsAppWebService, AdminSettingsService, UserVoiceSettingsService],
})
export class WhatsappModule {}
