import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { CryptoModule } from '../../common/crypto/crypto.module';

@Global()
@Module({
  imports: [ConfigModule, CryptoModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
