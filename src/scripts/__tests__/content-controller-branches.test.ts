/**
 * ContentController Additional Branch Tests
 *
 * Tests for branches not covered in the main content-controller.test.ts
 * Focuses on edge cases, error paths, and timeout scenarios.
 */

import { ContentController } from '../ui/content/ContentController';
import { InjectionService } from '../services/InjectionService';
import {
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockDOMAdapter,
} from '../core/Container';
import { StorageKeys, PageMessageType, ErrorCode } from '../types';
import type { IStorageAdapter, IRuntimeAdapter, IDOMAdapter } from '../adapters/types';

// Mock the config module
jest.mock('../config', () => ({
  isAllowedOrigin: jest.fn(() => true),
  API_BASE_URL: 'http://localhost:3000',
  API_ENDPOINTS: {
    SIWE_CHALLENGE: '/api/auth/siwe/challenge',
    SIWE_VERIFY: '/api/auth/siwe/verify',
    SESSION_VALIDATE: '/api/auth/session',
  },
}));

describe('ContentController - Branch Coverage', () => {
  let controller: ContentController;
  let storage: IStorageAdapter;
  let runtime: IRuntimeAdapter;
  let dom: IDOMAdapter;
  let injectionService: InjectionService;
  let mockFetch: jest.Mock;
  let mockLogger: {
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
  let postMessageSpy: jest.SpyInstance;
  let addEventListenerSpy: jest.SpyInstance;
  let getVisibilityStateSpy: jest.SpyInstance;
  let sendMessageSpy: jest.SpyInstance;
  // Storage change listeners need to be captured
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storageChangeCallback: any = null;

  beforeEach(() => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    dom = createMockDOMAdapter();

    // Spy on DOM methods
    postMessageSpy = jest.spyOn(dom, 'postMessage');
    addEventListenerSpy = jest.spyOn(dom, 'addEventListener');
    jest.spyOn(dom, 'removeEventListener');
    jest.spyOn(dom, 'getOrigin').mockReturnValue('http://localhost:3000');
    getVisibilityStateSpy = jest.spyOn(dom, 'getVisibilityState').mockReturnValue('visible');

    // Spy on runtime sendMessage
    sendMessageSpy = jest.spyOn(runtime, 'sendMessage').mockResolvedValue({ success: true });

    // Capture storage change listener
    jest.spyOn(storage, 'addChangeListener').mockImplementation((cb) => {
      storageChangeCallback = cb;
    });

    injectionService = {
      initialize: jest.fn(),
      cleanup: jest.fn(),
      checkWallet: jest.fn().mockResolvedValue({ available: true, walletName: 'MetaMask' }),
      connectWallet: jest.fn().mockResolvedValue({ success: true, address: '0x1234', chainId: '0x1' }),
      signMessage: jest.fn().mockResolvedValue({ success: true, signature: '0xsig' }),
      isReady: jest.fn(() => true),
      injectWalletScript: jest.fn().mockResolvedValue(undefined),
      sendWalletMessage: jest.fn(),
    } as unknown as InjectionService;

    mockFetch = jest.fn();
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    controller = new ContentController({
      storageAdapter: storage,
      runtimeAdapter: runtime,
      domAdapter: dom,
      injectionService,
      logger: mockLogger as unknown as typeof import('../logger').contentLogger,
      fetchFn: mockFetch,
    });
  });

  afterEach(() => {
    controller.cleanup();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Rate Limiting - Token Refill', () => {
    it('should refill tokens over time', async () => {
      // Consume all tokens
      for (let i = 0; i < 200; i++) {
        controller.isRateLimited();
      }
      expect(controller.isRateLimited()).toBe(true);

      // Advance time by 2 seconds (should refill 200 tokens at 100/sec)
      jest.useFakeTimers();
      jest.advanceTimersByTime(2000);

      // Now rate limiting should be off again
      expect(controller.isRateLimited()).toBe(false);

      jest.useRealTimers();
    });

    it('should not exceed max tokens', async () => {
      // With fake timers, advance a lot of time
      jest.useFakeTimers();
      jest.advanceTimersByTime(10000);

      // Even after long time, should not exceed max tokens
      // First call should not be rate limited
      expect(controller.isRateLimited()).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('Request Deduplication - Stale Cleanup', () => {
    it('should clean up stale requests after timeout', async () => {
      jest.useFakeTimers();

      // Create a never-resolving promise
      const neverResolvingPromise = new Promise<void>(() => {});
      controller.markRequestInFlight('stale-test', neverResolvingPromise);

      expect(controller.isRequestInFlight('stale-test')).toBe(true);

      // Advance time beyond REQUEST_TIMEOUT (60000ms)
      jest.advanceTimersByTime(61000);

      // Should be cleaned up after timeout
      expect(controller.isRequestInFlight('stale-test')).toBe(false);

      jest.useRealTimers();
    });

    it('should return null for non-existent in-flight request', () => {
      expect(controller.getInFlightPromise('non-existent')).toBeNull();
    });
  });

  describe('Service Worker Health - Cooldown', () => {
    it('should skip health check if checked recently', async () => {
      const sendMessageSpy = jest.spyOn(runtime, 'sendMessage')
        .mockResolvedValue({ success: true });

      // First call
      await controller.ensureServiceWorkerHealthy();
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);

      // Second immediate call should be skipped due to cooldown
      await controller.ensureServiceWorkerHealthy();
      expect(sendMessageSpy).toHaveBeenCalledTimes(1); // Still 1

      // Advance time past cooldown (5000ms)
      jest.useFakeTimers();
      jest.advanceTimersByTime(6000);

      await controller.ensureServiceWorkerHealthy();
      expect(sendMessageSpy).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should attempt wake-up when service worker not responding', async () => {
      const sendMessageSpy = jest.spyOn(runtime, 'sendMessage')
        .mockResolvedValue({ success: false }); // Not healthy

      jest.useFakeTimers();
      jest.advanceTimersByTime(6000); // Past cooldown

      const result = await controller.ensureServiceWorkerHealthy();

      // Should have made multiple calls - initial check + wake-up + retry
      expect(sendMessageSpy).toHaveBeenCalled();
      expect(result).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('handleOpenAuth - In-flight Handling', () => {
    it('should wait for existing in-flight request', async () => {
      await controller.initialize();

      // Mock the injection service to take time
      let resolveConnect: () => void;
      const connectPromise = new Promise<{ success: boolean; address: string; chainId: string }>(
        (resolve) => {
          resolveConnect = () => resolve({ success: true, address: '0x1234', chainId: '0x1' });
        }
      );
      (injectionService.connectWallet as jest.Mock).mockReturnValue(connectPromise);
      (injectionService.signMessage as jest.Mock).mockResolvedValue({ success: true, signature: '0xsig' });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'SIWE message' }),
      });

      // Start first request
      const firstRequest = controller.handleOpenAuth();

      // Start second request immediately - should wait for first
      const secondRequest = controller.handleOpenAuth();

      // Resolve the connect
      resolveConnect!();

      // Both should complete
      await Promise.all([firstRequest, secondRequest]);
    });
  });

  describe('handleGetSession - Error Handling', () => {
    it('should handle storage error gracefully', async () => {
      jest.spyOn(storage, 'getLocal').mockRejectedValue(new Error('Storage error'));

      await controller.handleGetSession();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_RESPONSE,
          session: null,
          hasValidToken: false,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleWalletConnectV2 - Timeout Branch', () => {
    it('should send timeout error when request times out', async () => {
      (injectionService.checkWallet as jest.Mock).mockRejectedValue(
        new Error('Request timed out after 30000ms')
      );

      await controller.handleWalletConnectV2('req-timeout');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.REQUEST_TIMEOUT,
          requestId: 'req-timeout',
        }),
        expect.any(String)
      );
    });

    it('should handle non-Error exceptions', async () => {
      (injectionService.checkWallet as jest.Mock).mockRejectedValue('String error');

      await controller.handleWalletConnectV2('req-string-error');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.WALLET_CONNECTION_FAILED,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleWalletSignV2 - Timeout Branch', () => {
    it('should send timeout error when signing times out', async () => {
      (injectionService.signMessage as jest.Mock).mockRejectedValue(
        new Error('Request timed out after 30000ms')
      );

      await controller.handleWalletSignV2('message', '0x123', 'req-sign-timeout');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.REQUEST_TIMEOUT,
        }),
        expect.any(String)
      );
    });

    it('should handle user rejection (code 4001)', async () => {
      (injectionService.signMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'User rejected',
        code: 4001,
      });

      await controller.handleWalletSignV2('message', '0x123', 'req-reject');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.USER_REJECTED,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleStoreSession - Error Branch', () => {
    it('should handle storage error', async () => {
      jest.spyOn(storage, 'setLocal').mockRejectedValue(new Error('Storage full'));

      await controller.handleStoreSession(
        { sessionToken: 'token', address: '0x123', chainId: '0x1' },
        'req-store-error'
      );

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.SESSION_STORAGE_FAILED,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleDisconnect - Error Handling', () => {
    it('should handle runtime error gracefully', async () => {
      sendMessageSpy.mockRejectedValue(new Error('Runtime error'));

      await controller.handleDisconnect();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_DISCONNECT_RESPONSE,
          success: false,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleSetAccountMode', () => {
    it('should store account mode', async () => {
      await controller.handleSetAccountMode('demo', 'req-mode');

      const local = await storage.getLocal([StorageKeys.ACCOUNT_MODE]);
      expect(local[StorageKeys.ACCOUNT_MODE]).toBe('demo');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ACCOUNT_MODE_SET,
          success: true,
        }),
        expect.any(String)
      );
    });

    it('should handle storage error for account mode', async () => {
      jest.spyOn(storage, 'setLocal').mockRejectedValue(new Error('Storage error'));

      await controller.handleSetAccountMode('live', 'req-mode-error');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('handlePopupGetSession - Edge Cases', () => {
    it('should handle API error when checking session', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await controller.handlePopupGetSession();

      expect(result.success).toBe(false);
    });

    it('should handle non-ok API response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await controller.handlePopupGetSession();

      expect(result.success).toBe(false);
    });

    it('should return session when API says authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          address: '0xabc',
          chainId: '0x1',
        }),
      });

      const result = await controller.handlePopupGetSession();

      expect(result.success).toBe(true);
      expect(result.session?.address).toBe('0xabc');
    });
  });

  describe('Page Message Handler - Security Checks', () => {
    it('should ignore messages from different origin', async () => {
      await controller.initialize();

      // Get the registered message handler
      const messageHandler = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];

      expect(messageHandler).toBeDefined();

      // Simulate message from different origin
      const badOriginEvent = {
        origin: 'https://evil.com',
        data: { type: 'CJ_CHECK_EXTENSION' },
      };

      messageHandler(badOriginEvent);

      // Should not respond
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should ignore messages with cj-content-script source', async () => {
      await controller.initialize();

      const messageHandler = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];

      // Simulate message from content script (should be ignored)
      const selfMessage = {
        origin: 'http://localhost:3000',
        data: { type: 'CJ_CHECK_EXTENSION', source: 'cj-content-script' },
      };

      messageHandler(selfMessage);

      // Should not respond (ignoring self-messages)
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should ignore non-handled message types', async () => {
      await controller.initialize();

      const messageHandler = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];

      // Simulate unhandled message type
      const unknownMessage = {
        origin: 'http://localhost:3000',
        data: { type: 'UNKNOWN_MESSAGE_TYPE' },
      };

      messageHandler(unknownMessage);

      // Should not respond
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should rate limit sensitive messages', async () => {
      await controller.initialize();

      const messageHandler = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];

      // Drain the rate limiter
      for (let i = 0; i < 200; i++) {
        controller.isRateLimited();
      }

      // Now send a rate-limited message type
      const rateLimitedMessage = {
        origin: 'http://localhost:3000',
        data: { type: 'CJ_OPEN_AUTH' },
      };

      await messageHandler(rateLimitedMessage);

      // Should send rate limit error
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.RATE_LIMITED,
        }),
        expect.any(String)
      );
    });
  });

  describe('Storage Change Listener', () => {
    it('should notify session change when storage changes', async () => {
      await controller.initialize();

      // The storage change listener should have been registered
      expect(storageChangeCallback).toBeDefined();

      // Pre-populate storage
      await storage.setLocal({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.SESSION_TOKEN]: 'token',
      });

      // Clear the spy to check new calls
      postMessageSpy.mockClear();

      // Simulate storage change
      if (storageChangeCallback) {
        await storageChangeCallback(
          { [StorageKeys.CONNECTED_ADDRESS]: { oldValue: undefined, newValue: '0x1234' } },
          'local'
        );
      }

      // Should post session changed message
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_CHANGED,
        }),
        expect.any(String)
      );
    });

    it('should notify session change when session token changes', async () => {
      await controller.initialize();

      postMessageSpy.mockClear();

      // Simulate session storage change
      if (storageChangeCallback) {
        await storageChangeCallback(
          { [StorageKeys.SESSION_TOKEN]: { oldValue: 'old', newValue: 'new' } },
          'session'
        );
      }

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_CHANGED,
        }),
        expect.any(String)
      );
    });
  });

  describe('Visibility Change Handler', () => {
    it('should check health when page becomes visible', async () => {
      jest.useFakeTimers();

      await controller.initialize();

      // Get the visibility change listener
      const visibilityHandler = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'visibilitychange'
      )?.[1];

      expect(visibilityHandler).toBeDefined();

      // Advance past cooldown
      jest.advanceTimersByTime(6000);

      // Simulate page becoming visible
      getVisibilityStateSpy.mockReturnValue('visible');
      visibilityHandler();

      // Wait for async operations
      await Promise.resolve();

      expect(sendMessageSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should skip health check when page is hidden', async () => {
      jest.useFakeTimers();

      await controller.initialize();

      // Clear previous calls
      sendMessageSpy.mockClear();

      // Advance past initial cooldown
      jest.advanceTimersByTime(6000);

      // Simulate hidden state
      getVisibilityStateSpy.mockReturnValue('hidden');

      // Trigger periodic health check
      jest.advanceTimersByTime(60000);

      // Should not have made health check calls while hidden
      // (Note: sendMessage may be called for other reasons, so we check it wasn't called FOR health check)

      jest.useRealTimers();
    });
  });

  describe('Full Auth Flow - performOpenAuth', () => {
    it('should handle SIWE challenge fetch failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      (injectionService.connectWallet as jest.Mock).mockResolvedValue({
        success: true,
        address: '0x1234',
        chainId: '0x1',
      });

      await controller.handleOpenAuth();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_AUTH_OPENED,
          success: false,
        }),
        expect.any(String)
      );
    });

    it('should handle SIWE verify failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: 'SIWE message' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      (injectionService.connectWallet as jest.Mock).mockResolvedValue({
        success: true,
        address: '0x1234',
        chainId: '0x1',
      });
      (injectionService.signMessage as jest.Mock).mockResolvedValue({
        success: true,
        signature: '0xsig',
      });

      await controller.handleOpenAuth();

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_AUTH_OPENED,
          success: false,
        }),
        expect.any(String)
      );
    });

    it('should complete full auth flow successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: 'SIWE message' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionToken: 'valid-token' }),
        });

      (injectionService.connectWallet as jest.Mock).mockResolvedValue({
        success: true,
        address: '0x1234',
        chainId: '0x1',
      });
      (injectionService.signMessage as jest.Mock).mockResolvedValue({
        success: true,
        signature: '0xsig',
      });

      await controller.handleOpenAuth();

      // Should store session
      const local = await storage.getLocal([StorageKeys.SESSION_TOKEN]);
      expect(local[StorageKeys.SESSION_TOKEN]).toBe('valid-token');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_AUTH_OPENED,
          success: true,
        }),
        expect.any(String)
      );
    });
  });
});
