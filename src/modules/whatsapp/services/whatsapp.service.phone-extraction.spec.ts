import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService - Phone Number Extraction', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            // Create a minimal instance with just the methods we need to test
            extractWhatsappId: WhatsappService.prototype['extractWhatsappId'],
            normalizePhoneNumber: WhatsappService.prototype['normalizePhoneNumber'],
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  describe('extractWhatsappId', () => {
    it('should extract ID from number@c.us format', () => {
      const result = service['extractWhatsappId']('18764250250@c.us');
      expect(result).toBe('18764250250');
    });

    it('should extract ID from number@s.whatsapp.net format', () => {
      const result = service['extractWhatsappId']('18764250250@s.whatsapp.net');
      expect(result).toBe('18764250250');
    });

    it('should extract ID from whatsapp:+number format', () => {
      const result = service['extractWhatsappId']('whatsapp:+18764250250');
      expect(result).toBe('18764250250');
    });

    it('should handle plain numbers', () => {
      const result = service['extractWhatsappId']('18764250250');
      expect(result).toBe('18764250250');
    });
  });

  describe('normalizePhoneNumber', () => {
    it('should normalize number@c.us to +number format', () => {
      const result = service['normalizePhoneNumber']('18764250250@c.us');
      expect(result).toBe('+18764250250');
    });

    it('should normalize number@s.whatsapp.net to +number format', () => {
      const result = service['normalizePhoneNumber']('18764250250@s.whatsapp.net');
      expect(result).toBe('+18764250250');
    });

    it('should handle whatsapp: prefix', () => {
      const result = service['normalizePhoneNumber']('whatsapp:18764250250');
      expect(result).toBe('+18764250250');
    });

    it('should not add + if already present', () => {
      const result = service['normalizePhoneNumber']('+18764250250');
      expect(result).toBe('+18764250250');
    });

    it('should handle group IDs by removing @g.us', () => {
      const result = service['normalizePhoneNumber']('123456789@g.us');
      expect(result).toBe('+123456789');
    });
  });
});