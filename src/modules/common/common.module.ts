import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestDeduplicatorService } from './services/request-deduplicator.service';
import { CacheManagerService } from './services/cache-manager.service';
import { CacheWarmerService } from './services/cache-warmer.service';
import { RedisModule } from '../redis/redis.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    RedisModule,
    FlashApiModule,
    AuthModule,
  ],
  providers: [
    RequestDeduplicatorService,
    CacheManagerService,
    CacheWarmerService,
  ],
  exports: [
    RequestDeduplicatorService,
    CacheManagerService,
    CacheWarmerService,
  ],
})
export class CommonModule {}