import { Logger } from '@nestjs/common';
import { sanitizeUserId, sanitizeGroupId } from './sanitization';

export interface AdminValidationResult {
  isValid: boolean;
  isAdmin: boolean;
  reason?: string;
  normalizedUserId?: string;
  normalizedAdminIds?: string[];
}

export class AdminValidator {
  private static readonly logger = new Logger('AdminValidator');

  /**
   * Normalize a WhatsApp ID to a consistent format for comparison
   * Removes country codes and suffixes to get the base phone number
   */
  private static normalizePhoneNumber(id: string): string {
    if (!id) return '';

    // Remove WhatsApp suffixes
    let normalized = id
      .replace(/@c\.us$/, '')
      .replace(/@lid$/, '')
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/@g\.us$/, '');

    // Remove common country code prefixes
    normalized = normalized.replace(/^\+/, '');

    // Handle US numbers (remove leading 1)
    if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = normalized.substring(1);
    }

    return normalized;
  }

  /**
   * Validate and check if a user is an admin of a group
   * This method provides secure validation with audit logging
   */
  static validateAdminStatus(
    groupId: string,
    userId: string,
    adminIds: string[],
  ): AdminValidationResult {
    // Validate inputs
    const sanitizedGroupId = sanitizeGroupId(groupId);
    if (!sanitizedGroupId) {
      this.logger.warn(`Invalid group ID format: ${groupId}`);
      return {
        isValid: false,
        isAdmin: false,
        reason: 'Invalid group ID format',
      };
    }

    // Check for empty userId first
    if (!userId || userId.trim() === '') {
      this.logger.warn('Empty user ID provided');
      return {
        isValid: false,
        isAdmin: false,
        reason: 'Empty user ID',
      };
    }

    const sanitizedUserId = sanitizeUserId(userId);
    if (!sanitizedUserId) {
      // Try adding @c.us suffix if missing
      const userIdWithSuffix = userId.includes('@') ? userId : `${userId}@c.us`;
      const reSanitized = sanitizeUserId(userIdWithSuffix);
      if (!reSanitized) {
        this.logger.warn(`Invalid user ID format: ${userId}`);
        return {
          isValid: false,
          isAdmin: false,
          reason: 'Invalid user ID format',
        };
      }
    }

    // Normalize all IDs for comparison
    const normalizedUserId = this.normalizePhoneNumber(sanitizedUserId || userId);
    const normalizedAdminIds = adminIds.map((id) => this.normalizePhoneNumber(id));

    // Check if user is admin using exact matching on normalized IDs
    const isAdmin = normalizedAdminIds.some((adminId) => {
      // Exact match on normalized phone numbers
      return adminId === normalizedUserId;
    });

    // Log admin check for audit purposes
    this.logger.debug(
      `Admin check for user ${normalizedUserId} in group ${sanitizedGroupId}: ${isAdmin ? 'GRANTED' : 'DENIED'}`,
    );

    return {
      isValid: true,
      isAdmin,
      normalizedUserId,
      normalizedAdminIds,
    };
  }

  /**
   * Validate admin action with rate limiting info
   */
  static validateAdminAction(
    groupId: string,
    userId: string,
    action: string,
    adminIds: string[],
  ): AdminValidationResult & { shouldLog: boolean } {
    const result = this.validateAdminStatus(groupId, userId, adminIds);

    if (result.isAdmin) {
      // Log important admin actions
      this.logger.log(
        `Admin action '${action}' performed by ${result.normalizedUserId} in group ${groupId}`,
      );
    } else if (result.isValid) {
      // Log failed admin attempts for security monitoring
      this.logger.warn(
        `Unauthorized admin action '${action}' attempted by ${result.normalizedUserId} in group ${groupId}`,
      );
    }

    return {
      ...result,
      shouldLog: true,
    };
  }
}
