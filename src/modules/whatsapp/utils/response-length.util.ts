/**
 * Utility functions for managing response lengths
 * Target: ~21 seconds for voice, ~630 characters for text
 */

export class ResponseLengthUtil {
  // Average reading speed: 150 words per minute
  // 21 seconds = 0.35 minutes = ~52 words
  private static readonly MAX_VOICE_WORDS = 52;
  private static readonly MAX_TEXT_CHARS = 630;
  
  // Important response types that can exceed limits
  private static readonly EXCEPTIONS = [
    'help_menu',
    'onboarding',
    'error_detailed',
    'transaction_history',
    'analytics_report',
  ];

  /**
   * Estimate voice duration in seconds
   * @param text The text to be spoken
   * @returns Estimated duration in seconds
   */
  static estimateVoiceDuration(text: string): number {
    const words = text.split(/\s+/).filter(word => word.length > 0).length;
    // 150 words per minute = 2.5 words per second
    return words / 2.5;
  }

  /**
   * Check if response should be shortened
   * @param text The response text
   * @param type The type of response
   * @param isVoice Whether this is for voice output
   * @returns true if the response should be shortened
   */
  static shouldShorten(text: string, type?: string, isVoice = false): boolean {
    // Check if this is an exception type
    if (type && this.EXCEPTIONS.includes(type)) {
      return false;
    }

    if (isVoice) {
      const duration = this.estimateVoiceDuration(text);
      return duration > 21;
    } else {
      return text.length > this.MAX_TEXT_CHARS;
    }
  }

  /**
   * Shorten a response to meet length requirements
   * @param text The original text
   * @param isVoice Whether this is for voice output
   * @returns Shortened text
   */
  static shortenResponse(text: string, isVoice = false): string {
    if (isVoice) {
      return this.shortenForVoice(text);
    } else {
      return this.shortenForText(text);
    }
  }

  /**
   * Shorten text for voice output (~52 words max)
   */
  private static shortenForVoice(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const result: string[] = [];
    let wordCount = 0;

    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).length;
      if (wordCount + sentenceWords <= this.MAX_VOICE_WORDS) {
        result.push(sentence.trim());
        wordCount += sentenceWords;
      } else {
        break;
      }
    }

    // If we couldn't fit even one sentence, truncate the first sentence
    if (result.length === 0 && sentences.length > 0) {
      const words = sentences[0].trim().split(/\s+/);
      result.push(words.slice(0, this.MAX_VOICE_WORDS).join(' ') + '...');
    }

    return result.join('. ') + (result.length > 0 ? '.' : '');
  }

  /**
   * Shorten text for text output (~630 characters max)
   */
  private static shortenForText(text: string): string {
    if (text.length <= this.MAX_TEXT_CHARS) {
      return text;
    }

    // Try to cut at sentence boundary
    const cutoff = text.lastIndexOf('.', this.MAX_TEXT_CHARS - 50);
    if (cutoff > this.MAX_TEXT_CHARS * 0.7) {
      return text.substring(0, cutoff + 1);
    }

    // Otherwise cut at word boundary
    const wordCutoff = text.lastIndexOf(' ', this.MAX_TEXT_CHARS - 10);
    if (wordCutoff > this.MAX_TEXT_CHARS * 0.8) {
      return text.substring(0, wordCutoff) + '...';
    }

    // Last resort: hard cut
    return text.substring(0, this.MAX_TEXT_CHARS - 3) + '...';
  }

  /**
   * Get concise versions of common responses
   */
  static getConciseResponse(type: string, data?: any): string {
    const responses: Record<string, (data?: any) => string> = {
      // Balance response - from ~140 chars to ~80 chars
      balance: (d) => {
        const { fiatFormatted, tip } = d;
        return `💰 Balance: ${fiatFormatted}${tip ? '\n' + tip : ''}`;
      },
      
      // Payment success - from ~200 chars to ~100 chars
      payment_success: (d) => {
        const { amount, recipient } = d;
        return `✅ Sent $${amount} to ${recipient}`;
      },
      
      // Payment received - from ~180 chars to ~90 chars
      payment_received: (d) => {
        const { amount, sender } = d;
        return `💸 Received $${amount} from ${sender}`;
      },
      
      // Error messages - keep essential info only
      insufficient_balance: () => 
        '❌ Insufficient balance. Type "receive" to add funds.',
      
      user_not_found: (d) => 
        `❌ User ${d?.username || ''} not found.`,
      
      // Link account
      not_linked: () => 
        'Link your account first. Type "link" to start.',
      
      // Generic success/error
      success: () => '✅ Done!',
      error: () => '❌ Failed. Try again.',
      
      // Help hint
      help_hint: () => 
        'Type "help" for commands.',
    };

    const handler = responses[type];
    return handler ? handler(data) : '';
  }

  /**
   * Format a list concisely
   */
  static formatConciseList(items: string[], maxItems = 3): string {
    if (items.length === 0) return 'None';
    if (items.length <= maxItems) return items.join(', ');
    
    const shown = items.slice(0, maxItems).join(', ');
    const remaining = items.length - maxItems;
    return `${shown} (+${remaining} more)`;
  }

  /**
   * Get voice-optimized version of text
   */
  static optimizeForVoice(text: string): string {
    // Remove emoji and special characters
    let voiceText = text.replace(/[🔵🟠💰💸✅❌🎯📱🔑⏱️💡*_]/g, '');
    
    // Replace common abbreviations
    voiceText = voiceText
      .replace(/\$/g, 'dollars')
      .replace(/USD/g, 'U.S. dollars')
      .replace(/BTC/g, 'Bitcoin')
      .replace(/\b(\d+)k\b/gi, '$1 thousand')
      .replace(/\b(\d+)m\b/gi, '$1 million');
    
    // Clean up extra whitespace
    voiceText = voiceText.replace(/\s+/g, ' ').trim();
    
    return voiceText;
  }
}