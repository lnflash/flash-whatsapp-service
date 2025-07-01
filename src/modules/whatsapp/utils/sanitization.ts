/**
 * Sanitization utilities for group-related inputs
 */

export interface SanitizationOptions {
  maxLength?: number;
  allowEmoji?: boolean;
  stripHtml?: boolean;
  normalizeWhitespace?: boolean;
}

const DEFAULT_OPTIONS: SanitizationOptions = {
  maxLength: 100,
  allowEmoji: true,
  stripHtml: true,
  normalizeWhitespace: true,
};

/**
 * Sanitize group name to prevent XSS, injection attacks, and formatting issues
 */
export function sanitizeGroupName(
  input: string | undefined | null,
  options: SanitizationOptions = {},
): string {
  if (!input || typeof input !== 'string') {
    return 'Unknown Group';
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = input;

  // Remove any potential HTML/script tags
  if (opts.stripHtml) {
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ''); // Remove all HTML tags
  }

  // Remove dangerous characters and patterns
  sanitized = sanitized
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines and tabs
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Remove Unicode control characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Remove potential SQL injection characters
    .replace(/['";\\]/g, '')
    // Remove potential command injection characters
    .replace(/[`${}]/g, '')
    // Remove potential path traversal
    .replace(/\.\./g, '')
    // Remove potential URL protocols
    .replace(/^(?:javascript|data|vbscript|file|ftp|https?):/gi, '');

  // Normalize whitespace
  if (opts.normalizeWhitespace) {
    sanitized = sanitized
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing whitespace
  }

  // Handle emoji if not allowed
  if (!opts.allowEmoji) {
    // Remove emoji and other symbols
    sanitized = sanitized
      .replace(
        /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
        '',
      )
      .trim(); // Trim after removing emoji to clean up leftover spaces
  }

  // Enforce maximum length
  if (opts.maxLength && sanitized.length > opts.maxLength) {
    sanitized = sanitized.substring(0, opts.maxLength - 3) + '...';
  }

  // If we've removed everything, return a default
  if (!sanitized || sanitized.length === 0) {
    return 'Unknown Group';
  }

  return sanitized;
}

/**
 * Sanitize sender name to prevent display issues
 */
export function sanitizeSenderName(
  input: string | undefined | null,
  options: SanitizationOptions = {},
): string {
  if (!input || typeof input !== 'string') {
    return 'Unknown User';
  }

  const opts = { ...DEFAULT_OPTIONS, maxLength: 50, ...options };
  let sanitized = sanitizeGroupName(input, opts);

  // If we've removed everything, return a default
  if (!sanitized || sanitized.length === 0) {
    return 'Unknown User';
  }

  return sanitized;
}

/**
 * Sanitize message content for safe display
 */
export function sanitizeMessageContent(
  input: string | undefined | null,
  options: SanitizationOptions = {},
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const opts = { ...DEFAULT_OPTIONS, maxLength: 1000, ...options };
  return sanitizeGroupName(input, opts);
}

/**
 * Validate and sanitize WhatsApp group ID
 */
export function sanitizeGroupId(groupId: string | undefined | null): string | null {
  if (!groupId || typeof groupId !== 'string') {
    return null;
  }

  // WhatsApp group IDs should match pattern: number@g.us
  const groupIdPattern = /^[\d-]+@g\.us$/;

  if (!groupIdPattern.test(groupId)) {
    return null;
  }

  return groupId;
}

/**
 * Validate and sanitize WhatsApp user ID
 */
export function sanitizeUserId(userId: string | undefined | null): string | null {
  if (!userId || typeof userId !== 'string') {
    return null;
  }

  // WhatsApp user IDs should match patterns:
  // - number@c.us
  // - number@lid
  // - number@s.whatsapp.net
  const userIdPattern = /^[\d+]+@(c\.us|lid|s\.whatsapp\.net)$/;

  if (!userIdPattern.test(userId)) {
    return null;
  }

  return userId;
}
