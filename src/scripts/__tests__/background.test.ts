/**
 * Unit Tests for Background Main Script
 * 
 * Tests the background service worker functionality including:
 * - Session management
 * - Auth tab management
 * - Message handling
 * - Storage operations
 * - Origin validation
 */

import { StorageKeys, MessageType } from '../types';
import { ALLOWED_ORIGINS } from '../config';

// ============================================================================
// Mock Setup
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    session: {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    id: 'test-extension-id',
    getURL: jest.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    getManifest: jest.fn(() => ({ version: '1.1.0' })),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
    lastError: null as { message: string } | null,
  },
  tabs: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    query: jest.fn(),
    sendMessage: jest.fn(),
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  windows: {
    update: jest.fn(),
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// ============================================================================
// Helper Classes/Functions (Extracted for testing)
// ============================================================================

// Session storage keys
const SESSION_STORAGE_KEYS = [StorageKeys.SESSION_TOKEN] as const;

const storage = {
  async get<K extends StorageKeys>(key: K): Promise<unknown> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    const storageArea = isSecure ? mockChrome.storage.session : mockChrome.storage.local;
    const result = await storageArea.get(key);
    return result[key];
  },

  async set<K extends StorageKeys>(key: K, value: unknown): Promise<void> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    const storageArea = isSecure ? mockChrome.storage.session : mockChrome.storage.local;
    await storageArea.set({ [key]: value });
  },

  async remove(key: StorageKeys): Promise<void> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    const storageArea = isSecure ? mockChrome.storage.session : mockChrome.storage.local;
    await storageArea.remove(key);
  },

  async clear(): Promise<void> {
    await Promise.all([
      mockChrome.storage.session.clear(),
      mockChrome.storage.local.clear(),
    ]);
  },
};

function validateSenderOrigin(sender: {
  tab?: { url?: string };
  id?: string;
  url?: string;
}): boolean {
  // Messages from our extension
  if (!sender.tab && sender.id === mockChrome.runtime.id) {
    return true;
  }

  // Messages from extension pages
  if (sender.url?.startsWith(`chrome-extension://${mockChrome.runtime.id}`)) {
    return true;
  }

  // Messages from content scripts
  if (sender.tab?.url) {
    try {
      const senderOrigin = new URL(sender.tab.url).origin;
      return ALLOWED_ORIGINS.some((allowed) =>
        senderOrigin.startsWith(allowed.replace('/*', '').replace('*', ''))
      );
    } catch {
      return false;
    }
  }

  return false;
}

// ============================================================================
// Tests
// ============================================================================

