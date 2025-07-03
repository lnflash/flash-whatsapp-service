import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as googleTTS from 'google-tts-api';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import {
  AdminSettingsService,
  VoiceMode as _VoiceMode,
} from '../whatsapp/services/admin-settings.service';
import {
  UserVoiceSettingsService,
  UserVoiceMode,
} from '../whatsapp/services/user-voice-settings.service';

export type TtsProvider = 'google-tts-api' | 'google-cloud';

interface GoogleCloudVoiceConfig {
  languageCode: string;
  name?: string; // Specific voice name (e.g., "en-US-Wavenet-D")
  ssmlGender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly provider: TtsProvider;
  private googleCloudClient?: TextToSpeechClient;

  constructor(
    private readonly adminSettingsService: AdminSettingsService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UserVoiceSettingsService))
    private readonly userVoiceSettingsService?: UserVoiceSettingsService,
  ) {
    // Check if Google Cloud credentials are configured
    const googleCloudKeyFile = this.configService.get<string>('GOOGLE_CLOUD_KEYFILE');
    const googleApplicationCredentials = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );

    if (googleCloudKeyFile || googleApplicationCredentials) {
      try {
        // Initialize Google Cloud client
        this.googleCloudClient = new TextToSpeechClient({
          keyFilename: googleCloudKeyFile,
        });
        this.provider = 'google-cloud';
        this.logger.log('✅ Google Cloud TTS initialized successfully');
      } catch (error) {
        this.logger.warn('Failed to initialize Google Cloud TTS, falling back to free API:', error);
        this.provider = 'google-tts-api';
      }
    } else {
      this.provider = 'google-tts-api';
      this.logger.log('ℹ️ Using free TTS API (200 char limit). For better voice quality, configure GOOGLE_CLOUD_KEYFILE');
    }
  }

  /**
   * Convert text to speech and return audio buffer
   * @param text - Text to convert to speech
   * @param language - Language code (default: 'en')
   * @returns Buffer containing audio data
   */
  async textToSpeech(text: string, language: string = 'en'): Promise<Buffer> {
    try {
      // Clean the text first to get accurate length
      const cleanedText = this.cleanTextForTTS(text);

      if (this.provider === 'google-cloud' && this.googleCloudClient) {
        return this.textToSpeechGoogleCloud(cleanedText, language);
      } else {
        return this.textToSpeechFreeApi(cleanedText, language);
      }
    } catch (error) {
      this.logger.error('Error converting text to speech:', error);
      throw error;
    }
  }

  /**
   * Use free google-tts-api (limited to 200 chars)
   */
  private async textToSpeechFreeApi(text: string, language: string): Promise<Buffer> {
    // Limit text length to avoid API limits (leave room for ellipsis)
    const maxLength = 197; // 200 - 3 for "..."
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

    // Get audio URL from Google TTS
    const audioUrl = googleTTS.getAudioUrl(truncatedText, {
      lang: language,
      slow: false,
      host: 'https://translate.google.com',
    });

    // Fetch the audio data
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return buffer;
  }

  /**
   * Use Google Cloud Text-to-Speech (no length limit, better quality)
   */
  private async textToSpeechGoogleCloud(text: string, language: string): Promise<Buffer> {
    if (!this.googleCloudClient) {
      throw new Error('Google Cloud client not initialized');
    }

    // For very long texts, we might want to truncate even with Cloud TTS
    const maxLength = 5000; // Much higher limit
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

    // Get voice configuration
    const voiceConfig = this.getVoiceConfig(language);

    // Construct the request
    const request = {
      input: { text: truncatedText },
      voice: voiceConfig,
      audioConfig: {
        audioEncoding: 'OGG_OPUS' as const, // Best for WhatsApp voice notes
        speakingRate: 1.0,
        pitch: 0,
      },
    };

    // Perform the text-to-speech request
    const [response] = await this.googleCloudClient.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content in response');
    }

    const buffer = Buffer.from(response.audioContent as string, 'base64');
    return buffer;
  }

  /**
   * Get voice configuration based on language
   */
  private getVoiceConfig(language: string): GoogleCloudVoiceConfig {
    // Use Chirp3-HD voices for the best quality
    // Chirp3-HD-Gacrux is Google's latest high-definition voice model
    const voiceMap: Record<string, GoogleCloudVoiceConfig> = {
      en: {
        languageCode: 'en-AU',
        name: 'en-AU-Chirp3-HD-Gacrux', // Chirp3-HD high-definition voice
        ssmlGender: 'NEUTRAL' as const, // Chirp voices use NEUTRAL gender
      },
      es: {
        languageCode: 'es-AU',
        name: 'es-AU-Neural2-A', // Fallback to Neural2 for Spanish (Chirp may not be available)
        ssmlGender: 'FEMALE' as const,
      },
      fr: {
        languageCode: 'fr-FR',
        name: 'fr-FR-Neural2-A', // Fallback to Neural2 for French (Chirp may not be available)
        ssmlGender: 'FEMALE' as const,
      },
      // Add more languages as needed
    };

    return voiceMap[language] || voiceMap['en'];
  }

  /**
   * Check if text should be converted to voice note based on mode and keywords
   * @param text - The message text
   * @param isAiResponse - Whether this is an AI response (vs command response)
   * @param whatsappId - The user's WhatsApp ID to check user-specific settings
   * @returns boolean indicating if voice should be used
   */
  async shouldUseVoice(
    text: string,
    isAiResponse: boolean = false,
    whatsappId?: string,
  ): Promise<boolean> {
    try {
      // First check user-specific settings if whatsappId is provided
      if (whatsappId && this.userVoiceSettingsService) {
        const userMode = await this.userVoiceSettingsService.getUserVoiceMode(whatsappId);

        if (userMode !== null) {
          switch (userMode) {
            case UserVoiceMode.OFF:
              // User has disabled voice
              this.logger.debug(`Voice disabled for user ${whatsappId} (user preference: OFF)`);
              return false;

            case UserVoiceMode.ONLY:
              // User wants voice only (always)
              this.logger.debug(`Voice enabled for user ${whatsappId} (user preference: ONLY)`);
              return true;

            case UserVoiceMode.ON:
              // User wants voice for AI responses based on keywords
              if (isAiResponse) {
                const voiceKeywords = ['voice', 'audio', 'speak', 'say it', 'tell me'];
                const lowerText = text.toLowerCase();
                const hasKeyword = voiceKeywords.some((keyword) => lowerText.includes(keyword));
                this.logger.debug(`Voice check for user ${whatsappId}: AI response=${isAiResponse}, has keyword=${hasKeyword}`);
                return hasKeyword;
              }
              return false;
          }
        }
      }

      // Fall back to admin settings if no user preference
      const voiceMode = await this.adminSettingsService.getVoiceMode();
      this.logger.debug(`Using admin voice mode: ${voiceMode}, isAiResponse: ${isAiResponse}`);

      switch (voiceMode) {
        case 'off':
          // Voice disabled
          return false;

        case 'always':
          // Always use voice for everything
          return true;

        case 'on':
          // Default mode - AI responds to voice keywords only
          if (isAiResponse) {
            // Check if user requested voice response
            const voiceKeywords = ['voice', 'audio', 'speak', 'say it', 'tell me'];
            const lowerText = text.toLowerCase();
            return voiceKeywords.some((keyword) => lowerText.includes(keyword));
          }
          // Command responses don't use voice in 'on' mode
          return false;

        default:
          return false;
      }
    } catch (error) {
      this.logger.error('Error checking voice mode:', error);
      return false;
    }
  }

  /**
   * Clean text for better TTS output
   * @param text - Raw text
   * @returns Cleaned text suitable for TTS
   */
  cleanTextForTTS(text: string): string {
    // First, handle special cases for currency and common symbols
    let cleaned = text
      .replace(/\$(\d+(?:\.\d+)?)/g, '$1 dollars') // $100 -> 100 dollars, $10.50 -> 10.50 dollars
      .replace(/₿(\d+(?:\.\d+)?)/g, '$1 bitcoin') // ₿0.001 -> 0.001 bitcoin
      .replace(/USD/g, 'U S D')
      .replace(/BTC/g, 'bitcoin');

    // Remove emojis and special characters that don't translate well to speech
    cleaned = cleaned
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[🟢🔴⚡💸🎉✅❌🤖💡🔒🚀📱💰⚠️🔊👮🆘💸📥📅👤💡]/gu, '')
      .replace(/\*\*/g, '') // Remove markdown bold
      .replace(/__|_/g, ' ') // Replace underscores with spaces
      .replace(/`+/g, '') // Remove backticks
      .replace(/[~^]/g, '') // Remove tildes and carets
      .replace(/[#*]/g, '') // Remove hash and asterisk
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/[{}[\]]/g, '') // Remove curly and square brackets
      .replace(/[|\\]/g, '') // Remove pipes and backslashes
      .replace(/[@&]/g, ' and ') // Replace @ and & with "and"
      .replace(/[=%]/g, ' ') // Replace equals and percent with space
      .replace(/[+]/g, ' plus ') // Replace plus with "plus"
      .replace(/[-]{2,}/g, ' ') // Replace multiple dashes with space
      .replace(/[_$]/g, '') // Remove remaining underscores and dollar signs
      .replace(/\n\n/g, '. ') // Replace double newlines with periods
      .replace(/\n/g, '. ') // Replace single newlines with periods
      .replace(/[:;]/g, ',') // Replace colons and semicolons with commas
      .replace(/[!?]{2,}/g, (match) => match[0]) // Multiple ! or ? to single
      .replace(/\.{2,}/g, '.') // Multiple periods to single
      .replace(/,{2,}/g, ',') // Multiple commas to single
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .trim();

    // Clean up any punctuation at the start or end
    cleaned = cleaned
      .replace(/^[.,;:!?\s]+/, '') // Remove leading punctuation
      .replace(/[,;:\s]+$/, ''); // Remove trailing punctuation (except . ! ?)

    return cleaned;
  }

  /**
   * Check if user wants voice-only responses (no text)
   * @param whatsappId - The user's WhatsApp ID
   * @returns boolean indicating if only voice should be sent
   */
  async shouldSendVoiceOnly(whatsappId?: string): Promise<boolean> {
    try {
      if (whatsappId && this.userVoiceSettingsService) {
        const userMode = await this.userVoiceSettingsService.getUserVoiceMode(whatsappId);
        return userMode === UserVoiceMode.ONLY;
      }

      // Check admin settings for 'always' mode
      const adminMode = await this.adminSettingsService.getVoiceMode();
      return adminMode === 'always';
    } catch (error) {
      this.logger.error('Error checking voice-only mode:', error);
      return false;
    }
  }

  /**
   * Get current TTS provider info
   */
  getProviderInfo(): { provider: TtsProvider; quality: string; limits: string } {
    if (this.provider === 'google-cloud') {
      return {
        provider: 'google-cloud',
        quality: 'Premium (Chirp3-HD voices)',
        limits: 'Up to 5,000 characters per request',
      };
    } else {
      return {
        provider: 'google-tts-api',
        quality: 'Basic (Google Translate)',
        limits: '200 characters per request',
      };
    }
  }
}
