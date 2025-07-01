// Jest E2E Setup
// This file runs before all E2E tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.REDIS_DB = '1';
process.env.JWT_SECRET = 'test_jwt_secret_min_32_chars_for_testing_only';
process.env.ENCRYPTION_KEY = 'test_encryption_key_min_32_chars_for_testing';
process.env.ENCRYPTION_SALT = 'test_salt_16char';
process.env.HASH_SALT = 'test_hash_16char';
process.env.SESSION_SECRET = 'test_session_secret_min_32_chars_for_testing';
process.env.WEBHOOK_SECRET = 'test_webhook_secret_min_32_chars_for_testing';
process.env.ENABLE_INTRALEDGER_POLLING = 'false';
process.env.ENABLE_WEBSOCKET_NOTIFICATIONS = 'false';
process.env.RABBITMQ_URL = 'amqp://localhost:5672';
process.env.LOG_LEVEL = 'error';
process.env.ADMIN_PHONE_NUMBERS = '1234567890';

// Set longer timeout for E2E tests
jest.setTimeout(30000);

// Global teardown to ensure all resources are cleaned up
afterAll(async () => {
  // Give time for any pending operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});