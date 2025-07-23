import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule as IoRedisModule } from '@nestjs-modules/ioredis';
import { RedisService } from './redis.service';
import { WhatsAppRedisService } from './services/whatsapp-redis.service';
import { RedisBatchService } from './services/redis-batch.service';
import { RedisPoolService } from './services/redis-pool.service';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { WhatsAppIdNormalizer } from '../../common/utils/whatsapp/whatsapp-id-normalizer';

@Global()
@Module({
  imports: [
    ConfigModule,
    CryptoModule,
    IoRedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: `redis://:${configService.get('redis.password')}@${configService.get('redis.host')}:${configService.get('redis.port')}/${configService.get('redis.db', 0)}`,
      }),
    }),
  ],
  providers: [
    RedisService,
    WhatsAppRedisService,
    RedisBatchService,
    RedisPoolService,
    WhatsAppIdNormalizer,
  ],
  exports: [RedisService, WhatsAppRedisService, RedisBatchService, RedisPoolService, IoRedisModule],
})
export class RedisModule {}
