import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { WhatsAppRedisService } from './services/whatsapp-redis.service';
import { RedisBatchService } from './services/redis-batch.service';
import { RedisPoolService } from './services/redis-pool.service';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { WhatsAppIdNormalizer } from '../../common/utils/whatsapp/whatsapp-id-normalizer';

@Global()
@Module({
  imports: [ConfigModule, CryptoModule],
  providers: [
    RedisService,
    WhatsAppRedisService,
    RedisBatchService,
    RedisPoolService,
    WhatsAppIdNormalizer,
  ],
  exports: [
    RedisService,
    WhatsAppRedisService,
    RedisBatchService,
    RedisPoolService,
  ],
})
export class RedisModule {}
