import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminGuard } from '../guards/admin.guard';
import {
  SecurityAuditService,
  SecurityEventType,
} from '../../../common/services/security-audit.service';

@ApiTags('Admin Security')
@Controller('api/admin/security')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class SecurityDashboardController {
  constructor(private readonly securityAuditService: SecurityAuditService) {}

  @Get('events')
  @ApiOperation({ summary: 'Get security events' })
  @ApiQuery({ name: 'type', enum: SecurityEventType, required: false })
  @ApiQuery({ name: 'ip', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'severity', enum: ['info', 'warning', 'critical'], required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Security events retrieved' })
  async getSecurityEvents(
    @Query('type') type?: SecurityEventType,
    @Query('ip') ip?: string,
    @Query('userId') userId?: string,
    @Query('severity') severity?: 'info' | 'warning' | 'critical',
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.securityAuditService.getSecurityEvents({
      type,
      ip,
      userId,
      severity,
      limit,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get security summary for the last 24 hours' })
  @ApiResponse({ status: 200, description: 'Security summary retrieved' })
  async getSecuritySummary() {
    return this.securityAuditService.getSecuritySummary();
  }

  @Get('blocked-ips')
  @ApiOperation({ summary: 'Get list of currently blocked IPs' })
  @ApiResponse({ status: 200, description: 'Blocked IPs retrieved' })
  async getBlockedIPs() {
    // This would be implemented in the SecurityMiddleware
    // For now, return a placeholder
    return {
      message: 'Blocked IPs tracking is handled by SecurityMiddleware',
      note: 'Check application logs for blocked IP information',
    };
  }

  @Get('suspicious-activity')
  @ApiOperation({ summary: 'Get recent suspicious activity' })
  @ApiQuery({ name: 'hours', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Suspicious activity retrieved' })
  async getSuspiciousActivity(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const events = await this.securityAuditService.getSecurityEvents({
      startDate,
      severity: 'warning',
    });

    const criticalEvents = await this.securityAuditService.getSecurityEvents({
      startDate,
      severity: 'critical',
    });

    return {
      timeRange: {
        start: startDate,
        end: new Date(),
        hours,
      },
      suspicious: {
        total: events.length + criticalEvents.length,
        warning: events.length,
        critical: criticalEvents.length,
      },
      recentEvents: [...criticalEvents, ...events].slice(0, 50),
    };
  }

  @Get('api-usage')
  @ApiOperation({ summary: 'Get API key usage statistics' })
  @ApiResponse({ status: 200, description: 'API usage statistics retrieved' })
  async getApiUsage() {
    const events = await this.securityAuditService.getSecurityEvents({
      type: SecurityEventType.API_KEY_USED,
      limit: 1000,
    });

    const invalidAttempts = await this.securityAuditService.getSecurityEvents({
      type: SecurityEventType.API_KEY_INVALID,
      limit: 100,
    });

    // Group by API key (partial) and count
    const usage = new Map<string, number>();
    events.forEach((event) => {
      const key = event.details?.apiKey || 'unknown';
      usage.set(key, (usage.get(key) || 0) + 1);
    });

    return {
      totalRequests: events.length,
      invalidAttempts: invalidAttempts.length,
      usage: Array.from(usage.entries()).map(([key, count]) => ({
        apiKey: key,
        requests: count,
      })),
      recentInvalid: invalidAttempts.slice(0, 10),
    };
  }
}
