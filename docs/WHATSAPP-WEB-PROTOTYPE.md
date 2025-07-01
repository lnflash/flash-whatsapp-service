# Flash Connect - WhatsApp Web.js Prototype

This branch contains a prototype implementation using whatsapp-web.js for quick testing and development. 

⚠️ **WARNING**: This is for development/testing only. WhatsApp may ban numbers using automation.

## Quick Start

### 1. Start the Services

```bash
# Start Redis and RabbitMQ
docker compose up -d redis rabbitmq

# Install dependencies
yarn install

# Start the application
yarn start:dev
```

### 2. Authenticate WhatsApp

When the app starts, you'll see a QR code in the terminal. Scan it with WhatsApp:

1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code

### 3. Test the Integration

Check connection status:
```bash
curl http://localhost:3000/whatsapp-web/status
```

Send a test message:
```bash
curl -X POST "http://localhost:3000/whatsapp-web/test-message?to=1234567890&message=Hello"
```

## Available Endpoints

### WhatsApp Web.js Endpoints

- `GET /whatsapp-web/status` - Check connection status
- `GET /whatsapp-web/qr` - Get QR code for authentication
- `POST /whatsapp-web/logout` - Logout from WhatsApp
- `POST /whatsapp-web/test-message` - Send a test message
- `GET /whatsapp-web/health` - Health check

### How It Works

1. **Authentication**: Uses Puppeteer to control a headless Chrome instance
2. **Session Persistence**: Stores session in `./whatsapp-sessions` directory
3. **Message Handling**: Receives messages and processes them through the same pipeline as Cloud API
4. **Response**: Sends responses back through WhatsApp Web

### Testing Commands

Once authenticated, send these messages to your WhatsApp number:

- `help` - Get list of available commands
- `link` - Start account linking process
- `balance` - Check your balance (after linking)
- Any other text - AI-powered response via Gemini

### Differences from Cloud API

| Feature | Cloud API | WhatsApp Web.js |
|---------|-----------|-----------------|
| Official Support | ✅ Yes | ❌ No |
| Cost | 💰 Per conversation | 🆓 Free |
| Reliability | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Features | Full (buttons, media, etc.) | Limited |
| Setup | Business verification | QR code scan |
| Risk | None | Ban risk |

### Architecture

```
User → WhatsApp → whatsapp-web.js → WhatsAppWebService → WhatsappService → Flash API/Gemini AI
                                           ↓
                                    Session persistence
```

### Troubleshooting

**QR Code not appearing:**
- Check console logs for errors
- Ensure Puppeteer dependencies are installed
- Try deleting `./whatsapp-sessions` folder

**Messages not being received:**
- Check `/whatsapp-web/status` endpoint
- Ensure the number is properly formatted (country code + number)
- Check console logs for errors

**Connection keeps dropping:**
- This is normal for WhatsApp Web
- The service will auto-reconnect
- Check your internet connection

### Development Tips

1. **Session Management**: The session is stored locally, so you don't need to scan QR code every time
2. **Testing**: Use a separate WhatsApp number for testing
3. **Debugging**: Set `headless: false` in `whatsapp-web.service.ts` to see the browser
4. **Logging**: Check console for detailed logs of all events

### Limitations

- No support for buttons or interactive messages
- Media handling is basic
- May disconnect if phone goes offline
- Single session only (one WhatsApp account)
- Risk of account ban if used improperly

### Next Steps

To switch back to Cloud API:
1. Checkout main branch: `git checkout main`
2. Update environment variables for Cloud API
3. Uncomment Cloud API imports in `whatsapp.module.ts`

## Important Notes

- This is a **prototype only** - not for production use
- WhatsApp actively detects and bans automated accounts
- Use a test number, not your personal number
- Keep session data secure (contains auth info)
- Monitor for disconnections and errors

## License

This prototype is for development and testing purposes only.