import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface PaymentTemplate {
  id: string;
  name: string;
  amount: number;
  recipient: string;
  memo?: string;
  createdAt: Date;
  lastUsed?: Date;
  useCount: number;
}

@Injectable()
export class PaymentTemplatesService {
  private readonly logger = new Logger(PaymentTemplatesService.name);
  private readonly TEMPLATES_KEY_PREFIX = 'payment_templates:';
  private readonly MAX_TEMPLATES = 10;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Create a new payment template
   */
  async createTemplate(
    whatsappId: string,
    name: string,
    amount: number,
    recipient: string,
    memo?: string,
  ): Promise<{ success: boolean; message: string; template?: PaymentTemplate }> {
    try {
      const templates = await this.getUserTemplates(whatsappId);

      // Check template limit
      if (templates.length >= this.MAX_TEMPLATES) {
        return {
          success: false,
          message: `You've reached the maximum of ${this.MAX_TEMPLATES} templates. Delete one to add more.`,
        };
      }

      // Check for duplicate names
      if (templates.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        return {
          success: false,
          message: `A template named "${name}" already exists.`,
        };
      }

      // Create new template
      const template: PaymentTemplate = {
        id: this.generateTemplateId(),
        name: name.toLowerCase(),
        amount,
        recipient,
        memo,
        createdAt: new Date(),
        useCount: 0,
      };

      templates.push(template);
      await this.saveUserTemplates(whatsappId, templates);

      return {
        success: true,
        message: `✅ Template "${name}" created!`,
        template,
      };
    } catch (error) {
      this.logger.error(`Error creating template: ${error.message}`);
      return {
        success: false,
        message: 'Failed to create template. Please try again.',
      };
    }
  }

  /**
   * Get all templates for a user
   */
  async getUserTemplates(whatsappId: string): Promise<PaymentTemplate[]> {
    const key = `${this.TEMPLATES_KEY_PREFIX}${whatsappId}`;
    const data = await this.redisService.get(key);

    if (!data) return [];

    const templates: PaymentTemplate[] = JSON.parse(data);
    return templates.map(t => ({
      ...t,
      createdAt: new Date(t.createdAt),
      lastUsed: t.lastUsed ? new Date(t.lastUsed) : undefined,
    }));
  }

  /**
   * Get a template by name
   */
  async getTemplateByName(whatsappId: string, name: string): Promise<PaymentTemplate | null> {
    const templates = await this.getUserTemplates(whatsappId);
    return templates.find(t => t.name.toLowerCase() === name.toLowerCase()) || null;
  }

  /**
   * Use a template (updates usage stats)
   */
  async useTemplate(whatsappId: string, templateId: string): Promise<void> {
    const templates = await this.getUserTemplates(whatsappId);
    const template = templates.find(t => t.id === templateId);

    if (template) {
      template.lastUsed = new Date();
      template.useCount++;
      await this.saveUserTemplates(whatsappId, templates);
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(
    whatsappId: string,
    name: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const templates = await this.getUserTemplates(whatsappId);
      const index = templates.findIndex(t => t.name.toLowerCase() === name.toLowerCase());

      if (index === -1) {
        return {
          success: false,
          message: `Template "${name}" not found.`,
        };
      }

      templates.splice(index, 1);
      await this.saveUserTemplates(whatsappId, templates);

      return {
        success: true,
        message: `✅ Template "${name}" deleted.`,
      };
    } catch (error) {
      this.logger.error(`Error deleting template: ${error.message}`);
      return {
        success: false,
        message: 'Failed to delete template. Please try again.',
      };
    }
  }

  /**
   * Format templates list for display
   */
  async formatTemplatesList(whatsappId: string): Promise<string> {
    const templates = await this.getUserTemplates(whatsappId);

    if (templates.length === 0) {
      return `📝 *Payment Templates*

No templates saved yet.

Create one:
\`template add coffee 5 to john "Morning coffee"\`

Use template:
\`pay coffee\``;
    }

    // Sort by use count and recency
    const sorted = templates.sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      const aTime = a.lastUsed?.getTime() || a.createdAt.getTime();
      const bTime = b.lastUsed?.getTime() || b.createdAt.getTime();
      return bTime - aTime;
    });

    let message = `📝 *Payment Templates*\n\n`;

    sorted.forEach((template, index) => {
      message += `${index + 1}. *${template.name}*\n`;
      message += `   💰 $${template.amount.toFixed(2)} to ${template.recipient}\n`;
      if (template.memo) {
        message += `   📝 "${template.memo}"\n`;
      }
      message += `   📊 Used ${template.useCount} times\n\n`;
    });

    message += `*Commands:*\n`;
    message += `• \`pay [template_name]\` - Use template\n`;
    message += `• \`template add [name] [amount] to [recipient]\` - Create\n`;
    message += `• \`template remove [name]\` - Delete\n`;

    return message;
  }

  /**
   * Get template suggestions based on usage patterns
   */
  async getTemplateSuggestions(whatsappId: string): Promise<string[]> {
    const templates = await this.getUserTemplates(whatsappId);
    
    // Sort by usage and recency
    const sorted = templates
      .filter(t => t.useCount > 0)
      .sort((a, b) => {
        const aScore = a.useCount + (a.lastUsed ? 1000 / (Date.now() - a.lastUsed.getTime()) : 0);
        const bScore = b.useCount + (b.lastUsed ? 1000 / (Date.now() - b.lastUsed.getTime()) : 0);
        return bScore - aScore;
      })
      .slice(0, 3);

    return sorted.map(t => `pay ${t.name}`);
  }

  /**
   * Save templates to Redis
   */
  private async saveUserTemplates(whatsappId: string, templates: PaymentTemplate[]): Promise<void> {
    const key = `${this.TEMPLATES_KEY_PREFIX}${whatsappId}`;
    await this.redisService.set(key, JSON.stringify(templates), 0); // Persistent
  }

  /**
   * Generate unique template ID
   */
  private generateTemplateId(): string {
    return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse template command
   */
  parseTemplateCommand(command: string): {
    action: 'add' | 'remove' | 'list' | 'use';
    name?: string;
    amount?: number;
    recipient?: string;
    memo?: string;
  } | null {
    const parts = command.trim().split(/\s+/);
    
    // Check for "pay [template_name]"
    if (parts[0].toLowerCase() === 'pay' && parts.length === 2) {
      return { action: 'use', name: parts[1] };
    }

    // Check for template commands
    if (parts[0].toLowerCase() !== 'template') return null;

    const action = parts[1]?.toLowerCase();

    if (action === 'list' || !action) {
      return { action: 'list' };
    }

    if (action === 'add' && parts.length >= 6) {
      // template add [name] [amount] to [recipient] "[memo]"
      const name = parts[2];
      const amount = parseFloat(parts[3]);
      const toIndex = parts.findIndex(p => p.toLowerCase() === 'to');
      
      if (toIndex > 3) {
        const recipient = parts[toIndex + 1];
        
        // Extract memo if present (in quotes)
        const memoMatch = command.match(/"([^"]+)"/);
        const memo = memoMatch ? memoMatch[1] : undefined;

        return { action: 'add', name, amount, recipient, memo };
      }
    }

    if (action === 'remove' && parts.length >= 3) {
      return { action: 'remove', name: parts[2] };
    }

    return null;
  }
}