import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechClient } from '@google-cloud/speech';
import { WhisperService } from './whisper.service';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private speechClient?: SpeechClient;
  private readonly isConfigured: boolean;
  private readonly preferWhisper: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly whisperService: WhisperService,
  ) {
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
      } catch (error) {
        this.logger.warn('Failed to initialize Google Cloud Speech-to-Text:', error);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
      this.logger.warn('Google Cloud Speech-to-Text not configured');
    }

    // Check if we should prefer Whisper over Google Cloud Speech
    this.preferWhisper = this.configService.get<boolean>('PREFER_WHISPER', false);
  }

  /**
   * Convert speech audio to text
   * @param audioBuffer - Audio buffer containing speech
   * @param mimeType - MIME type of the audio (e.g., 'audio/ogg; codecs=opus')
   * @returns Transcribed text or null if not available
   */
  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    // If Whisper is preferred and available, try it first
    if (this.preferWhisper && this.whisperService.isAvailable()) {
      this.logger.log('Using Whisper AI for speech-to-text (preferred)');
      const whisperResult = await this.whisperService.speechToText(audioBuffer, mimeType);
      if (whisperResult) {
        return whisperResult;
      }
      this.logger.warn('Whisper transcription failed, falling back to Google Cloud Speech');
    }

    // Try Google Cloud Speech if configured
    if (this.isConfigured && this.speechClient) {
      const googleResult = await this.transcribeWithGoogle(audioBuffer, mimeType);
      if (googleResult) {
        return googleResult;
      }
    }

    // If Google failed or not configured, try Whisper as fallback
    if (!this.preferWhisper && this.whisperService.isAvailable()) {
      this.logger.log('Trying Whisper AI as fallback');
      const whisperResult = await this.whisperService.speechToText(audioBuffer, mimeType);
      if (whisperResult) {
        return whisperResult;
      }
    }

    this.logger.warn('No speech-to-text service available or all transcription attempts failed');
    return null;
  }

  /**
   * Transcribe using Google Cloud Speech
   */
  private async transcribeWithGoogle(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    if (!this.speechClient) {
      return null;
    }

    try {
      // Determine audio encoding from mime type
      // WhatsApp typically sends voice notes as audio/ogg with opus codec
      let encoding: any = 'OGG_OPUS'; // Default for WhatsApp voice notes
      let sampleRateHertz = 16000; // WhatsApp uses 16kHz

      if (mimeType.includes('ogg') || mimeType.includes('opus')) {
        encoding = 'OGG_OPUS';
        sampleRateHertz = 16000;
      } else if (mimeType.includes('mp3')) {
        encoding = 'MP3';
        sampleRateHertz = 16000;
      } else if (mimeType.includes('wav')) {
        encoding = 'LINEAR16';
        sampleRateHertz = 16000;
      } else if (mimeType.includes('webm')) {
        encoding = 'WEBM_OPUS';
        sampleRateHertz = 16000;
      }

      // Try with different configurations
      const configs = [
        {
          encoding,
          sampleRateHertz,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'latest_short', // Try short model for voice commands
          audioChannelCount: 1,
        },
        {
          encoding,
          sampleRateHertz: 48000, // Try higher sample rate
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'latest_short',
          audioChannelCount: 1,
        },
        {
          encoding: 'WEBM_OPUS', // Try WEBM if OGG fails
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'latest_short',
          audioChannelCount: 1,
        },
      ];

      let response = null;
      let lastError = null;

      // Try each configuration until one works
      for (const config of configs) {
        try {
          const request = {
            audio: {
              content: audioBuffer.toString('base64'),
            },
            config,
          };

          const [result] = await this.speechClient.recognize(request);
          if (result && result.results && result.results.length > 0) {
            response = result;
            break;
          }
        } catch (error) {
          lastError = error;
          continue;
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      if (!response) {
        this.logger.warn('No response from any configuration');
        return null;
      }

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

      return transcription;
    } catch (error) {
      this.logger.error('Error transcribing speech with Google Cloud:', error);

      // Log more details about the error
      if (error.code) {
        this.logger.error(`Error code: ${error.code}`);
      }
      if (error.details) {
        this.logger.error(`Error details: ${error.details}`);
      }
      if (error.message) {
        this.logger.error(`Error message: ${error.message}`);
      }

      return null;
    }
  }

  /**
   * Check if Speech-to-Text is available
   */
  isAvailable(): boolean {
    return this.isConfigured || this.whisperService.isAvailable();
  }
}
