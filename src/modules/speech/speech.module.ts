import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpeechService } from './speech.service';
import { WhisperService } from './whisper.service';

@Module({
  imports: [ConfigModule],
  providers: [SpeechService, WhisperService],
  exports: [SpeechService, WhisperService],
})
export class SpeechModule {}
