/**
 * Tests for StorageService
 * 
 * Tests the storage service with mock adapters.
 */

import { StorageService, type StoredSession } from '../src/scripts/core/storage/StorageService';
import { createMockStorageAdapter, type MockStorageAdapter } from './utils/mock-factories';

describe('StorageService', () => {
  let mockAdapter: MockStorageAdapter;
  let service: StorageService;

  beforeEach(() => {
    mockAdapter = createMockStorageAdapter();
    service = new StorageService(mockAdapter);
  });

  afterEach(() => {
    mockAdapter._reset();
  });

  describe('getSession', () => {
    it('should return null when no session stored', async () => {
      const session = await service.getSession();
      expect(session).toBeNull();
    });

    it('should return stored session', async () => {
      const storedSession: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        sessionToken: 'token123',
      };
      mockAdapter._sessionStorage.set('session', storedSession);

      const session = await service.getSession();

      expect(session).toEqual(storedSession);
    });

    it('should use session storage', async () => {
      await service.getSession();

      expect(mockAdapter._calls).toContainEqual(
        expect.objectContaining({
          method: 'sessionGet',
          args: [['session']],
        })
      );
    });
  });

  describe('setSession', () => {
    it('should store session in session storage', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };

      await service.setSession(session);

      // Session gets connectedAt added automatically
      const storedSession = mockAdapter._sessionStorage.get('session') as StoredSession;
      expect(storedSession.address).toEqual(session.address);
      expect(storedSession.chainId).toEqual(session.chainId);
      expect(storedSession.connectedAt).toBeDefined();
    });

    it('should call sessionSet on adapter', async () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };

      await service.setSession(session);

      // Should have called sessionSet
      const sessionSetCall = mockAdapter._calls.find(c => c.method === 'sessionSet');
      expect(sessionSetCall).toBeDefined();
      const storedSession = (sessionSetCall!.args[0] as any).session as StoredSession;
      expect(storedSession.address).toBe(session.address);
      expect(storedSession.chainId).toBe(session.chainId);
    });
  });

  describe('clearSession', () => {
    it('should remove session from storage', async () => {
      mockAdapter._sessionStorage.set('session', {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      });

      await service.clearSession();

      expect(mockAdapter._sessionStorage.has('session')).toBe(false);
    });

    it('should call sessionRemove on adapter', async () => {
      await service.clearSession();

      expect(mockAdapter._calls).toContainEqual(
        expect.objectContaining({
          method: 'sessionRemove',
          args: [['session']],
        })
      );
    });
  });

  describe('isSessionExpired', () => {
    it('should return true for null session', () => {
      expect(service.isSessionExpired(null)).toBe(true);
    });

    it('should return false for session without expiry', () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      expect(service.isSessionExpired(session)).toBe(false);
    });

    it('should return true for expired session', () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        expiresAt: Date.now() - 10000,
      };
      expect(service.isSessionExpired(session)).toBe(true);
    });

    it('should return false for non-expired session', () => {
      const session: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        expiresAt: Date.now() + 100000,
      };
      expect(service.isSessionExpired(session)).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return null when no config stored', async () => {
      const config = await service.getConfig();
      expect(config).toBeNull();
    });

    it('should return stored config', async () => {
      const storedConfig = {
        apiUrl: 'https://api.example.com',
        debug: true,
      };
      mockAdapter._localStorage.set('config', storedConfig);

      const config = await service.getConfig();

      expect(config).toEqual(storedConfig);
    });
  });

  describe('setConfig', () => {
    it('should store config in local storage', async () => {
      const config = {
        apiUrl: 'https://api.example.com',
        debug: false,
      };

      await service.setConfig(config);

      expect(mockAdapter._localStorage.get('config')).toEqual(config);
    });
  });

  describe('onSessionChange', () => {
    it('should call callback when session changes', async () => {
      const callback = jest.fn();
      service.onSessionChange(callback);

      // Simulate storage change
      const newSession: StoredSession = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };
      mockAdapter._simulateChange(
        {
          session: {
            oldValue: undefined,
            newValue: newSession,
          },
        },
        'session'
      );

      expect(callback).toHaveBeenCalledWith(newSession, null);
    });

    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = service.onSessionChange(callback);

      unsubscribe();

      // Simulate change after unsubscribe
      mockAdapter._simulateChange(
        {
          session: {
            oldValue: undefined,
            newValue: { address: '0x123', chainId: '0x1' },
          },
        },
        'session'
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('should ignore changes to other keys', () => {
      const callback = jest.fn();
      service.onSessionChange(callback);

      mockAdapter._simulateChange(
        {
          otherKey: {
            oldValue: 'old',
            newValue: 'new',
          },
        },
        'session'
      );

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
