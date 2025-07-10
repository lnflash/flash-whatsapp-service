import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { CommandType } from './command-parser.service';

export interface UserActivity {
  command: string;
  type: CommandType;
  timestamp: Date;
  failed: boolean;
  errorType?: string;
}

export interface ConfusionPattern {
  pattern: string;
  helpSuggestion: string;
  priority: number;
}

@Injectable()
export class ContextualHelpService {
  private readonly logger = new Logger(ContextualHelpService.name);
  private readonly ACTIVITY_KEY_PREFIX = 'user_activity:';
  private readonly ACTIVITY_WINDOW = 300; // 5 minutes
  private readonly MAX_ACTIVITIES = 10;

  constructor(private readonly redisService: RedisService) {}

  private readonly confusionPatterns: ConfusionPattern[] = [
    // Repeated unknown commands
    {
      pattern: 'multiple_unknown_commands',
      helpSuggestion: "I notice you're trying different commands. Type `help` to see what I can do, or tell me what you'd like to accomplish!",
      priority: 1,
    },
    // Multiple failed payment attempts
    {
      pattern: 'payment_failures',
      helpSuggestion: "Having trouble with payments? Make sure to use: `send [amount] to [username]`. For example: `send 10 to john`",
      priority: 2,
    },
    // Trying to use unlinked features
    {
      pattern: 'unlinked_features',
      helpSuggestion: "You'll need to link your Flash account first. Type `link` to get started!",
      priority: 3,
    },
    // Verification confusion
    {
      pattern: 'verification_issues',
      helpSuggestion: "Enter just the 6-digit code you received. For example: `123456`",
      priority: 2,
    },
    // Voice command confusion
    {
      pattern: 'voice_confusion',
      helpSuggestion: "For voice commands: `voice on` enables voice, `voice list` shows available voices, `voice [name]` selects a voice.",
      priority: 1,
    },
    // Contact confusion
    {
      pattern: 'contact_confusion',
      helpSuggestion: "To manage contacts: `contacts add john +1234567890` saves a contact, `contacts list` shows all contacts.",
      priority: 1,
    },
    // Amount format confusion
    {
      pattern: 'amount_format_confusion',
      helpSuggestion: "Use numbers for amounts. Examples: `send 10 to john` or `receive 25.50`",
      priority: 2,
    },
    // General help needed
    {
      pattern: 'help_needed',
      helpSuggestion: "Need help? Try these:\n• `help` - Basic commands\n• `help wallet` - Money features\n• `help more` - All commands",
      priority: 1,
    },
  ];

  /**
   * Track user activity
   */
  async trackActivity(
    whatsappId: string,
    command: string,
    type: CommandType,
    failed: boolean = false,
    errorType?: string,
  ): Promise<void> {
    const key = `${this.ACTIVITY_KEY_PREFIX}${whatsappId}`;
    
    // Get existing activities
    const data = await this.redisService.get(key);
    let activities: UserActivity[] = data ? JSON.parse(data) : [];

    // Add new activity
    activities.push({
      command,
      type,
      timestamp: new Date(),
      failed,
      errorType,
    });

    // Keep only recent activities
    activities = activities
      .filter(a => Date.now() - new Date(a.timestamp).getTime() < this.ACTIVITY_WINDOW * 1000)
      .slice(-this.MAX_ACTIVITIES);

    await this.redisService.set(key, JSON.stringify(activities), this.ACTIVITY_WINDOW);
  }

