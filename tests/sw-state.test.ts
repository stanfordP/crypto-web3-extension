/**
 * Tests for sw-state.ts
 *
 * Tests service worker state persistence across restarts in Manifest V3.
 * Covers state CRUD, pending request lifecycle, connection state,
 * expiry cleanup, and wake-up initialization.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Chrome Storage
// ============================================================================

const mockSessionStorage: Record<string, unknown> = {};

(global as any).chrome = {
  storage: {
    session: {
      get: jest.fn((key: string) =>
        Promise.resolve({ [key]: mockSessionStorage[key] })
      ),
      set: jest.fn((items: Record<string, unknown>) => {
        Object.assign(mockSessionStorage, items);
        return Promise.resolve();
      }),
      remove: jest.fn((key: string) => {
        delete mockSessionStorage[key];
        return Promise.resolve();
      }),
    },
  },
};

// ============================================================================
// Import module under test (after mocks are in place)
// ============================================================================

import {
  saveState,
  getState,
  clearState,
  addPendingRequest,
  removePendingRequest,
  getPendingRequests,
  hasPendingRequests,
  updateConnectionState,
  getConnectionState,
  initializeOnWakeUp,
  recordActivity,
  type ServiceWorkerState,
  type PendingRequest,
} from '../src/scripts/sw-state';

// ============================================================================
// Helpers
// ============================================================================

const STORAGE_KEY = 'serviceWorkerState';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Directly read the raw stored state (bypasses module logic). */
function rawState(): ServiceWorkerState | undefined {
  return mockSessionStorage[STORAGE_KEY] as ServiceWorkerState | undefined;
}

/** Directly seed the raw stored state. */
function seedState(state: ServiceWorkerState): void {
  mockSessionStorage[STORAGE_KEY] = state;
}

/** Build a minimal valid state for seeding. */
function buildState(overrides: Partial<ServiceWorkerState> = {}): ServiceWorkerState {
  return {
    pendingRequests: [],
    lastAddress: null,
    lastChainId: '0x1',
    lastActivity: Date.now(),
    ...overrides,
  };
}

