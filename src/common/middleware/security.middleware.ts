import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);
  private readonly suspiciousPaths = [
    // Common scanner/bot paths
    '/.env',
    '/wp-admin',
    '/wp-login',
    '/administrator',
    '/admin.php',
    '/phpMyAdmin',
    '/phpmyadmin',
    '/.git',
    '/.svn',
    '/.htaccess',
    '/web.config',
    '/config.php',
    '/backup',
    '/sql',
    '/db',
    '/database',
    '/.aws',
    '/.ssh',
    '/api/v1/users/all', // Potential data enumeration
    '/api/users/dump',
    '/api/export',
    '/api/backup',
    // Security scanners
    '/actuator',
    '/jolokia',
    '/metrics',
    '/trace',
    '/heapdump',
    '/info',
    '/auditevents',
    '/flyway',
    '/liquibase',
    '/shutdown',
    '/mappings',
    '/beans',
    '/configprops',
    '/dump',
    '/refresh',
    '/features',
    '/loggers',
    '/api/swagger',
    '/api/api-docs',
    '/v2/api-docs',
    '/swagger-ui',
    '/swagger.json',
    // Common vulnerability scans
    '/.DS_Store',
    '/Thumbs.db',
    '/xmlrpc.php',
    '/wp-content',
    '/wordpress',
    '/joomla',
    '/drupal',
    '/magento',
    // Sensitive files
    '/package.json',
    '/composer.json',
    '/requirements.txt',
    '/Gemfile',
    '/yarn.lock',
    '/package-lock.json',
    '/Dockerfile',
    '/docker-compose.yml',
    '/.dockerignore',
    '/nginx.conf',
    '/httpd.conf',
    // Shell access attempts
    '/shell',
    '/cmd',
    '/command',
    '/execute',
    '/exec',
    '/system',
    '/eval',
    // Common exploits
    '/../',
    '/..\\',
    '/%2e%2e',
    '/..;/',
    '/.%2e/',
    '/%252e%252e',
    '/\\.\\.\\',
  ];

  private readonly suspiciousUserAgents = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'nessus',
    'openvas',
    'metasploit',
    'burpsuite',
    'acunetix',
    'appscan',
    'webinspect',
    'qualys',
    'zaproxy',
    'dirbuster',
    'gobuster',
    'wfuzz',
    'hydra',
    'medusa',
    'john',
    'hashcat',
    // Common bot patterns
    'bot',
    'crawler',
    'spider',
    'scraper',
    'scan',
    // Specific known bad actors
    'ahrefsbot',
    'semrushbot',
    'dotbot',
    'mj12bot',
    'blexbot',
    'yandexbot',
    'bingbot',
    'slurp',
    'duckduckbot',
    'baiduspider',
    'facebookexternalhit',
    'twitterbot',
    'linkedinbot',
    'whatsapp',
    'applebot',
    'googlebot',
    'bingpreview',
    'discordbot',
    'telegrambot',
    'slackbot',
  ];

  private readonly blockedIPs = new Map<string, { count: number; timestamp: number }>();
  private readonly MAX_ATTEMPTS = 5;
  private readonly BLOCK_DURATION = 3600000; // 1 hour

  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const clientIP = this.getClientIP(req);
    const userAgent = req.get('user-agent')?.toLowerCase() || '';
    const path = req.path.toLowerCase();
    const fullUrl = req.originalUrl.toLowerCase();

    // Check if IP is blocked
    if (this.isIPBlocked(clientIP)) {
      this.logger.warn(`Blocked IP ${clientIP} attempted access to ${path}`);
      res.status(403).json({
        statusCode: 403,
        message: 'Access forbidden',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check for suspicious paths
    if (this.isSuspiciousPath(path) || this.isSuspiciousPath(fullUrl)) {
      this.handleSuspiciousRequest(clientIP, path, 'suspicious_path', res);
      return;
    }

    // Check for suspicious user agents (be more lenient with these)
    if (this.isSuspiciousUserAgent(userAgent)) {
      // Log but don't immediately block for user agents
      this.logger.warn(`Suspicious user agent detected: ${userAgent} from IP ${clientIP}`);

      // Only block if it's also trying to access sensitive paths
      if (path.includes('/api/admin') || path.includes('/api/auth')) {
        this.handleSuspiciousRequest(clientIP, path, 'suspicious_user_agent', res);
        return;
      }
    }

    // Check for SQL injection attempts
    if (this.containsSQLInjection(fullUrl) || this.containsSQLInjection(req.body)) {
      this.handleSuspiciousRequest(clientIP, path, 'sql_injection_attempt', res);
      return;
    }

    // Check for XSS attempts
    if (this.containsXSS(fullUrl) || this.containsXSS(req.body)) {
      this.handleSuspiciousRequest(clientIP, path, 'xss_attempt', res);
      return;
    }

    // Check for command injection attempts
    if (this.containsCommandInjection(fullUrl) || this.containsCommandInjection(req.body)) {
      this.handleSuspiciousRequest(clientIP, path, 'command_injection_attempt', res);
      return;
    }

    next();
  }

  private getClientIP(req: Request): string {
    // Get real IP behind proxies
    const forwarded = req.get('x-forwarded-for');
    const realIP = req.get('x-real-ip');
    const cfIP = req.get('cf-connecting-ip'); // Cloudflare

    return cfIP || realIP || forwarded?.split(',')[0] || req.ip || 'unknown';
  }

  private isIPBlocked(ip: string): boolean {
    const blocked = this.blockedIPs.get(ip);
    if (!blocked) return false;

    const now = Date.now();
    if (now - blocked.timestamp > this.BLOCK_DURATION) {
      this.blockedIPs.delete(ip);
      return false;
    }

    return true;
  }

  private handleSuspiciousRequest(ip: string, path: string, reason: string, res: Response) {
    this.logger.warn(`Suspicious request from ${ip} to ${path} - Reason: ${reason}`);

    // Track attempts
    const blocked = this.blockedIPs.get(ip) || { count: 0, timestamp: Date.now() };
    blocked.count++;
    blocked.timestamp = Date.now();
    this.blockedIPs.set(ip, blocked);

    // Send honeypot response to waste attacker's time
    res.status(404).json({
      statusCode: 404,
      message: 'Not Found',
      timestamp: new Date().toISOString(),
    });
  }

  private isSuspiciousPath(path: string): boolean {
    return this.suspiciousPaths.some(
      (suspicious) => path.includes(suspicious) || path.startsWith(suspicious),
    );
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    return this.suspiciousUserAgents.some((suspicious) => userAgent.includes(suspicious));
  }

  private containsSQLInjection(input: any): boolean {
    if (!input || typeof input !== 'string') return false;

    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|vbscript|onload|onerror|onclick)\b)/i,
      /(\b(or|and)\b\s*\d+\s*=\s*\d+)/i,
      /(\'|\"|;|--|\||\\)/,
      /(\b(waitfor|delay|benchmark|sleep)\b)/i,
      /(0x[0-9a-f]+)/i,
      /(\b(concat|substring|ascii|char|length)\b\s*\()/i,
    ];

    return sqlPatterns.some((pattern) => pattern.test(input));
  }

  private containsXSS(input: any): boolean {
    if (!input || typeof input !== 'string') return false;

    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>.*?<\/embed>/gi,
    ];

    return xssPatterns.some((pattern) => pattern.test(input));
  }

  private containsCommandInjection(input: any): boolean {
    if (!input || typeof input !== 'string') return false;

    const cmdPatterns = [
      /(\||;|&|`|\$\(|\))/,
      /(\b(cat|ls|pwd|echo|rm|mv|cp|chmod|chown|kill|ps|wget|curl|nc|bash|sh|cmd|powershell)\b)/i,
      /(\/etc\/passwd|\/etc\/shadow|\/windows\/system32)/i,
      /(\.\.\/)|(\.\.\\)/,
    ];

    return cmdPatterns.some((pattern) => pattern.test(input));
  }
}
