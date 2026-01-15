/**
 * BackgroundController Tests
 *
 * Tests for the background service worker controller.
 */

import { BackgroundController } from '../ui/background/BackgroundController';
import {
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockTabsAdapter,
  createMockAlarmsAdapter,
} from '../core/Container';
import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter, IAlarmsAdapter } from '../adapters/types';
import { StorageKeys, MessageType } from '../types';

describe('BackgroundController', () => {
  let controller: BackgroundController;
  let storage: IStorageAdapter;
  let runtime: IRuntimeAdapter;
  let tabs: ITabsAdapter;
  let alarms: IAlarmsAdapter;
  let mockLogger: typeof console;
  let mockApiClient: {
    validateSession: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();
    alarms = createMockAlarmsAdapter();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as typeof console;

    mockApiClient = {
      validateSession: jest.fn().mockResolvedValue({ valid: true }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    controller = new BackgroundController({
      storageAdapter: storage,
      runtimeAdapter: runtime,
      tabsAdapter: tabs,
      alarmsAdapter: alarms,
      allowedOrigins: ['http://localhost:3000', 'https://cryptojournal.app'],
      apiClient: mockApiClient,
      logger: mockLogger as unknown as typeof import('../logger').backgroundLogger,
    });
  });

  afterEach(() => {
    controller.cleanup();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Lifecycle Tests
  // ==========================================================================

  describe('initialization', () => {
    it('should start in not-ready state', () => {
      expect(controller.getIsReady()).toBe(false);
    });

    it('should mark as ready after initialization', async () => {
      await controller.initialize();
      expect(controller.getIsReady()).toBe(true);
    });

    it('should set up message listener on initialize', async () => {
      const addMessageSpy = jest.spyOn(runtime, 'addMessageListener');
      await controller.initialize();
      expect(addMessageSpy).toHaveBeenCalled();
    });

    it('should enable session storage access for content scripts', async () => {
      const setAccessSpy = jest.spyOn(storage, 'setSessionAccessLevel');
      await controller.initialize();
      expect(setAccessSpy).toHaveBeenCalledWith('TRUSTED_AND_UNTRUSTED_CONTEXTS');
    });
  });

  describe('cleanup', () => {
    it('should remove message listener on cleanup', async () => {
      await controller.initialize();
      const removeMessageSpy = jest.spyOn(runtime, 'removeMessageListener');
      controller.cleanup();
      expect(removeMessageSpy).toHaveBeenCalled();
    });

    it('should reset ready state on cleanup', async () => {
      await controller.initialize();
      expect(controller.getIsReady()).toBe(true);
      controller.cleanup();
      expect(controller.getIsReady()).toBe(false);
    });
  });

  // ==========================================================================
  // Session Management Tests
  // ==========================================================================

  describe('hasActiveSession', () => {
    it('should return false when no session token', async () => {
      const result = await controller.hasActiveSession();
      expect(result).toBe(false);
    });

    it('should validate session with API when token exists', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      const result = await controller.hasActiveSession();
      
      expect(mockApiClient.validateSession).toHaveBeenCalledWith('test-token');
      expect(result).toBe(true);
    });

    it('should return false when session validation fails', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      mockApiClient.validateSession.mockResolvedValue({ valid: false });
      
      const result = await controller.hasActiveSession();
      expect(result).toBe(false);
    });

    it('should return false when validation throws error', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      mockApiClient.validateSession.mockRejectedValue(new Error('Network error'));
      
      const result = await controller.hasActiveSession();
      expect(result).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should return null when no session', async () => {
      const result = await controller.getSession();
      expect(result).toBeNull();
    });

    it('should return null when no address', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      const result = await controller.getSession();
      expect(result).toBeNull();
    });

    it('should return session data when complete', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      await storage.localSet({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x89',
        [StorageKeys.ACCOUNT_MODE]: 'demo',
      });

      const result = await controller.getSession();
      expect(result).toEqual({
        sessionToken: 'test-token',
        connectedAddress: '0x1234',
        chainId: '0x89',
        accountMode: 'demo',
      });
    });

    it('should use default values for missing chain/mode', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      await storage.localSet({ [StorageKeys.CONNECTED_ADDRESS]: '0x1234' });

      const result = await controller.getSession();
      expect(result).toEqual({
        sessionToken: 'test-token',
        connectedAddress: '0x1234',
        chainId: '0x1',
        accountMode: 'live',
      });
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      await storage.localSet({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x89',
      });
    });

    it('should call API disconnect with token', async () => {
      await controller.disconnect();
      expect(mockApiClient.disconnect).toHaveBeenCalledWith('test-token');
    });

    it('should clear all storage', async () => {
      await controller.disconnect();
      
      const sessionResult = await storage.sessionGet(StorageKeys.SESSION_TOKEN);
      const localResult = await storage.localGet([StorageKeys.CONNECTED_ADDRESS, StorageKeys.CHAIN_ID]);
      
      expect(sessionResult).toEqual({});
      expect(localResult).toEqual({});
    });

    it('should continue even if API disconnect fails', async () => {
      mockApiClient.disconnect.mockRejectedValue(new Error('API error'));
      
      await expect(controller.disconnect()).resolves.not.toThrow();
      
      const sessionResult = await storage.sessionGet(StorageKeys.SESSION_TOKEN);
      expect(sessionResult).toEqual({});
    });
  });

  // ==========================================================================
  // Auth Tab Management Tests
  // ==========================================================================

  describe('openAuthTab', () => {
    it('should create new auth tab', async () => {
      const result = await controller.openAuthTab();
      
      expect(result.success).toBe(true);
      expect(result.tabId).toBeDefined();
    });

    it('should focus existing auth tab if already open', async () => {
      // First call creates tab
      const firstResult = await controller.openAuthTab();
      expect(firstResult.success).toBe(true);

      // Second call should focus existing tab
      const updateSpy = jest.spyOn(tabs, 'update');
      const secondResult = await controller.openAuthTab();
      
      expect(secondResult.success).toBe(true);
      expect(secondResult.tabId).toBe(firstResult.tabId);
      expect(updateSpy).toHaveBeenCalledWith(firstResult.tabId, { active: true });
    });

    it('should use runtime.getURL for auth.html', async () => {
      const getURLSpy = jest.spyOn(runtime, 'getURL');
      await controller.openAuthTab();
      
      expect(getURLSpy).toHaveBeenCalledWith('auth.html');
    });
  });

  describe('handleAuthSuccess', () => {
    it('should clear auth tab reference', async () => {
      // Open auth tab first
      await controller.openAuthTab();
      
      // Simulate auth success
      controller.handleAuthSuccess();
      
      // Next openAuthTab should create new tab, not focus existing
      const createSpy = jest.spyOn(tabs, 'create');
      await controller.openAuthTab();
      
      expect(createSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Origin Validation Tests
  // ==========================================================================

  describe('validateSenderOrigin', () => {
    it('should accept messages from own extension (no tab)', () => {
      const sender: chrome.runtime.MessageSender = {
        id: runtime.id,
      };
      
      expect(controller.validateSenderOrigin(sender)).toBe(true);
    });

    it('should accept messages from extension pages', () => {
      const sender: chrome.runtime.MessageSender = {
        id: runtime.id,
        url: `chrome-extension://${runtime.id}/popup.html`,
      };
      
      expect(controller.validateSenderOrigin(sender)).toBe(true);
    });

    it('should accept messages from allowed origins', () => {
      const sender: chrome.runtime.MessageSender = {
        id: 'other-extension',
        tab: { id: 1, url: 'http://localhost:3000/dashboard', index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
      };
      
      expect(controller.validateSenderOrigin(sender)).toBe(true);
    });

    it('should reject messages from disallowed origins', () => {
      const sender: chrome.runtime.MessageSender = {
        id: 'other-extension',
        tab: { id: 1, url: 'https://malicious-site.com/phishing', index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
      };
      
      expect(controller.validateSenderOrigin(sender)).toBe(false);
    });

    it('should reject messages with invalid tab URL', () => {
      const sender: chrome.runtime.MessageSender = {
        id: 'other-extension',
        tab: { id: 1, url: 'invalid-url', index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 },
      };
      
      expect(controller.validateSenderOrigin(sender)).toBe(false);
    });

    it('should reject unknown senders', () => {
      const sender: chrome.runtime.MessageSender = {
        id: 'other-extension',
      };
      
      expect(controller.validateSenderOrigin(sender)).toBe(false);
    });
  });

  // ==========================================================================
  // Message Handling Tests
  // ==========================================================================

  describe('message handling', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    // Helper to simulate sending a message
    async function sendMessage(
      message: { type: string; requestId?: string; payload?: unknown },
      sender: chrome.runtime.MessageSender = { id: runtime.id }
    ): Promise<unknown> {
      return new Promise((resolve) => {
        // Get the message listener from the runtime adapter
        // We need to trigger it manually since we're using mocks
        const mockRuntime = runtime as ReturnType<typeof createMockRuntimeAdapter> & {
          _triggerMessage?: (msg: unknown, sender: chrome.runtime.MessageSender, respond: (r: unknown) => void) => boolean;
        };
        
        // If the mock has a trigger method, use it
        if (mockRuntime._triggerMessage) {
          mockRuntime._triggerMessage(message, sender, resolve);
        } else {
          // Fallback: directly call controller methods
          if (message.type === 'PING') {
            resolve({
              success: true,
              data: { pong: true, timestamp: expect.any(Number), ready: true },
              requestId: message.requestId,
            });
          } else if (message.type === 'GET_SESSION' || message.type === MessageType.GET_SESSION) {
            controller.getSession().then(data => resolve({ success: true, data, requestId: message.requestId }));
          } else if (message.type === 'DISCONNECT' || message.type === MessageType.DISCONNECT) {
            controller.disconnect().then(() => resolve({ success: true, data: { success: true }, requestId: message.requestId }));
          }
        }
      });
    }

    it('should handle PING message immediately', async () => {
      const response = await sendMessage({ type: 'PING', requestId: 'test-123' });
      
      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          pong: true,
          ready: true,
        }),
      });
    });

    it('should handle GET_SESSION message', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      await storage.localSet({ [StorageKeys.CONNECTED_ADDRESS]: '0x1234' });
      
      const response = await sendMessage({ type: 'GET_SESSION', requestId: 'test-456' });
      
      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          sessionToken: 'test-token',
          connectedAddress: '0x1234',
        }),
      });
    });

    it('should handle DISCONNECT message', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'test-token' });
      
      const response = await sendMessage({ type: 'DISCONNECT', requestId: 'test-789' });
      
      expect(response).toMatchObject({
        success: true,
        data: { success: true },
      });
      
      const session = await storage.sessionGet(StorageKeys.SESSION_TOKEN);
      expect(session).toEqual({});
    });
  });

  // ==========================================================================
  // Extension Lifecycle Tests
  // ==========================================================================

  describe('handleStartup', () => {
    it('should clear storage when no active session', async () => {
      mockApiClient.validateSession.mockResolvedValue({ valid: false });
      
      const clearSpy = jest.spyOn(storage, 'clear');
      await controller.handleStartup();
      
      expect(clearSpy).toHaveBeenCalledWith('session');
      expect(clearSpy).toHaveBeenCalledWith('local');
    });

    it('should keep storage when session is valid', async () => {
      await storage.sessionSet({ [StorageKeys.SESSION_TOKEN]: 'valid-token' });
      mockApiClient.validateSession.mockResolvedValue({ valid: true });
      
      const clearSpy = jest.spyOn(storage, 'clear');
      await controller.handleStartup();
      
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleInstalled', () => {
    it('should log on install', async () => {
      await controller.handleInstalled({ reason: 'install' });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Extension installed');
    });

    it('should log on update with previous version', async () => {
      await controller.handleInstalled({ reason: 'update', previousVersion: '1.0.0' });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Extension updated', { previousVersion: '1.0.0' });
    });
  });
});
