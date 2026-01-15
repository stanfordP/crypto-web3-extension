/**
 * ContentController Tests
 *
 * Tests for the content script controller that handles CJ_* message protocol.
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

describe('ContentController', () => {
  let controller: ContentController;
  let storage: IStorageAdapter;
  let runtime: IRuntimeAdapter;
  let dom: IDOMAdapter;
  let injectionService: InjectionService;
  let mockFetch: jest.Mock;
  let mockLogger: typeof console;

  beforeEach(() => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    dom = createMockDOMAdapter();
    
    // Enhanced DOM mock
    (dom.postMessage as jest.Mock) = jest.fn();
    (dom.addEventListener as jest.Mock) = jest.fn();
    (dom.removeEventListener as jest.Mock) = jest.fn();
    (dom.getOrigin as jest.Mock) = jest.fn(() => 'http://localhost:3000');
    (dom.getVisibilityState as jest.Mock) = jest.fn(() => 'visible');

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
    } as unknown as typeof console;

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
  });

  describe('initialization', () => {
    it('should initialize injection service', async () => {
      await controller.initialize();
      expect(injectionService.initialize).toHaveBeenCalled();
    });

    it('should set up message listeners', async () => {
      await controller.initialize();
      expect(dom.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should not double-initialize', async () => {
      await controller.initialize();
      await controller.initialize();
      expect(injectionService.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should remove all listeners', async () => {
      await controller.initialize();
      controller.cleanup();
      expect(dom.removeEventListener).toHaveBeenCalled();
      expect(injectionService.cleanup).toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('should not rate limit initial requests', () => {
      expect(controller.isRateLimited()).toBe(false);
    });

    it('should rate limit after many requests', () => {
      // Consume all tokens (200 - updated from 50)
      for (let i = 0; i < 200; i++) {
        controller.isRateLimited();
      }
      expect(controller.isRateLimited()).toBe(true);
    });
  });

  describe('request deduplication', () => {
    it('should track in-flight requests', async () => {
      const promise = Promise.resolve();
      controller.markRequestInFlight('test', promise);
      expect(controller.isRequestInFlight('test')).toBe(true);
    });

    it('should clear in-flight request after completion', async () => {
      let resolve: () => void;
      const promise = new Promise<void>(r => { resolve = r; });
      
      controller.markRequestInFlight('test', promise);
      expect(controller.isRequestInFlight('test')).toBe(true);
      
      resolve!();
      await promise;
      
      expect(controller.isRequestInFlight('test')).toBe(false);
    });

    it('should return in-flight promise', () => {
      const promise = new Promise<void>(() => {});
      controller.markRequestInFlight('test', promise);
      expect(controller.getInFlightPromise('test')).toBe(promise);
    });
  });

  describe('handleCheckExtension', () => {
    it('should post CJ_EXTENSION_PRESENT message', () => {
      controller.handleCheckExtension();
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        { type: PageMessageType.CJ_EXTENSION_PRESENT },
        'http://localhost:3000'
      );
    });
  });

  describe('handleGetSession', () => {
    it('should return null session when not connected', async () => {
      await controller.handleGetSession();
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_RESPONSE,
          session: null,
          hasValidToken: false,
        }),
        expect.any(String)
      );
    });

    it('should return session when connected', async () => {
      await storage.setLocal({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.SESSION_TOKEN]: 'token123',
        [StorageKeys.ACCOUNT_MODE]: 'live',
      });

      await controller.handleGetSession();
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_RESPONSE,
          hasValidToken: true,
          session: expect.objectContaining({
            address: '0x1234',
            chainId: '0x1',
            accountMode: 'live',
            isConnected: true,
          }),
        }),
        expect.any(String)
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should send disconnect message to runtime', async () => {
      const sendMessageSpy = jest.spyOn(runtime, 'sendMessage').mockResolvedValue({ success: true });
      
      await controller.handleDisconnect();
      
      expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'DISCONNECT' });
    });

    it('should post disconnect response', async () => {
      jest.spyOn(runtime, 'sendMessage').mockResolvedValue({ success: true });
      
      await controller.handleDisconnect();
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_DISCONNECT_RESPONSE,
          success: true,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleWalletConnectV2', () => {
    it('should send error if no wallet detected', async () => {
      (injectionService.checkWallet as jest.Mock).mockResolvedValue({ available: false });
      
      await controller.handleWalletConnectV2('req-123');
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.NO_WALLET,
          requestId: 'req-123',
        }),
        expect.any(String)
      );
    });

    it('should return wallet info on success', async () => {
      await controller.handleWalletConnectV2('req-123');
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_WALLET_RESULT,
          success: true,
          address: '0x1234',
          chainId: '0x1',
          requestId: 'req-123',
        }),
        expect.any(String)
      );
    });

    it('should handle user rejection', async () => {
      (injectionService.connectWallet as jest.Mock).mockResolvedValue({
        success: false,
        error: 'User rejected',
        code: 4001,
      });
      
      await controller.handleWalletConnectV2('req-123');
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.USER_REJECTED,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleWalletSignV2', () => {
    it('should sign message and return signature', async () => {
      await controller.handleWalletSignV2('Hello', '0x123', 'req-456');
      
      expect(injectionService.signMessage).toHaveBeenCalledWith('Hello', '0x123');
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SIGN_RESULT,
          success: true,
          signature: '0xsig',
          requestId: 'req-456',
        }),
        expect.any(String)
      );
    });

    it('should handle signing failure', async () => {
      (injectionService.signMessage as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Signing failed',
      });
      
      await controller.handleWalletSignV2('Hello', '0x123', 'req-456');
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_ERROR,
          code: ErrorCode.SIGNING_FAILED,
        }),
        expect.any(String)
      );
    });
  });

  describe('handleStoreSession', () => {
    it('should store session in both local and session storage', async () => {
      const session = {
        sessionToken: 'token123',
        address: '0x1234',
        chainId: '0x1',
      };
      
      await controller.handleStoreSession(session, 'req-789');
      
      // Check local storage
      const local = await storage.getLocal([
        StorageKeys.SESSION_TOKEN,
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
      ]);
      expect(local[StorageKeys.CONNECTED_ADDRESS]).toBe('0x1234');
      expect(local[StorageKeys.CHAIN_ID]).toBe('0x1');
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_STORED,
          success: true,
          requestId: 'req-789',
        }),
        expect.any(String)
      );
    });
  });

  describe('handleClearSession', () => {
    it('should clear session from storage', async () => {
      // First store a session
      await storage.setLocal({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      
      await controller.handleClearSession('req-999');
      
      const local = await storage.getLocal([StorageKeys.CONNECTED_ADDRESS]);
      expect(local[StorageKeys.CONNECTED_ADDRESS]).toBeUndefined();
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_STORED,
          success: true,
        }),
        expect.any(String)
      );
    });

    it('should emit session changed event', async () => {
      await controller.handleClearSession('req-999');
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PageMessageType.CJ_SESSION_CHANGED,
          session: null,
        }),
        expect.any(String)
      );
    });
  });

  describe('handlePopupGetSession', () => {
    it('should return session from storage', async () => {
      await storage.setLocal({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.SESSION_TOKEN]: 'token123',
      });
      
      const result = await controller.handlePopupGetSession();
      
      expect(result).toEqual({
        success: true,
        session: {
          address: '0x1234',
          chainId: '0x1',
          sessionToken: 'token123',
        },
      });
    });

    it('should return failure when no session', async () => {
      const result = await controller.handlePopupGetSession();
      expect(result).toEqual({ success: false });
    });

    it('should fallback to API when no local session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          address: '0xapi-addr',
          chainId: '0x1',
        }),
      });
      
      const result = await controller.handlePopupGetSession();
      
      expect(mockFetch).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.session?.address).toBe('0xapi-addr');
    });
  });

  describe('service worker health', () => {
    it('should check service worker health', async () => {
      const sendMessageSpy = jest.spyOn(runtime, 'sendMessage')
        .mockResolvedValue({ success: true });
      
      const result = await controller.checkServiceWorkerHealth();
      
      expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'PING' });
      expect(result).toBe(true);
    });

    it('should return false if service worker not responding', async () => {
      jest.spyOn(runtime, 'sendMessage').mockRejectedValue(new Error('No response'));
      
      const result = await controller.checkServiceWorkerHealth();
      
      expect(result).toBe(false);
    });
  });
});
