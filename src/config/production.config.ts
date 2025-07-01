import { registerAs } from '@nestjs/config';

export default registerAs('production', () => ({
  // Disable debug features in production
  debug: false,

  // Production logging
  logging: {
    level: process.env.LOG_LEVEL || 'error',
    prettify: false,
  },

  // Production optimizations
  optimization: {
    // Enable compression
    compression: true,

    // Cache settings
    cache: {
      ttl: 3600, // 1 hour
      max: 1000, // Max items in cache
    },
  },

  // Production security
  security: {
    // Force HTTPS in production
    forceHttps: true,

    // Strict transport security
    hsts: {
      maxAge: 31536000,
      includeSubdomains: true,
      preload: true,
    },

    // Content security policy
    csp: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  },

  // Production Redis settings
  redis: {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  },

  // Production WhatsApp settings
  whatsapp: {
    // Disable QR code in terminal for production
    qrTerminal: false,

    // Session management
    session: {
      // Store sessions in Redis for production
      storage: 'redis',

      // Session timeout
      timeout: 86400000, // 24 hours
    },

    // Message processing
    messages: {
      // Max concurrent message processing
      maxConcurrent: 10,

      // Message timeout
      timeout: 30000, // 30 seconds
    },
  },

  // Production monitoring
  monitoring: {
    // Enable metrics collection
    metrics: true,

    // Health check endpoint
    healthCheck: '/health',

    // Metrics endpoint (should be protected)
    metricsEndpoint: '/metrics',
  },
}));