  /**
   * Analyze user activity for confusion patterns
   */
  async analyzeForConfusion(whatsappId: string): Promise<string | null> {
    const key = `${this.ACTIVITY_KEY_PREFIX}${whatsappId}`;
    const data = await this.redisService.get(key);
    
    if (!data) return null;

    const activities: UserActivity[] = JSON.parse(data).map((a: any) => ({
      ...a,
      timestamp: new Date(a.timestamp),
    }));

    // Check for confusion patterns
    const detectedPatterns: ConfusionPattern[] = [];

    // Pattern: Multiple unknown commands
    const unknownCount = activities.filter(a => a.type === CommandType.UNKNOWN).length;
    if (unknownCount >= 3) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'multiple_unknown_commands')!);
    }

    // Pattern: Multiple failed payments
    const failedPayments = activities.filter(
      a => (a.type === CommandType.SEND || a.type === CommandType.REQUEST) && a.failed
    ).length;
    if (failedPayments >= 2) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'payment_failures')!);
    }

    // Pattern: Trying features while unlinked
    const unlinkedAttempts = activities.filter(
      a => a.errorType === 'unlinked' && 
      [CommandType.BALANCE, CommandType.SEND, CommandType.RECEIVE, CommandType.HISTORY].includes(a.type)
    ).length;
    if (unlinkedAttempts >= 2) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'unlinked_features')!);
    }

    // Pattern: Verification issues
    const verifyAttempts = activities.filter(
      a => a.type === CommandType.VERIFY && a.failed
    ).length;
    if (verifyAttempts >= 2) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'verification_issues')!);
    }

    // Pattern: Voice command confusion
    const voiceConfusion = activities.filter(
      a => a.command.toLowerCase().includes('voice') && (a.type === CommandType.UNKNOWN || a.failed)
    ).length;
    if (voiceConfusion >= 2) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'voice_confusion')!);
    }

    // Pattern: Contact confusion
    const contactConfusion = activities.filter(
      a => a.command.toLowerCase().includes('contact') && (a.type === CommandType.UNKNOWN || a.failed)
    ).length;
    if (contactConfusion >= 2) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'contact_confusion')!);
    }

    // Pattern: Amount format issues
    const amountIssues = activities.filter(
      a => a.errorType === 'invalid_amount' || 
      (a.command.match(/[a-zA-Z]+\s+[a-zA-Z]+\s+to/) && a.failed)
    ).length;
    if (amountIssues >= 2) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'amount_format_confusion')!);
    }

    // Pattern: General help needed (quick succession of different failed commands)
    const recentFailures = activities
      .filter(a => Date.now() - a.timestamp.getTime() < 60000 && a.failed)
      .length;
    if (recentFailures >= 3) {
      detectedPatterns.push(this.confusionPatterns.find(p => p.pattern === 'help_needed')!);
    }

    // Return the highest priority suggestion
    if (detectedPatterns.length > 0) {
      const sorted = detectedPatterns.sort((a, b) => b.priority - a.priority);
      return `\n\n💡 *Tip:* ${sorted[0].helpSuggestion}`;
    }

    return null;
  }

  /**
   * Get smart suggestions based on user context
   */
  async getSmartSuggestions(
    whatsappId: string,
    currentCommand: CommandType,
    isLinked: boolean,
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Context-based suggestions
    switch (currentCommand) {
      case CommandType.BALANCE:
        suggestions.push('send 10 to friend', 'receive 20', 'history');
        break;
      case CommandType.SEND:
        suggestions.push('balance', 'contacts list', 'history');
        break;
      case CommandType.RECEIVE:
        suggestions.push('pending', 'balance', 'share the invoice with sender');
        break;
      case CommandType.HISTORY:
        suggestions.push('history #abc123 (for details)', 'balance', 'send payment');
        break;
      case CommandType.CONTACTS:
        suggestions.push('contacts add name +1234567890', 'send 10 to contact_name', 'contacts list');
        break;
      case CommandType.VOICE:
        suggestions.push('voice list', 'voice on', 'voice aurora');
        break;
      case CommandType.LINK:
        if (!isLinked) {
          suggestions.push('enter the 6-digit code', 'link (to resend code)');
        }
        break;
      case CommandType.UNKNOWN:
        suggestions.push('help', 'balance', 'send 10 to username');
        break;
      default:
        suggestions.push('help', 'balance', 'send payment');
    }

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Clear user activity (for privacy or after successful help)
   */
  async clearActivity(whatsappId: string): Promise<void> {
    const key = `${this.ACTIVITY_KEY_PREFIX}${whatsappId}`;
    await this.redisService.del(key);
  }
}