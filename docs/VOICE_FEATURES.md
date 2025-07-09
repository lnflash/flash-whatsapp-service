# Voice Features Documentation

## Overview

Pulse includes comprehensive voice features powered by ElevenLabs for Text-to-Speech and Google Cloud/Whisper AI for Speech-to-Text.

## Key Features

### 1. Dynamic Voice Management
- Users can add custom ElevenLabs voices using voice IDs
- Voices are stored persistently in Redis
- Auto-naming system generates friendly names from a pool
- Reserved word protection prevents conflicts with commands

### 2. Voice Modes
- **On**: Voice responses with text (default for payment recipients)
- **Off**: Text only, no voice
- **Only**: Voice only, no text messages

### 3. Payment Voice Notifications
- Recipients automatically receive voice-only notifications when they receive money
- Recipients are set to 'voice on' mode for future interactions
- Natural language generation for payment amounts

### 4. Voice Commands
```
voice on          - Enable voice with text
voice off         - Disable voice
voice only        - Voice only mode
voice list        - Show available voices
voice [name]      - Select a voice
voice add [id]    - Add voice with auto-generated name
voice add [name] [id] - Add voice with custom name
voice remove [name] - Remove a voice
```

### 5. Admin Voice Commands
```
admin voice default [name] - Set default voice for all users
admin voice default       - View current default voice
admin voice default clear - Clear default voice setting
```

### 6. Natural Language Processing
- Numbers converted to words: "$10.50" → "ten dollars and fifty cents"
- Natural speech patterns for better voice synthesis
- Context-aware responses based on command type

## Technical Implementation

### Services
- `VoiceManagementService`: Handles voice CRUD operations
- `VoiceResponseService`: Generates natural language responses
- `UserVoiceSettingsService`: Manages user preferences
- `TtsService`: Interfaces with ElevenLabs API
- `number-to-words.ts`: Utility for currency conversion

### Data Storage
```typescript
// Voice list in Redis
Key: elevenlabs:voices
Value: { [name: string]: voiceId }

// Voice details
Key: elevenlabs:voice:[name]
Value: { name, voiceId, addedBy, addedAt }

// User settings
Key: user_voice_settings:[whatsappId]
Value: { mode, voiceName, updatedAt }
```

### Voice Name Pool
```typescript
['aurora', 'blaze', 'cascade', 'delta', 'echo', 'flux', 'galaxy', 'horizon',
 'iris', 'jazz', 'koda', 'luna', 'matrix', 'nova', 'orbit', 'phoenix',
 'quantum', 'ripple', 'spark', 'tide', 'ultra', 'vortex', 'wave', 'xenon',
 'yonder', 'zephyr', 'cosmo', 'dusk', 'ember', 'frost', 'glimmer', 'halo',
 'indigo', 'jade', 'karma', 'lumen', 'mystic', 'nebula', 'opal', 'prism',
 'quartz', 'radiant', 'storm', 'twilight', 'umbra', 'velvet', 'whisper', 'zion']
```

## Configuration

### Environment Variables
```env
# Required for voice features
ELEVENLABS_API_KEY=your_api_key_here

# Optional for speech-to-text
OPENAI_API_KEY=your_openai_key
GOOGLE_CLOUD_KEYFILE=/path/to/credentials.json
```

### Default Configuration
- No hardcoded voice IDs
- System finds first available voice or uses ElevenLabs default
- Voice features work without pre-configured voices

## User Experience

### First-Time Setup
1. User receives payment → Gets voice notification
2. Automatically set to 'voice on' mode
3. Can customize voice with `voice list` and `voice [name]`

### Voice Selection Flow
1. Check user's selected voice
2. If not found, use admin-configured default voice
3. If no default set, use first available voice
4. If no voices configured, use ElevenLabs default
5. Log warning for monitoring

### Default Voice Feature
Administrators can set a default voice for all users who haven't selected their own voice:
- `admin voice default [name]` - Set a voice as the default for all users
- `admin voice default` - View the current default voice
- `admin voice default clear` - Remove the default voice setting

The voice selection hierarchy is:
1. User's explicitly selected voice (highest priority)
2. Admin-configured default voice
3. First available voice in the system
4. ElevenLabs platform default (lowest priority)

## Best Practices

1. **Keep messages short**: Voice synthesis works best with concise messages
2. **Natural language**: Use conversational tone, avoid technical jargon
3. **Number formatting**: Always convert numbers to words for voice
4. **Error handling**: Gracefully fall back to text if voice fails
5. **Testing**: Test with different voices and accents

## Troubleshooting

### Common Issues
1. **No voices available**: System uses default ElevenLabs voice
2. **Voice not found**: Falls back to first available voice
3. **API errors**: Falls back to Google Cloud TTS if configured

### Debugging
- Check Redis for voice configurations: `redis-cli get elevenlabs:voices`
- Check user settings: `redis-cli get user_voice_settings:[whatsappId]`
- Monitor logs for voice selection: `pm2 logs | grep "Using ElevenLabs voice"`

## Future Enhancements

1. Voice cloning for personalized voices
2. Multi-language support
3. Voice emotion/style parameters
4. Voice preview before selection
5. Admin voice management interface