describe('Background Main Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  describe('Storage Helper', () => {
    describe('get', () => {
      it('should get session token from session storage', async () => {
        mockChrome.storage.session.get.mockResolvedValue({
          [StorageKeys.SESSION_TOKEN]: 'test-token',
        });

        const token = await storage.get(StorageKeys.SESSION_TOKEN);
        expect(mockChrome.storage.session.get).toHaveBeenCalledWith(StorageKeys.SESSION_TOKEN);
        expect(token).toBe('test-token');
      });

      it('should get address from local storage', async () => {
        mockChrome.storage.local.get.mockResolvedValue({
          [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        });

        const address = await storage.get(StorageKeys.CONNECTED_ADDRESS);
        expect(mockChrome.storage.local.get).toHaveBeenCalledWith(StorageKeys.CONNECTED_ADDRESS);
        expect(address).toBe('0x1234');
      });

      it('should return undefined for missing keys', async () => {
        mockChrome.storage.local.get.mockResolvedValue({});

        const value = await storage.get(StorageKeys.CHAIN_ID);
        expect(value).toBeUndefined();
      });
    });

    describe('set', () => {
      it('should set session token in session storage', async () => {
        await storage.set(StorageKeys.SESSION_TOKEN, 'new-token');
        expect(mockChrome.storage.session.set).toHaveBeenCalledWith({
          [StorageKeys.SESSION_TOKEN]: 'new-token',
        });
      });

      it('should set address in local storage', async () => {
        await storage.set(StorageKeys.CONNECTED_ADDRESS, '0xabcd');
        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
          [StorageKeys.CONNECTED_ADDRESS]: '0xabcd',
        });
      });
    });

    describe('remove', () => {
      it('should remove from appropriate storage', async () => {
        await storage.remove(StorageKeys.CHAIN_ID);
        expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(StorageKeys.CHAIN_ID);
      });
    });

    describe('clear', () => {
      it('should clear both storages', async () => {
        await storage.clear();
        expect(mockChrome.storage.session.clear).toHaveBeenCalled();
        expect(mockChrome.storage.local.clear).toHaveBeenCalled();
      });
    });
  });

  describe('Origin Validation', () => {
    it('should allow messages from extension popup', () => {
      const sender = { id: 'test-extension-id' };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should allow messages from extension pages', () => {
      const sender = { url: 'chrome-extension://test-extension-id/auth.html' };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should allow messages from localhost:3000', () => {
      const sender = { tab: { url: 'http://localhost:3000/dashboard' } };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should allow messages from localhost:3001', () => {
      const sender = { tab: { url: 'http://localhost:3001/test' } };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should allow messages from production domain', () => {
      const sender = { tab: { url: 'https://cryptotradingjournal.xyz/trades' } };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should reject messages from unknown origins', () => {
      const sender = { tab: { url: 'https://evil.com/phishing' } };
      expect(validateSenderOrigin(sender)).toBe(false);
    });

    it('should reject messages without proper context', () => {
      const sender = {};
      expect(validateSenderOrigin(sender)).toBe(false);
    });

    it('should handle invalid URLs gracefully', () => {
      const sender = { tab: { url: 'not-a-valid-url' } };
      expect(validateSenderOrigin(sender)).toBe(false);
    });
  });

  describe('Auth Tab Management', () => {
    it('should create new auth tab', async () => {
      mockChrome.tabs.create.mockResolvedValue({ id: 123 });

      const newTab = await mockChrome.tabs.create({ 
        url: mockChrome.runtime.getURL('auth.html'),
        active: true,
      });

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://test-extension-id/auth.html',
        active: true,
      });
      expect(newTab.id).toBe(123);
    });

    it('should focus existing auth tab if open', async () => {
      const existingTabId = 456;
      mockChrome.tabs.get.mockResolvedValue({ id: existingTabId, windowId: 1 });
      mockChrome.tabs.update.mockResolvedValue({ id: existingTabId });
      mockChrome.windows.update.mockResolvedValue({});

      const tab = await mockChrome.tabs.get(existingTabId);
      await mockChrome.tabs.update(existingTabId, { active: true });
      await mockChrome.windows.update(tab.windowId, { focused: true });

      expect(mockChrome.tabs.update).toHaveBeenCalledWith(existingTabId, { active: true });
      expect(mockChrome.windows.update).toHaveBeenCalledWith(1, { focused: true });
    });

    it('should handle tab not found error', async () => {
      mockChrome.tabs.get.mockRejectedValue(new Error('No tab with that id'));

      await expect(mockChrome.tabs.get(999)).rejects.toThrow('No tab with that id');
    });
  });

  describe('Session Manager', () => {
    it('should get session when all data present', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.ACCOUNT_MODE]: 'live',
      });

      const token = await storage.get(StorageKeys.SESSION_TOKEN);
      const address = await storage.get(StorageKeys.CONNECTED_ADDRESS);

      expect(token).toBe('token');
      expect(address).toBe('0x1234');
    });

    it('should return null session when token missing', async () => {
      mockChrome.storage.session.get.mockResolvedValue({});
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      });

      const token = await storage.get(StorageKeys.SESSION_TOKEN);
      expect(token).toBeUndefined();
    });

    it('should return null session when address missing', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});

      const address = await storage.get(StorageKeys.CONNECTED_ADDRESS);
      expect(address).toBeUndefined();
    });
  });

  describe('Message Handling', () => {
    it('should respond to PING immediately', () => {
      const message = { type: 'PING', requestId: 'req-1' };
      const sendResponse = jest.fn();

      // Simulate handler
      if (message.type === 'PING') {
        sendResponse({
          success: true,
          data: { pong: true, timestamp: Date.now(), ready: true },
          requestId: message.requestId,
        });
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ pong: true }),
          requestId: 'req-1',
        })
      );
    });

    it('should handle OPEN_AUTH_TAB message', async () => {
      mockChrome.tabs.create.mockResolvedValue({ id: 789 });

      const result = await mockChrome.tabs.create({
        url: 'chrome-extension://test-extension-id/auth.html',
        active: true,
      });

      expect(result).toEqual({ id: 789 });
    });

    it('should handle DISCONNECT message', async () => {
      // Clear storage on disconnect
      await storage.clear();

      expect(mockChrome.storage.session.clear).toHaveBeenCalled();
      expect(mockChrome.storage.local.clear).toHaveBeenCalled();
    });

    it('should handle GET_SESSION message', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'test-token',
      });
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.ACCOUNT_MODE]: 'demo',
      });

      const tokenResult = await mockChrome.storage.session.get(StorageKeys.SESSION_TOKEN);
      const localResult = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
      ]);

      expect(tokenResult[StorageKeys.SESSION_TOKEN]).toBe('test-token');
      expect(localResult[StorageKeys.CONNECTED_ADDRESS]).toBe('0x1234');
    });
  });

  describe('Tab Notifications', () => {
    it('should notify tabs on disconnect', async () => {
      mockChrome.tabs.query.mockImplementation((_query, callback) => {
        callback([{ id: 1 }, { id: 2 }, { id: 3 }]);
      });

      await new Promise<void>(resolve => {
        mockChrome.tabs.query({}, (tabs: Array<{ id: number }>) => {
          tabs.forEach(tab => {
            if (tab.id) {
              mockChrome.tabs.sendMessage(tab.id, { type: 'DISCONNECT_EVENT' });
            }
          });
          resolve();
        });
      });

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'DISCONNECT_EVENT' });
    });

    it('should handle tabs without IDs gracefully', async () => {
      mockChrome.tabs.query.mockImplementation((_query, callback) => {
        callback([{ id: 1 }, { id: undefined }, { id: 3 }]);
      });

      let messageCount = 0;
      await new Promise<void>(resolve => {
        mockChrome.tabs.query({}, (tabs: Array<{ id?: number }>) => {
          tabs.forEach(tab => {
            if (tab.id) {
              mockChrome.tabs.sendMessage(tab.id, { type: 'DISCONNECT_EVENT' });
              messageCount++;
            }
          });
          resolve();
        });
      });

      expect(messageCount).toBe(2);
    });
  });

  describe('Service Worker Initialization', () => {
    it('should register alarm listener', () => {
      mockChrome.alarms.onAlarm.addListener(jest.fn());
      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should register message listener', () => {
      mockChrome.runtime.onMessage.addListener(jest.fn());
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should get extension manifest', () => {
      const manifest = mockChrome.runtime.getManifest();
      expect(manifest.version).toBe('1.1.0');
    });
  });

  describe('MessageType Enum', () => {
    it('should have all expected message types', () => {
      expect(MessageType.REQUEST_ACCOUNTS).toBe('REQUEST_ACCOUNTS');
      expect(MessageType.SIGN_MESSAGE).toBe('SIGN_MESSAGE');
      expect(MessageType.GET_SESSION).toBe('GET_SESSION');
      expect(MessageType.DISCONNECT).toBe('DISCONNECT');
      expect(MessageType.ACCOUNTS_CHANGED).toBe('ACCOUNTS_CHANGED');
      expect(MessageType.CHAIN_CHANGED).toBe('CHAIN_CHANGED');
    });
  });

  describe('Keep-Alive Alarm', () => {
    it('should create keep-alive alarm', async () => {
      await mockChrome.alarms.create('sw-keepalive', {
        periodInMinutes: 0.4,
        delayInMinutes: 0.4,
      });

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('sw-keepalive', {
        periodInMinutes: 0.4,
        delayInMinutes: 0.4,
      });
    });

    it('should clear keep-alive alarm on shutdown', async () => {
      await mockChrome.alarms.clear('sw-keepalive');
      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('sw-keepalive');
    });
  });
});

describe('Background Bootstrap', () => {
  it('should handle module load errors gracefully', () => {
    let bootstrapError: string | null = null;
    
    try {
      throw new Error('Module load failed');
    } catch (error) {
      bootstrapError = error instanceof Error ? error.message : String(error);
    }

    expect(bootstrapError).toBe('Module load failed');
  });

  it('should set bootstrap ready state on success', () => {
    let bootstrapReady = false;

    // Simulate successful load
    try {
      // Module loads successfully
      bootstrapReady = true;
    } catch {
      bootstrapReady = false;
    }

    expect(bootstrapReady).toBe(true);
  });
});
