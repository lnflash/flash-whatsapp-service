import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiAiService } from './gemini-ai.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
  ],
  providers: [GeminiAiService],
  exports: [GeminiAiService],
})
export class GeminiAiModule {}