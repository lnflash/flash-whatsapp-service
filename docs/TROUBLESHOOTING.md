# Troubleshooting Guide

## Common Issues and Solutions

### Flash API Connection Errors

**Symptoms:**
```
ERROR [FlashApiService] Error executing Flash API query: fetch failed
TypeError: fetch failed
ConnectTimeoutError: Connect Timeout Error (attempted address: api.flashapp.me:443, timeout: 10000ms)
```

**Cause:**
The application is trying to connect to the Flash API but experiencing network connectivity issues or the API is unreachable.

**Solutions:**

1. **Disable payment polling** (Quick fix for development):
   Add this to your `.env` file:
   ```bash
   ENABLE_INTRALEDGER_POLLING=false
   ```
   This will stop the payment notification polling and eliminate the error messages.

2. **Check network connectivity**:
   - Ensure your internet connection is working
   - Try accessing https://api.flashapp.me/graphql in a browser
   - Check if you're behind a firewall or proxy that might block the connection

3. **Configure Flash API credentials** (if you have them):
   ```bash
   FLASH_API_URL=https://api.flashapp.me/graphql
   FLASH_API_KEY=your-api-key-here
   ```

4. **Adjust polling interval** to reduce frequency:
   ```bash
   PAYMENT_POLLING_INTERVAL=30000  # 30 seconds instead of 10
   ```

### WhatsApp Session Issues

**"WhatsApp Web client is not ready" errors after clear-session**

This has been fixed in the latest version. The `admin clear-session` command now:
1. Sends a notification to all admins before clearing the session
2. Properly manages the client state to prevent errors
3. Provides clear instructions on how to reconnect

To reconnect after clearing session:
1. Make sure the bot is running
2. Send `admin reconnect` from any admin number
3. Scan the QR code to authenticate

### Voice Message Processing

**"Voice messages are not currently available"**

This means the Google Cloud Speech-to-Text API is not configured. To enable:
1. Set up Google Cloud credentials
2. Configure the path to your service account key:
   ```bash
   GOOGLE_CLOUD_KEYFILE=/path/to/your/service-account-key.json
   ```

### Memory/Performance Issues

If the application is consuming too much memory or CPU:
1. Check the payment polling intervals
2. Ensure Redis is running and properly configured
3. Monitor the number of active WebSocket connections
4. Consider adjusting rate limits

### Redis Connection Issues

Ensure Redis is running:
```bash
docker compose up -d redis
```

Check Redis connectivity:
```bash
redis-cli -h localhost -p 6379 -a flash_redis_secure_pass ping
```

## Debug Mode

For more detailed logging, set:
```bash
LOG_LEVEL=debug
```

This will provide more information about what the application is doing internally.

## E2E Test Failures

**Symptoms:**
```
TypeError: Cannot read properties of undefined (reading 'host')
Exceeded timeout of 5000 ms for a hook
```

**Cause:**
E2E tests require Redis and RabbitMQ to be running. The tests are trying to connect to these services but they're not available.

**Solutions:**

1. **Run dependencies before E2E tests**:
   ```bash
   docker compose up -d redis rabbitmq
   npm run test:e2e
   ```

2. **Skip E2E tests in CI** if dependencies aren't available:
   ```bash
   npm test  # Runs unit tests only
   ```

3. **Use GitHub Actions** for E2E tests (already configured in `.github/workflows/e2e-tests.yml`)

The E2E tests are designed to run in environments where all dependencies are available. For local development, you can focus on unit tests which don't require external dependencies.