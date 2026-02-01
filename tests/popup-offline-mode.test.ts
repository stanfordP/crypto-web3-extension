/**
 * Popup Controller Offline Mode Tests
 *
 * Tests for offline mode UX improvements:
 * - Automatic retry with exponential backoff
 * - Cached session display when offline
 * - Network error handling
 */

import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter } from '../src/scripts/adapters/types';
import type { PopupView, PopupViewEventHandlers, SessionDisplayData, PopupViewState } from '../src/scripts/ui/popup/PopupView';
import { PopupController } from '../src/scripts/ui/popup/PopupController';

// Mock fetch globally
const originalFetch = global.fetch;

describe('PopupController - Offline Mode', () => {
  let controller: PopupController;
  let mockStorage: jest.Mocked<IStorageAdapter>;
  let mockRuntime: jest.Mocked<IRuntimeAdapter>;
  let mockTabs: jest.Mocked<ITabsAdapter>;
  let mockView: jest.Mocked<PopupView>;
  let mockFetch: jest.Mock;
  let viewHandlers: PopupViewEventHandlers | null = null;

  beforeEach(() => {
    jest.useFakeTimers();

    mockStorage = {
      localGet: jest.fn().mockResolvedValue({}),
      localSet: jest.fn().mockResolvedValue(undefined),
      localClear: jest.fn().mockResolvedValue(undefined),
      sessionGet: jest.fn().mockResolvedValue({}),
      sessionSet: jest.fn().mockResolvedValue(undefined),
      sessionClear: jest.fn().mockResolvedValue(undefined),
      syncGet: jest.fn().mockResolvedValue({}),
      onChanged: jest.fn(),
      offChanged: jest.fn(),
      removeLocal: jest.fn().mockResolvedValue(undefined),
      removeSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IStorageAdapter>;

    mockRuntime = {
      sendMessage: jest.fn().mockResolvedValue({ success: true }),
      addMessageListener: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeAdapter>;

    mockTabs = {
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn().mockResolvedValue({ success: false }),
    } as unknown as jest.Mocked<ITabsAdapter>;

    mockView = {
      initialize: jest.fn((handlers: PopupViewEventHandlers) => {
        viewHandlers = handlers;
      }),
      showView: jest.fn(),
      showError: jest.fn(),
      showConnectedState: jest.fn(),
      updateOnlineStatus: jest.fn(),
      getOnlineStatus: jest.fn().mockReturnValue(true),
      close: jest.fn(),
    } as unknown as jest.Mocked<PopupView>;

    mockFetch = jest.fn();
    global.fetch = mockFetch;

    controller = new PopupController(
      mockStorage,
      mockRuntime,
      mockTabs,
      mockView,
      {
        defaultAppUrl: 'http://localhost:3000',
        apiSessionEndpoint: '/api/auth/session',
      }
    );
  });

  afterEach(() => {
    controller.destroy();
    global.fetch = originalFetch;
    jest.useRealTimers();
    viewHandlers = null;
  });

  describe('Exponential Backoff Retry', () => {
    it('should schedule retry on network error', async () => {
      mockFetch.mockRejectedValue(new Error('NetworkError'));

      await controller.initialize();

      // Verify first API call was made
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timers for first retry (1000ms) and flush promises
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve(); // Extra tick for async operations
      
      // Run all pending timers and promises
      await jest.runAllTimersAsync();

      // Should have called fetch again
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });

    it('should use exponential backoff delays', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('NetworkError'));
      });

      await controller.initialize();
      expect(callCount).toBe(1);

      // First retry at 1000ms
      await jest.advanceTimersByTimeAsync(1100);
      expect(callCount).toBe(2);

      // Second retry at 2000ms (2^1 * 1000)
      await jest.advanceTimersByTimeAsync(2100);
      expect(callCount).toBe(3);

      // Third retry at 4000ms (2^2 * 1000)
      await jest.advanceTimersByTimeAsync(4100);
      expect(callCount).toBe(4);
    });

    it('should stop retrying after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('NetworkError'));

      await controller.initialize();

      // Go through all retries
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      }

      // Should not exceed 4 calls (initial + 3 retries)
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);
    });

    it('should reset retry counter on success', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('NetworkError'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ authenticated: true, address: '0x123' }),
        });
      });

      await controller.initialize();
      expect(callCount).toBe(1);

      // Advance to trigger retry
      await jest.advanceTimersByTimeAsync(1100);
      expect(callCount).toBe(2);

      // Verify success showed connected state
      expect(mockView.showConnectedState).toHaveBeenCalled();
    });

    it('should reset retry counter on manual retry', async () => {
      mockFetch.mockRejectedValue(new Error('NetworkError'));

      await controller.initialize();

      // Advance some time (but not to retry)
      jest.advanceTimersByTime(500);

      // Trigger manual retry
      expect(viewHandlers).not.toBeNull();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      });

      await viewHandlers!.onRetry();

      // Should have called API again
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should schedule retry on timeout', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        return Promise.reject(abortError);
      });

      await controller.initialize();
      expect(callCount).toBe(1);

      // Should schedule retry
      await jest.advanceTimersByTimeAsync(1100);
      expect(callCount).toBe(2);
    });
  });

  describe('Cached Session Display', () => {
    it('should show cached session when storage fails after initial success', async () => {
      // First load - has cached data
      mockStorage.localGet.mockResolvedValueOnce({
        connectedAddress: '0xcached',
        chainId: '0x1',
        accountMode: 'live',
      });

      // Session storage empty
      mockStorage.sessionGet.mockResolvedValue({});

      // Tab sync fails
      mockTabs.query.mockResolvedValue([]);

      // API also fails
      mockFetch.mockRejectedValue(new Error('Network error'));

      await controller.initialize();

      // Should show connected state with cached data
      expect(mockView.showConnectedState).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0xcached',
        })
      );
    });

    it('should show offline indicator when using cached data after error', async () => {
      // Make initial storage throw
      mockStorage.localGet.mockRejectedValueOnce(new Error('Storage error'));

      // Cached data for fallback
      mockStorage.localGet.mockResolvedValueOnce({
        connectedAddress: '0xcached',
        chainId: '0x1',
      });

      await controller.initialize();

      // Should update online status to false
      expect(mockView.updateOnlineStatus).toHaveBeenCalledWith(false);
    });
  });

  describe('Cleanup', () => {
    it('should clear retry timeout on destroy', async () => {
      mockFetch.mockRejectedValue(new Error('NetworkError'));

      await controller.initialize();

      // Destroy before retry
      controller.destroy();

      // Advance timers - should not trigger retry
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Should only have initial call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should clear retry timeout on manual retry', async () => {
      mockFetch.mockRejectedValue(new Error('NetworkError'));

      await controller.initialize();

      // Before automatic retry, trigger manual retry
      jest.advanceTimersByTime(500);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      });

      expect(viewHandlers).not.toBeNull();
      await viewHandlers!.onRetry();

      // Advance past original retry time
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have 2 calls: initial + manual retry (not automatic)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Online/Offline Status', () => {
    it('should not attempt API call when offline', async () => {
      mockView.getOnlineStatus.mockReturnValue(false);

      await controller.initialize();

      // Should show offline status
      expect(mockView.updateOnlineStatus).toHaveBeenCalledWith(false);
      
      // Should not make API calls
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
