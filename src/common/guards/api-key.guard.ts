import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly validApiKeys: Set<string>;
  private readonly apiKeyHeader = 'x-api-key';

  constructor(private configService: ConfigService) {
    // Load API keys from environment
    const apiKeys = this.configService.get<string>('API_KEYS', '');
    this.validApiKeys = new Set(apiKeys.split(',').filter(key => key.trim()));
    
    if (this.validApiKeys.size === 0) {
      this.logger.warn('No API keys configured! API key authentication will fail.');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);
    
    if (!apiKey) {
      this.logger.warn(`Missing API key from ${this.getClientIP(request)}`);
      throw new UnauthorizedException('API key is required');
    }

    // Hash the API key for comparison (storing hashed keys is more secure)
    const hashedKey = this.hashApiKey(apiKey);
    
    if (!this.isValidApiKey(apiKey) && !this.isValidApiKey(hashedKey)) {
      this.logger.warn(`Invalid API key attempt from ${this.getClientIP(request)}`);
      throw new UnauthorizedException('Invalid API key');
    }

    // Add API key info to request for logging
    (request as any).apiKeyUsed = apiKey.substring(0, 8) + '...';
    
    return true;
  }

  private extractApiKey(request: Request): string | undefined {
    // Check header first
    let apiKey = request.get(this.apiKeyHeader);
    
    // Check query parameter as fallback
    if (!apiKey && request.query.apiKey) {
      apiKey = request.query.apiKey as string;
    }
    
    // Check Authorization header with Bearer scheme
    if (!apiKey) {
      const auth = request.get('authorization');
      if (auth && auth.startsWith('Bearer ')) {
        apiKey = auth.substring(7);
      }
    }
    
    return apiKey;
  }

  private isValidApiKey(key: string): boolean {
    return this.validApiKeys.has(key);
  }

  private hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private getClientIP(req: Request): string {
    const forwarded = req.get('x-forwarded-for');
    const realIP = req.get('x-real-ip');
    const cfIP = req.get('cf-connecting-ip');
    
    return cfIP || realIP || forwarded?.split(',')[0] || req.ip || 'unknown';
  }
}