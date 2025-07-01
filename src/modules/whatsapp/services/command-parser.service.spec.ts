import { Test, TestingModule } from '@nestjs/testing';
import { CommandParserService, CommandType } from './command-parser.service';

describe('CommandParserService - Natural Language', () => {
  let service: CommandParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommandParserService],
    }).compile();

    service = module.get<CommandParserService>(CommandParserService);
  });

  describe('Natural Language Balance Commands', () => {
    const balanceVariations = [
      'check my balance',
      'what is my balance',
      'show me my balance',
      'how much do i have',
      'how much money',
      'my wallet balance',
    ];

    balanceVariations.forEach((input) => {
      it(`should parse "${input}" as balance command`, () => {
        const result = service.parseCommand(input, true);
        expect(result.type).toBe(CommandType.BALANCE);
      });
    });
  });

  describe('Natural Language Price Commands', () => {
    const priceVariations = [
      'bitcoin price',
      'btc price',
      'price of bitcoin',
      'how much is bitcoin',
      'what is bitcoin worth',
      'current bitcoin price',
      'check the price',
    ];

    priceVariations.forEach((input) => {
      it(`should parse "${input}" as price command`, () => {
        const result = service.parseCommand(input, true);
        expect(result.type).toBe(CommandType.PRICE);
      });
    });
  });

  describe('Natural Language Help Commands', () => {
    const helpVariations = [
      'help please',
      'please help',
      'help me',
      'i need help',
      'can you help me',
      'what can you do',
      'show me what you can do',
    ];

    helpVariations.forEach((input) => {
      it(`should parse "${input}" as help command`, () => {
        const result = service.parseCommand(input, true);
        expect(result.type).toBe(CommandType.HELP);
      });
    });
  });

  describe('Natural Language Send Commands', () => {
    it('should parse "send 5 dollars to john" as send command', () => {
      const result = service.parseCommand('send 5 dollars to john', true);
      expect(result.type).toBe(CommandType.SEND);
      expect(result.args.amount).toBe('5');
      expect(result.args.recipient).toBe('john');
      expect(result.args.requiresConfirmation).toBe('true');
    });

    it('should parse "please send one dollar to alice" as send command', () => {
      const result = service.parseCommand('please send one dollar to alice', true);
      expect(result.type).toBe(CommandType.SEND);
      expect(result.args.amount).toBe('1');
      expect(result.args.recipient).toBe('alice');
      expect(result.args.requiresConfirmation).toBe('true');
    });

    it('should parse "pay 10 to bob" as send command', () => {
      const result = service.parseCommand('pay 10 to bob', true);
      expect(result.type).toBe(CommandType.SEND);
      expect(result.args.amount).toBe('10');
      expect(result.args.recipient).toBe('bob');
    });

    it('should parse "transfer 20 dollars to charlie" as send command', () => {
      const result = service.parseCommand('transfer 20 dollars to charlie', true);
      expect(result.type).toBe(CommandType.SEND);
      expect(result.args.amount).toBe('20');
      expect(result.args.recipient).toBe('charlie');
    });

    it('should convert word numbers to digits', () => {
      const result = service.parseCommand('send five dollars to dave', true);
      expect(result.type).toBe(CommandType.SEND);
      expect(result.args.amount).toBe('5');
    });
  });

  describe('Natural Language Request Commands', () => {
    it('should parse "request 5 dollars from john" as request command', () => {
      const result = service.parseCommand('request 5 dollars from john', true);
      expect(result.type).toBe(CommandType.REQUEST);
      expect(result.args.amount).toBe('5');
      expect(result.args.username).toBe('john');
      expect(result.args.requiresConfirmation).toBe('true');
    });

    it('should parse "ask alice for 10 dollars" as request command', () => {
      const result = service.parseCommand('ask alice for 10 dollars', true);
      expect(result.type).toBe(CommandType.REQUEST);
      expect(result.args.amount).toBe('10');
      expect(result.args.username).toBe('alice');
    });
  });

  describe('Natural Language Link Commands', () => {
    const linkVariations = [
      'link my account',
      'connect my account',
      'link my flash',
      'connect to flash',
      'link me',
      'connect me',
    ];

    linkVariations.forEach((input) => {
      it(`should parse "${input}" as link command`, () => {
        const result = service.parseCommand(input, true);
        expect(result.type).toBe(CommandType.LINK);
      });
    });
  });

  describe('Natural Language History Commands', () => {
    const historyVariations = [
      'show my history',
      'transaction history',
      'show my transactions',
      'recent transactions',
      'payment history',
    ];

    historyVariations.forEach((input) => {
      it(`should parse "${input}" as history command`, () => {
        const result = service.parseCommand(input, true);
        expect(result.type).toBe(CommandType.HISTORY);
      });
    });
  });

  describe('Natural Language Receive Commands', () => {
    const receiveVariations = [
      'receive money',
      'receive payment',
      'get paid',
      'request money',
      'create invoice',
    ];

    receiveVariations.forEach((input) => {
      it(`should parse "${input}" as receive command`, () => {
        const result = service.parseCommand(input, true);
        expect(result.type).toBe(CommandType.RECEIVE);
      });
    });

    it('should extract amount from receive command', () => {
      const result = service.parseCommand('receive 50 dollars', true);
      expect(result.type).toBe(CommandType.RECEIVE);
      expect(result.args.amount).toBe('50');
    });
  });

  describe('Payment Confirmation Requirements', () => {
    it('should require confirmation for voice send commands', () => {
      const result = service.parseCommand('send 5 to john', true);
      expect(result.args.requiresConfirmation).toBe('true');
      expect(result.args.isVoiceCommand).toBe('true');
    });

    it('should require confirmation for voice request commands', () => {
      const result = service.parseCommand('request 10 from alice', true);
      expect(result.args.requiresConfirmation).toBe('true');
      expect(result.args.isVoiceCommand).toBe('true');
    });

    it('should not require confirmation for non-payment voice commands', () => {
      const result = service.parseCommand('check my balance', true);
      expect(result.args.requiresConfirmation).toBeUndefined();
    });

    it('should not require confirmation for text send commands', () => {
      const result = service.parseCommand('send 5 to john', false);
      expect(result.args.requiresConfirmation).toBeUndefined();
    });
  });
});
