# Contact-based Send Command Enhancement

## Overview
Enhanced the `send` command to intelligently handle cases where the recipient is not found as a Flash username, checking contacts and providing better guidance.

## Problem
When users typed `send 1 to ayanna` and "ayanna" wasn't a Flash username, the bot just returned an error without helpful guidance.

## Solution

### 1. Smart Username/Contact Detection
The bot now:
- First tries to find the recipient as a Flash username
- If not found, checks the user's saved contacts
- If not in contacts, prompts user to add the contact

### 2. Enhanced Error Handling
When a username doesn't exist in Flash:
```javascript
// Check if the error is about account not existing
if (error.message.includes('Account does not exist for username')) {
  // Check if this might be a contact name
  const contact = contacts[targetUsername.toLowerCase()];
  
  if (contact) {
    // Automatically create and process payment request
    const result = await this.handleRequestCommand(requestCommand, whatsappId, session);
    return `📤 Sending $${amount} to ${targetUsername}...\n\n${result.text}`;
  }
  
  // Store pending send for when contact is added
  return `${targetUsername} not found. Share contact or: contacts add ${targetUsername} +1234567890`;
}
```

### 3. Pending Send Feature
When a recipient isn't found:
- The send details are stored temporarily (5 minutes)
- When user shares a vCard or adds the contact
- The bot automatically processes the payment request

### 4. vCard Integration
The existing vCard handler now:
- Checks for pending sends when a contact is shared
- Automatically saves the contact
- Automatically processes the payment request with QR code

## User Flow Examples

### Example 1: Recipient not in Flash or contacts
```
User: send 1 to ayanna
Bot: ayanna not found. Share contact or: contacts add ayanna +1234567890
User: [shares Ayanna's vCard]
Bot: ✅ Ayanna saved!

📤 Sending $1 to ayanna...

💸 Payment request created!
Amount: $1.00
To: ayanna (+1876555xxxx)
[QR code appears]
```

### Example 2: Recipient already in contacts
```
User: send 5 to john
Bot: 📤 Sending $5 to john...

💸 Payment request created!
Amount: $5.00
To: john (+1876555yyyy)
[QR code appears]
```

## Key Features

1. **Automatic Processing**: No manual steps - bot automatically creates payment requests
2. **Smart Detection**: Distinguishes between usernames, phone numbers, and contact names
3. **Persistent State**: Remembers pending sends for 5 minutes
4. **Seamless vCard Support**: Automatically processes shared contacts
5. **Unified Experience**: `send` command works for both Flash users and contacts

## Technical Implementation

- Added `pending_send` Redis key to store attempted sends
- Modified `checkAndProcessPendingRequest` to handle both payment requests and sends
- Enhanced error handling in send command to check contacts
- Maintained backward compatibility with existing functionality

## Future Enhancement
When phone number payments are supported, the bot can automatically send to contacts without requiring the payment request workaround.