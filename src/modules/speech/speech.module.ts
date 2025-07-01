import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpeechService } from './speech.service';

@Module({
  imports: [ConfigModule],
  providers: [SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}