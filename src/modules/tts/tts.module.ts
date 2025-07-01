import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TtsService } from './tts.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ConfigModule, forwardRef(() => WhatsappModule)],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}
