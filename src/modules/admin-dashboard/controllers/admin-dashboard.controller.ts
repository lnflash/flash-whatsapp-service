import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Admin Dashboard')
@Controller('api/admin/dashboard')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics' })
  async getStats() {
    return this.dashboardService.getDashboardStats();
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get all user sessions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserSessions(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.dashboardService.getUserSessions(parseInt(page, 10), parseInt(limit, 10));
  }

  @Delete('sessions/:whatsappId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear specific user session' })
  async clearUserSession(@Param('whatsappId') whatsappId: string) {
    await this.dashboardService.clearUserSession(whatsappId);
  }

  @Delete('sessions')
  @ApiOperation({ summary: 'Clear all user sessions' })
  async clearAllSessions() {
    return this.dashboardService.clearAllSessions();
  }

  @Post('announcement')
  @ApiOperation({ summary: 'Send announcement to all users' })
  async sendAnnouncement(
    @Body() body: { message: string; includeUnlinked?: boolean; testMode?: boolean },
  ) {
    return this.dashboardService.sendAnnouncement(body.message, {
      includeUnlinked: body.includeUnlinked,
      testMode: body.testMode,
    });
  }

  @Post('support-mode/:whatsappId')
  @ApiOperation({ summary: 'Toggle support mode for a user' })
  async toggleSupportMode(
    @Param('whatsappId') whatsappId: string,
    @Body() body: { enable: boolean },
  ) {
    await this.dashboardService.toggleSupportMode(whatsappId, body.enable);
    return { success: true };
  }

  @Get('whatsapp/status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  async getWhatsAppStatus() {
    const stats = await this.dashboardService.getDashboardStats();
    return stats.system.whatsappStatus;
  }

  @Get('whatsapp/qr')
  @ApiOperation({ summary: 'Get WhatsApp QR code' })
  async getWhatsAppQr() {
    const qr = await this.dashboardService.getWhatsAppQr();
    return { qr };
  }

  @Post('whatsapp/disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect WhatsApp session' })
  async disconnectWhatsApp() {
    await this.dashboardService.disconnectWhatsApp();
  }

  @Post('test-message')
  @ApiOperation({ summary: 'Send test message' })
  async sendTestMessage(@Body() body: { to: string; message: string }) {
    await this.dashboardService.sendTestMessage(body.to, body.message);
    return { success: true };
  }

  @Post('command')
  @ApiOperation({ summary: 'Execute admin command' })
  async executeCommand(@Body() body: { command: string }, @Req() req: any) {
    const result = await this.dashboardService.executeAdminCommand(
      body.command,
      req.user.phoneNumber,
    );
    return { result };
  }

  @Get('command/history')
  @ApiOperation({ summary: 'Get admin command history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCommandHistory(@Query('limit') limit = '50') {
    return this.dashboardService.getCommandHistory(parseInt(limit, 10));
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get system logs' })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSystemLogs(@Query('level') level?: string, @Query('limit') limit = '100') {
    return this.dashboardService.getSystemLogs({
      level,
      limit: parseInt(limit, 10),
    });
  }
}
