# Flash Connect (Pulse) - WhatsApp Web.js Quick Start

## 🚀 Get Started in 3 Minutes

### 1. Start Required Services
```bash
# Start Redis and RabbitMQ
docker compose up -d redis rabbitmq

# Verify they're running
docker compose ps
```

### 2. Configure Environment
```bash
# Copy the example environment file
cp .env.example .env

# The .env file is already configured with:
# ✅ Redis connection (with password from docker-compose.yml)
# ✅ RabbitMQ connection (with password from docker-compose.yml)
# ✅ Your Gemini AI key (already set!)
# ❌ Flash API credentials (optional - leave empty for now)
```

### 3. Install & Run
```bash
# Install dependencies
yarn install

# Start the application
yarn start:dev
```

### 4. Connect WhatsApp
1. Look for the QR code in your terminal
2. Open WhatsApp on your phone
3. Go to **Settings → Linked Devices → Link a Device**
4. Scan the QR code

### 5. Test It!

#### Check Status
```bash
curl http://localhost:3000/whatsapp-web/status
```

#### Send Test Message
```bash
# Replace with your phone number (country code + number, no + or spaces)
curl -X POST "http://localhost:3000/whatsapp-web/test-message?to=1234567890&message=Hello from Flash Connect!"
```

#### Get QR Code (if needed)
```bash
curl http://localhost:3000/whatsapp-web/qr
```

## 📱 Testing with Your Phone

Once connected, send these messages to your WhatsApp number:

- `help` - Get list of commands
- `link` - Link your Flash account
- `balance` - Check balance (after linking)
- `receive 10` - Create Lightning invoice
- `pay` - Pay pending invoices
- `vybz` - Share content to earn sats
- Any question - Get AI-powered response

### Admin Commands (if authorized)
- `admin status` - Check connection status
- `admin reconnect` - Change WhatsApp number

## 🛠️ Troubleshooting

### QR Code Not Appearing?
```bash
# Check logs
docker compose logs -f

# Restart the app
yarn start:dev
```

### Connection Issues?
```bash
# Check Redis and RabbitMQ
docker compose ps

# Restart services
docker compose restart redis rabbitmq
```

### Session Issues?
```bash
# Delete session and re-authenticate
rm -rf ./whatsapp-sessions
yarn start:dev
```

## ⚠️ Important Notes

1. **Use a test WhatsApp number** - Don't use your personal number
2. **Development only** - This is not for production use
3. **Session persists** - After first scan, it auto-connects
4. **Keep phone online** - WhatsApp Web requires phone connection

## 🔧 Optional Configuration

### Enable Flash API Integration
Edit `.env` and add:
```env
FLASH_API_URL=https://api.flashapp.me/graphql
FLASH_API_KEY=your_api_key_here
```

### Configure Admin Access
Add authorized phone numbers:
```env
ADMIN_PHONE_NUMBERS=13059244435,18764250250
```

### Disable AI Responses
Remove or comment out in `.env`:
```env
# GEMINI_API_KEY=...
```

## 📊 Monitoring

### View Logs
```bash
# Application logs
yarn start:dev

# Redis logs
docker compose logs -f redis

# RabbitMQ logs
docker compose logs -f rabbitmq
```

### RabbitMQ Management UI
Open http://localhost:15672
- Username: `flash`
- Password: `flash_secure_pass`

## 🔄 Next Steps

Ready to move to production? Switch to the main branch:
```bash
git checkout main
# Follow the WhatsApp Cloud API setup guide
```