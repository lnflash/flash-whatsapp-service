import * as crypto from 'crypto';

export default () => {
  // Generate secure defaults if not provided
  const generateSecureKey = (envVar: string, length: number = 32): string => {
    const value = process.env[envVar];
    if (value && value.length >= length) {
      return value;
    }

    // In production, this should fail rather than generate
    if (process.env.NODE_ENV === 'production' && !value) {
      throw new Error(`${envVar} must be set in production`);
    }

    // For development, generate cryptographically secure random keys
    // Store in memory for session consistency
    const memoryKey = `_generated_${envVar}`;
    if ((process as any)[memoryKey]) {
      return (process as any)[memoryKey];
    }

    // Generate cryptographically secure random bytes
    const generated = crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .substring(0, length);
    (process as any)[memoryKey] = generated;

    console.warn(
      `⚠️  ${envVar} not set, using cryptographically secure random value for development`,
    );
    console.warn(`   To persist this value, add to .env: ${envVar}=${generated}`);
    return generated;
  };

  return {
    security: {
      // JWT Configuration
      jwt: {
        secret: generateSecureKey('JWT_SECRET', 64),
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      },

      // Encryption Configuration
      encryption: {
        key: generateSecureKey('ENCRYPTION_KEY', 32),
        salt: generateSecureKey('ENCRYPTION_SALT', 16),
        algorithm: 'aes-256-gcm',
      },

      // Hashing Configuration
      hashing: {
        salt: generateSecureKey('HASH_SALT', 16),
        iterations: parseInt(process.env.HASH_ITERATIONS || '100000'),
      },

      // Session Configuration
      session: {
        secret: generateSecureKey('SESSION_SECRET', 32),
        expiresIn: parseInt(process.env.SESSION_EXPIRES_IN || '86400'), // 24 hours
        rotationInterval: parseInt(process.env.SESSION_ROTATION_INTERVAL || '3600'), // 1 hour
      },

      // MFA Configuration
      mfa: {
        otpLength: parseInt(process.env.OTP_LENGTH || '6'),
        otpExpiresIn: parseInt(process.env.OTP_EXPIRES_IN || '300'), // 5 minutes
        maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '3'),
      },

      // Rate Limiting
      rateLimiting: {
        default: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
          max: parseInt(process.env.RATE_LIMIT_MAX || '20'),
        },
        auth: {
          windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '300000'), // 5 minutes
          max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5'),
        },
        payment: {
          windowMs: parseInt(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
          max: parseInt(process.env.PAYMENT_RATE_LIMIT_MAX || '5'),
        },
      },

      // Webhook Security
      webhook: {
        secret: generateSecureKey('WEBHOOK_SECRET', 32),
        tolerance: parseInt(process.env.WEBHOOK_TOLERANCE || '300'), // 5 minutes
      },

      // Admin Configuration
      admin: {
        phoneNumbers: (process.env.ADMIN_PHONE_NUMBERS || '').split(',').filter(Boolean),
        requireMfa: process.env.ADMIN_REQUIRE_MFA === 'true',
        sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT || '3600'), // 1 hour
      },
    },
  };
};
