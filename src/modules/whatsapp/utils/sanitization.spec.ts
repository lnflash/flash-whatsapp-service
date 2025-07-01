import {
  sanitizeGroupName,
  sanitizeSenderName,
  sanitizeMessageContent,
  sanitizeGroupId,
  sanitizeUserId,
} from './sanitization';

describe('Sanitization Utilities', () => {
  describe('sanitizeGroupName', () => {
    it('should handle normal group names', () => {
      expect(sanitizeGroupName('Family Chat')).toBe('Family Chat');
      expect(sanitizeGroupName('Work Team 2024')).toBe('Work Team 2024');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeGroupName('<script>alert("xss")</script>Group')).toBe('Group');
      expect(sanitizeGroupName('Group<b>Name</b>')).toBe('GroupName');
      expect(sanitizeGroupName('<img src=x onerror=alert(1)>')).toBe('Unknown Group');
    });

    it('should remove dangerous characters', () => {
      expect(sanitizeGroupName("Group'; DROP TABLE users;--")).toBe('Group DROP TABLE users--');
      expect(sanitizeGroupName('Group`rm -rf /`')).toBe('Grouprm -rf /');
      expect(sanitizeGroupName('${process.env.SECRET}')).toBe('process.env.SECRET');
    });

    it('should handle null bytes and control characters', () => {
      expect(sanitizeGroupName('Group\x00Name')).toBe('GroupName');
      expect(sanitizeGroupName('Group\x1bName')).toBe('GroupName');
      expect(sanitizeGroupName('Group\u200bName')).toBe('GroupName'); // Zero-width space
    });

    it('should normalize whitespace', () => {
      expect(sanitizeGroupName('  Group   Name  ')).toBe('Group Name');
      expect(sanitizeGroupName('Group\n\nName')).toBe('Group Name');
      expect(sanitizeGroupName('Group\tName')).toBe('Group Name');
    });

    it('should enforce max length', () => {
      const longName = 'A'.repeat(150);
      const result = sanitizeGroupName(longName);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toMatch(/\.\.\.$/);
    });

    it('should allow emoji by default', () => {
      // Note: Zero-width joiners are removed for security, so compound emojis become separate
      expect(sanitizeGroupName('Family 👨‍👩‍👧‍👦')).toBe('Family 👨👩👧👦');
      expect(sanitizeGroupName('Work 💼')).toBe('Work 💼');
    });

    it('should remove emoji when disabled', () => {
      expect(sanitizeGroupName('Family 👨‍👩‍👧‍👦', { allowEmoji: false })).toBe('Family');
      expect(sanitizeGroupName('Work 💼', { allowEmoji: false })).toBe('Work');
    });

    it('should return default for empty or invalid input', () => {
      expect(sanitizeGroupName(null)).toBe('Unknown Group');
      expect(sanitizeGroupName(undefined)).toBe('Unknown Group');
      expect(sanitizeGroupName('')).toBe('Unknown Group');
      expect(sanitizeGroupName('   ')).toBe('Unknown Group');
      expect(sanitizeGroupName('<script></script>')).toBe('Unknown Group');
    });

    it('should remove URL protocols', () => {
      expect(sanitizeGroupName('javascript:alert(1)')).toBe('alert(1)');
      expect(sanitizeGroupName('data:text/html,<script>alert(1)</script>')).toBe('text/html,');
    });

    it('should handle path traversal attempts', () => {
      expect(sanitizeGroupName('../../etc/passwd')).toBe('//etc/passwd');
      expect(sanitizeGroupName('Group/../Name')).toBe('Group//Name');
    });
  });

  describe('sanitizeSenderName', () => {
    it('should sanitize sender names with shorter max length', () => {
      const longName = 'A'.repeat(60);
      const result = sanitizeSenderName(longName);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should return default for invalid sender names', () => {
      expect(sanitizeSenderName(null)).toBe('Unknown User');
      expect(sanitizeSenderName('')).toBe('Unknown User');
    });
  });

  describe('sanitizeMessageContent', () => {
    it('should allow longer content', () => {
      const longMessage = 'Hello '.repeat(200);
      const result = sanitizeMessageContent(longMessage);
      expect(result.length).toBeLessThanOrEqual(1000);
    });

    it('should return empty string for null content', () => {
      expect(sanitizeMessageContent(null)).toBe('');
      expect(sanitizeMessageContent(undefined)).toBe('');
    });
  });

  describe('sanitizeGroupId', () => {
    it('should validate correct group IDs', () => {
      expect(sanitizeGroupId('123456789@g.us')).toBe('123456789@g.us');
      expect(sanitizeGroupId('987654321-1234567890@g.us')).toBe('987654321-1234567890@g.us');
    });

    it('should reject invalid group IDs', () => {
      expect(sanitizeGroupId('123456789@c.us')).toBeNull(); // User ID, not group
      expect(sanitizeGroupId('invalid@g.us')).toBeNull(); // Contains non-numeric
      expect(sanitizeGroupId('123456789')).toBeNull(); // Missing @g.us
      expect(sanitizeGroupId('123456789@g.us.evil.com')).toBeNull(); // Extra domain
      expect(sanitizeGroupId(null)).toBeNull();
      expect(sanitizeGroupId('')).toBeNull();
    });
  });

  describe('sanitizeUserId', () => {
    it('should validate correct user IDs', () => {
      expect(sanitizeUserId('1234567890@c.us')).toBe('1234567890@c.us');
      expect(sanitizeUserId('1234567890@lid')).toBe('1234567890@lid');
      expect(sanitizeUserId('1234567890@s.whatsapp.net')).toBe('1234567890@s.whatsapp.net');
      expect(sanitizeUserId('+1234567890@c.us')).toBe('+1234567890@c.us');
    });

    it('should reject invalid user IDs', () => {
      expect(sanitizeUserId('123456789@g.us')).toBeNull(); // Group ID, not user
      expect(sanitizeUserId('invalid@c.us')).toBeNull(); // Contains non-numeric
      expect(sanitizeUserId('1234567890')).toBeNull(); // Missing suffix
      expect(sanitizeUserId('1234567890@evil.com')).toBeNull(); // Wrong domain
      expect(sanitizeUserId(null)).toBeNull();
      expect(sanitizeUserId('')).toBeNull();
    });
  });
});
