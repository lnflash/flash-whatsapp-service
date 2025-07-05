import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface IDeviceFingerprint {
  browser: string;
  os: string;
  screenResolution: string;
  timezone: string;
  language: string;
  colorDepth: number;
  hardwareConcurrency: number;
  deviceMemory?: number;
  platform: string;
  plugins: string[];
  canvas: string;
  webgl: string;
  fonts: string[];
  userAgent: string;
  [key: string]: any;
}

@Injectable()
export class DeviceFingerprintService {
  /**
   * Generate a unique device ID from fingerprint data
   */
  async generateDeviceId(fingerprint: IDeviceFingerprint): Promise<string> {
    // Combine stable fingerprint components
    const stableComponents = [
      fingerprint.browser,
      fingerprint.os,
      fingerprint.screenResolution,
      fingerprint.timezone,
      fingerprint.language,
      fingerprint.colorDepth.toString(),
      fingerprint.hardwareConcurrency.toString(),
      fingerprint.platform,
      fingerprint.canvas,
      fingerprint.webgl,
      ...fingerprint.fonts.slice(0, 10), // Use top 10 fonts for stability
    ].filter(Boolean);

    // Create hash of components
    const fingerprintString = stableComponents.join('|');
    const hash = crypto
      .createHash('sha256')
      .update(fingerprintString)
      .digest('hex');

    return hash;
  }

  /**
   * Calculate similarity between two fingerprints
   */
  calculateSimilarity(
    fingerprint1: IDeviceFingerprint,
    fingerprint2: IDeviceFingerprint,
  ): number {
    const features = [
      'browser',
      'os',
      'screenResolution',
      'timezone',
      'language',
      'colorDepth',
      'hardwareConcurrency',
      'platform',
    ];

    let matchCount = 0;

    features.forEach(feature => {
      if (fingerprint1[feature] === fingerprint2[feature]) {
        matchCount++;
      }
    });

    // Check canvas similarity
    if (this.isCanvasSimilar(fingerprint1.canvas, fingerprint2.canvas)) {
      matchCount++;
    }

    // Check font similarity
    const fontSimilarity = this.calculateArraySimilarity(
      fingerprint1.fonts,
      fingerprint2.fonts,
    );
    if (fontSimilarity > 0.8) {
      matchCount++;
    }

    return matchCount / (features.length + 2); // +2 for canvas and fonts
  }

  /**
   * Check if a fingerprint is suspicious
   */
  isSuspiciousFingerprint(fingerprint: IDeviceFingerprint): boolean {
    // Check for common spoofing indicators
    const suspiciousIndicators = [
      // Inconsistent platform/OS combinations
      fingerprint.platform.includes('Win') && fingerprint.os.includes('Mac'),
      fingerprint.platform.includes('Mac') && fingerprint.os.includes('Windows'),
      
      // Missing critical data
      !fingerprint.canvas || fingerprint.canvas.length < 50,
      !fingerprint.webgl || fingerprint.webgl.length < 50,
      fingerprint.fonts.length === 0,
      
      // Unrealistic hardware
      fingerprint.hardwareConcurrency > 64,
      fingerprint.colorDepth !== 24 && fingerprint.colorDepth !== 32,
      
      // Common bot indicators
      fingerprint.plugins.length === 0 && fingerprint.browser.includes('Chrome'),
      fingerprint.language === undefined || fingerprint.language === '',
    ];

    return suspiciousIndicators.some(indicator => indicator === true);
  }

  /**
   * Get human-readable device name from fingerprint
   */
  getDeviceName(fingerprint: IDeviceFingerprint): string {
    const browser = this.extractBrowserName(fingerprint.browser);
    const os = this.extractOSName(fingerprint.os);
    
    return `${browser} on ${os}`;
  }

  /**
   * Validate fingerprint data
   */
  validateFingerprint(fingerprint: any): fingerprint is IDeviceFingerprint {
    const requiredFields = [
      'browser',
      'os',
      'screenResolution',
      'timezone',
      'language',
      'colorDepth',
      'hardwareConcurrency',
      'platform',
      'canvas',
      'webgl',
      'userAgent',
    ];

    return requiredFields.every(field => 
      fingerprint.hasOwnProperty(field) && fingerprint[field] !== null
    );
  }

  /**
   * Anonymize fingerprint for logging
   */
  anonymizeFingerprint(fingerprint: IDeviceFingerprint): any {
    return {
      browser: fingerprint.browser,
      os: fingerprint.os,
      timezone: fingerprint.timezone,
      language: fingerprint.language,
      screenResolution: this.generalizeResolution(fingerprint.screenResolution),
      hardwareConcurrency: this.generalizeHardware(fingerprint.hardwareConcurrency),
      fontCount: fingerprint.fonts.length,
      pluginCount: fingerprint.plugins.length,
    };
  }

  /**
   * Private helper methods
   */
  private isCanvasSimilar(canvas1: string, canvas2: string): boolean {
    if (!canvas1 || !canvas2) return false;
    
    // Simple similarity check - in production, use more sophisticated comparison
    const distance = this.levenshteinDistance(
      canvas1.substring(0, 100),
      canvas2.substring(0, 100),
    );
    
    return distance < 10;
  }

  private calculateArraySimilarity(arr1: string[], arr2: string[]): number {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private extractBrowserName(browserString: string): string {
    if (browserString.includes('Chrome')) return 'Chrome';
    if (browserString.includes('Firefox')) return 'Firefox';
    if (browserString.includes('Safari') && !browserString.includes('Chrome')) return 'Safari';
    if (browserString.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  }

  private extractOSName(osString: string): string {
    if (osString.includes('Windows')) return 'Windows';
    if (osString.includes('Mac')) return 'macOS';
    if (osString.includes('Linux')) return 'Linux';
    if (osString.includes('Android')) return 'Android';
    if (osString.includes('iOS')) return 'iOS';
    return 'Unknown OS';
  }

  private generalizeResolution(resolution: string): string {
    const [width] = resolution.split('x').map(Number);
    
    if (width < 1280) return 'Small';
    if (width < 1920) return 'Medium';
    if (width < 2560) return 'Large';
    return 'Very Large';
  }

  private generalizeHardware(cores: number): string {
    if (cores <= 2) return 'Low';
    if (cores <= 4) return 'Medium';
    if (cores <= 8) return 'High';
    return 'Very High';
  }
}