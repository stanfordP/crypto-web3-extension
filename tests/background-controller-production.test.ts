/**
 * BackgroundController Production Tests
 * 
 * Tests the actual BackgroundController class with proper mock adapters.
 * Focuses on message handling, origin validation, and edge cases.
 * 
 * @module tests/background-controller-production
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BackgroundController } from '../src/scripts/ui/background/BackgroundController';
import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter, RuntimeMessageSender } from '../src/scripts/adapters/types';
import { StorageKeys, MessageType } from '../src/scripts/types';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockStorageAdapter(): jest.Mocked<IStorageAdapter> {
  const localStore: Record<string, unknown> = {};
  const sessionStore: Record<string, unknown> = {};

  return {
    getLocal: jest.fn().mockImplementation(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (localStore[key] !== undefined) result[key] = localStore[key];
      }
      return result;
    }),
    setLocal: jest.fn().mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(localStore, items);
    }),
    removeLocal: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockImplementation(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (sessionStore[key] !== undefined) result[key] = sessionStore[key];
      }
      return result;
    }),
    setSession: jest.fn().mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(sessionStore, items);
    }),
    removeSession: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockImplementation(async (area: string) => {
      if (area === 'local') Object.keys(localStore).forEach(k => delete localStore[k]);
      if (area === 'session') Object.keys(sessionStore).forEach(k => delete sessionStore[k]);
    }),
    setSessionAccessLevel: jest.fn().mockResolvedValue(undefined),
    onStorageChanged: jest.fn(),
    offStorageChanged: jest.fn(),
    // Expose stores for test verification
    _localStore: localStore,
    _sessionStore: sessionStore,
  } as unknown as jest.Mocked<IStorageAdapter>;
}

function createMockRuntimeAdapter(): jest.Mocked<IRuntimeAdapter> & {
  _messageListeners: Array<(message: unknown, sender: RuntimeMessageSender, sendResponse: (r: unknown) => void) => boolean>;
  _triggerMessage: (message: unknown, sender: RuntimeMessageSender) => Promise<unknown>;
} {
  const listeners: Array<(message: unknown, sender: RuntimeMessageSender, sendResponse: (r: unknown) => void) => boolean> = [];

  const adapter = {
    id: 'test-extension-id',
    lastError: null,
    sendMessage: jest.fn().mockResolvedValue({}),
    addMessageListener: jest.fn().mockImplementation((listener) => {
      listeners.push(listener);
    }),
    removeMessageListener: jest.fn().mockImplementation((listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    }),
    getURL: jest.fn().mockImplementation((path: string) => `chrome-extension://test-extension-id/${path}`),
    getManifest: jest.fn().mockReturnValue({ version: '2.2.4' }),
    connect: jest.fn(),
    onConnect: jest.fn(),
    offConnect: jest.fn(),
    _messageListeners: listeners,
    _triggerMessage: async (message: unknown, sender: RuntimeMessageSender): Promise<unknown> => {
      return new Promise((resolve) => {
        for (const listener of listeners) {
          const handled = listener(message, sender, (response) => {
            resolve(response);
          });
          if (handled) return;
        }
        resolve(undefined);
      });
    },
  };

  return adapter as unknown as jest.Mocked<IRuntimeAdapter> & {
    _messageListeners: typeof listeners;
    _triggerMessage: typeof adapter._triggerMessage;
  };
}

function createMockTabsAdapter(): jest.Mocked<ITabsAdapter> {
  const tabs: Array<{ id: number; url?: string; windowId?: number }> = [];
  let nextTabId = 1;

  return {
    query: jest.fn().mockImplementation(async () => [...tabs]),
    sendMessage: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation(async (options) => {
      const tab = { id: nextTabId++, url: options?.url, windowId: 1 };
      tabs.push(tab);
      return tab;
    }),
    get: jest.fn().mockImplementation(async (tabId: number) => {
      return tabs.find(t => t.id === tabId) || null;
    }),
    update: jest.fn().mockResolvedValue({}),
    getCurrent: jest.fn().mockResolvedValue(null),
    focusWindow: jest.fn().mockResolvedValue(undefined),
    addTabListener: jest.fn(),
    removeTabListener: jest.fn(),
  } as unknown as jest.Mocked<ITabsAdapter>;
}

function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createMockApiClient() {
  return {
    validateSession: jest.fn().mockResolvedValue({ valid: true }),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('BackgroundController - Message Handling', () => {
  let controller: BackgroundController;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let runtime: ReturnType<typeof createMockRuntimeAdapter>;
  let tabs: ReturnType<typeof createMockTabsAdapter>;
  let logger: ReturnType<typeof createMockLogger>;
  let apiClient: ReturnType<typeof createMockApiClient>;

  const extensionSender: RuntimeMessageSender = {
    id: 'test-extension-id',
  };

  const contentScriptSender: RuntimeMessageSender = {
    id: 'test-extension-id',
    tab: { id: 1, url: 'http://localhost:3000/dashboard' },
  };

  const unauthorizedSender: RuntimeMessageSender = {
    id: 'unknown-extension',
    tab: { id: 2, url: 'https://malicious.com/phishing' },
  };

  beforeEach(async () => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();
    logger = createMockLogger();
    apiClient = createMockApiClient();

    controller = new BackgroundController({
      storageAdapter: storage as unknown as IStorageAdapter,
      runtimeAdapter: runtime as unknown as IRuntimeAdapter,
      tabsAdapter: tabs as unknown as ITabsAdapter,
      alarmsAdapter: {},
      allowedOrigins: ['http://localhost:3000', 'https://cryptotradingjournal.xyz'],
      apiClient,
      logger: logger as any,
    });

    await controller.initialize();
  });

  afterEach(() => {
    controller.cleanup();
    jest.clearAllMocks();
  });

  describe('PING handling', () => {
    it('should respond to PING immediately with pong and ready state', async () => {
      const response = await runtime._triggerMessage(
        { type: 'PING', requestId: 'ping-123' },
        extensionSender
      );

      expect(response).toEqual({
        success: true,
        data: expect.objectContaining({
          pong: true,
          ready: true,
          timestamp: expect.any(Number),
        }),
        requestId: 'ping-123',
      });
    });

    it('should respond to PING even from unauthorized senders', async () => {
      const response = await runtime._triggerMessage(
        { type: 'PING', requestId: 'ping-456' },
        unauthorizedSender
      );

      expect(response).toMatchObject({
        success: true,
        data: { pong: true },
      });
    });
  });

  describe('OPEN_AUTH_TAB handling', () => {
    it('should open auth tab and return tab ID', async () => {
      const response = await runtime._triggerMessage(
        { type: 'OPEN_AUTH_TAB', requestId: 'auth-123' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: true,
        tabId: expect.any(Number),
      });
      expect(tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test-extension-id/auth.html',
        active: true,
      });
    });

    it('should handle auth tab open error', async () => {
      tabs.create.mockRejectedValueOnce(new Error('Tab creation failed'));

      const response = await runtime._triggerMessage(
        { type: 'OPEN_AUTH_TAB', requestId: 'auth-err' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: false,
        error: 'Tab creation failed',
      });
    });
  });

  describe('AUTH_SUCCESS handling', () => {
    it('should handle auth success notification', async () => {
      const response = await runtime._triggerMessage(
        { type: 'AUTH_SUCCESS', requestId: 'success-123' },
        extensionSender
      );

      expect(response).toEqual({ success: true });
    });
  });

  describe('GET_SESSION handling', () => {
    it('should return session data when available', async () => {
      // Set up session data
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'test-token-123' });
      await storage.setLocal({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890abcdef',
        [StorageKeys.CHAIN_ID]: '0x89',
        [StorageKeys.ACCOUNT_MODE]: 'demo',
      });

      const response = await runtime._triggerMessage(
        { type: 'GET_SESSION', requestId: 'session-123' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: true,
        data: {
          sessionToken: 'test-token-123',
          connectedAddress: '0x1234567890abcdef',
          chainId: '0x89',
          accountMode: 'demo',
        },
        requestId: 'session-123',
      });
    });

    it('should return null when no session exists', async () => {
      const response = await runtime._triggerMessage(
        { type: 'GET_SESSION', requestId: 'session-empty' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: true,
        data: null,
        requestId: 'session-empty',
      });
    });

    it('should accept GET_SESSION from allowed content script origins', async () => {
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token' });
      await storage.setLocal({ [StorageKeys.CONNECTED_ADDRESS]: '0xabc' });

      const response = await runtime._triggerMessage(
        { type: 'GET_SESSION', requestId: 'cs-session' },
        contentScriptSender
      );

      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          sessionToken: 'token',
        }),
      });
    });

    it('should reject GET_SESSION from unauthorized origins', async () => {
      const response = await runtime._triggerMessage(
        { type: 'GET_SESSION', requestId: 'unauth-session' },
        unauthorizedSender
      );

      expect(response).toMatchObject({
        success: false,
        error: 'Unauthorized sender',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Rejected message from unauthorized sender',
        expect.objectContaining({ type: 'GET_SESSION' })
      );
    });
  });

  describe('DISCONNECT handling', () => {
    it('should disconnect and clear storage', async () => {
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token-to-clear' });
      await storage.setLocal({ [StorageKeys.CONNECTED_ADDRESS]: '0xabc' });

      const response = await runtime._triggerMessage(
        { type: 'DISCONNECT', requestId: 'disconnect-123' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: true,
        data: { success: true },
        requestId: 'disconnect-123',
      });
      expect(apiClient.disconnect).toHaveBeenCalledWith('token-to-clear');
      expect(storage.clear).toHaveBeenCalledWith('session');
      expect(storage.clear).toHaveBeenCalledWith('local');
    });

    it('should handle DISCONNECT with MessageType enum', async () => {
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token' });

      const response = await runtime._triggerMessage(
        { type: MessageType.DISCONNECT, requestId: 'disconnect-enum' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: true,
        data: { success: true },
      });
    });
  });

  describe('Unknown message handling', () => {
    it('should return error for unknown message types', async () => {
      const response = await runtime._triggerMessage(
        { type: 'UNKNOWN_TYPE', requestId: 'unknown-123' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: false,
        error: 'Unknown message type: UNKNOWN_TYPE',
        requestId: 'unknown-123',
      });
    });
  });

  describe('Message error handling', () => {
    it('should handle async errors gracefully', async () => {
      // Make getSession throw an error
      storage.getSession.mockRejectedValueOnce(new Error('Storage read failed'));

      const response = await runtime._triggerMessage(
        { type: 'GET_SESSION', requestId: 'error-123' },
        extensionSender
      );

      expect(response).toMatchObject({
        success: false,
        error: 'Storage read failed',
        requestId: 'error-123',
      });
    });
  });
});

describe('BackgroundController - Origin Validation', () => {
  let controller: BackgroundController;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let runtime: ReturnType<typeof createMockRuntimeAdapter>;
  let tabs: ReturnType<typeof createMockTabsAdapter>;

  beforeEach(async () => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();

    controller = new BackgroundController({
      storageAdapter: storage as unknown as IStorageAdapter,
      runtimeAdapter: runtime as unknown as IRuntimeAdapter,
      tabsAdapter: tabs as unknown as ITabsAdapter,
      alarmsAdapter: {},
      allowedOrigins: ['http://localhost:*', 'https://cryptotradingjournal.xyz/*'],
      logger: createMockLogger() as any,
    });

    await controller.initialize();
  });

  afterEach(() => {
    controller.cleanup();
  });

  it('should validate extension page URLs', () => {
    const sender: RuntimeMessageSender = {
      id: 'test-extension-id',
      url: 'chrome-extension://test-extension-id/popup.html',
    };

    expect(controller.validateSenderOrigin(sender)).toBe(true);
  });

  it('should validate localhost with correct port', () => {
    const sender: RuntimeMessageSender = {
      id: 'other',
      tab: { id: 1, url: 'http://localhost:3000/app' },
    };

    expect(controller.validateSenderOrigin(sender)).toBe(true);
  });

  it('should validate any localhost port when wildcard configured', () => {
    // The origin validation tests use 'http://localhost:*' which allows any port
    const sender: RuntimeMessageSender = {
      id: 'other',
      tab: { id: 1, url: 'http://localhost:5173/app' },
    };

    expect(controller.validateSenderOrigin(sender)).toBe(true);
  });

  it('should validate production domain with wildcard path', () => {
    const sender: RuntimeMessageSender = {
      id: 'other',
      tab: { id: 1, url: 'https://cryptotradingjournal.xyz/trades/123' },
    };

    expect(controller.validateSenderOrigin(sender)).toBe(true);
  });

  it('should reject subdomain attacks', () => {
    const sender: RuntimeMessageSender = {
      id: 'other',
      tab: { id: 1, url: 'https://malicious.cryptotradingjournal.xyz/phishing' },
    };

    expect(controller.validateSenderOrigin(sender)).toBe(false);
  });

  // SECURITY FIX: Now uses exact origin matching instead of startsWith
  // This prevents domain suffix attacks like cryptotradingjournal.xyz.evil.com
  it('should reject similar domain attacks (SECURITY FIX)', () => {
    const sender: RuntimeMessageSender = {
      id: 'other',
      tab: { id: 1, url: 'https://cryptotradingjournal.xyz.evil.com/fake' },
    };

    // FIXED: Exact origin matching rejects this attack
    expect(controller.validateSenderOrigin(sender)).toBe(false);
  });

  it('should reject messages with missing tab ID', () => {
    const sender: RuntimeMessageSender = {
      id: 'other',
      // No tab
    };

    expect(controller.validateSenderOrigin(sender)).toBe(false);
  });
});

describe('BackgroundController - Tab Notification', () => {
  let controller: BackgroundController;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let runtime: ReturnType<typeof createMockRuntimeAdapter>;
  let tabs: ReturnType<typeof createMockTabsAdapter>;
  let apiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(async () => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();
    apiClient = createMockApiClient();

    controller = new BackgroundController({
      storageAdapter: storage as unknown as IStorageAdapter,
      runtimeAdapter: runtime as unknown as IRuntimeAdapter,
      tabsAdapter: tabs as unknown as ITabsAdapter,
      alarmsAdapter: {},
      allowedOrigins: ['http://localhost:3000'],
      apiClient,
      logger: createMockLogger() as any,
    });

    await controller.initialize();
  });

  afterEach(() => {
    controller.cleanup();
  });

  it('should notify all tabs on disconnect', async () => {
    // Set up session
    await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token' });

    // Add some tabs to query
    tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'http://localhost:3000/app' },
      { id: 2, url: 'http://localhost:3000/trades' },
      { id: 3, url: 'https://other-site.com' },
    ]);

    await controller.disconnect();

    expect(tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'DISCONNECT_EVENT' });
    expect(tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'DISCONNECT_EVENT' });
    expect(tabs.sendMessage).toHaveBeenCalledWith(3, { type: 'DISCONNECT_EVENT' });
  });

  it('should handle tab notification errors gracefully', async () => {
    await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token' });

    tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'http://localhost:3000/app' },
    ]);
    tabs.sendMessage.mockRejectedValueOnce(new Error('Tab not found'));

    // Should not throw
    await expect(controller.disconnect()).resolves.not.toThrow();
  });

  it('should handle query error during disconnect notification', async () => {
    await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token' });

    tabs.query.mockRejectedValueOnce(new Error('Query failed'));

    // Should not throw
    await expect(controller.disconnect()).resolves.not.toThrow();
  });
});

describe('BackgroundController - Auth Tab Management', () => {
  let controller: BackgroundController;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let runtime: ReturnType<typeof createMockRuntimeAdapter>;
  let tabs: ReturnType<typeof createMockTabsAdapter>;

  beforeEach(async () => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();

    controller = new BackgroundController({
      storageAdapter: storage as unknown as IStorageAdapter,
      runtimeAdapter: runtime as unknown as IRuntimeAdapter,
      tabsAdapter: tabs as unknown as ITabsAdapter,
      alarmsAdapter: {},
      allowedOrigins: [],
      logger: createMockLogger() as any,
    });

    await controller.initialize();
  });

  afterEach(() => {
    controller.cleanup();
  });

  it('should focus existing auth tab instead of creating new one', async () => {
    // First call creates tab
    const firstResult = await controller.openAuthTab();
    expect(firstResult.success).toBe(true);
    const firstTabId = firstResult.tabId;

    // Set up mock to return the existing tab
    tabs.get.mockResolvedValueOnce({ id: firstTabId, windowId: 1 });

    // Second call should focus existing
    const secondResult = await controller.openAuthTab();
    
    expect(secondResult.success).toBe(true);
    expect(secondResult.tabId).toBe(firstTabId);
    expect(tabs.update).toHaveBeenCalledWith(firstTabId, { active: true });
    expect(tabs.focusWindow).toHaveBeenCalledWith(1);
  });

  it('should create new tab if existing tab is closed', async () => {
    // First call creates tab
    const firstResult = await controller.openAuthTab();
    expect(firstResult.success).toBe(true);

    // Simulate tab being closed - get returns null
    tabs.get.mockRejectedValueOnce(new Error('Tab not found'));

    // Second call should create new tab
    const secondResult = await controller.openAuthTab();
    
    expect(secondResult.success).toBe(true);
    expect(tabs.create).toHaveBeenCalledTimes(2);
  });

  it('should track tab removal via listener', async () => {
    const result = await controller.openAuthTab();
    expect(result.success).toBe(true);

    // Verify listener was added
    expect(tabs.addTabListener).toHaveBeenCalledWith('onRemoved', expect.any(Function));
  });

  it('should return error when tab creation fails without ID', async () => {
    tabs.create.mockResolvedValueOnce({ url: 'chrome-extension://test/auth.html' }); // No ID

    const result = await controller.openAuthTab();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to create auth tab');
  });
});

describe('BackgroundController - Lifecycle Events', () => {
  let controller: BackgroundController;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let runtime: ReturnType<typeof createMockRuntimeAdapter>;
  let tabs: ReturnType<typeof createMockTabsAdapter>;
  let logger: ReturnType<typeof createMockLogger>;
  let apiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();
    logger = createMockLogger();
    apiClient = createMockApiClient();

    controller = new BackgroundController({
      storageAdapter: storage as unknown as IStorageAdapter,
      runtimeAdapter: runtime as unknown as IRuntimeAdapter,
      tabsAdapter: tabs as unknown as ITabsAdapter,
      alarmsAdapter: {},
      allowedOrigins: [],
      apiClient,
      logger: logger as any,
    });
  });

  afterEach(() => {
    controller.cleanup();
  });

  describe('handleStartup', () => {
    it('should clear storage when session is invalid', async () => {
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'invalid-token' });
      apiClient.validateSession.mockResolvedValueOnce({ valid: false });

      await controller.handleStartup();

      expect(storage.clear).toHaveBeenCalledWith('session');
      expect(storage.clear).toHaveBeenCalledWith('local');
      expect(logger.debug).toHaveBeenCalledWith('Cleared stale session data');
    });

    it('should preserve storage when session is valid', async () => {
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'valid-token' });
      apiClient.validateSession.mockResolvedValueOnce({ valid: true });

      await controller.handleStartup();

      expect(storage.clear).not.toHaveBeenCalled();
    });

    it('should clear storage when validation throws', async () => {
      await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'error-token' });
      apiClient.validateSession.mockRejectedValueOnce(new Error('API error'));

      await controller.handleStartup();

      expect(storage.clear).toHaveBeenCalled();
    });
  });

  describe('handleInstalled', () => {
    it('should log fresh install', async () => {
      await controller.handleInstalled({ reason: 'install' });

      expect(logger.info).toHaveBeenCalledWith('Extension installed');
    });

    it('should log update with version', async () => {
      await controller.handleInstalled({ reason: 'update', previousVersion: '2.2.3' });

      expect(logger.info).toHaveBeenCalledWith('Extension updated', { previousVersion: '2.2.3' });
    });

    it('should not log for other reasons', async () => {
      await controller.handleInstalled({ reason: 'chrome_update' });

      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});

describe('BackgroundController - No API Client', () => {
  let controller: BackgroundController;
  let storage: ReturnType<typeof createMockStorageAdapter>;
  let runtime: ReturnType<typeof createMockRuntimeAdapter>;
  let tabs: ReturnType<typeof createMockTabsAdapter>;

  beforeEach(async () => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();

    // Create without API client
    controller = new BackgroundController({
      storageAdapter: storage as unknown as IStorageAdapter,
      runtimeAdapter: runtime as unknown as IRuntimeAdapter,
      tabsAdapter: tabs as unknown as ITabsAdapter,
      alarmsAdapter: {},
      allowedOrigins: [],
      logger: createMockLogger() as any,
      // No apiClient!
    });

    await controller.initialize();
  });

  afterEach(() => {
    controller.cleanup();
  });

  it('should assume session valid when no API client', async () => {
    await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'local-token' });

    const hasSession = await controller.hasActiveSession();

    expect(hasSession).toBe(true);
  });

  it('should disconnect without API call', async () => {
    await storage.setSession({ [StorageKeys.SESSION_TOKEN]: 'token' });
    await storage.setLocal({ [StorageKeys.CONNECTED_ADDRESS]: '0xabc' });

    await controller.disconnect();

    expect(storage.clear).toHaveBeenCalledWith('session');
    expect(storage.clear).toHaveBeenCalledWith('local');
  });
});
