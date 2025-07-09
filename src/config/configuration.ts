export default () => ({
  // Application
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  app_url: process.env.APP_URL || 'http://localhost:3000',

  // WhatsApp Cloud API Settings
  whatsappCloud: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || 'https://whatsapp.flashapp.me/whatsapp/webhook',
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
    url: process.env.FLASH_API_URL || 'https://api.flashapp.me/graphql',
    apiKey: process.env.FLASH_AUTH_TOKEN || process.env.FLASH_API_KEY,
    apiSecret: process.env.FLASH_API_SECRET,
  },

  // RabbitMQ Configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    queueName: process.env.RABBITMQ_QUEUE_NAME || 'flash_whatsapp_events',
  },

  // Google Gemini AI Configuration
  geminiAi: {
    apiKey: process.env.GEMINI_API_KEY,
  },

  // ElevenLabs TTS Configuration
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voices: {
      'terri-ann': process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Voice 1: Terri-Ann
      patience: process.env.ELEVENLABS_VOICE_ID2 || 'EXAVITQu4vr4xnSDxMaL', // Voice 2: Patience
      dean: process.env.ELEVENLABS_VOICE_ID3 || 'EXAVITQu4vr4xnSDxMaL', // Voice 3: Dean
    },
    defaultVoice: 'terri-ann', // Default voice option
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

  // Notifications
  notifications: {
    enableWebSocket: process.env.ENABLE_WEBSOCKET_NOTIFICATIONS !== 'false',
    enableIntraledgerPolling: process.env.ENABLE_INTRALEDGER_POLLING !== 'false',
    pollingInterval: parseInt(process.env.PAYMENT_POLLING_INTERVAL || '10000', 10), // 10 seconds default
  },
});
