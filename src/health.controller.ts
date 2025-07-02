import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WhatsAppWebService } from './modules/whatsapp/services/whatsapp-web.service';
import { RedisService } from './modules/redis/redis.service';
import { EventsService } from './modules/events/events.service';
import { ConfigService } from '@nestjs/config';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    whatsapp: ServiceStatus;
    redis: ServiceStatus;
    rabbitmq: ServiceStatus;
  };
  metrics?: {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
  };
}

interface ServiceStatus {
  status: 'up' | 'down';
  message?: string;
  latency?: number;
}

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly startTime = Date.now();
  private readonly version = process.env.npm_package_version || '1.0.0';

  constructor(
    private readonly whatsappWebService: WhatsAppWebService,
    private readonly redisService: RedisService,
    private readonly eventsService: EventsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Basic health check' })
  async healthCheck() {
    return { 
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: this.version,
    };
  }

  @Get('health/detailed')
  @ApiOperation({ summary: 'Detailed health check with service status' })
  @ApiQuery({ name: 'includeMetrics', required: false, type: Boolean })
  async detailedHealthCheck(
    @Query('includeMetrics') includeMetrics?: string,
  ): Promise<HealthStatus> {
    const [whatsapp, redis, rabbitmq] = await Promise.all([
      this.checkWhatsApp(),
      this.checkRedis(),
      this.checkRabbitMQ(),
    ]);

    const allHealthy = 
      whatsapp.status === 'up' && 
      redis.status === 'up' && 
      rabbitmq.status === 'up';

    const anyDown = 
      whatsapp.status === 'down' || 
      redis.status === 'down' || 
      rabbitmq.status === 'down';

    const response: HealthStatus = {
      status: anyDown ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: this.version,
      services: {
        whatsapp,
        redis,
        rabbitmq,
      },
    };

    if (includeMetrics) {
      response.metrics = {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      };
    }

    return response;
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  async readinessCheck() {
    try {
      // Check if critical services are ready
      const whatsappReady = this.whatsappWebService.isClientReady();
      const redisClient = this.redisService.getClient();
      const redisReady = redisClient && redisClient.status === 'ready';

      if (whatsappReady && redisReady) {
        return { ready: true };
      } else {
        throw new Error('Services not ready');
      }
    } catch (error) {
      return { ready: false, error: error.message };
    }
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  async livenessCheck() {
    // Simple check that the application is running
    return { alive: true, pid: process.pid };
  }

  private async checkWhatsApp(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      const isReady = this.whatsappWebService.isClientReady();
      const status = this.whatsappWebService.getStatus();
      
      return {
        status: isReady ? 'up' : 'down',
        message: status.connected ? `Connected: ${status.number || 'Unknown number'}` : 'Disconnected',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        message: error.message,
        latency: Date.now() - start,
      };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      const client = this.redisService.getClient();
      await client.ping();
      
      return {
        status: 'up',
        message: 'Connected',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        message: error.message,
        latency: Date.now() - start,
      };
    }
  }

  private async checkRabbitMQ(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      // Check if events service is connected
      const isConnected = await this.eventsService.isConnected();
      
      return {
        status: isConnected ? 'up' : 'down',
        message: isConnected ? 'Connected' : 'Disconnected',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        message: error.message,
        latency: Date.now() - start,
      };
    }
  }
}
