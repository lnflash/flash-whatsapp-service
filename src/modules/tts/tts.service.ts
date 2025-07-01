import { Injectable, Logger } from '@nestjs/common';
import * as googleTTS from 'google-tts-api';
import { AdminSettingsService, VoiceMode } from '../whatsapp/services/admin-settings.service';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(private readonly adminSettingsService: AdminSettingsService) {}

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
      
      // Limit text length to avoid API limits (leave room for ellipsis)
      const maxLength = 197; // 200 - 3 for "..."
      const truncatedText = cleanedText.length > maxLength 
        ? cleanedText.substring(0, maxLength) + '...' 
        : cleanedText;

      this.logger.debug(`Converting text to speech: ${truncatedText.substring(0, 50)}...`);

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

      this.logger.debug(`Successfully converted text to speech (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      this.logger.error('Error converting text to speech:', error);
      throw error;
    }
  }

  /**
   * Check if text should be converted to voice note based on mode and keywords
   * @param text - The message text
   * @param isAiResponse - Whether this is an AI response (vs command response)
   * @returns boolean indicating if voice should be used
   */
  async shouldUseVoice(text: string, isAiResponse: boolean = false): Promise<boolean> {
    try {
      const voiceMode = await this.adminSettingsService.getVoiceMode();

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
    // Remove emojis and special characters that don't translate well to speech
    let cleaned = text
      .replace(/[🟢🔴⚡💸🎉✅❌🤖💡🔒🚀📱💰⚠️]/g, '')
      .replace(/\*\*/g, '') // Remove markdown bold
      .replace(/\n\n/g, '. ') // Replace double newlines with periods
      .replace(/\n/g, '. ') // Replace single newlines with periods
      .replace(/\.+/g, '.') // Multiple periods to single
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .trim();

    // Replace common abbreviations and symbols
    cleaned = cleaned
      .replace(/USD/g, 'U S D')
      .replace(/BTC/g, 'bitcoin')
      .replace(/\$(\d+)/g, '$1 dollars') // $100 -> 100 dollars
      .replace(/₿/g, 'bitcoin');

    return cleaned;
  }
}
