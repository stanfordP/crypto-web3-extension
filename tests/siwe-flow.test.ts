/**
 * Tests for SIWE Flow Pure Functions
 */

import {
  createSiweMessage,
  createDefaultSiweFields,
  parseSiweMessage,
  validateSiweMessage,
  isValidEthereumAddress,
  generateNonce,
  hexToChainId,
  chainIdToHex,
  getChainName,
  createChallengeRequest,
  createVerifyRequest,
  isChallengeValid,
  type SiweMessageFields,
  type ChallengeResponse,
} from '../src/scripts/core/auth/SiweFlow';

describe('SiweFlow', () => {
  const validAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const validNonce = 'abc123xyz456';

  describe('isValidEthereumAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidEthereumAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
      expect(isValidEthereumAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidEthereumAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false); // no 0x
      expect(isValidEthereumAddress('0x1234')).toBe(false); // too short
      expect(isValidEthereumAddress('0x1234567890abcdef1234567890abcdef123456789')).toBe(false); // too long
      expect(isValidEthereumAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false); // invalid chars
      expect(isValidEthereumAddress('')).toBe(false);
    });
  });

  describe('generateNonce', () => {
    it('should generate a nonce of default length', () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(16);
      expect(/^[a-zA-Z0-9]+$/.test(nonce)).toBe(true);
    });

    it('should generate a nonce of specified length', () => {
      const nonce = generateNonce(32);
      expect(nonce).toHaveLength(32);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('hexToChainId', () => {
    it('should convert hex to number', () => {
      expect(hexToChainId('0x1')).toBe(1);
      expect(hexToChainId('0x89')).toBe(137);
      expect(hexToChainId('0xa4b1')).toBe(42161);
    });

    it('should handle decimal strings', () => {
      expect(hexToChainId('1')).toBe(1);
      expect(hexToChainId('137')).toBe(137);
    });
  });

  describe('chainIdToHex', () => {
    it('should convert number to hex', () => {
      expect(chainIdToHex(1)).toBe('0x1');
      expect(chainIdToHex(137)).toBe('0x89');
      expect(chainIdToHex(42161)).toBe('0xa4b1');
    });
  });

  describe('getChainName', () => {
    it('should return known chain names', () => {
      expect(getChainName(1)).toBe('Ethereum Mainnet');
      expect(getChainName(137)).toBe('Polygon');
      expect(getChainName(42161)).toBe('Arbitrum One');
    });

    it('should return generic name for unknown chains', () => {
      expect(getChainName(99999)).toBe('Chain 99999');
    });
  });

  describe('createDefaultSiweFields', () => {
    it('should create fields with required params', () => {
      const fields = createDefaultSiweFields({
        domain: 'example.com',
        address: validAddress,
        chainId: 1,
        nonce: validNonce,
        uri: 'https://example.com',
      });

      expect(fields.domain).toBe('example.com');
      expect(fields.address).toBe(validAddress);
      expect(fields.chainId).toBe(1);
      expect(fields.nonce).toBe(validNonce);
      expect(fields.uri).toBe('https://example.com');
      expect(fields.version).toBe('1');
      expect(fields.statement).toBe('Sign in with Ethereum to the app.');
      expect(fields.issuedAt).toBeDefined();
    });

    it('should use custom statement', () => {
      const fields = createDefaultSiweFields({
        domain: 'example.com',
        address: validAddress,
        chainId: 1,
        nonce: validNonce,
        uri: 'https://example.com',
        statement: 'Custom statement',
      });

      expect(fields.statement).toBe('Custom statement');
    });

    it('should set expiration time when specified', () => {
      const issuedAt = new Date('2024-01-01T00:00:00Z');
      const fields = createDefaultSiweFields({
        domain: 'example.com',
        address: validAddress,
        chainId: 1,
        nonce: validNonce,
        uri: 'https://example.com',
        issuedAt,
        expiresInMinutes: 60,
      });

      expect(fields.expirationTime).toBe('2024-01-01T01:00:00.000Z');
    });
  });

  describe('createSiweMessage', () => {
    it('should create a valid SIWE message', () => {
      const fields: SiweMessageFields = {
        domain: 'example.com',
        address: validAddress,
        statement: 'Sign in with Ethereum to the app.',
        uri: 'https://example.com',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: '2024-01-01T00:00:00.000Z',
      };

      const message = createSiweMessage(fields);

      expect(message).toContain('example.com wants you to sign in with your Ethereum account:');
      expect(message).toContain(validAddress);
      expect(message).toContain('Sign in with Ethereum to the app.');
      expect(message).toContain('URI: https://example.com');
      expect(message).toContain('Version: 1');
      expect(message).toContain('Chain ID: 1');
      expect(message).toContain(`Nonce: ${validNonce}`);
      expect(message).toContain('Issued At: 2024-01-01T00:00:00.000Z');
    });

    it('should include optional fields', () => {
      const fields: SiweMessageFields = {
        domain: 'example.com',
        address: validAddress,
        uri: 'https://example.com',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: '2024-01-01T00:00:00.000Z',
        expirationTime: '2024-01-01T01:00:00.000Z',
        requestId: 'req-123',
        resources: ['https://example.com/resource1'],
      };

      const message = createSiweMessage(fields);

      expect(message).toContain('Expiration Time: 2024-01-01T01:00:00.000Z');
      expect(message).toContain('Request ID: req-123');
      expect(message).toContain('Resources:');
      expect(message).toContain('- https://example.com/resource1');
    });
  });

  describe('parseSiweMessage', () => {
    it('should parse a valid SIWE message', () => {
      const fields: SiweMessageFields = {
        domain: 'example.com',
        address: validAddress,
        statement: 'Sign in with Ethereum.',
        uri: 'https://example.com',
        version: '1',
        chainId: 1,
        nonce: validNonce,
        issuedAt: '2024-01-01T00:00:00.000Z',
      };

      const message = createSiweMessage(fields);
      const result = parseSiweMessage(message);

      expect(result.success).toBe(true);
      expect(result.fields?.domain).toBe('example.com');
      expect(result.fields?.address).toBe(validAddress);
      expect(result.fields?.chainId).toBe(1);
      expect(result.fields?.nonce).toBe(validNonce);
    });

    it('should return error for invalid message', () => {
      const result = parseSiweMessage('invalid message');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for invalid address', () => {
      const message = `example.com wants you to sign in with your Ethereum account:
invalid-address

URI: https://example.com
Version: 1
Chain ID: 1
Nonce: ${validNonce}
Issued At: 2024-01-01T00:00:00.000Z`;

      const result = parseSiweMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Ethereum address');
    });
  });

  describe('validateSiweMessage', () => {
    const validFields: SiweMessageFields = {
      domain: 'example.com',
      address: validAddress,
      uri: 'https://example.com',
      version: '1',
      chainId: 1,
      nonce: validNonce,
      issuedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should validate a valid message', () => {
      const result = validateSiweMessage(validFields);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid address format', () => {
      const result = validateSiweMessage({
        ...validFields,
        address: 'invalid',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid Ethereum address');
    });

    it('should reject expired message', () => {
      const result = validateSiweMessage(
        {
          ...validFields,
          expirationTime: '2020-01-01T00:00:00.000Z',
        },
        { now: new Date('2024-01-01T00:00:00.000Z') }
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject message not yet valid', () => {
      const result = validateSiweMessage(
        {
          ...validFields,
          notBefore: '2025-01-01T00:00:00.000Z',
        },
        { now: new Date('2024-01-01T00:00:00.000Z') }
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not yet valid');
    });

    it('should reject domain mismatch', () => {
      const result = validateSiweMessage(validFields, {
        expectedDomain: 'other.com',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain mismatch');
    });

    it('should reject address mismatch', () => {
      const result = validateSiweMessage(validFields, {
        expectedAddress: '0x0000000000000000000000000000000000000000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Address mismatch');
    });

    it('should reject chain ID mismatch', () => {
      const result = validateSiweMessage(validFields, {
        expectedChainId: 137,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Chain ID mismatch');
    });

    it('should reject invalid nonce format', () => {
      const result = validateSiweMessage({
        ...validFields,
        nonce: 'short', // Too short
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid nonce');
    });
  });

  describe('createChallengeRequest', () => {
    it('should create request with lowercase address', () => {
      const request = createChallengeRequest('0xABCDEF1234567890ABCDEF1234567890ABCDEF12', '0x1');

      expect(request.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(request.chainId).toBe(1);
    });

    it('should convert hex chain ID', () => {
      const request = createChallengeRequest(validAddress, '0x89');
      expect(request.chainId).toBe(137);
    });

    it('should handle numeric chain ID', () => {
      const request = createChallengeRequest(validAddress, 42161);
      expect(request.chainId).toBe(42161);
    });
  });

  describe('createVerifyRequest', () => {
    it('should create verify request', () => {
      const request = createVerifyRequest('message', '0xsignature');

      expect(request.message).toBe('message');
      expect(request.signature).toBe('0xsignature');
    });
  });

  describe('isChallengeValid', () => {
    it('should return true for valid challenge', () => {
      const challenge: ChallengeResponse = {
        message: 'SIWE message',
        nonce: validNonce,
        expiresAt: Date.now() + 60000,
      };

      expect(isChallengeValid(challenge)).toBe(true);
    });

    it('should return false for expired challenge', () => {
      const challenge: ChallengeResponse = {
        message: 'SIWE message',
        nonce: validNonce,
        expiresAt: Date.now() - 1000,
      };

      expect(isChallengeValid(challenge)).toBe(false);
    });

    it('should return false for empty message', () => {
      const challenge: ChallengeResponse = {
        message: '',
        nonce: validNonce,
        expiresAt: Date.now() + 60000,
      };

      expect(isChallengeValid(challenge)).toBe(false);
    });

    it('should return false for empty nonce', () => {
      const challenge: ChallengeResponse = {
        message: 'SIWE message',
        nonce: '',
        expiresAt: Date.now() + 60000,
      };

      expect(isChallengeValid(challenge)).toBe(false);
    });
  });
});
