import { Test, TestingModule } from '@nestjs/testing';
import { VoiceResponseService } from './voice-response.service';
import { CommandType } from './command-parser.service';

describe('VoiceResponseService', () => {
  let service: VoiceResponseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VoiceResponseService],
    }).compile();

    service = module.get<VoiceResponseService>(VoiceResponseService);
  });

  describe('generateNaturalVoiceResponse', () => {
    it('should generate natural balance response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.BALANCE,
        '💰 *Your Flash Balance*\n\n$50.00 USD\n\n_Updated: Today at 2:30 PM EST_',
        {},
        { userName: 'John' },
      );

      expect(response).toContain('Hi John!');
      expect(response).toContain('Your Flash balance is 50.00 dollars');
      expect(response).not.toContain('*');
      expect(response).not.toContain('💰');
    });

    it('should generate natural send success response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.SEND,
        '✅ Success! Sent $10.00 to @alice',
        { amount: '10', username: 'alice' },
        {},
      );

      expect(response).toContain('successfully sent 10 dollars to alice');
      expect(response).toContain('instant');
      expect(response).not.toContain('✅');
    });

    it('should generate natural receive response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.RECEIVE,
        '✅ Invoice created successfully!\n\nlnbc100...',
        { amount: '20' },
        {},
      );

      expect(response).toContain('created a payment request for 20 dollars');
      expect(response).toContain('share');
      expect(response).not.toContain('lnbc');
    });

    it('should generate natural price response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.PRICE,
        '₿ *Bitcoin Price*\n\n$65,432.10 USD',
        {},
        {},
      );

      expect(response).toContain('current Bitcoin price is 65,432');
      expect(response).toContain('US dollars');
      expect(response).not.toContain('₿');
      expect(response).not.toContain('*');
    });

    it('should generate natural help response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.HELP,
        '⚡ *Welcome to Pulse!*\n\n📱 *Essential Commands:*\n1️⃣ Balance - Check your wallet',
        {},
        {},
      );

      expect(response).toContain('help you with many things');
      expect(response).toContain('balance');
      expect(response).toContain('send');
      expect(response).not.toContain('⚡');
      expect(response).not.toContain('1️⃣');
    });

    it('should handle empty balance response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.BALANCE,
        '💰 *Your Flash Balance*\n\n$0.00 USD',
        {},
        {},
      );

      expect(response).toContain('balance is currently empty');
      expect(response).toContain('add funds');
    });

    it('should handle low balance response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.BALANCE,
        '💰 *Your Flash Balance*\n\n$3.50 USD',
        {},
        {},
      );

      expect(response).toContain('3.50 dollars');
      expect(response).toContain('getting a bit low');
    });

    it('should handle high balance response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.BALANCE,
        '💰 *Your Flash Balance*\n\n$250.00 USD',
        {},
        {},
      );

      expect(response).toContain('250.00 dollars');
      expect(response).toContain('healthy balance');
    });

    it('should handle transaction history response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.HISTORY,
        '📊 *Recent Transactions*\n\n📤 Sent $10\n📥 Received $50',
        {},
        {},
      );

      expect(response).toMatch(/transaction|history|sent|received/i);
      expect(response).not.toContain('📤');
      expect(response).not.toContain('📥');
    });

    it('should handle error responses gracefully', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.SEND,
        '❌ Insufficient balance',
        {},
        {},
      );

      expect(response).toMatch(/not able|wasn't able|check|try again/i);
      expect(response).not.toContain('❌');
    });
  });
});
