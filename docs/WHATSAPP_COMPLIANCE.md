# WhatsApp Compliance Guide

This guide helps ensure Pulse operates within WhatsApp's terms of service to avoid account suspension.

## ⚠️ Critical Rules

### 1. **Use a Dedicated Number**
- **NEVER** use your personal WhatsApp number
- Use a separate SIM/phone number exclusively for Pulse
- Document this number for your team

### 2. **No Spam or Bulk Messaging**
- Don't send unsolicited messages
- Only respond to user-initiated conversations
- Implement rate limiting (already configured)

### 3. **Respect User Privacy**
- Only store necessary data
- Allow users to delete their data
- Don't share user information

## 📋 Compliance Checklist

### Message Patterns to Avoid

❌ **DON'T DO THIS:**
- Mass messaging to all users simultaneously
- Sending promotional content without consent
- Auto-messaging new contacts
- Repeatedly messaging unresponsive users
- Using multiple numbers to circumvent limits

✅ **DO THIS INSTEAD:**
- Respond only to incoming messages
- Send announcements sparingly (max 1-2 per week)
- Respect users who don't respond
- Implement cooling-off periods
- Use single, verified business number

### Rate Limiting Guidelines

Pulse implements these safeguards:

1. **Message Frequency**
   - Max 100 messages per minute per user
   - 5-minute cooldown after rate limit hit
   - Announcement limited to 5 per 5 minutes

2. **Bulk Operations**
   - Announcements sent in batches of 10
   - 1-second delay between batches
   - Max 100 recipients per announcement

3. **Connection Limits**
   - Single WhatsApp Web session
   - Auto-reconnect with exponential backoff
   - Session rotation every 24 hours (recommended)

## 🚦 Warning Signs

Watch for these indicators of potential issues:

### Early Warning Signs
- Frequent "Security Code Changed" notifications
- Messages showing single tick (not delivered)
- Contacts showing as "Waiting for this message"
- Slow message delivery
- Random disconnections

### Critical Signs (Take Action)
- "Your phone number is banned from using WhatsApp"
- Cannot scan QR code
- Messages failing consistently
- All contacts showing offline

## 🛡️ Best Practices

### 1. Message Content
- Keep messages informative and relevant
- Avoid repetitive templates
- Don't use excessive emojis or formatting
- Include clear opt-out instructions

### 2. User Interaction
```
Good: "Hi! I can help you check your Flash balance. Type 'help' for commands."
Bad: "💰💰 GET RICH QUICK! CHECK YOUR BALANCE NOW! 💰💰"
```

### 3. Announcement Guidelines
- Limit to important updates only
- Space out announcements (minimum 48 hours)
- Keep them brief and relevant
- Always include value for users

### 4. Session Management
- Monitor session health daily
- Rotate sessions monthly
- Keep backup numbers ready
- Document all number changes

## 📊 Monitoring Compliance

### Daily Checks
```bash
# Check message volume
docker logs pulse-app | grep "sent" | wc -l

# Monitor rate limiting
docker logs pulse-app | grep -i "rate limit"

# Check for warnings
docker logs pulse-app | grep -i "warning\|error\|banned"
```

### Weekly Review
- Message volume trends
- User complaint patterns
- Delivery success rates
- Session stability

## 🔄 Recovery Procedures

### If You Get Warnings

1. **Immediate Actions**
   - Reduce message frequency
   - Review recent activity
   - Check for user complaints
   - Temporarily disable announcements

2. **Investigation**
   - Analyze message patterns
   - Review user interactions
   - Check for automation detection
   - Verify compliance with limits

### If Your Number Gets Banned

1. **Don't Panic**
   - Have backup numbers ready
   - Document the incident
   - Review what led to the ban

2. **Migration Steps**
   ```bash
   # 1. Update configuration
   nano /opt/pulse/.env
   # Change phone number
   
   # 2. Clear old session
   rm -rf /opt/pulse/whatsapp-sessions/*
   
   # 3. Restart with new number
   docker compose -f docker-compose.production.yml restart app
   
   # 4. Scan new QR code
   docker logs -f pulse-app
   ```

3. **Notify Users**
   - Use alternative channels
   - Provide new contact number
   - Explain the change briefly

## 📝 Compliance Documentation

Keep records of:
- User consent for announcements
- Opt-out requests
- Message volumes
- Incident reports
- Number changes

## 🤝 WhatsApp Business Account

Consider migrating to WhatsApp Business API for:
- Higher rate limits
- Official verification
- Better compliance tools
- Direct Meta support

### Migration Path
1. Apply for WhatsApp Business API
2. Get Facebook Business verification
3. Implement API integration
4. Gradual user migration

## ⚖️ Legal Considerations

1. **Terms of Service**
   - Regular review of WhatsApp ToS
   - Compliance with local regulations
   - User data protection (GDPR, etc.)

2. **User Agreement**
   - Clear terms for bot usage
   - Data handling disclosure
   - Opt-out procedures

3. **Disclaimers**
   - Not officially affiliated with WhatsApp
   - Service availability disclaimer
   - Financial service disclaimers

## 🔍 Compliance Audit

Monthly compliance check:

- [ ] Message volume within limits
- [ ] No spam complaints
- [ ] Session stable
- [ ] Rate limiting working
- [ ] Announcements spaced appropriately
- [ ] User consent documented
- [ ] Backup numbers available
- [ ] Team trained on compliance

## 📞 Support Escalation

If you need help:
1. Review this guide
2. Check WhatsApp Business FAQ
3. Contact Meta Business Support (if verified)
4. Consult legal counsel for ToS interpretation

---

**Remember**: It's better to be conservative with messaging than risk losing your WhatsApp number. When in doubt, reduce volume and frequency.