import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FlashApiService } from './flash-api.service';
import { BalanceService } from './services/balance.service';
import { UsernameService } from './services/username.service';
import { PriceService } from './services/price.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
  ],
  providers: [
    FlashApiService,
    BalanceService,
    UsernameService,
    PriceService,
  ],
  exports: [
    FlashApiService,
    BalanceService,
    UsernameService,
    PriceService,
  ],
})
export class FlashApiModule {}