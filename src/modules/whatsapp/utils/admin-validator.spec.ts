import { AdminValidator } from './admin-validator';

describe('AdminValidator', () => {
  describe('validateAdminStatus', () => {
    const validGroupId = '1234567890-1234567890@g.us';
    const adminIds = [
      '1234567890@c.us',
      '0987654321@s.whatsapp.net',
      '5555555555@lid',
      '11234567890@c.us', // US number with country code
    ];

    it('should validate admin with exact match', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '1234567890@c.us',
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(result.normalizedUserId).toBe('1234567890');
    });

    it('should validate admin with different suffix', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '0987654321@c.us', // Different suffix than in adminIds
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(result.normalizedUserId).toBe('0987654321');
    });

    it('should validate admin without suffix', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '5555555555',
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(result.normalizedUserId).toBe('5555555555');
    });

    it('should handle US numbers with country code', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '11234567890@c.us',
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(true);
      expect(result.normalizedUserId).toBe('1234567890');
    });

    it('should reject non-admin users', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '9999999999@c.us',
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(false);
    });

    it('should reject partial matches', () => {
      // This should NOT match '1234567890@c.us'
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '234567890@c.us',
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(false);
    });

    it('should reject substring matches', () => {
      // This should NOT match any admin
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '123@c.us',
        adminIds
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(false);
    });

    it('should handle invalid group ID', () => {
      const result = AdminValidator.validateAdminStatus(
        'invalid-group-id',
        '1234567890@c.us',
        adminIds
      );

      expect(result.isValid).toBe(false);
      expect(result.isAdmin).toBe(false);
      expect(result.reason).toBe('Invalid group ID format');
    });

    it('should handle invalid user ID', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        'not-a-phone-number',
        adminIds
      );

      expect(result.isValid).toBe(false);
      expect(result.isAdmin).toBe(false);
      expect(result.reason).toBe('Invalid user ID format');
    });

    it('should handle empty admin list', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '1234567890@c.us',
        []
      );

      expect(result.isValid).toBe(true);
      expect(result.isAdmin).toBe(false);
    });

    it('should handle null/undefined inputs safely', () => {
      const result = AdminValidator.validateAdminStatus(
        validGroupId,
        '',
        adminIds
      );

      expect(result.isValid).toBe(false);
      expect(result.isAdmin).toBe(false);
    });
  });

  describe('validateAdminAction', () => {
    const validGroupId = '1234567890-1234567890@g.us';
    const adminIds = ['1234567890@c.us'];

    it('should log admin actions', () => {
      const logSpy = jest.spyOn(AdminValidator['logger'], 'log').mockImplementation();
      
      const result = AdminValidator.validateAdminAction(
        validGroupId,
        '1234567890@c.us',
        'updateSettings',
        adminIds
      );

      expect(result.isAdmin).toBe(true);
      expect(result.shouldLog).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Admin action 'updateSettings' performed")
      );

      logSpy.mockRestore();
    });

    it('should log unauthorized attempts', () => {
      const warnSpy = jest.spyOn(AdminValidator['logger'], 'warn').mockImplementation();
      
      const result = AdminValidator.validateAdminAction(
        validGroupId,
        '9999999999@c.us',
        'updateSettings',
        adminIds
      );

      expect(result.isAdmin).toBe(false);
      expect(result.shouldLog).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unauthorized admin action 'updateSettings' attempted")
      );

      warnSpy.mockRestore();
    });
  });
});