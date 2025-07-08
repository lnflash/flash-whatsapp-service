/**
 * Configuration for admin panel isolation from core bot functionality
 */
export const ADMIN_ISOLATION_CONFIG = {
  // Rate limiting defaults
  rateLimits: {
    announcement: {
      limit: 5,
      windowMs: 300000, // 5 minutes
    },
    clearAllSessions: {
      limit: 1,
      windowMs: 3600000, // 1 hour
    },
    commands: {
      limit: 50,
      windowMs: 300000, // 5 minutes
    },
    default: {
      limit: 100,
      windowMs: 60000, // 1 minute
    },
  },

  // Circuit breaker defaults
  circuitBreaker: {
    announcement: {
      failureThreshold: 3,
      resetTimeout: 300000, // 5 minutes
      timeout: 30000, // 30 seconds
    },
    whatsappOperation: {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      timeout: 10000, // 10 seconds
    },
  },

  // Operation limits
  limits: {
    maxBulkRecipients: 100,
    maxAnnouncementLength: 1000,
    maxCommandLength: 200,
    batchSize: 10,
    batchDelayMs: 1000,
  },

  // Audit settings
  audit: {
    enabled: true,
    maxLogEntries: 1000,
    retentionDays: 30,
  },

  // Error handling
  errors: {
    // Don't expose these error types to admin users
    sensitivePatterns: [
      /auth.*token/i,
      /password/i,
      /secret/i,
      /key/i,
      /credential/i,
      /database/i,
      /redis/i,
      /rabbitmq/i,
    ],
    maxErrorMessageLength: 200,
  },

  // Timeouts
  timeouts: {
    adminOperation: 30000, // 30 seconds
    bulkOperation: 300000, // 5 minutes
  },
};
