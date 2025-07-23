import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestDeduplicatorService } from './services/request-deduplicator.service';
import { CacheManagerService } from './services/cache-manager.service';
import { CacheWarmerService } from './services/cache-warmer.service';
import { MetricsService } from './services/metrics.service';
import { SecurityAuditService } from '../../common/services/security-audit.service';
import { RedisModule } from '../redis/redis.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), RedisModule, FlashApiModule, AuthModule],
  providers: [
    RequestDeduplicatorService,
    CacheManagerService,
    CacheWarmerService,
    MetricsService,
    SecurityAuditService,
  ],
  exports: [
    RequestDeduplicatorService,
    CacheManagerService,
    CacheWarmerService,
    MetricsService,
    SecurityAuditService,
  ],
})
export class CommonModule {}
