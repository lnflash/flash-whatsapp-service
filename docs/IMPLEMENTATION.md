# Implementation Guide

This guide provides detailed instructions for developing, testing, and deploying the Flash WhatsApp Service.

## Development Setup

### Prerequisites
1. Install Node.js 18+ and Yarn
2. Install Redis locally or use Docker
3. Obtain required API credentials:
   - Flash backend auth token
   - Google Gemini API key

### Local Development

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd flash-whatsapp-service
   ```

2. **Install dependencies:**
   ```bash
   yarn install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials:
   ```env
   FLASH_API_URL=https://api.flashapp.me/graphql
   FLASH_BACKEND_API_KEY=Bearer ory_st_...
   GEMINI_API_KEY=your_key_here
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

4. **Start Redis:**
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

5. **Run the service:**
   ```bash
   yarn start:dev
   ```

6. **Connect WhatsApp:**
   - Scan the QR code with WhatsApp
   - Use a test number, not your personal one

## Testing

### Unit Tests
```bash
yarn test
```

### Integration Tests
```bash
yarn test:e2e
```

### Manual Testing
1. Send `help` to see available commands
2. Send `link` to start account linking
3. Enter the OTP code received
4. Send `balance` to check wallet balance
5. Send `refresh` to force update balance

## Code Structure

### Adding New Commands

1. Add command type to `CommandType` enum:
   ```typescript
   export enum CommandType {
     // ... existing commands
     YOUR_COMMAND = 'yourcommand',
   }
   ```

2. Add pattern to `CommandParserService`:
   ```typescript
   private readonly commandPatterns = [
     // ... existing patterns
     { type: CommandType.YOUR_COMMAND, pattern: /^yourcommand$/i },
   ];
   ```

3. Add handler in `WhatsappService`:
   ```typescript
   case CommandType.YOUR_COMMAND:
     return this.handleYourCommand(whatsappId, session);
   ```

4. Implement the handler method:
   ```typescript
   private async handleYourCommand(
     whatsappId: string, 
     session: UserSession | null
   ): Promise<string> {
     // Your implementation
   }
   ```

### Adding New GraphQL Queries

1. Define the query in service:
   ```typescript
   const query = `
     query YourQuery($param: String!) {
       yourQuery(param: $param) {
         field1
         field2
       }
     }
   `;
   ```

2. Execute with proper typing:
   ```typescript
   const result = await this.flashApiService.executeQuery<{
     yourQuery: {
       field1: string;
       field2: number;
     };
   }>(query, variables, authToken);
   ```

## Debugging

### Enable Debug Logs
```bash
DEBUG=* yarn start:dev
```

### Common Issues

1. **QR Code not appearing:**
   - Delete `.wwebjs_auth` folder
   - Restart the service

2. **Balance showing wrong currency:**
   - Check user's display currency in Flash app
   - Verify exchange rate data in logs

3. **OTP not received:**
   - Ensure phone number matches Flash account
   - Check Flash API logs for errors

## Deployment

### Docker Build
```bash
docker build -t flash-whatsapp-service .
```

### Docker Compose
```bash
docker-compose up -d
```

### Environment Variables
Ensure all required environment variables are set in production:
- `NODE_ENV=production`
- `FLASH_API_URL`
- `FLASH_BACKEND_API_KEY`
- `GEMINI_API_KEY`
- `REDIS_URL`

## Performance Optimization

1. **Caching**: Balance data cached for 30 seconds
2. **Message Deduplication**: Prevents duplicate processing
3. **Connection Pooling**: Redis connection reuse
4. **Async Operations**: Non-blocking message handling

## Security Best Practices

1. Never log sensitive data (auth tokens, OTPs)
2. Use environment variables for secrets
3. Implement rate limiting for commands
4. Validate all user inputs
5. Keep dependencies updated

## Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Metrics to Track
- Message processing time
- API response times
- Cache hit/miss rates
- Error rates by command type