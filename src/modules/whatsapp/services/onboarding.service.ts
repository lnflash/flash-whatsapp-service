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
  hasSeenWelcome: boolean;
  dismissed: boolean;
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
      description: "I'm your Bitcoin wallet assistant",
      action: 'link',
      emoji: '👋',
    },
    {
      id: 'link_account',
      title: 'Connect Flash Account',
      description: 'Link your wallet to send & receive money',
      action: 'verify',
      emoji: '🔗',
    },
    {
      id: 'verify_account',
      title: 'Verify Phone',
      description: 'Secure your account with phone verification',
      action: 'balance',
      emoji: '✅',
    },
    {
      id: 'check_balance',
      title: 'Check Balance',
      description: 'View your available funds',
      action: 'send',
      emoji: '💰',
    },
    {
      id: 'first_send',
      title: 'Send Payment',
      description: 'Try sending your first Lightning payment',
      action: 'complete',
      emoji: '⚡',
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
      hasSeenWelcome: false,
      dismissed: false,
    };

    await this.redisService.set(key, JSON.stringify(newState), this.ONBOARDING_TTL);
    return newState;
  }

  /**
   * Get welcome message for new users
   */
  async getWelcomeMessage(whatsappId: string): Promise<string> {
    const state = await this.getOnboardingState(whatsappId);
    
    if (!state.hasSeenWelcome) {
      state.hasSeenWelcome = true;
      const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
      await this.redisService.set(key, JSON.stringify(state), this.ONBOARDING_TTL);
      
      return `👋 *Welcome to Pulse!*

I'm your personal Bitcoin wallet assistant. I can help you:

💸 Send & receive money instantly
💰 Check your balance
📱 Manage contacts
🎤 Use voice commands

*Ready to start?*
Type \`link\` to connect your Flash account
Type \`help\` to see all commands

_Already a pro? Just start using any command!_`;
    }

    // Return simple help for returning users
    return this.getSimpleHelp();
  }

  /**
   * Get simple help message (not onboarding)
   */
  private getSimpleHelp(): string {
    return `⚡ *Quick Commands*

• \`link\` - Connect Flash account
• \`balance\` - Check your money
• \`send 10 to @john\` - Send payment
• \`receive 20\` - Request money
• \`help more\` - See all commands

What would you like to do?`;
  }

  /**
   * Update onboarding progress
   */
  async updateProgress(whatsappId: string, completedStepId: string): Promise<void> {
    const state = await this.getOnboardingState(whatsappId);
    
    if (!state.completedSteps.includes(completedStepId)) {
      state.completedSteps.push(completedStepId);
      const stepIndex = this.onboardingSteps.findIndex(s => s.id === completedStepId);
      if (stepIndex >= 0 && stepIndex >= state.currentStep) {
        state.currentStep = Math.min(stepIndex + 1, this.onboardingSteps.length - 1);
      }
    }
    
    state.lastActivity = new Date();

    const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
    await this.redisService.set(key, JSON.stringify(state), this.ONBOARDING_TTL);
  }

  /**
   * Get contextual onboarding hint (subtle, non-intrusive)
   */
  async getContextualHint(whatsappId: string, session: UserSession | null): Promise<string | null> {
    const state = await this.getOnboardingState(whatsappId);
    
    // Don't show hints if user dismissed onboarding or completed it
    if (state.dismissed || state.completedSteps.length >= this.onboardingSteps.length) {
      return null;
    }

    // Only show hints occasionally, not on every message
    const timeSinceLastActivity = Date.now() - new Date(state.lastActivity).getTime();
    const shouldShowHint = timeSinceLastActivity > 60000; // 1 minute

    if (!shouldShowHint) {
      return null;
    }

    const currentStep = this.onboardingSteps[state.currentStep];

    // Contextual hints based on user state
    if (!session && currentStep.id === 'welcome') {
      return `\n\n💡 _New here? Type \`link\` to connect your Flash account_`;
    }

    if (session && !session.isVerified && currentStep.id === 'link_account') {
      return `\n\n💡 _Enter the 6-digit code to complete verification_`;
    }

    if (session?.isVerified && state.completedSteps.length < 3) {
      return `\n\n💡 _Try \`balance\` to see your funds_`;
    }

    return null;
  }

  /**
   * Get progress indicator (simplified and clear)
   */
  async getProgressIndicator(whatsappId: string): Promise<string> {
    const state = await this.getOnboardingState(whatsappId);
    const completed = state.completedSteps.length;
    const total = this.onboardingSteps.length;
    
    if (completed >= total) {
      return '✅ Setup Complete!';
    }

    // Show progress as fraction with current step
    const currentStep = this.onboardingSteps[state.currentStep];
    return `${currentStep.emoji} Step ${completed + 1}/${total}: ${currentStep.title}`;
  }

  /**
   * Check if user should see onboarding content
   */
  async shouldShowOnboarding(whatsappId: string): Promise<boolean> {
    const state = await this.getOnboardingState(whatsappId);
    return !state.dismissed && state.completedSteps.length < this.onboardingSteps.length;
  }

  /**
   * Skip/dismiss onboarding
   */
  async dismissOnboarding(whatsappId: string): Promise<void> {
    const state = await this.getOnboardingState(whatsappId);
    state.dismissed = true;
    state.lastActivity = new Date();

    const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
    await this.redisService.set(key, JSON.stringify(state), this.ONBOARDING_TTL);
  }

  /**
   * Check if user is new (first interaction)
   */
  async isNewUser(whatsappId: string): Promise<boolean> {
    const state = await this.getOnboardingState(whatsappId);
    return !state.hasSeenWelcome;
  }

  /**
   * Detect user action and silently update progress
   */
  async detectAndUpdateProgress(whatsappId: string, command: string): Promise<boolean> {
    const state = await this.getOnboardingState(whatsappId);
    
    // Don't track if dismissed
    if (state.dismissed) {
      return false;
    }

    // Check each incomplete step to see if user completed it
    for (const step of this.onboardingSteps) {
      if (!state.completedSteps.includes(step.id) && 
          step.action && 
          command.toLowerCase().includes(step.action)) {
        await this.updateProgress(whatsappId, step.id);
        return true;
      }
    }

    return false;
  }

  /**
   * Get completion celebration (only shown once)
   */
  async getCompletionMessage(whatsappId: string): Promise<string | null> {
    const state = await this.getOnboardingState(whatsappId);
    
    // Check if just completed
    if (state.completedSteps.length === this.onboardingSteps.length && 
        !state.completedSteps.includes('celebrated')) {
      
      // Mark as celebrated
      state.completedSteps.push('celebrated');
      const key = `${this.ONBOARDING_KEY_PREFIX}${whatsappId}`;
      await this.redisService.set(key, JSON.stringify(state), this.ONBOARDING_TTL);
      
      return `\n\n🎉 *Awesome! You've mastered the basics!*\n\nExplore more features:\n• \`voice on\` - Enable voice mode\n• \`learn\` - Teach me about you\n• \`settings\` - Customize your experience`;
    }

    return null;
  }
}