/**
 * Tests for SessionManager
 * 
 * Tests the pure session management functions and SessionManager class.
 */

import {
  validateSession,
  isValidEthereumAddress,
  normalizeAddress,
  parseApiSessionResponse,
  sessionsEqual,
  mergeSession,
  getSessionChangeType,
  createSessionChangeEvent,
  formatSessionForDisplay,
  truncateAddress,
  getChainName,
  SessionManager,
  constantTimeEqual,
  type SessionChangeEvent,
} from '../src/scripts/core/session/SessionManager';
import type { StoredSession } from '../src/scripts/core/storage/StorageService';

describe('SessionManager - Pure Functions', () => {
  describe('constantTimeEqual', () => {
    it('should return true for equal strings', () => {
      expect(constantTimeEqual('abc', 'abc')).toBe(true);
      expect(constantTimeEqual('', '')).toBe(true);
      expect(constantTimeEqual('test-token-123', 'test-token-123')).toBe(true);
    });

    it('should return true for both undefined', () => {
      expect(constantTimeEqual(undefined, undefined)).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(constantTimeEqual('abc', 'abd')).toBe(false);
      expect(constantTimeEqual('abc', 'ABC')).toBe(false);
      expect(constantTimeEqual('test', 'testing')).toBe(false);
    });

    it('should return false when one is undefined', () => {
      expect(constantTimeEqual('abc', undefined)).toBe(false);
      expect(constantTimeEqual(undefined, 'abc')).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(constantTimeEqual('short', 'longer-string')).toBe(false);
      expect(constantTimeEqual('a', 'ab')).toBe(false);
    });

    it('should handle empty and non-empty strings', () => {
      expect(constantTimeEqual('', 'abc')).toBe(false);
      expect(constantTimeEqual('abc', '')).toBe(false);
    });

    it('should handle UUID-like session tokens', () => {
      const token1 = '550e8400-e29b-41d4-a716-446655440000';
      const token2 = '550e8400-e29b-41d4-a716-446655440000';
      const token3 = '550e8400-e29b-41d4-a716-446655440001';
      
      expect(constantTimeEqual(token1, token2)).toBe(true);
      expect(constantTimeEqual(token1, token3)).toBe(false);
    });
  });

  describe('isValidEthereumAddress', () => {
    it('should validate correct addresses', () => {
      expect(isValidEthereumAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidEthereumAddress('0xABCDEF1234567890123456789012345678901234')).toBe(true);
      expect(isValidEthereumAddress('0xabcdef1234567890123456789012345678901234')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidEthereumAddress('')).toBe(false);
      expect(isValidEthereumAddress('0x123')).toBe(false);
      expect(isValidEthereumAddress('1234567890123456789012345678901234567890')).toBe(false);
      expect(isValidEthereumAddress('0xGHIJ567890123456789012345678901234567890')).toBe(false);
      expect(isValidEthereumAddress('0x12345678901234567890123456789012345678901')).toBe(false);
    });
  });

  describe('normalizeAddress', () => {
    it('should lowercase valid addresses', () => {
      expect(normalizeAddress('0xABCDEF1234567890123456789012345678901234')).toBe(
        '0xabcdef1234567890123456789012345678901234'
      );
    });

    it('should return invalid addresses unchanged', () => {
      expect(normalizeAddress('invalid')).toBe('invalid');
      expect(normalizeAddress('0x123')).toBe('0x123');
    });
  });

  describe('validateSession', () => {
    const validSession: StoredSession = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: '0x1',
    };

    it('should validate a valid session', () => {
      const result = validateSession(validSession);
      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject null session', () => {
      const result = validateSession(null);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('invalid_format');
    });

    it('should reject session without address', () => {
      const result = validateSession({ address: '', chainId: '0x1' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('missing_address');
    });

    it('should reject session with invalid address format', () => {
      const result = validateSession({ address: 'invalid', chainId: '0x1' });
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('invalid_format');
    });

    it('should reject expired session', () => {
      const expiredSession: StoredSession = {
        ...validSession,
        expiresAt: Date.now() - 10000,
      };
      const result = validateSession(expiredSession);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should accept session with future expiry', () => {
      const futureSession: StoredSession = {
        ...validSession,
        expiresAt: Date.now() + 100000,
      };
      const result = validateSession(futureSession);
      expect(result.isValid).toBe(true);
    });

    it('should validate against provided time', () => {
      const session: StoredSession = {
        ...validSession,
        expiresAt: 1000,
      };
      expect(validateSession(session, 500).isValid).toBe(true);
      expect(validateSession(session, 1500).isValid).toBe(false);
    });
  });

  describe('parseApiSessionResponse', () => {
    it('should parse authenticated response', () => {
      const response = {
        authenticated: true,
        address: '0xABCD567890123456789012345678901234567890',
        chainId: '0x89',
        expiresAt: 12345,
      };
      const session = parseApiSessionResponse(response);

      expect(session).not.toBeNull();
      expect(session?.address).toBe('0xabcd567890123456789012345678901234567890');
      expect(session?.chainId).toBe('0x89');
      expect(session?.expiresAt).toBe(12345);
    });

    it('should return null for unauthenticated response', () => {
      const response = { authenticated: false };
      expect(parseApiSessionResponse(response)).toBeNull();
    });

    it('should return null for response without address', () => {
      const response = { authenticated: true };
      expect(parseApiSessionResponse(response)).toBeNull();
    });

    it('should default to Ethereum chainId', () => {
      const response = {
        authenticated: true,
        address: '0x1234567890123456789012345678901234567890',
      };
      const session = parseApiSessionResponse(response);
      expect(session?.chainId).toBe('0x1');
    });
  });

  describe('sessionsEqual', () => {
    const sessionA: StoredSession = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: '0x1',
      sessionToken: 'token1',
    };

    it('should return true for equal sessions', () => {
      const sessionB = { ...sessionA };
      expect(sessionsEqual(sessionA, sessionB)).toBe(true);
    });

    it('should return true for both null', () => {
      expect(sessionsEqual(null, null)).toBe(true);
    });

    it('should return false for one null', () => {
      expect(sessionsEqual(sessionA, null)).toBe(false);
      expect(sessionsEqual(null, sessionA)).toBe(false);
    });

    it('should return false for different addresses', () => {
      const sessionB = { ...sessionA, address: '0xABCD567890123456789012345678901234567890' };
      expect(sessionsEqual(sessionA, sessionB)).toBe(false);
    });

    it('should return false for different chain IDs', () => {
      const sessionB = { ...sessionA, chainId: '0x89' };
      expect(sessionsEqual(sessionA, sessionB)).toBe(false);
    });

    it('should return false for different tokens', () => {
      const sessionB = { ...sessionA, sessionToken: 'token2' };
      expect(sessionsEqual(sessionA, sessionB)).toBe(false);
    });

    it('should normalize addresses when comparing', () => {
      const sessionB = { ...sessionA, address: '0x1234567890123456789012345678901234567890'.toUpperCase() };
      // Note: The uppercase version starts with 0X which is invalid, so let's use proper case
      const sessionC = { ...sessionA, address: '0xAa34567890123456789012345678901234567890' };
      const sessionD = { ...sessionA, address: '0xaa34567890123456789012345678901234567890' };
      expect(sessionsEqual(sessionC, sessionD)).toBe(true);
    });
  });

  describe('mergeSession', () => {
    const sessionA: StoredSession = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: '0x1',
    };

    it('should return incoming if existing is null', () => {
      expect(mergeSession(null, sessionA)).toBe(sessionA);
    });

    it('should return existing if incoming is null', () => {
      expect(mergeSession(sessionA, null)).toBe(sessionA);
    });

    it('should prefer incoming values', () => {
      const incoming: StoredSession = {
        address: '0xABCD567890123456789012345678901234567890',
        chainId: '0x89',
      };
      const merged = mergeSession(sessionA, incoming);

      expect(merged?.address).toBe(incoming.address);
      expect(merged?.chainId).toBe(incoming.chainId);
    });

    it('should preserve existing values if incoming is empty', () => {
      const existing: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        connectedAt: 1000,
      };
      const incoming: StoredSession = {
        address: '0xABCD567890123456789012345678901234567890',
        chainId: '0x89',
      };
      const merged = mergeSession(existing, incoming);

      expect(merged?.connectedAt).toBe(1000);
    });
  });

  describe('getSessionChangeType', () => {
    const session: StoredSession = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: '0x1',
    };

    it('should return connected when going from null to session', () => {
      expect(getSessionChangeType(null, session)).toBe('connected');
    });

    it('should return disconnected when going from session to null', () => {
      expect(getSessionChangeType(session, null)).toBe('disconnected');
    });

    it('should return updated when sessions differ', () => {
      const session2 = { ...session, chainId: '0x89' };
      expect(getSessionChangeType(session, session2)).toBe('updated');
    });
  });

  describe('createSessionChangeEvent', () => {
    it('should create event with correct type', () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      const event = createSessionChangeEvent(null, session, 12345);

      expect(event.type).toBe('connected');
      expect(event.previousSession).toBeNull();
      expect(event.currentSession).toBe(session);
      expect(event.timestamp).toBe(12345);
    });
  });

  describe('formatSessionForDisplay', () => {
    it('should format null session as not connected', () => {
      const display = formatSessionForDisplay(null);

      expect(display.isConnected).toBe(false);
      expect(display.address).toBe('');
      expect(display.chainName).toBe('Not Connected');
    });

    it('should format valid session', () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      const display = formatSessionForDisplay(session);

      expect(display.isConnected).toBe(true);
      expect(display.address).toBe(session.address);
      expect(display.shortAddress).toBe('0x1234...7890');
      expect(display.chainName).toBe('Ethereum');
    });
  });

  describe('truncateAddress', () => {
    it('should truncate long addresses', () => {
      expect(truncateAddress('0x1234567890123456789012345678901234567890')).toBe('0x1234...7890');
    });

    it('should not truncate short strings', () => {
      expect(truncateAddress('0x123')).toBe('0x123');
    });
  });

  describe('getChainName', () => {
    it('should return known chain names', () => {
      expect(getChainName('0x1')).toBe('Ethereum');
      expect(getChainName('0x89')).toBe('Polygon');
      expect(getChainName('0xa4b1')).toBe('Arbitrum One');
      expect(getChainName('0xa')).toBe('Optimism');
      expect(getChainName('0x2105')).toBe('Base');
    });

    it('should return Chain ID for unknown chains', () => {
      expect(getChainName('0x539')).toBe('Chain 1337');
    });

    it('should handle invalid chain IDs', () => {
      expect(getChainName('invalid')).toBe('Unknown');
    });
  });
});