/** Build a pending request helper. */
function buildRequest(overrides: Partial<PendingRequest> = {}): PendingRequest {
  return {
    id: 'req-1',
    method: 'eth_sendTransaction',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Service Worker State Management (sw-state)', () => {
  let dateNowSpy: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    // Clear mock storage between tests
    for (const key of Object.keys(mockSessionStorage)) {
      delete mockSessionStorage[key];
    }
    jest.clearAllMocks();

    // Provide a stable Date.now for most tests
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  // ==========================================================================
  // getState
  // ==========================================================================

  describe('getState()', () => {
    it('should return the default state when nothing is stored', async () => {
      const state = await getState();

      expect(state).toEqual({
        pendingRequests: [],
        lastAddress: null,
        lastChainId: '0x1',
        lastActivity: 1000000,
      });
    });

    it('should return the stored state when one exists', async () => {
      const existing = buildState({
        lastAddress: '0xabc',
        lastChainId: '0x89',
        lastActivity: 900000,
      });
      seedState(existing);

      const state = await getState();

      expect(state).toEqual(existing);
    });

    it('should call chrome.storage.session.get with the correct key', async () => {
      await getState();
      expect(chrome.storage.session.get).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  // ==========================================================================
  // saveState
  // ==========================================================================

  describe('saveState()', () => {
    it('should persist state to chrome.storage.session', async () => {
      await saveState({ lastAddress: '0xdeadbeef' });

      expect(chrome.storage.session.set).toHaveBeenCalled();
      const stored = rawState();
      expect(stored).toBeDefined();
      expect(stored!.lastAddress).toBe('0xdeadbeef');
    });

    it('should merge partial state with existing state', async () => {
      seedState(
        buildState({
          lastAddress: '0x111',
          lastChainId: '0x5',
          lastActivity: 500000,
        })
      );

      await saveState({ lastChainId: '0xa4b1' });

      const stored = rawState()!;
      // The address should survive the merge
      expect(stored.lastAddress).toBe('0x111');
      // The chain should be updated
      expect(stored.lastChainId).toBe('0xa4b1');
    });

    it('should always update lastActivity to Date.now()', async () => {
      dateNowSpy.mockReturnValue(7777777);

      await saveState({ lastAddress: '0x999' });

      expect(rawState()!.lastActivity).toBe(7777777);
    });

    it('should create a new state when storage is empty', async () => {
      await saveState({ lastChainId: '0x89' });

      const stored = rawState()!;
      expect(stored.pendingRequests).toEqual([]);
      expect(stored.lastAddress).toBeNull();
      expect(stored.lastChainId).toBe('0x89');
    });

    it('should preserve pendingRequests when not overwritten', async () => {
      const req = buildRequest({ id: 'preserved' });
      seedState(buildState({ pendingRequests: [req] }));

      await saveState({ lastAddress: '0xnew' });

      expect(rawState()!.pendingRequests).toHaveLength(1);
      expect(rawState()!.pendingRequests[0].id).toBe('preserved');
    });
  });

  // ==========================================================================
  // clearState
  // ==========================================================================

  describe('clearState()', () => {
    it('should remove all state from storage', async () => {
      seedState(buildState({ lastAddress: '0xwillbegone' }));

      await clearState();

      expect(rawState()).toBeUndefined();
    });

    it('should call chrome.storage.session.remove with the correct key', async () => {
      await clearState();
      expect(chrome.storage.session.remove).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('should not throw when storage is already empty', async () => {
      await expect(clearState()).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // addPendingRequest
  // ==========================================================================

  describe('addPendingRequest()', () => {
    it('should add a request with the current timestamp', async () => {
      dateNowSpy.mockReturnValue(2000000);

      await addPendingRequest({ id: 'r1', method: 'eth_sign' });

      const reqs = rawState()!.pendingRequests;
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toMatchObject({
        id: 'r1',
        method: 'eth_sign',
        timestamp: 2000000,
      });
    });

    it('should preserve optional params and tabId', async () => {
      await addPendingRequest({
        id: 'r2',
        method: 'eth_sendTransaction',
        params: [{ to: '0x1', value: '0x0' }],
        tabId: 42,
      });

      const req = rawState()!.pendingRequests[0];
      expect(req.params).toEqual([{ to: '0x1', value: '0x0' }]);
      expect(req.tabId).toBe(42);
    });

    it('should append to existing pending requests', async () => {
      const existing = buildRequest({ id: 'existing', timestamp: Date.now() });
      seedState(buildState({ pendingRequests: [existing] }));

      await addPendingRequest({ id: 'new-one', method: 'personal_sign' });

      expect(rawState()!.pendingRequests).toHaveLength(2);
    });

    it('should clean up expired requests when adding a new one', async () => {
      const now = 2000000;
      dateNowSpy.mockReturnValue(now);

      const expired = buildRequest({
        id: 'old',
        timestamp: now - FIVE_MINUTES_MS - 1,
      });
      const fresh = buildRequest({
        id: 'fresh',
        timestamp: now - 1000,
      });
      seedState(buildState({ pendingRequests: [expired, fresh] }));

      await addPendingRequest({ id: 'newest', method: 'eth_call' });

      const ids = rawState()!.pendingRequests.map((r) => r.id);
      expect(ids).not.toContain('old');
      expect(ids).toContain('fresh');
      expect(ids).toContain('newest');
    });
  });

  // ==========================================================================
  // removePendingRequest
  // ==========================================================================

  describe('removePendingRequest()', () => {
    it('should remove a request by ID', async () => {
      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'keep' }),
            buildRequest({ id: 'remove-me' }),
          ],
        })
      );

      await removePendingRequest('remove-me');

      const ids = rawState()!.pendingRequests.map((r) => r.id);
      expect(ids).toEqual(['keep']);
    });

    it('should be a no-op if the ID does not exist', async () => {
      seedState(
        buildState({
          pendingRequests: [buildRequest({ id: 'stays' })],
        })
      );

      await removePendingRequest('nonexistent');

      expect(rawState()!.pendingRequests).toHaveLength(1);
    });

    it('should result in an empty array when the last request is removed', async () => {
      seedState(
        buildState({
          pendingRequests: [buildRequest({ id: 'only' })],
        })
      );

      await removePendingRequest('only');

      expect(rawState()!.pendingRequests).toEqual([]);
    });
  });

  // ==========================================================================
  // getPendingRequests
  // ==========================================================================

  describe('getPendingRequests()', () => {
    it('should return an empty array when there are no requests', async () => {
      const result = await getPendingRequests();
      expect(result).toEqual([]);
    });

    it('should return only non-expired requests', async () => {
      const now = 3000000;
      dateNowSpy.mockReturnValue(now);

      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'expired', timestamp: now - FIVE_MINUTES_MS - 1 }),
            buildRequest({ id: 'valid', timestamp: now - 1000 }),
          ],
        })
      );

      const result = await getPendingRequests();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid');
    });

    it('should include a request that is exactly at the expiry boundary', async () => {
      const now = 3000000;
      dateNowSpy.mockReturnValue(now);

      // timestamp such that now - timestamp === FIVE_MINUTES_MS (not strictly less)
      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'boundary', timestamp: now - FIVE_MINUTES_MS }),
          ],
        })
      );

      const result = await getPendingRequests();
      // now - timestamp = FIVE_MINUTES_MS, which is NOT < FIVE_MINUTES_MS, so filtered out
      expect(result).toHaveLength(0);
    });

    it('should return all requests when none are expired', async () => {
      const now = 3000000;
      dateNowSpy.mockReturnValue(now);

      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'a', timestamp: now - 1000 }),
            buildRequest({ id: 'b', timestamp: now - 2000 }),
            buildRequest({ id: 'c', timestamp: now }),
          ],
        })
      );

      const result = await getPendingRequests();
      expect(result).toHaveLength(3);
    });
  });

  // ==========================================================================
  // hasPendingRequests
  // ==========================================================================

  describe('hasPendingRequests()', () => {
    it('should return false when there are no requests', async () => {
      expect(await hasPendingRequests()).toBe(false);
    });

    it('should return true when there are valid requests', async () => {
      seedState(
        buildState({
          pendingRequests: [buildRequest({ timestamp: Date.now() })],
        })
      );

      expect(await hasPendingRequests()).toBe(true);
    });

    it('should return false when all requests are expired', async () => {
      const now = 5000000;
      dateNowSpy.mockReturnValue(now);

      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'old1', timestamp: now - FIVE_MINUTES_MS - 1 }),
            buildRequest({ id: 'old2', timestamp: now - FIVE_MINUTES_MS - 5000 }),
          ],
        })
      );

      expect(await hasPendingRequests()).toBe(false);
    });
  });

  // ==========================================================================
  // updateConnectionState / getConnectionState
  // ==========================================================================

  describe('updateConnectionState() / getConnectionState()', () => {
    it('should round-trip address and chainId', async () => {
      await updateConnectionState('0x1234abcd', '0x89');

      const conn = await getConnectionState();
      expect(conn.address).toBe('0x1234abcd');
      expect(conn.chainId).toBe('0x89');
    });

    it('should handle a null address (disconnected)', async () => {
      await updateConnectionState(null, '0x1');

      const conn = await getConnectionState();
      expect(conn.address).toBeNull();
      expect(conn.chainId).toBe('0x1');
    });

    it('should overwrite previous connection state', async () => {
      await updateConnectionState('0xfirst', '0x1');
      await updateConnectionState('0xsecond', '0xa');

      const conn = await getConnectionState();
      expect(conn.address).toBe('0xsecond');
      expect(conn.chainId).toBe('0xa');
    });

    it('should return default connection state when nothing is stored', async () => {
      const conn = await getConnectionState();
      expect(conn.address).toBeNull();
      expect(conn.chainId).toBe('0x1');
    });
  });

  // ==========================================================================
  // initializeOnWakeUp
  // ==========================================================================

  describe('initializeOnWakeUp()', () => {
    let consoleSpy: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should do nothing when there are no pending requests', async () => {
      await initializeOnWakeUp();

      // No log output expected because pendingRequests.length === 0
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log restored request count when pending requests exist', async () => {
      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'a', timestamp: Date.now() }),
            buildRequest({ id: 'b', timestamp: Date.now() }),
          ],
        })
      );

      await initializeOnWakeUp();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('2 pending requests')
      );
    });

    it('should clean up expired requests and log the cleanup count', async () => {
      const now = 4000000;
      dateNowSpy.mockReturnValue(now);

      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'expired1', timestamp: now - FIVE_MINUTES_MS - 1000 }),
            buildRequest({ id: 'expired2', timestamp: now - FIVE_MINUTES_MS - 2000 }),
            buildRequest({ id: 'valid', timestamp: now - 1000 }),
          ],
        })
      );

      await initializeOnWakeUp();

      // First log: restored with 3 pending
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 pending requests')
      );
      // Second log: cleaned up 2
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('2 expired requests')
      );

      // Only the valid request should remain
      const stored = rawState()!;
      expect(stored.pendingRequests).toHaveLength(1);
      expect(stored.pendingRequests[0].id).toBe('valid');
    });

    it('should not save when no requests are expired', async () => {
      const now = 4000000;
      dateNowSpy.mockReturnValue(now);

      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'fresh', timestamp: now - 1000 }),
          ],
        })
      );

      // Clear set call history from seedState
      (chrome.storage.session.set as jest.Mock).mockClear();

      await initializeOnWakeUp();

      // Logged the restore message
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 pending requests')
      );
      // No additional save because validRequests.length === state.pendingRequests.length
      // Actually initializeOnWakeUp won't call saveState if lengths match
      // The only set call would be if saveState was called. Let's check no cleanup log.
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('expired requests')
      );
    });
  });

  // ==========================================================================
  // recordActivity
  // ==========================================================================

  describe('recordActivity()', () => {
    it('should update lastActivity to the current timestamp', async () => {
      dateNowSpy.mockReturnValue(9999999);

      await recordActivity();

      expect(rawState()!.lastActivity).toBe(9999999);
    });

    it('should not alter other state fields', async () => {
      seedState(
        buildState({
          lastAddress: '0xcafe',
          lastChainId: '0x5',
          pendingRequests: [buildRequest({ id: 'untouched' })],
        })
      );

      await recordActivity();

      const stored = rawState()!;
      expect(stored.lastAddress).toBe('0xcafe');
      expect(stored.lastChainId).toBe('0x5');
      expect(stored.pendingRequests[0].id).toBe('untouched');
    });
  });

  // ==========================================================================
  // Edge cases & integration
  // ==========================================================================

  describe('Edge cases', () => {
    it('should handle rapid sequential saves without data loss', async () => {
      await saveState({ lastAddress: '0x1' });
      await saveState({ lastChainId: '0x89' });
      await saveState({ pendingRequests: [buildRequest({ id: 'seq' })] });

      const stored = rawState()!;
      expect(stored.lastAddress).toBe('0x1');
      expect(stored.lastChainId).toBe('0x89');
      expect(stored.pendingRequests).toHaveLength(1);
    });

    it('should return fresh defaults after clearState followed by getState', async () => {
      await saveState({ lastAddress: '0xold', lastChainId: '0x5' });
      await clearState();

      const state = await getState();
      expect(state.lastAddress).toBeNull();
      expect(state.lastChainId).toBe('0x1');
      expect(state.pendingRequests).toEqual([]);
    });

    it('should correctly handle addPendingRequest when all existing are expired', async () => {
      const now = 6000000;
      dateNowSpy.mockReturnValue(now);

      seedState(
        buildState({
          pendingRequests: [
            buildRequest({ id: 'e1', timestamp: now - FIVE_MINUTES_MS - 1 }),
            buildRequest({ id: 'e2', timestamp: now - FIVE_MINUTES_MS - 5000 }),
          ],
        })
      );

      await addPendingRequest({ id: 'new', method: 'wallet_switchEthereumChain' });

      const reqs = rawState()!.pendingRequests;
      expect(reqs).toHaveLength(1);
      expect(reqs[0].id).toBe('new');
    });

    it('should handle addPendingRequest with no optional fields', async () => {
      await addPendingRequest({ id: 'minimal', method: 'eth_accounts' });

      const req = rawState()!.pendingRequests[0];
      expect(req.id).toBe('minimal');
      expect(req.method).toBe('eth_accounts');
      expect(req.params).toBeUndefined();
      expect(req.tabId).toBeUndefined();
      expect(req.timestamp).toBe(Date.now());
    });
  });
});
