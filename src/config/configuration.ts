export default () => ({
  // Application
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  app_url: process.env.APP_URL || 'http://localhost:3000',

  // Twilio WhatsApp Settings
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
    webhookAuthToken: process.env.TWILIO_WEBHOOK_AUTH_TOKEN,
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // Flash API Configuration
  flashApi: {
    url: process.env.FLASH_API_URL || 'https://api.flashapp.io/graphql',
    apiKey: process.env.FLASH_API_KEY,
    apiSecret: process.env.FLASH_API_SECRET,
  },

  // RabbitMQ Configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    queueName: process.env.RABBITMQ_QUEUE_NAME || 'flash_whatsapp_events',
  },

  // Maple AI Configuration
  mapleAi: {
    apiUrl: process.env.MAPLE_AI_API_URL || 'https://api.trymaple.ai/',
    apiKey: process.env.MAPLE_AI_API_KEY,
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    sessionExpiry: parseInt(process.env.SESSION_EXPIRY || '86400', 10), // 24 hours in seconds
    mfaExpiry: parseInt(process.env.MFA_EXPIRY || '300', 10), // 5 minutes in seconds
  },

  // Caching
  balanceCacheTtl: parseInt(process.env.BALANCE_CACHE_TTL || '300', 10), // 5 minutes in seconds
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '10', 10), // 10 requests per minute
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
});