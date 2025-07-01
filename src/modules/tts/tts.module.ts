import { Module, forwardRef } from '@nestjs/common';
import { TtsService } from './tts.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => WhatsappModule)],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}
