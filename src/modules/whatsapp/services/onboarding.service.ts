import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../../auth/services/session.service';
import { UserSession } from '../../auth/interfaces/user-session.interface';

export interface OnboardingStep {
  step: number;
  total: number;
  title: string;
  description: string;
  action?: string;
  completed: boolean;
}

export interface OnboardingState {
  currentStep: number;
  completedSteps: string[];
  startTime: Date;
  lastActivity: Date;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly ONBOARDING_KEY_PREFIX = 'onboarding:';
  private readonly ONBOARDING_TTL = 86400 * 7; // 7 days

  constructor(
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
  ) {}

  private readonly onboardingSteps = [
    {
      id: 'welcome',
      title: 'Welcome to Pulse!',
      description: "I'm your personal payment assistant powered by Lightning Network",
      action: 'link',
      nextHint: 'Type `link` to connect your Flash account',
    },
    {
      id: 'link_account',
      title: 'Connect Your Account',
      description: 'Linking your Flash wallet for secure payments',
      action: 'verify',
      nextHint: 'Enter the 6-digit code sent to your phone',
    },
    {
      id: 'verify_account',
      title: 'Verify Your Identity',
      description: 'Confirming your phone number for security',
      action: 'balance',
      nextHint: 'Type `balance` to see your wallet',
    },
    {
      id: 'check_balance',
      title: 'Check Your Balance',
      description: 'View your available funds',
      action: 'send',
      nextHint: 'Try sending money: `send 5 to demo`',
    },
    {
      id: 'first_send',
      title: 'Send Your First Payment',
      description: 'Experience instant Lightning payments',
      action: 'help',
      nextHint: 'Type `help` to see all commands',
    },
  ];

  /**
   * Get or create onboarding state for a user
   */
  async getOnboardingState(whatsappId: string): Promise<OnboardingState> {
    const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
    const data = await this.redisService.get(key);

    if (data) {
      const state = JSON.parse(data);
      return {
        ...state,
        startTime: new Date(state.startTime),
        lastActivity: new Date(state.lastActivity),
      };
    }

    // Create new onboarding state
    const newState: OnboardingState = {
      currentStep: 0,
      completedSteps: [],
      startTime: new Date(),
      lastActivity: new Date(),
    };

    await this.redisService.set(key, JSON.stringify(newState), this.ONBOARDING_TTL);
    return newState;
  }

  /**
   * Update onboarding progress
   */
  async updateProgress(whatsappId: string, completedStepId: string): Promise<void> {
    const state = await this.getOnboardingState(whatsappId);
    
    if (!state.completedSteps.includes(completedStepId)) {
      state.completedSteps.push(completedStepId);
      state.currentStep = Math.min(state.currentStep + 1, this.onboardingSteps.length - 1);
    }
    
    state.lastActivity = new Date();

    const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
    await this.redisService.set(key, JSON.stringify(state), this.ONBOARDING_TTL);
  }

  /**
   * Get current onboarding message with progress
   */
  async getOnboardingMessage(whatsappId: string, session: UserSession | null): Promise<string> {
    const state = await this.getOnboardingState(whatsappId);
    const currentStep = this.onboardingSteps[state.currentStep];
    const progress = this.getProgressBar(state.currentStep, this.onboardingSteps.length);

    // Check if user has completed onboarding
    if (state.completedSteps.length >= this.onboardingSteps.length) {
      return this.getCompletionMessage(session);
    }

    let message = `${progress}\n\n`;
    message += `*${currentStep.title}* 🎯\n`;
    message += `${currentStep.description}\n\n`;

    // Add contextual help based on current step
    if (currentStep.id === 'welcome' && !session) {
      message += `👋 Ready to get started?\n\n`;
      message += `${currentStep.nextHint}`;
    } else if (currentStep.id === 'link_account' && session && !session.isVerified) {
      message += `📱 Check your phone for the code\n\n`;
      message += `${currentStep.nextHint}`;
    } else if (currentStep.id === 'verify_account' && session?.isVerified) {
      message += `✅ Great! You're verified!\n\n`;
      message += `${currentStep.nextHint}`;
    } else if (currentStep.id === 'check_balance') {
      message += `💰 Your wallet is ready!\n\n`;
      message += `${currentStep.nextHint}`;
    } else if (currentStep.id === 'first_send') {
      message += `⚡ Send instant payments!\n\n`;
      message += `${currentStep.nextHint}`;
    }

    // Add skip option for experienced users
    if (state.currentStep > 0) {
      message += `\n\n_Already know Pulse? Type \`skip onboarding\`_`;
    }

    return message;
  }

  /**
   * Generate progress bar
   */
  private getProgressBar(current: number, total: number): string {
    const filled = '●';
    const empty = '○';
    const progress = Array(total)
      .fill(empty)
      .map((_, i) => (i <= current ? filled : empty))
      .join(' ');
    
    return `Progress: ${progress} (${current + 1}/${total})`;
  }

  /**
   * Get completion message
   */
  private getCompletionMessage(session: UserSession | null): string {
    if (!session?.isVerified) {
      return `🎉 *Welcome to Pulse!*\n\nType \`link\` to connect your Flash account and start using all features.`;
    }

    return `🎉 *Onboarding Complete!*

You're all set! Here are some things to try:

• \`voice on\` - Enable voice responses
• \`contacts add\` - Save frequent recipients
• \`help\` - See all available commands

Need assistance? I'm here to help! 💪`;
  }

  /**
   * Check if user is in onboarding
   */
  async isUserOnboarding(whatsappId: string): Promise<boolean> {
    const state = await this.getOnboardingState(whatsappId);
    return state.completedSteps.length < this.onboardingSteps.length;
  }

  /**
   * Skip onboarding for experienced users
   */
  async skipOnboarding(whatsappId: string): Promise<void> {
    const state = await this.getOnboardingState(whatsappId);
    state.completedSteps = this.onboardingSteps.map(s => s.id);
    state.currentStep = this.onboardingSteps.length - 1;
    state.lastActivity = new Date();

    const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
    await this.redisService.set(key, JSON.stringify(state), this.ONBOARDING_TTL);
  }

  /**
   * Detect user action and update progress accordingly
   */
  async detectAndUpdateProgress(whatsappId: string, command: string): Promise<boolean> {
    const state = await this.getOnboardingState(whatsappId);
    const currentStep = this.onboardingSteps[state.currentStep];

    // Check if the command matches the expected action
    if (currentStep.action && command.toLowerCase().includes(currentStep.action)) {
      await this.updateProgress(whatsappId, currentStep.id);
      return true;
    }

    return false;
  }
}