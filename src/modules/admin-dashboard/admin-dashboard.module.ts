import { Module } from '@nestjs/common';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminGuard } from './guards/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FlashApiModule } from '../flash-api/flash-api.module';
import { RedisModule } from '../redis/redis.module';
import { EventsModule } from '../events/events.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, AuthModule, WhatsappModule, FlashApiModule, RedisModule, EventsModule],
  controllers: [AdminDashboardController, AdminAuthController],
  providers: [AdminDashboardService, AdminAuthService, AdminGuard],
  exports: [AdminDashboardService, AdminAuthService],
})
export class AdminDashboardModule {}
