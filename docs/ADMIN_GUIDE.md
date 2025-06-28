# Admin Guide for Flash Connect

This guide covers administrative features for managing the Flash Connect WhatsApp bot.

## Overview

Admin commands allow authorized users to manage the WhatsApp connection without requiring SSH access to the server. This is particularly useful for:
- Changing the WhatsApp number
- Troubleshooting connection issues
- Managing sessions remotely

## Prerequisites

To use admin commands, your phone number must be listed in the `ADMIN_PHONE_NUMBERS` environment variable:

```env
ADMIN_PHONE_NUMBERS=13059244435,18764250250
```

## Admin Commands

### 1. Check Status
```
admin status
```

Returns the current connection status including:
- Connection state (connected/disconnected)
- Connected phone number
- Bot display name

Example response:
```
✅ *WhatsApp Status*

Connected: Yes
Number: 13059244435
Name: Flash Connect
```

### 2. Disconnect Session
```
admin disconnect
```

Disconnects the current WhatsApp session:
- Sends farewell message before disconnecting
- Logs out the current number
- Bot becomes unavailable until reconnected

Use this when:
- Switching to a different number
- Troubleshooting connection issues
- Temporarily taking the bot offline

### 3. Reconnect with New Number
```
admin reconnect
```

Initiates the reconnection process:
1. Sends instructions to admin
2. Generates new QR code
3. Sends QR code image via WhatsApp
4. Waits for QR scan on new device
5. Sends welcome message when connected

**Important**: After reconnecting, you must message the bot at the NEW number!

### 4. Clear Session Data
```
admin clear-session
```

Completely removes all session data:
- Deletes stored authentication
- Requires new QR scan to reconnect
- Use only when experiencing persistent issues

## Reconnection Process

The reconnection feature is designed for zero-downtime number switching:

### Step 1: Initiate Reconnection
Send `admin reconnect` to the bot. You'll receive:
```
🔄 *WhatsApp Reconnection Initiated*

1. I'll generate and send you the QR code
2. Open WhatsApp on your NEW phone/number
3. Go to Settings → Linked Devices
4. Tap "Link a Device"
5. Scan the QR code I send you

⚠️ *IMPORTANT REMINDER:*
After connecting the new number, I'll send a welcome message to confirm the connection.

⏱️ Generating QR code now...
```

### Step 2: Receive QR Code
The bot will send you a QR code image. This typically takes 5-10 seconds.

### Step 3: Scan QR Code
1. Open WhatsApp on your NEW device/number
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code

### Step 4: Confirmation
Once connected, you'll receive a welcome message:
```
🎉 *Reconnection Successful!*

✅ Bot is now connected to the new number: 18673225224
✅ Bot name: Pulse

📱 *Important Reminders:*
• The old number is no longer connected
• All messages should now be sent to this new number
• Your admin privileges have been maintained

Type `admin status` to verify the connection.
```

## Troubleshooting

### Bot Not Responding After Reconnect
- Make sure you're messaging the NEW number
- Wait 10-15 seconds after scanning for full initialization
- Try `admin status` to check connection

### QR Code Not Received
- Ensure you have admin privileges
- Check that the bot is currently connected
- Try `admin status` first to verify connection

### Session Persistence Issues
- Use `admin clear-session` to completely reset
- Restart the bot service after clearing session
- Scan new QR code to reconnect

## Security Considerations

1. **Admin Access**: Only phone numbers listed in `ADMIN_PHONE_NUMBERS` can use admin commands
2. **Session Security**: Session data is stored locally in `./whatsapp-sessions/`
3. **QR Code Expiry**: QR codes expire after 60 seconds
4. **Audit Trail**: All admin commands are logged

## Best Practices

1. **Regular Status Checks**: Use `admin status` to monitor connection health
2. **Planned Maintenance**: Notify users before disconnecting
3. **Backup Numbers**: Keep multiple admin numbers configured
4. **Test First**: Test reconnection process during low-usage periods

## Session Management

The bot maintains session persistence across restarts:
- Sessions are stored in `./whatsapp-sessions/`
- Automatic reconnection on service restart
- No QR scan needed if session is valid

To manually manage sessions:
```bash
# Check session files
ls -la ./whatsapp-sessions/

# Backup session before changes
cp -r ./whatsapp-sessions ./whatsapp-sessions.backup

# Remove session (requires new QR scan)
rm -rf ./whatsapp-sessions
```

## Environment Variables

Configure admin access in `.env`:
```env
# Comma-separated list of admin phone numbers
ADMIN_PHONE_NUMBERS=13059244435,18764250250

# Optional: Set in development mode to allow any number as admin
NODE_ENV=development
```

## Monitoring

Monitor admin activity in logs:
```bash
# View admin command usage
grep "admin" app.log

# Watch reconnection process
tail -f app.log | grep -E "(admin|reconnect|QR)"
```

## Support

For issues with admin features:
1. Check you have admin privileges
2. Verify bot is running and connected
3. Review logs for error messages
4. Contact the development team if issues persist