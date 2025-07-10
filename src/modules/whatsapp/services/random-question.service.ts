import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface RandomQuestion {
  id: string;
  question: string;
  category: string;
  followUp?: string;
  examples?: string[];
}

@Injectable()
export class RandomQuestionService {
  private readonly logger = new Logger(RandomQuestionService.name);
  private readonly ASKED_QUESTIONS_PREFIX = 'user:asked_questions';
  private readonly PENDING_QUESTION_PREFIX = 'user:pending_question';
  private readonly QUESTION_TTL = 5 * 60; // 5 minutes for pending questions

  // Question bank organized by category
  private readonly questions: RandomQuestion[] = [
    // Personal preferences
    {
      id: 'pref_1',
      question: "What's your favorite way to spend money - experiences or things?",
      category: 'preferences',
      followUp: 'That helps me understand your spending style better!',
    },
    {
      id: 'pref_2',
      question: 'Do you prefer saving for big purchases or buying things as you go?',
      category: 'preferences',
      examples: ['I save for months', 'I buy when I need', 'Mix of both'],
    },
    {
      id: 'pref_3',
      question: "What's your favorite local business to support?",
      category: 'preferences',
      followUp: 'Supporting local businesses is great for the community!',
    },

    // Financial habits
    {
      id: 'fin_1',
      question: 'What financial goal are you working towards right now?',
      category: 'financial',
      examples: ['Saving for a car', 'Building emergency fund', 'Starting a business'],
    },
    {
      id: 'fin_2',
      question: 'How do you usually track your spending?',
      category: 'financial',
      examples: ['Mental notes', 'Spreadsheet', 'Banking app', "I don't track"],
    },
    {
      id: 'fin_3',
      question: "What's one financial tip you wish you knew earlier?",
      category: 'financial',
      followUp: "That's valuable wisdom to share!",
    },

    // Crypto & technology
    {
      id: 'tech_1',
      question: 'What got you interested in Bitcoin/cryptocurrency?',
      category: 'technology',
      followUp: "It's always interesting to hear people's crypto journey!",
    },
    {
      id: 'tech_2',
      question: "What's the most useful app on your phone besides Flash?",
      category: 'technology',
      followUp: 'Technology really changes how we manage daily life!',
    },
    {
      id: 'tech_3',
      question: 'How do you explain Bitcoin to friends who are new to it?',
      category: 'technology',
      examples: ['Digital gold', 'Internet money', 'Freedom currency'],
    },

    // Local culture & lifestyle
    {
      id: 'local_1',
      question: "What's your favorite local dish that visitors must try?",
      category: 'lifestyle',
      followUp: 'Local cuisine is the best way to experience culture!',
    },
    {
      id: 'local_2',
      question: 'Where do you recommend visitors go for the best local experience?',
      category: 'lifestyle',
      followUp: 'Local recommendations are always the best!',
    },
    {
      id: 'local_3',
      question: "What's one thing about your area that people often misunderstand?",
      category: 'lifestyle',
      followUp: "It's great to hear the local perspective!",
    },

    // Business & entrepreneurship
    {
      id: 'biz_1',
      question: 'If you could start any business tomorrow, what would it be?',
      category: 'business',
      followUp: 'Entrepreneurial dreams are worth pursuing!',
    },
    {
      id: 'biz_2',
      question: "What's the biggest challenge for small businesses in your area?",
      category: 'business',
      examples: ['Access to capital', 'Finding customers', 'Competition', 'Regulations'],
    },
    {
      id: 'biz_3',
      question: 'How do you think digital payments are changing local business?',
      category: 'business',
      followUp: 'Digital transformation is reshaping commerce everywhere!',
    },

    // Fun & casual
    {
      id: 'fun_1',
      question: "What's your go-to stress relief activity that doesn't cost money?",
      category: 'lifestyle',
      followUp: 'Free activities are often the most rewarding!',
    },
    {
      id: 'fun_2',
      question: 'If you won $1000 today, what would be your first purchase?',
      category: 'preferences',
      followUp: "It's fun to dream about windfalls!",
    },
    {
      id: 'fun_3',
      question: "What's the best financial advice you've ever received?",
      category: 'financial',
      followUp: 'Wisdom worth sharing is wisdom worth keeping!',
    },
  ];

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get a random question that hasn't been asked to this user recently
   */
  async getRandomQuestion(whatsappId: string): Promise<RandomQuestion | null> {
    try {
      // Get list of recently asked questions
      const askedKey = `${this.ASKED_QUESTIONS_PREFIX}:${whatsappId}`;
      const askedQuestions = await this.redisService.getSetMembers(askedKey);

      // Filter out already asked questions
      const availableQuestions = this.questions.filter((q) => !askedQuestions.includes(q.id));

      // If all questions have been asked, reset and start over
      if (availableQuestions.length === 0) {
        await this.redisService.del(askedKey);
        return this.questions[Math.floor(Math.random() * this.questions.length)];
      }

      // Select a random question from available ones
      const randomIndex = Math.floor(Math.random() * availableQuestions.length);
      const selectedQuestion = availableQuestions[randomIndex];

      // Mark this question as asked
      await this.redisService.addToSet(askedKey, selectedQuestion.id);
      await this.redisService.expire(askedKey, 7 * 24 * 60 * 60); // Remember for 7 days

      // Store as pending question for this user
      await this.storePendingQuestion(whatsappId, selectedQuestion);

      return selectedQuestion;
    } catch (error) {
      this.logger.error('Error getting random question:', error);
      return null;
    }
  }

