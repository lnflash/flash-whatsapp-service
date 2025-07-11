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

      expect(response).toContain('Your balance is fifty dollars');
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

      expect(response).toContain('Sent ten dollars to alice');
      expect(response).not.toContain('✅');
    });

    it('should generate natural receive response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.RECEIVE,
        '✅ Invoice created successfully!\n\nlnbc100...',
        { amount: '20' },
        {},
      );

      expect(response).toContain('Created payment request for twenty dollars');
      expect(response).not.toContain('lnbc');
    });

    it('should generate natural price response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.PRICE,
        '₿ *Bitcoin Price*\n\n$65,432.10 USD',
        {},
        {},
      );

      expect(response).toContain('current Bitcoin price is');
      expect(response).toContain('thousand');
      expect(response).toContain('dollars');
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

      expect(response).toContain('balance');
      expect(response).toContain('send');
      expect(response).toContain('receive');
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

      expect(response).toContain('balance is empty');
      expect(response).toContain('receive');
    });

    it('should handle low balance response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.BALANCE,
        '💰 *Your Flash Balance*\n\n$3.50 USD',
        {},
        {},
      );

      expect(response).toContain('three dollars and fifty cents');
      expect(response).toContain('Low balance');
    });

    it('should handle high balance response', async () => {
      const response = await service.generateNaturalVoiceResponse(
        CommandType.BALANCE,
        '💰 *Your Flash Balance*\n\n$250.00 USD',
        {},
        {},
      );

      expect(response).toContain('two hundred and fifty dollars');
      expect(response).not.toContain('healthy balance');
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
