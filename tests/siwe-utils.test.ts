/**
 * Unit Tests for SIWE Utils
 */

import { 
  parseSiweMessage, 
  prepareSiweMessage, 
  validateSiweMessage,
  createSiweMessage,
  SiweMessageFields 
} from '../src/scripts/siwe-utils';

describe('SIWE Utils', () => {
  const sampleMessage = `localhost wants you to sign in with your Ethereum account:
0x1234567890123456789012345678901234567890

Sign in to Crypto Trading Journal

URI: http://localhost:3001
Version: 1
Chain ID: 1
Nonce: abc123xyz
Issued At: 2025-12-28T12:00:00.000Z`;

  describe('parseSiweMessage', () => {
    it('should parse domain correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.domain).toBe('localhost');
    });

    it('should parse address correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should parse statement correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.statement).toBe('Sign in to Crypto Trading Journal');
    });

    it('should parse URI correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.uri).toBe('http://localhost:3001');
    });

    it('should parse version correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.version).toBe('1');
    });

    it('should parse chainId correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.chainId).toBe(1);
    });

    it('should parse nonce correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.nonce).toBe('abc123xyz');
    });

    it('should parse issuedAt correctly', () => {
      const parsed = parseSiweMessage(sampleMessage);
      expect(parsed.issuedAt).toBe('2025-12-28T12:00:00.000Z');
    });
  });

  describe('prepareSiweMessage', () => {
    it('should create a valid SIWE message', () => {
      const fields: SiweMessageFields = {
        domain: 'example.com',
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        statement: 'Test statement',
        uri: 'https://example.com',
        version: '1',
        chainId: 1,
        nonce: 'testnonce',
        issuedAt: '2025-01-01T00:00:00.000Z',
      };

      const message = prepareSiweMessage(fields);
      expect(message).toContain('example.com wants you to sign in');
      expect(message).toContain('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(message).toContain('Test statement');
      expect(message).toContain('URI: https://example.com');
      expect(message).toContain('Nonce: testnonce');
    });

    it('should roundtrip correctly', () => {
      const original: SiweMessageFields = {
        domain: 'test.com',
        address: '0x1111111111111111111111111111111111111111',
        statement: 'Roundtrip test',
        uri: 'https://test.com',
        version: '1',
        chainId: 137,
        nonce: 'roundtripnonce',
        issuedAt: '2025-06-15T10:30:00.000Z',
      };

      const message = prepareSiweMessage(original);
      const parsed = parseSiweMessage(message);

      expect(parsed.domain).toBe(original.domain);
      expect(parsed.address).toBe(original.address);
      expect(parsed.statement).toBe(original.statement);
      expect(parsed.uri).toBe(original.uri);
      expect(parsed.chainId).toBe(original.chainId);
      expect(parsed.nonce).toBe(original.nonce);
    });
  });

  describe('validateSiweMessage', () => {
    it('should validate a correct message', () => {
      const fields: SiweMessageFields = {
        domain: 'test.com',
        address: '0x1234567890123456789012345678901234567890',
        uri: 'https://test.com',
        version: '1',
        chainId: 1,
        nonce: 'testnonce',
        issuedAt: new Date().toISOString(),
      };

      const result = validateSiweMessage(fields);
      expect(result.valid).toBe(true);
    });

    it('should reject missing domain', () => {
      const fields = {
        domain: '',
        address: '0x1234567890123456789012345678901234567890',
        uri: 'https://test.com',
        version: '1',
        chainId: 1,
        nonce: 'testnonce',
        issuedAt: new Date().toISOString(),
      } as SiweMessageFields;

      const result = validateSiweMessage(fields);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing domain');
    });

    it('should reject invalid address', () => {
      const fields = {
        domain: 'test.com',
        address: 'invalid-address',
        uri: 'https://test.com',
        version: '1',
        chainId: 1,
        nonce: 'testnonce',
        issuedAt: new Date().toISOString(),
      } as SiweMessageFields;

      const result = validateSiweMessage(fields);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid Ethereum address');
    });

    it('should reject expired message', () => {
      const fields: SiweMessageFields = {
        domain: 'test.com',
        address: '0x1234567890123456789012345678901234567890',
        uri: 'https://test.com',
        version: '1',
        chainId: 1,
        nonce: 'testnonce',
        issuedAt: '2020-01-01T00:00:00.000Z',
        expirationTime: '2020-01-02T00:00:00.000Z', // Already expired
      };

      const result = validateSiweMessage(fields);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message expired');
    });
  });

  describe('createSiweMessage', () => {
    it('should create message fields with defaults', () => {
      const fields = createSiweMessage({
        domain: 'app.com',
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        uri: 'https://app.com',
        chainId: 1,
        nonce: 'nonce123',
      });

      expect(fields.version).toBe('1');
      expect(fields.issuedAt).toBeDefined();
      expect(new Date(fields.issuedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
