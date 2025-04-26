import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FlashApiService } from './flash-api.service';
import { BalanceService } from './services/balance.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
  ],
  providers: [
    FlashApiService,
    BalanceService,
  ],
  exports: [
    FlashApiService,
    BalanceService,
  ],
})
export class FlashApiModule {}