describe('SessionManager Class', () => {
  let mockStorage: Map<string, StoredSession | null>;
  let getSession: () => Promise<StoredSession | null>;
  let setSession: (s: StoredSession) => Promise<void>;
  let clearSession: () => Promise<void>;

  beforeEach(() => {
    mockStorage = new Map();

    getSession = jest.fn(async () => mockStorage.get('session') ?? null);
    setSession = jest.fn(async (s: StoredSession) => {
      mockStorage.set('session', s);
    });
    clearSession = jest.fn(async () => {
      mockStorage.delete('session');
    });
  });

  describe('loadSession', () => {
    it('should load session from storage', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      mockStorage.set('session', session);

      const manager = new SessionManager(getSession, setSession, clearSession);
      const loaded = await manager.loadSession();

      expect(loaded).toEqual(session);
      expect(manager.getCachedSession()).toEqual(session);
    });

    it('should return null if no session', async () => {
      const manager = new SessionManager(getSession, setSession, clearSession);
      const loaded = await manager.loadSession();

      expect(loaded).toBeNull();
    });
  });

  describe('saveSession', () => {
    it('should save session to storage', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };

      const manager = new SessionManager(getSession, setSession, clearSession);
      await manager.saveSession(session);

      expect(setSession).toHaveBeenCalledWith(session);
      expect(manager.getCachedSession()).toEqual(session);
    });

    it('should notify listeners on save', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };

      const manager = new SessionManager(getSession, setSession, clearSession);
      const listener = jest.fn();
      manager.onSessionChange(listener);

      await manager.saveSession(session);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connected',
          currentSession: session,
        })
      );
    });
  });

  describe('clearSession', () => {
    it('should clear session from storage', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      mockStorage.set('session', session);

      const manager = new SessionManager(getSession, setSession, clearSession);
      await manager.loadSession();
      await manager.clearSession();

      expect(clearSession).toHaveBeenCalled();
      expect(manager.getCachedSession()).toBeNull();
    });

    it('should notify listeners on clear', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      mockStorage.set('session', session);

      const manager = new SessionManager(getSession, setSession, clearSession);
      await manager.loadSession();

      const listener = jest.fn();
      manager.onSessionChange(listener);

      await manager.clearSession();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'disconnected',
        })
      );
    });
  });

  describe('syncSession', () => {
    it('should return storage session if valid', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      mockStorage.set('session', session);

      const manager = new SessionManager(getSession, setSession, clearSession);
      const result = await manager.syncSession();

      expect(result.success).toBe(true);
      expect(result.source).toBe('storage');
      expect(result.session).toEqual(session);
    });

    it('should fall back to API if storage session expired', async () => {
      const expiredSession: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        expiresAt: Date.now() - 10000,
      };
      mockStorage.set('session', expiredSession);

      const apiSession: StoredSession = {
        address: '0xABCD567890123456789012345678901234567890',
        chainId: '0x89',
      };

      const fetchApi = jest.fn(async () => ({
        authenticated: true,
        address: apiSession.address,
        chainId: apiSession.chainId,
      }));

      const manager = new SessionManager(getSession, setSession, clearSession, fetchApi);
      const result = await manager.syncSession();

      expect(result.success).toBe(true);
      expect(result.source).toBe('api');
      expect(result.session?.chainId).toBe('0x89');
    });

    it('should return failure if no valid session found', async () => {
      const manager = new SessionManager(getSession, setSession, clearSession);
      const result = await manager.syncSession();

      expect(result.success).toBe(false);
      expect(result.source).toBe('none');
      expect(result.session).toBeNull();
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid cached session', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      mockStorage.set('session', session);

      const manager = new SessionManager(getSession, setSession, clearSession);
      await manager.loadSession();

      expect(manager.isSessionValid()).toBe(true);
    });

    it('should return false for no cached session', () => {
      const manager = new SessionManager(getSession, setSession, clearSession);
      expect(manager.isSessionValid()).toBe(false);
    });
  });

  describe('onSessionChange', () => {
    it('should unsubscribe when returned function is called', async () => {
      const manager = new SessionManager(getSession, setSession, clearSession);
      const listener = jest.fn();
      const unsubscribe = manager.onSessionChange(listener);

      // Unsubscribe
      unsubscribe();

      // Save should not notify
      await manager.saveSession({
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