  /**
   * Store a pending question waiting for answer
   */
  async storePendingQuestion(whatsappId: string, question: RandomQuestion): Promise<void> {
    const key = `${this.PENDING_QUESTION_PREFIX}:${whatsappId}`;
    await this.redisService.setEncrypted(key, question, this.QUESTION_TTL);
  }

  /**
   * Get pending question for a user
   */
  async getPendingQuestion(whatsappId: string): Promise<RandomQuestion | null> {
    try {
      const key = `${this.PENDING_QUESTION_PREFIX}:${whatsappId}`;
      const question = await this.redisService.getEncrypted(key);
      return question as RandomQuestion | null;
    } catch (error) {
      this.logger.error('Error getting pending question:', error);
      return null;
    }
  }

  /**
   * Clear pending question
   */
  async clearPendingQuestion(whatsappId: string): Promise<void> {
    const key = `${this.PENDING_QUESTION_PREFIX}:${whatsappId}`;
    await this.redisService.del(key);
  }

  /**
   * Check if user is currently in a learning session
   */
  async isInLearningSession(whatsappId: string): Promise<boolean> {
    const pendingQuestion = await this.getPendingQuestion(whatsappId);
    return pendingQuestion !== null;
  }

  /**
   * Format question for display
   */
  formatQuestion(question: RandomQuestion): string {
    let message = `🤔 *Random Question Time!*\n\n${question.question}`;

    if (question.examples && question.examples.length > 0) {
      message += '\n\n_Examples:_\n';
      question.examples.forEach((example) => {
        message += `• ${example}\n`;
      });
    }

    message += '\n\n💭 _Just type your answer, or type "skip" to pass on this question._';

    return message;
  }

  /**
   * Get a question by category
   */
  async getQuestionByCategory(
    whatsappId: string,
    category: string,
  ): Promise<RandomQuestion | null> {
    try {
      const askedKey = `${this.ASKED_QUESTIONS_PREFIX}:${whatsappId}`;
      const askedQuestions = await this.redisService.getSetMembers(askedKey);

      // Filter by category and not asked
      const categoryQuestions = this.questions.filter(
        (q) => q.category === category && !askedQuestions.includes(q.id),
      );

      if (categoryQuestions.length === 0) {
        // All questions in this category have been asked
        return null;
      }

      const randomIndex = Math.floor(Math.random() * categoryQuestions.length);
      const selectedQuestion = categoryQuestions[randomIndex];

      // Mark as asked and store as pending
      await this.redisService.addToSet(askedKey, selectedQuestion.id);
      await this.redisService.expire(askedKey, 7 * 24 * 60 * 60);
      await this.storePendingQuestion(whatsappId, selectedQuestion);

      return selectedQuestion;
    } catch (error) {
      this.logger.error('Error getting question by category:', error);
      return null;
    }
  }

  /**
   * Get available categories
   */
  getCategories(): string[] {
    const categories = new Set(this.questions.map((q) => q.category));
    return Array.from(categories);
  }

  /**
   * Reset asked questions for a user
   */
  async resetAskedQuestions(whatsappId: string): Promise<void> {
    const askedKey = `${this.ASKED_QUESTIONS_PREFIX}:${whatsappId}`;
    await this.redisService.del(askedKey);
  }
}