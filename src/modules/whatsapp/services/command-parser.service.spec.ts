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

  describe('Natural Language Processing', () => {
    describe('Balance Commands', () => {
      const balanceVariations = [
        'what is my balance',
        'check my balance',
        'show me my balance',
        'how much do i have',
        'how much money do I have',
        'my wallet balance',
      ];

      balanceVariations.forEach((text) => {
        it(`should parse "${text}" as balance command`, () => {
          const result = service.parseCommand(text, true);
          expect(result.type).toBe(CommandType.BALANCE);
        });
      });
    });

    describe('Send Commands', () => {
      it('should parse "send five dollars to john"', () => {
        const result = service.parseCommand('send five dollars to john', true);
        expect(result.type).toBe(CommandType.SEND);
        expect(result.args.amount).toBe('5');
        expect(result.args.recipient).toBe('john');
        expect(result.args.requiresConfirmation).toBe('true');
      });

      it('should parse "send 20 to alice"', () => {
        const result = service.parseCommand('send 20 to alice', true);
        expect(result.type).toBe(CommandType.SEND);
        expect(result.args.amount).toBe('20');
        expect(result.args.recipient).toBe('alice');
      });

      it('should parse "transfer 100 to bob"', () => {
        const result = service.parseCommand('transfer 100 to bob', true);
        expect(result.type).toBe(CommandType.SEND);
        expect(result.args.amount).toBe('100');
        expect(result.args.recipient).toBe('bob');
      });
    });

    describe('Request Commands', () => {
      it('should parse "request 10 from sarah"', () => {
        const result = service.parseCommand('request 10 from sarah', true);
        expect(result.type).toBe(CommandType.REQUEST);
        expect(result.args.amount).toBe('10');
        expect(result.args.username).toBe('sarah');
        expect(result.args.requiresConfirmation).toBe('true');
      });

      it('should parse "ask mike for 50 dollars"', () => {
        const result = service.parseCommand('ask mike for 50 dollars', true);
        expect(result.type).toBe(CommandType.REQUEST);
        expect(result.args.amount).toBe('50');
        expect(result.args.username).toBe('mike');
      });
    });

    describe('Price Commands', () => {
      const priceVariations = [
        'bitcoin price',
        'btc price',
        'price of bitcoin',
        'how much is bitcoin',
        'what is bitcoin worth',
        'current bitcoin price',
        'check the price',
      ];

      priceVariations.forEach((text) => {
        it(`should parse "${text}" as price command`, () => {
          const result = service.parseCommand(text, true);
          expect(result.type).toBe(CommandType.PRICE);
        });
      });
    });

    describe('Number Word Conversion', () => {
      const conversions = [
        { word: 'one', number: '1' },
        { word: 'two', number: '2' },
        { word: 'three', number: '3' },
        { word: 'ten', number: '10' },
        { word: 'twenty', number: '20' },
        { word: 'fifty', number: '50' },
        { word: 'hundred', number: '100' },
        { word: 'thousand', number: '1000' },
      ];

      conversions.forEach(({ word, number }) => {
        it(`should convert "${word}" to ${number}`, () => {
          const result = service.parseCommand(`send ${word} to alice`, true);
          expect(result.args.amount).toBe(number);
          expect(result.args.recipient).toBe('alice');
        });
      });
    });

    describe('Edge Cases', () => {
      it('should handle mixed case', () => {
        const result = service.parseCommand('SEND Five DOLLARS to JOHN', true);
        expect(result.type).toBe(CommandType.SEND);
        expect(result.args.amount).toBe('5');
        expect(result.args.recipient).toBe('JOHN'); // Natural language parser preserves case
      });

      it('should handle extra spaces', () => {
        const result = service.parseCommand('  send   five    to   john  ', true);
        expect(result.type).toBe(CommandType.SEND);
        expect(result.args.amount).toBe('5');
        expect(result.args.recipient).toBe('john');
      });

      it('should fall back to standard parsing for unrecognized patterns', () => {
        const result = service.parseCommand('gibberish nonsense', true);
        expect(result.type).toBe(CommandType.UNKNOWN);
      });
    });
  });

  describe('Voice Settings Commands', () => {
    it('should parse "voice off" as voice command', () => {
      const result = service.parseCommand('voice off');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('off');
    });

    it('should parse "voice on" as voice command', () => {
      const result = service.parseCommand('voice on');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('on');
    });

    it('should parse "voice only" as voice command', () => {
      const result = service.parseCommand('voice only');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('only');
    });

    it('should parse "voice status" as voice command', () => {
      const result = service.parseCommand('voice status');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('status');
    });

    it('should parse "voice help" as voice command', () => {
      const result = service.parseCommand('voice help');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('help');
    });

    it('should parse "voice" alone as voice command', () => {
      const result = service.parseCommand('voice');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('status');
    });

    it('should parse "voice balance" as voice command with balance action', () => {
      const result = service.parseCommand('voice balance');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('select');
      expect(result.args.voiceName).toBe('balance');
    });

    it('should parse "voice price" as voice command with price action', () => {
      const result = service.parseCommand('voice price');
      expect(result.type).toBe(CommandType.VOICE);
      expect(result.args.action).toBe('select');
      expect(result.args.voiceName).toBe('price');
    });
  });
});
