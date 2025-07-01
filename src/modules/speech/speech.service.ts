import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechClient } from '@google-cloud/speech';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private speechClient?: SpeechClient;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    // Check if Google Cloud credentials are configured
    const googleCloudKeyFile = this.configService.get<string>('GOOGLE_CLOUD_KEYFILE');
    const googleApplicationCredentials = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );

    if (googleCloudKeyFile || googleApplicationCredentials) {
      try {
        // Initialize Google Cloud Speech client
        this.speechClient = new SpeechClient({
          keyFilename: googleCloudKeyFile,
        });
        this.isConfigured = true;
        this.logger.log('Google Cloud Speech-to-Text initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize Google Cloud Speech-to-Text:', error);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
      this.logger.warn('Google Cloud Speech-to-Text not configured');
    }
  }

  /**
   * Convert speech audio to text
   * @param audioBuffer - Audio buffer containing speech
   * @param mimeType - MIME type of the audio (e.g., 'audio/ogg; codecs=opus')
   * @returns Transcribed text or null if not available
   */
  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    if (!this.isConfigured || !this.speechClient) {
      this.logger.warn('Speech-to-Text not available - Google Cloud not configured');
      return null;
    }

    try {
      // Determine audio encoding from mime type
      let encoding: any = 'WEBM_OPUS'; // Default for WhatsApp voice notes
      if (mimeType.includes('ogg')) {
        encoding = 'OGG_OPUS';
      } else if (mimeType.includes('mp3')) {
        encoding = 'MP3';
      } else if (mimeType.includes('wav')) {
        encoding = 'LINEAR16';
      }

      // Configure the request
      const request = {
        audio: {
          content: audioBuffer.toString('base64'),
        },
        config: {
          encoding,
          sampleRateHertz: 48000, // Standard for WhatsApp voice notes
          languageCode: 'en-US', // Default to English
          alternativeLanguageCodes: ['es-US', 'fr-FR'], // Support Spanish and French
          enableAutomaticPunctuation: true,
          model: 'latest_long', // Best model for conversational speech
          useEnhanced: true, // Use enhanced model if available
        },
      };

      // Perform the transcription
      const [response] = await this.speechClient.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        this.logger.warn('No transcription results');
        return null;
      }

      // Get the best transcription
      const transcription = response.results
        .map((result) => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();

      if (!transcription) {
        this.logger.warn('Empty transcription result');
        return null;
      }

      this.logger.log(`Transcribed: "${transcription}"`);
      return transcription;
    } catch (error) {
      this.logger.error('Error transcribing speech:', error);
      return null;
    }
  }

  /**
   * Check if Speech-to-Text is available
   */
  isAvailable(): boolean {
    return this.isConfigured;
  }
}