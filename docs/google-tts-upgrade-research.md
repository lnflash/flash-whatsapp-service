# Research: Upgrading from google-tts-api to Google Cloud Text-to-Speech

## Current Implementation (google-tts-api)

### Package Details
- **Current version**: 2.0.2
- **Usage**: Simple API that uses Google Translate's unofficial TTS endpoint
- **Limitations**: 
  - 200 character limit per request
  - Limited to basic voices from Google Translate
  - No authentication required
  - Unofficial API (could break at any time)
  - Limited language support
  - No voice customization options

### Current Code Structure
```typescript
import * as googleTTS from 'google-tts-api';

const audioUrl = googleTTS.getAudioUrl(text, {
  lang: language,
  slow: false,
  host: 'https://translate.google.com',
});
```

## Google Cloud Text-to-Speech (@google-cloud/text-to-speech)

### Package Details
- **Latest version**: 6.1.0 (as of research date)
- **Official Google Cloud service with SLA**
- **Installation**: `npm install @google-cloud/text-to-speech`

### Key Differences

#### 1. Authentication Required
- Requires Google Cloud Project
- Needs service account with proper permissions
- Authentication via:
  - Environment variable: `GOOGLE_APPLICATION_CREDENTIALS`
  - Or programmatic configuration with keyfile

#### 2. Voice Options
- **380+ voices** across 50+ languages
- Voice types:
  - Standard voices
  - WaveNet voices (more natural, human-like)
  - Neural2 voices
  - Chirp3-HD voices (latest generation, highest quality)
    - **en-US-Chirp3-HD-Gacrux**: Ultra-realistic HD voice
    - Best for natural conversation
    - Uses NEUTRAL gender setting
- SSML gender options: NEUTRAL, FEMALE, MALE
- Custom voice training available

#### 3. Audio Encoding Options
- MP3 (current format)
- LINEAR16 (WAV)
- OGG_OPUS
- FLAC
- AMR/AMR_WB
- And more formats

#### 4. Advanced Features
- Full SSML support for speech customization
- Adjustable parameters:
  - Speaking rate: 0.25 to 4.0
  - Pitch: -20.0 to 20.0
  - Volume gain: -96.0 to 16.0
- No character limit (pricing based on usage)

### Pricing and Limits

#### Free Tier (Monthly)
- **WaveNet voices**: First 1 million characters free
- **Standard voices**: First 4 million characters free
- New customers get $300 in free credits

#### Paid Pricing (per 1 million characters)
- Standard voices: Lower cost
- WaveNet voices: Higher cost
- Premium/Studio voices: Highest cost
- Exact pricing varies by voice type

#### Important Notes
- Billing must be enabled (automatic charges after free tier)
- All characters count including spaces and SSML tags
- No hard character limit per request

### Implementation Example

```typescript
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

export class GoogleCloudTtsService {
  private client: TextToSpeechClient;

  constructor() {
    // Option 1: Use environment variable GOOGLE_APPLICATION_CREDENTIALS
    this.client = new TextToSpeechClient();
    
    // Option 2: Specify keyfile path
    // this.client = new TextToSpeechClient({
    //   keyFilename: '/path/to/service-account-key.json'
    // });
  }

  async textToSpeech(text: string, language: string = 'en-US'): Promise<Buffer> {
    const request = {
      input: { text },
      voice: {
        languageCode: language,
        ssmlGender: 'NEUTRAL',
        // Optional: specify exact voice
        // name: 'en-US-Wavenet-D'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        // Optional parameters
        // speakingRate: 1.0,
        // pitch: 0,
        // volumeGainDb: 0
      },
    };

    const [response] = await this.client.synthesizeSpeech(request);
    return Buffer.from(response.audioContent);
  }
}
```

### Setup Requirements

1. **Create Google Cloud Project**
   ```bash
   # Enable the API
   gcloud services enable texttospeech.googleapis.com
   ```

2. **Create Service Account**
   ```bash
   # Create service account
   gcloud iam service-accounts create tts-service-account \
     --display-name "Text-to-Speech Service Account"

   # Create and download key
   gcloud iam service-accounts keys create ~/tts-key.json \
     --iam-account tts-service-account@PROJECT_ID.iam.gserviceaccount.com

   # Grant permissions
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:tts-service-account@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/cloudtts.viewer"
   ```

3. **Set Authentication**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/tts-key.json"
   ```

### Migration Considerations

#### Pros of Upgrading
1. **Reliability**: Official API with SLA
2. **No character limits**: Can handle longer texts without truncation
3. **Better voice quality**: WaveNet and Neural voices sound more natural
4. **More languages and voices**: 380+ voices vs basic Translate voices
5. **SSML support**: Fine control over pronunciation, pauses, emphasis
6. **Audio format options**: Not limited to MP3
7. **Future-proof**: Official API unlikely to break

#### Cons of Upgrading
1. **Cost**: After free tier, there are usage charges
2. **Complexity**: Requires authentication setup
3. **Google Cloud dependency**: Need GCP project and billing
4. **Larger package size**: Full Google Cloud SDK vs lightweight library

#### Migration Effort
1. Set up Google Cloud project and authentication
2. Update package dependencies
3. Rewrite TTS service to use new API
4. Update error handling for new error types
5. Test with various text lengths and languages
6. Monitor usage to stay within free tier if needed

### Recommendations

1. **For Production Use**: Upgrade is highly recommended for reliability and features
2. **For Development/Low Volume**: Current solution may suffice if under 200 chars
3. **Cost Management**: 
   - Use standard voices for most content
   - Reserve WaveNet for important messages
   - Monitor character usage in GCP console
4. **Implementation Strategy**:
   - Keep character limit logic for cost control
   - Add voice type configuration option
   - Implement proper error handling for quota/auth issues
   - Consider caching audio for repeated messages