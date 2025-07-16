import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { WhatsAppRedisService } from './services/whatsapp-redis.service';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { WhatsAppIdNormalizer } from '../../common/utils/whatsapp/whatsapp-id-normalizer';

@Global()
@Module({
  imports: [ConfigModule, CryptoModule],
  providers: [RedisService, WhatsAppRedisService, WhatsAppIdNormalizer],
  exports: [RedisService, WhatsAppRedisService],
})
export class RedisModule {}
