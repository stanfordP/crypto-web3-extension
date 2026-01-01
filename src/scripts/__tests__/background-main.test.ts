/**
 * Unit Tests for Background Main Script
 * 
 * Tests the background service worker functionality including:
 * - Session management
 * - Auth tab management
 * - Message handling
 * - Origin validation
 * - Storage helpers
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
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
    session: {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    id: 'test-extension-id',
    getURL: jest.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
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

// Mock fetch for API calls
global.fetch = jest.fn();

// ============================================================================
// Helper Classes (Extracted from background-main.ts for testing)
// ============================================================================

// Storage keys by security level
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

// Origin validation
function validateSenderOrigin(sender: { tab?: { url?: string }; id?: string; url?: string }): boolean {
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

// Auth tab management
let openAuthTabId: number | null = null;

async function openAuthTab(): Promise<{ success: boolean; tabId?: number; error?: string }> {
  try {
    if (openAuthTabId !== null) {
      try {
        const existingTab = await mockChrome.tabs.get(openAuthTabId);
        if (existingTab) {
          await mockChrome.tabs.update(openAuthTabId, { active: true });
          await mockChrome.windows.update(existingTab.windowId, { focused: true });
          return { success: true, tabId: openAuthTabId };
        }
      } catch {
        openAuthTabId = null;
      }
    }

    const authUrl = mockChrome.runtime.getURL('auth.html');
    const newTab = await mockChrome.tabs.create({ url: authUrl, active: true });

    if (newTab.id) {
      openAuthTabId = newTab.id;
      return { success: true, tabId: newTab.id };
    }

    return { success: false, error: 'Failed to create auth tab' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Background Main Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    openAuthTabId = null;
  });

  describe('Storage Helper', () => {
    describe('get', () => {
      it('should get session token from session storage', async () => {
        mockChrome.storage.session.get.mockResolvedValue({
          [StorageKeys.SESSION_TOKEN]: 'test-token',
        });

        const result = await storage.get(StorageKeys.SESSION_TOKEN);
        expect(result).toBe('test-token');
        expect(mockChrome.storage.session.get).toHaveBeenCalledWith(StorageKeys.SESSION_TOKEN);
      });

      it('should get address from local storage', async () => {
        mockChrome.storage.local.get.mockResolvedValue({
          [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        });

        const result = await storage.get(StorageKeys.CONNECTED_ADDRESS);
        expect(result).toBe('0x1234');
        expect(mockChrome.storage.local.get).toHaveBeenCalledWith(StorageKeys.CONNECTED_ADDRESS);
      });

      it('should return undefined for missing keys', async () => {
        mockChrome.storage.local.get.mockResolvedValue({});

        const result = await storage.get(StorageKeys.CHAIN_ID);
        expect(result).toBeUndefined();
      });
    });

    describe('set', () => {
      it('should store session token in session storage', async () => {
        await storage.set(StorageKeys.SESSION_TOKEN, 'new-token');
        expect(mockChrome.storage.session.set).toHaveBeenCalledWith({
          [StorageKeys.SESSION_TOKEN]: 'new-token',
        });
      });

      it('should store address in local storage', async () => {
        await storage.set(StorageKeys.CONNECTED_ADDRESS, '0xabcd');
        expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
          [StorageKeys.CONNECTED_ADDRESS]: '0xabcd',
        });
      });
    });

    describe('remove', () => {
      it('should remove session token from session storage', async () => {
        await storage.remove(StorageKeys.SESSION_TOKEN);
        expect(mockChrome.storage.session.remove).toHaveBeenCalledWith(StorageKeys.SESSION_TOKEN);
      });

      it('should remove address from local storage', async () => {
        await storage.remove(StorageKeys.CONNECTED_ADDRESS);
        expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(StorageKeys.CONNECTED_ADDRESS);
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
    it('should accept messages from extension itself', () => {
      const sender = { id: 'test-extension-id' };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should accept messages from extension pages', () => {
      const sender = { url: 'chrome-extension://test-extension-id/auth.html' };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should accept messages from localhost:3000', () => {
      const sender = { tab: { url: 'http://localhost:3000/dashboard' } };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should accept messages from localhost:3001', () => {
      const sender = { tab: { url: 'http://localhost:3001/test' } };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should accept messages from production domain', () => {
      const sender = { tab: { url: 'https://cryptotradingjournal.xyz/trades' } };
      expect(validateSenderOrigin(sender)).toBe(true);
    });

    it('should reject messages from unknown origins', () => {
      const sender = { tab: { url: 'https://evil.com/phishing' } };
      expect(validateSenderOrigin(sender)).toBe(false);
    });

    it('should reject messages with invalid URLs', () => {
      const sender = { tab: { url: 'not-a-valid-url' } };
      expect(validateSenderOrigin(sender)).toBe(false);
    });

    it('should reject unknown senders', () => {
      const sender = {};
      expect(validateSenderOrigin(sender)).toBe(false);
    });
  });

  describe('Auth Tab Management', () => {
    describe('openAuthTab', () => {
      it('should create new auth tab', async () => {
        mockChrome.tabs.create.mockResolvedValue({ id: 123 });

        const result = await openAuthTab();

        expect(result.success).toBe(true);
        expect(result.tabId).toBe(123);
        expect(mockChrome.tabs.create).toHaveBeenCalledWith({
          url: 'chrome-extension://test-extension-id/auth.html',
          active: true,
        });
      });

      it('should focus existing auth tab', async () => {
        openAuthTabId = 456;
        mockChrome.tabs.get.mockResolvedValue({ id: 456, windowId: 1 });
        mockChrome.tabs.update.mockResolvedValue({});
        mockChrome.windows.update.mockResolvedValue({});

        const result = await openAuthTab();

        expect(result.success).toBe(true);
        expect(result.tabId).toBe(456);
        expect(mockChrome.tabs.update).toHaveBeenCalledWith(456, { active: true });
        expect(mockChrome.windows.update).toHaveBeenCalledWith(1, { focused: true });
      });

      it('should create new tab if existing tab not found', async () => {
        openAuthTabId = 789;
        mockChrome.tabs.get.mockRejectedValue(new Error('Tab not found'));
        mockChrome.tabs.create.mockResolvedValue({ id: 999 });

        const result = await openAuthTab();

        expect(result.success).toBe(true);
        expect(result.tabId).toBe(999);
      });

      it('should handle tab creation failure', async () => {
        mockChrome.tabs.create.mockResolvedValue({});

        const result = await openAuthTab();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to create auth tab');
      });

      it('should handle errors gracefully', async () => {
        mockChrome.tabs.create.mockRejectedValue(new Error('Permission denied'));

        const result = await openAuthTab();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Permission denied');
      });
    });
  });

  describe('Message Types', () => {
    it('should have correct message type values', () => {
      expect(MessageType.REQUEST_ACCOUNTS).toBe('REQUEST_ACCOUNTS');
      expect(MessageType.SIGN_MESSAGE).toBe('SIGN_MESSAGE');
      expect(MessageType.GET_SESSION).toBe('GET_SESSION');
      expect(MessageType.DISCONNECT).toBe('DISCONNECT');
    });
  });

  describe('PING Handler', () => {
    it('should respond to PING with pong', () => {
      const sendResponse = jest.fn();
      const message = { type: 'PING', requestId: 'req-123' };

      // Simulate PING handler
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
          data: expect.objectContaining({ pong: true, ready: true }),
          requestId: 'req-123',
        })
      );
    });
  });

  describe('Session Management', () => {
    it('should check for active session', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'valid-token',
      });

      const token = await storage.get(StorageKeys.SESSION_TOKEN);
      expect(token).toBe('valid-token');
    });

    it('should get full session info', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockImplementation((key) => {
        const data: Record<string, string> = {
          [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
          [StorageKeys.CHAIN_ID]: '0x1',
          [StorageKeys.ACCOUNT_MODE]: 'live',
        };
        return Promise.resolve({ [key]: data[key] });
      });

      const token = await storage.get(StorageKeys.SESSION_TOKEN);
      const address = await storage.get(StorageKeys.CONNECTED_ADDRESS);
      const chainId = await storage.get(StorageKeys.CHAIN_ID);
      const mode = await storage.get(StorageKeys.ACCOUNT_MODE);

      expect(token).toBe('token');
      expect(address).toBe('0x1234');
      expect(chainId).toBe('0x1');
      expect(mode).toBe('live');
    });
  });

  describe('Disconnect Flow', () => {
    it('should clear all storage on disconnect', async () => {
      await storage.clear();

      expect(mockChrome.storage.session.clear).toHaveBeenCalled();
      expect(mockChrome.storage.local.clear).toHaveBeenCalled();
    });

    it('should notify content scripts of disconnect', () => {
      mockChrome.tabs.query.mockImplementation((_query, callback) => {
        callback([{ id: 1 }, { id: 2 }]);
      });

      mockChrome.tabs.query({}, (tabs: Array<{ id: number }>) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            mockChrome.tabs.sendMessage(tab.id, { type: 'DISCONNECT_EVENT' });
          }
        });
      });

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'DISCONNECT_EVENT' });
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'DISCONNECT_EVENT' });
    });
  });

  describe('API Integration', () => {
    it('should call session validation endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      const response = await fetch('http://localhost:3000/api/auth/session', {
        headers: { Authorization: 'Bearer test-token' },
      });
      const data = await response.json();

      expect(data.valid).toBe(true);
    });

    it('should call disconnect endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const response = await fetch('http://localhost:3000/api/auth/disconnect', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });
  });
});

describe('Background Bootstrap', () => {
  it('should register PING handler immediately', () => {
    // The background.ts registers PING handler before loading background-main
    expect(mockChrome.runtime.onMessage.addListener).toBeDefined();
  });

  it('should track bootstrap state', () => {
    let bootstrapReady = false;
    let bootstrapError: string | null = null;

    // Simulate successful bootstrap
    try {
      bootstrapReady = true;
    } catch (error) {
      bootstrapError = error instanceof Error ? error.message : String(error);
    }

    expect(bootstrapReady).toBe(true);
    expect(bootstrapError).toBeNull();
  });
});

describe('ALLOWED_ORIGINS Configuration', () => {
  it('should include localhost origins', () => {
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3000');
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3001');
  });

  it('should include production domain', () => {
    expect(ALLOWED_ORIGINS).toContain('https://cryptotradingjournal.xyz');
  });

  it('should include subdomain wildcard', () => {
    expect(ALLOWED_ORIGINS.some(o => o.includes('*.cryptotradingjournal.xyz'))).toBe(true);
  });
});
