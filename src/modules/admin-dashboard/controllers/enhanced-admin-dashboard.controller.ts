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
import { AdminRateLimitGuard, RateLimit } from '../guards/admin-rate-limit.guard';
import { RBACGuard, Permissions, PermissionLogic } from '../guards/rbac.guard';
import { Permission } from '../services/rbac.service';
import { SecurityEventService, SecurityEventType } from '../services/security-event.service';

@ApiTags('Admin Dashboard')
@Controller('api/admin/dashboard')
@UseGuards(AdminGuard, RBACGuard, AdminRateLimitGuard)
@ApiBearerAuth()
export class EnhancedAdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly securityEventService: SecurityEventService,
  ) {}

  @Get('stats')
  @Permissions(Permission.SYSTEM_HEALTH_VIEW)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics' })
  async getStats(@Req() req: any) {
    await this.logDataAccess(req, 'dashboard_stats');
    return this.dashboardService.getDashboardStats();
  }

  @Get('sessions')
  @Permissions(Permission.SESSION_VIEW)
  @ApiOperation({ summary: 'Get all user sessions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserSessions(
    @Query('page') page = '1', 
    @Query('limit') limit = '20',
    @Req() req: any,
  ) {
    await this.logDataAccess(req, 'user_sessions', { page, limit });
    return this.dashboardService.getUserSessions(parseInt(page, 10), parseInt(limit, 10));
  }

  @Delete('sessions/:whatsappId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(Permission.SESSION_DELETE)
  @ApiOperation({ summary: 'Clear specific user session' })
  async clearUserSession(
    @Param('whatsappId') whatsappId: string,
    @Req() req: any,
  ) {
    await this.logDataModification(req, 'clear_session', { whatsappId });
    await this.dashboardService.clearUserSession(whatsappId);
  }

  @Delete('sessions')
  @Permissions(Permission.SESSION_DELETE, Permission.USER_DELETE)
  @PermissionLogic('AND')
  @RateLimit(1, 3600000) // 1 clear all per hour
  @ApiOperation({ summary: 'Clear all user sessions' })
  async clearAllSessions(@Req() req: any) {
    const result = await this.dashboardService.clearAllSessions();
    await this.logBulkOperation(req, 'clear_all_sessions', result);
    return result;
  }

  @Post('announcement')
  @Permissions(Permission.ANNOUNCEMENT_SEND)
  @RateLimit(5, 300000) // 5 announcements per 5 minutes
  @ApiOperation({ summary: 'Send announcement to all users' })
  async sendAnnouncement(
    @Body() body: { message: string; includeUnlinked?: boolean; testMode?: boolean },
    @Req() req: any,
  ) {
    const result = await this.dashboardService.sendAnnouncement(body.message, {
      includeUnlinked: body.includeUnlinked,
      testMode: body.testMode,
    });
    
    await this.logBulkOperation(req, 'send_announcement', {
      ...result,
      testMode: body.testMode,
    });
    
    return result;
  }

  @Post('support-mode/:whatsappId')
  @Permissions(Permission.USER_EDIT)
  @ApiOperation({ summary: 'Toggle support mode for a user' })
  async toggleSupportMode(
    @Param('whatsappId') whatsappId: string,
    @Body() body: { enable: boolean },
    @Req() req: any,
  ) {
    await this.logDataModification(req, 'toggle_support_mode', {
      whatsappId,
      enable: body.enable,
    });
    
    await this.dashboardService.toggleSupportMode(whatsappId, body.enable);
    return { success: true };
  }

  @Get('whatsapp/status')
  @Permissions(Permission.WHATSAPP_VIEW)
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  async getWhatsAppStatus(@Req() req: any) {
    await this.logDataAccess(req, 'whatsapp_status');
    const stats = await this.dashboardService.getDashboardStats();
    return stats.system.whatsappStatus;
  }

  @Get('whatsapp/qr')
  @Permissions(Permission.WHATSAPP_VIEW)
  @ApiOperation({ summary: 'Get WhatsApp QR code' })
  async getWhatsAppQr(@Req() req: any) {
    await this.logDataAccess(req, 'whatsapp_qr');
    const qr = await this.dashboardService.getWhatsAppQr();
    return { qr };
  }

  @Post('whatsapp/disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(Permission.WHATSAPP_MANAGE)
  @ApiOperation({ summary: 'Disconnect WhatsApp session' })
  async disconnectWhatsApp(@Req() req: any) {
    await this.logDataModification(req, 'disconnect_whatsapp');
    await this.dashboardService.disconnectWhatsApp();
  }

  @Post('test-message')
  @Permissions(Permission.WHATSAPP_MANAGE)
  @RateLimit(10, 60000) // 10 test messages per minute
  @ApiOperation({ summary: 'Send test message' })
  async sendTestMessage(
    @Body() body: { to: string; message: string },
    @Req() req: any,
  ) {
    await this.logDataAccess(req, 'send_test_message', {
      to: body.to.substring(0, 6) + '****', // Partial number for privacy
    });
    
    await this.dashboardService.sendTestMessage(body.to, body.message);
    return { success: true };
  }

  @Post('command')
  @Permissions(Permission.COMMAND_EXECUTE)
  @RateLimit(50, 300000) // 50 commands per 5 minutes
  @ApiOperation({ summary: 'Execute admin command' })
  async executeCommand(
    @Body() body: { command: string }, 
    @Req() req: any,
  ) {
    await this.logDataModification(req, 'execute_command', {
      command: body.command.split(' ')[0], // Log command type only
    });
    
    const result = await this.dashboardService.executeAdminCommand(
      body.command,
      req.user.phoneNumber,
    );
    return { result };
  }

  @Get('command/history')
  @Permissions(Permission.COMMAND_HISTORY_VIEW)
  @ApiOperation({ summary: 'Get admin command history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCommandHistory(
    @Query('limit') limit = '50',
    @Req() req: any,
  ) {
    await this.logDataAccess(req, 'command_history', { limit });
    return this.dashboardService.getCommandHistory(parseInt(limit, 10));
  }

  @Get('logs')
  @Permissions(Permission.SYSTEM_LOGS_VIEW)
  @ApiOperation({ summary: 'Get system logs' })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSystemLogs(
    @Query('level') level?: string, 
    @Query('limit') limit = '100',
    @Req() req?: any,
  ) {
    await this.logDataAccess(req, 'system_logs', { level, limit });
    return this.dashboardService.getSystemLogs({
      level,
      limit: parseInt(limit, 10),
    });
  }

  @Get('security/events')
  @Permissions(Permission.SYSTEM_LOGS_VIEW)
  @ApiOperation({ summary: 'Get security events' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSecurityEvents(
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit = '100',
    @Req() req?: any,
  ) {
    await this.logDataAccess(req, 'security_events', { type, severity, limit });
    
    return this.securityEventService.queryEvents({
      types: type ? [type as SecurityEventType] : undefined,
      severities: severity ? [severity as any] : undefined,
      limit: parseInt(limit, 10),
    });
  }

  @Get('security/metrics')
  @Permissions(Permission.SYSTEM_HEALTH_VIEW)
  @ApiOperation({ summary: 'Get security metrics' })
  async getSecurityMetrics(@Req() req: any) {
    await this.logDataAccess(req, 'security_metrics');
    
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return this.securityEventService.getMetrics({
      start: dayAgo,
      end: now,
    });
  }

  /**
   * Private logging methods
   */
  private async logDataAccess(req: any, resource: string, details?: any): Promise<void> {
    await this.securityEventService.logEvent({
      type: SecurityEventType.DATA_ACCESS,
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: {
        resource,
        method: req.method,
        path: req.path,
        ...details,
      },
    });
  }

  private async logDataModification(req: any, action: string, details?: any): Promise<void> {
    await this.securityEventService.logEvent({
      type: SecurityEventType.DATA_MODIFICATION,
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: {
        action,
        method: req.method,
        path: req.path,
        ...details,
      },
    });
  }

  private async logBulkOperation(req: any, operation: string, result: any): Promise<void> {
    await this.securityEventService.logEvent({
      type: SecurityEventType.BULK_OPERATION,
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: {
        operation,
        result,
      },
    });
  }
}