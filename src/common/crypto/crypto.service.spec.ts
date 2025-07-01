import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'ENCRYPTION_KEY':
                  return 'test_encryption_key_32_characters_long_for_test';
                case 'ENCRYPTION_SALT':
                  return 'test_salt_16char';
                case 'HASH_SALT':
                  return 'test_hash_salt16';
                default:
                  return undefined;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const testData = 'This is sensitive data that needs encryption';

      // Encrypt the data
      const encrypted = service.encrypt(testData);

      // Verify encrypted data is different from original
      expect(encrypted).not.toBe(testData);
      expect(encrypted).toBeTruthy();

      // Decrypt the data
      const decrypted = service.decrypt(encrypted);

      // Verify decryption returns original data
      expect(decrypted).toBe(testData);
    });

    it('should produce different encrypted output for same input', () => {
      const testData = 'Same data encrypted twice';

      const encrypted1 = service.encrypt(testData);
      const encrypted2 = service.encrypt(testData);

      // Due to random IV, encrypted outputs should be different
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      expect(service.decrypt(encrypted1)).toBe(testData);
      expect(service.decrypt(encrypted2)).toBe(testData);
    });

    it('should handle special characters and unicode', () => {
      const testData = '🔐 Special chars: @#$%^&*() Unicode: 你好世界';

      const encrypted = service.encrypt(testData);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(testData);
    });

    it('should throw error for invalid encrypted data', () => {
      expect(() => {
        service.decrypt('invalid-encrypted-data');
      }).toThrow('Decryption failed');
    });

    it('should throw error for tampered data', () => {
      const testData = 'Original data';
      const encrypted = service.encrypt(testData);

      // Tamper with the encrypted data
      const tampered = encrypted.slice(0, -10) + 'tamperedXX';

      expect(() => {
        service.decrypt(tampered);
      }).toThrow('Decryption failed');
    });
  });

  describe('hash', () => {
    it('should hash data consistently', () => {
      const testData = 'password123';

      const hash1 = service.hash(testData);
      const hash2 = service.hash(testData);

      // Same input should produce same hash
      expect(hash1).toBe(hash2);

      // Hash should be 64 characters (SHA-256 hex)
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service.hash('password123');
      const hash2 = service.hash('password124');

      expect(hash1).not.toBe(hash2);
    });

    it('should use salt in hashing', () => {
      const testData = 'password';

      // Create another service with different salt
      const differentSaltService = new CryptoService({
        get: jest.fn((key: string) => {
          if (key === 'HASH_SALT') return 'different_salt16';
          return configService.get(key);
        }),
      } as any);

      const hash1 = service.hash(testData);
      const hash2 = differentSaltService.hash(testData);

      // Same data with different salt should produce different hashes
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate token of correct length', () => {
      const token = service.generateSecureToken(16);

      // 16 bytes = 32 hex characters
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();

      // Generate 100 tokens
      for (let i = 0; i < 100; i++) {
        tokens.add(service.generateSecureToken(16));
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);
    });

    it('should use default length if not specified', () => {
      const token = service.generateSecureToken();

      // Default 32 bytes = 64 hex characters
      expect(token).toHaveLength(64);
    });
  });
});
