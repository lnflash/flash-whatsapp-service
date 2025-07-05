import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Controllers
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';

// Services
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminAuthService } from './services/admin-auth.service';
import { EnhancedAdminAuthService } from './services/enhanced-admin-auth.service';
import { AdminFacadeService } from './services/admin-facade.service';
import { AdminHealthService } from './services/admin-health.service';
import { TOTPAuthService } from './services/totp-auth.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { SecurityEventService } from './services/security-event.service';
import { RBACService } from './services/rbac.service';

// Guards and Filters
import { AdminGuard } from './guards/admin.guard';
import { AdminRateLimitGuard } from './guards/admin-rate-limit.guard';
import { AdminExceptionFilter } from './filters/admin-exception.filter';
import { RBACGuard } from './guards/rbac.guard';

// Import other modules
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { RedisModule } from '../redis/redis.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '24h',
          issuer: 'flash-admin',
          audience: 'flash-admin-dashboard',
        },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    WhatsappModule,
    FlashApiModule,
    RedisModule,
    EventsModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminAuthController,
  ],
  providers: [
    // Core Services
    AdminDashboardService,
    AdminAuthService,
    EnhancedAdminAuthService,
    AdminFacadeService,
    AdminHealthService,
    
    // Security Services
    TOTPAuthService,
    DeviceFingerprintService,
    SecurityEventService,
    RBACService,
    
    // Guards
    AdminGuard,
    AdminRateLimitGuard,
    RBACGuard,
    
    // Global exception filter for admin routes
    {
      provide: APP_FILTER,
      useClass: AdminExceptionFilter,
    },
    
    // Global RBAC guard for admin routes
    {
      provide: APP_GUARD,
      useClass: RBACGuard,
    },
  ],
  exports: [
    AdminDashboardService,
    AdminAuthService,
    EnhancedAdminAuthService,
    TOTPAuthService,
    SecurityEventService,
    RBACService,
  ],
})
export class AdminDashboardEnhancedModule {
  constructor(private readonly securityEventService: SecurityEventService) {
    // Log module initialization
    this.securityEventService.logEvent({
      type: 'system_startup' as any,
      severity: 'info' as any,
      ipAddress: 'system',
      details: {
        module: 'AdminDashboardEnhanced',
        timestamp: new Date(),
      },
    }).catch(err => console.error('Failed to log startup event:', err));
  }
}