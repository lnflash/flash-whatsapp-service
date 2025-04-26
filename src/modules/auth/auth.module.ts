import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { OtpService } from './services/otp.service';
import { RedisModule } from '../redis/redis.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { SessionGuard } from './guards/session.guard';
import { MfaGuard } from './guards/mfa.guard';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    FlashApiModule,
  ],
  providers: [
    AuthService,
    SessionService,
    OtpService,
    SessionGuard,
    MfaGuard,
  ],
  exports: [
    AuthService,
    SessionService,
    OtpService,
    SessionGuard,
    MfaGuard,
  ],
})
export class AuthModule {}