import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface UserKnowledge {
  question: string;
  answer: string;
  category: string;
  timestamp: Date;
  id: string;
}

@Injectable()
export class UserKnowledgeBaseService {
  private readonly logger = new Logger(UserKnowledgeBaseService.name);
  private readonly KNOWLEDGE_PREFIX = 'user:knowledge';
  private readonly KNOWLEDGE_TTL = 30 * 24 * 60 * 60; // 30 days

  constructor(private readonly redisService: RedisService) {}

  /**
   * Store a user's answer to a question
   */
  async storeUserKnowledge(
    whatsappId: string,
    question: string,
    answer: string,
    category: string,
  ): Promise<string> {
    try {
      const knowledgeId = this.generateKnowledgeId();
      const knowledge: UserKnowledge = {
        id: knowledgeId,
        question,
        answer,
        category,
        timestamp: new Date(),
      };

      // Store individual knowledge entry
      const knowledgeKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:${knowledgeId}`;
      await this.redisService.setEncrypted(knowledgeKey, knowledge, this.KNOWLEDGE_TTL);

      // Add to user's knowledge index
      const indexKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:index`;
      await this.redisService.addToSet(indexKey, knowledgeId);
      await this.redisService.expire(indexKey, this.KNOWLEDGE_TTL);

      // Store by category for easier retrieval
      const categoryKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:category:${category}`;
      await this.redisService.addToSet(categoryKey, knowledgeId);
      await this.redisService.expire(categoryKey, this.KNOWLEDGE_TTL);

      this.logger.log(`Stored user knowledge for ${whatsappId}: ${knowledgeId}`);
      return knowledgeId;
    } catch (error) {
      this.logger.error('Error storing user knowledge:', error);
      throw error;
    }
  }

  /**
   * Retrieve all knowledge entries for a user
   */
  async getUserKnowledge(whatsappId: string): Promise<UserKnowledge[]> {
    try {
      const indexKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:index`;
      const knowledgeIds = await this.redisService.getSetMembers(indexKey);

      const knowledgeEntries: UserKnowledge[] = [];
      for (const knowledgeId of knowledgeIds) {
        const knowledgeKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:${knowledgeId}`;
        const knowledge = await this.redisService.getEncrypted(knowledgeKey);
        if (knowledge) {
          knowledgeEntries.push(knowledge);
        }
      }

      // Sort by timestamp, most recent first
      return knowledgeEntries.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } catch (error) {
      this.logger.error('Error retrieving user knowledge:', error);
      return [];
    }
  }

  /**
   * Get knowledge entries by category
   */
  async getUserKnowledgeByCategory(
    whatsappId: string,
    category: string,
  ): Promise<UserKnowledge[]> {
    try {
      const categoryKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:category:${category}`;
      const knowledgeIds = await this.redisService.getSetMembers(categoryKey);

      const knowledgeEntries: UserKnowledge[] = [];
      for (const knowledgeId of knowledgeIds) {
        const knowledgeKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:${knowledgeId}`;
        const knowledge = await this.redisService.getEncrypted(knowledgeKey);
        if (knowledge) {
          knowledgeEntries.push(knowledge);
        }
      }

      return knowledgeEntries.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } catch (error) {
      this.logger.error('Error retrieving knowledge by category:', error);
      return [];
    }
  }

  /**
   * Search user's knowledge base for relevant answers
   */
  async searchUserKnowledge(whatsappId: string, query: string): Promise<UserKnowledge[]> {
    try {
      const allKnowledge = await this.getUserKnowledge(whatsappId);
      const queryLower = query.toLowerCase();

      // Simple keyword matching - can be enhanced with better search algorithms
      const relevantKnowledge = allKnowledge.filter(
        (k) =>
          k.question.toLowerCase().includes(queryLower) ||
          k.answer.toLowerCase().includes(queryLower) ||
          k.category.toLowerCase().includes(queryLower),
      );

      return relevantKnowledge;
    } catch (error) {
      this.logger.error('Error searching user knowledge:', error);
      return [];
    }
  }

  /**
   * Delete a specific knowledge entry
   */
  async deleteUserKnowledge(whatsappId: string, knowledgeId: string): Promise<boolean> {
    try {
      // Get the knowledge to find its category
      const knowledgeKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:${knowledgeId}`;
      const knowledge = await this.redisService.getEncrypted(knowledgeKey);

      if (!knowledge) {
        return false;
      }

      // Remove from index
      const indexKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:index`;
      await this.redisService.getClient().srem(indexKey, knowledgeId);

      // Remove from category index
      const categoryKey = `${this.KNOWLEDGE_PREFIX}:${whatsappId}:category:${knowledge.category}`;
      await this.redisService.getClient().srem(categoryKey, knowledgeId);

      // Delete the knowledge entry
      await this.redisService.del(knowledgeKey);

      this.logger.log(`Deleted user knowledge for ${whatsappId}: ${knowledgeId}`);
      return true;
    } catch (error) {
      this.logger.error('Error deleting user knowledge:', error);
      return false;
    }
  }

  /**
   * Get knowledge statistics for a user
   */
  async getUserKnowledgeStats(whatsappId: string): Promise<{
    totalEntries: number;
    categoryCounts: Record<string, number>;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    try {
      const allKnowledge = await this.getUserKnowledge(whatsappId);

      if (allKnowledge.length === 0) {
        return {
          totalEntries: 0,
          categoryCounts: {},
        };
      }

      // Count by category
      const categoryCounts: Record<string, number> = {};
      allKnowledge.forEach((k) => {
        categoryCounts[k.category] = (categoryCounts[k.category] || 0) + 1;
      });

      // Sort to find oldest and newest
      const sorted = allKnowledge.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      return {
        totalEntries: allKnowledge.length,
        categoryCounts,
        oldestEntry: new Date(sorted[0].timestamp),
        newestEntry: new Date(sorted[sorted.length - 1].timestamp),
      };
    } catch (error) {
      this.logger.error('Error getting knowledge stats:', error);
      return {
        totalEntries: 0,
        categoryCounts: {},
      };
    }
  }

  /**
   * Format knowledge entries for display
   */
  formatKnowledgeList(knowledge: UserKnowledge[]): string {
    if (knowledge.length === 0) {
      return "📚 You haven't taught me anything yet! Use 'learn' to start.";
    }

    let message = '📚 *Your Personal Knowledge Base*\n\n';

    // Group by category
    const byCategory: Record<string, UserKnowledge[]> = {};
    knowledge.forEach((k) => {
      if (!byCategory[k.category]) {
        byCategory[k.category] = [];
      }
      byCategory[k.category].push(k);
    });

    // Format each category
    Object.entries(byCategory).forEach(([category, entries]) => {
      message += `*${this.capitalizeFirst(category)}*\n`;
      entries.slice(0, 3).forEach((entry) => {
        const date = new Date(entry.timestamp).toLocaleDateString();
        message += `❓ ${entry.question}\n`;
        message += `💡 ${this.truncateText(entry.answer, 50)}\n`;
        message += `🗓️ ${date} • ID: ${entry.id.slice(0, 6)}\n\n`;
      });

      if (entries.length > 3) {
        message += `_...and ${entries.length - 3} more in ${category}_\n\n`;
      }
    });

    message += `\n💡 *Tips:*\n`;
    message += `• Type "learn category [name]" to see entries by category\n`;
    message += `• Type "learn delete [ID]" to remove an entry\n`;
    message += `• Type "learn stats" to see your statistics`;

    return message;
  }

  /**
   * Generate a unique knowledge ID
   */
  private generateKnowledgeId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}