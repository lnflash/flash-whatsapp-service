import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { OtpService } from './services/otp.service';
import { GroupAuthService } from './services/group-auth.service';
import { RedisModule } from '../redis/redis.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { SessionGuard } from './guards/session.guard';
import { MfaGuard } from './guards/mfa.guard';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    FlashApiModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, SessionService, OtpService, GroupAuthService, SessionGuard, MfaGuard],
  exports: [
    AuthService,
    SessionService,
    OtpService,
    GroupAuthService,
    SessionGuard,
    MfaGuard,
    JwtModule,
  ],
})
export class AuthModule {}
