import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MapleAiService } from './maple-ai.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
  ],
  providers: [MapleAiService],
  exports: [MapleAiService],
})
export class MapleAiModule {}