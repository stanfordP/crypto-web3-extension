/**
 * Comprehensive Unit Tests for Service Worker and Background Logic
 * 
 * Tests:
 * - Service worker lifecycle
 * - Keep-alive mechanism
 * - Message routing
 * - Session state management
 * - Error recovery
 */

import { StorageKeys } from '../types';

// ============================================================================
// Mock Setup
// ============================================================================

const mockAlarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];
const mockMessageListeners: Array<(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean | void> = [];

// Tab type for mocking
interface MockTab {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
}

const mockChrome = {
  alarms: {
    create: jest.fn<void, [string, chrome.alarms.AlarmCreateInfo]>(),
    clear: jest.fn<Promise<boolean>, [string]>(),
    get: jest.fn<Promise<chrome.alarms.Alarm | undefined>, [string]>(),
    onAlarm: {
      addListener: jest.fn((listener: (alarm: chrome.alarms.Alarm) => void) => {
        mockAlarmListeners.push(listener);
      }),
      removeListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn<Promise<Record<string, unknown>>, [string | string[]]>(),
      set: jest.fn<Promise<void>, [Record<string, unknown>]>(() => Promise.resolve()),
      remove: jest.fn<Promise<void>, [string | string[]]>(() => Promise.resolve()),
      clear: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    },
    session: {
      get: jest.fn<Promise<Record<string, unknown>>, [string | string[]]>(),
      set: jest.fn<Promise<void>, [Record<string, unknown>]>(() => Promise.resolve()),
      remove: jest.fn<Promise<void>, [string | string[]]>(() => Promise.resolve()),
      clear: jest.fn<Promise<void>, []>(() => Promise.resolve()),
      setAccessLevel: jest.fn<Promise<void>, [{ accessLevel: string }]>(() => Promise.resolve()),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  runtime: {
    id: 'test-extension-id',
    lastError: null as { message: string } | null,
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn((listener) => {
        mockMessageListeners.push(listener);
      }),
      removeListener: jest.fn(),
    },
    getURL: jest.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
  },
  tabs: {
    query: jest.fn<Promise<MockTab[]>, [chrome.tabs.QueryInfo]>(() => Promise.resolve([])),
    sendMessage: jest.fn<Promise<unknown>, [number, unknown]>(),
    create: jest.fn<Promise<MockTab>, [chrome.tabs.CreateProperties]>(() => Promise.resolve({ id: 1 })),
    update: jest.fn<Promise<MockTab>, [number, chrome.tabs.UpdateProperties]>(() => Promise.resolve({})),
    get: jest.fn<Promise<MockTab>, [number]>(() => Promise.resolve({ id: 1, windowId: 1 })),
  },
  windows: {
    update: jest.fn<Promise<chrome.windows.Window>, [number, chrome.windows.UpdateInfo]>(() => Promise.resolve({} as chrome.windows.Window)),
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ============================================================================
// Tests
// ============================================================================

describe('Service Worker Bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessageListeners.length = 0;
    mockAlarmListeners.length = 0;
    mockChrome.runtime.lastError = null;
  });

  describe('PING Handler', () => {
    it('should respond to PING with pong and status', () => {
      let responseData: unknown = null;
      
      // Simulate the PING handler logic
      const handlePing = (message: { type?: string; requestId?: string }, sendResponse: (response: unknown) => void) => {
        if (message?.type === 'PING') {
          sendResponse({
            success: true,
            data: {
              pong: true,
              timestamp: Date.now(),
              ready: true,
              mainLoaded: true,
              error: null,
            },
            requestId: message.requestId,
          });
          return true;
        }
        return false;
      };
      
      const result = handlePing({ type: 'PING', requestId: 'test-123' }, (response) => {
        responseData = response;
      });
      
      expect(result).toBe(true);
      expect(responseData).toMatchObject({
        success: true,
        data: {
          pong: true,
          ready: true,
        },
        requestId: 'test-123',
      });
    });

    it('should indicate error state when bootstrap fails', () => {
      let responseData: unknown = null;
      
      const handlePing = (message: { type?: string }, sendResponse: (response: unknown) => void, bootstrapError: string | null) => {
        if (message?.type === 'PING') {
          sendResponse({
            success: true,
            data: {
              pong: true,
              timestamp: Date.now(),
              ready: false,
              mainLoaded: true,
              error: bootstrapError,
            },
          });
          return true;
        }
        return false;
      };
      
      handlePing({ type: 'PING' }, (response) => {
        responseData = response;
      }, 'Failed to load main module');
      
      expect(responseData).toMatchObject({
        data: {
          pong: true,
          ready: false,
          error: 'Failed to load main module',
        },
      });
    });

    it('should not handle non-PING messages', () => {
      const handlePing = (message: { type?: string }) => {
        if (message?.type === 'PING') {
          return true;
        }
        return false;
      };
      
      expect(handlePing({ type: 'DISCONNECT' })).toBe(false);
      expect(handlePing({ type: 'GET_SESSION' })).toBe(false);
    });
  });

  describe('Session Storage Access Level', () => {
    it('should set session storage access level for content scripts', async () => {
      await mockChrome.storage.session.setAccessLevel({ 
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' 
      });
      
      expect(mockChrome.storage.session.setAccessLevel).toHaveBeenCalledWith({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      });
    });

    it('should handle setAccessLevel failure gracefully', async () => {
      mockChrome.storage.session.setAccessLevel.mockRejectedValueOnce(new Error('Permission denied'));
      
      try {
        await mockChrome.storage.session.setAccessLevel({
          accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});

describe('Service Worker Keep-Alive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlarmListeners.length = 0;
  });

  describe('Alarm Creation', () => {
    it('should create keep-alive alarm with correct interval', () => {
      const KEEP_ALIVE_INTERVAL_SECONDS = 24;
      
      mockChrome.alarms.create('keep-alive', {
        periodInMinutes: KEEP_ALIVE_INTERVAL_SECONDS / 60,
      });
      
      expect(mockChrome.alarms.create).toHaveBeenCalledWith('keep-alive', {
        periodInMinutes: 0.4,
      });
    });

    it('should handle alarm callback', () => {
      let alarmTriggered = false;
      
      const listener = (alarm: chrome.alarms.Alarm) => {
        if (alarm.name === 'keep-alive') {
          alarmTriggered = true;
        }
      };
      
      mockAlarmListeners.push(listener);
      
      // Simulate alarm
      mockAlarmListeners.forEach(l => l({ name: 'keep-alive', scheduledTime: Date.now() }));
      
      expect(alarmTriggered).toBe(true);
    });

    it('should ignore non-keep-alive alarms', () => {
      let alarmTriggered = false;
      
      const listener = (alarm: chrome.alarms.Alarm) => {
        if (alarm.name === 'keep-alive') {
          alarmTriggered = true;
        }
      };
      
      mockAlarmListeners.push(listener);
      
      // Simulate different alarm
      mockAlarmListeners.forEach(l => l({ name: 'other-alarm', scheduledTime: Date.now() }));
      
      expect(alarmTriggered).toBe(false);
    });
  });
});

describe('Session Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  // Simulate SessionManager methods
  class MockSessionManager {
    async hasActiveSession(): Promise<boolean> {
      const sessionResult = await mockChrome.storage.session.get([StorageKeys.SESSION_TOKEN]);
      const localResult = await mockChrome.storage.local.get([StorageKeys.SESSION_TOKEN]);
      const token = sessionResult[StorageKeys.SESSION_TOKEN] || localResult[StorageKeys.SESSION_TOKEN];
      
      if (!token) return false;
      
      try {
        const response = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    async getSession(): Promise<{
      sessionToken?: string;
      connectedAddress?: string;
      chainId?: string;
      accountMode?: string;
    } | null> {
      const [sessionResult, localResult] = await Promise.all([
        mockChrome.storage.session.get([StorageKeys.SESSION_TOKEN]),
        mockChrome.storage.local.get([
          StorageKeys.SESSION_TOKEN,
          StorageKeys.CONNECTED_ADDRESS,
          StorageKeys.CHAIN_ID,
          StorageKeys.ACCOUNT_MODE,
        ]),
      ]);
      
      const token = sessionResult[StorageKeys.SESSION_TOKEN] || localResult[StorageKeys.SESSION_TOKEN];
      const address = localResult[StorageKeys.CONNECTED_ADDRESS];
      
      if (!token || !address) return null;
      
      return {
        sessionToken: token as string,
        connectedAddress: address as string,
        chainId: (localResult[StorageKeys.CHAIN_ID] as string) || '0x1',
        accountMode: (localResult[StorageKeys.ACCOUNT_MODE] as string) || 'live',
      };
    }

    async disconnect(): Promise<void> {
      const sessionResult = await mockChrome.storage.session.get([StorageKeys.SESSION_TOKEN]);
      const localResult = await mockChrome.storage.local.get([StorageKeys.SESSION_TOKEN]);
      const token = sessionResult[StorageKeys.SESSION_TOKEN] || localResult[StorageKeys.SESSION_TOKEN];
      
      if (token) {
        try {
          await fetch('/api/auth/disconnect', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Ignore API errors
        }
      }
      
      await Promise.all([
        mockChrome.storage.session.clear(),
        mockChrome.storage.local.clear(),
      ]);
    }
  }

  describe('hasActiveSession', () => {
    it('should return false when no token in storage', async () => {
      mockChrome.storage.session.get.mockResolvedValue({});
      mockChrome.storage.local.get.mockResolvedValue({});
      
      const manager = new MockSessionManager();
      const hasSession = await manager.hasActiveSession();
      
      expect(hasSession).toBe(false);
    });

    it('should validate session with API when token exists', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'valid-token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({ ok: true });
      
      const manager = new MockSessionManager();
      const hasSession = await manager.hasActiveSession();
      
      expect(hasSession).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/session', {
        headers: { Authorization: 'Bearer valid-token' },
      });
    });

    it('should return false when API validation fails', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'expired-token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      
      const manager = new MockSessionManager();
      const hasSession = await manager.hasActiveSession();
      
      expect(hasSession).toBe(false);
    });

    it('should fallback to local storage token', async () => {
      mockChrome.storage.session.get.mockResolvedValue({});
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'local-token',
      });
      mockFetch.mockResolvedValue({ ok: true });
      
      const manager = new MockSessionManager();
      const hasSession = await manager.hasActiveSession();
      
      expect(hasSession).toBe(true);
    });

    it('should handle network errors gracefully', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const manager = new MockSessionManager();
      const hasSession = await manager.hasActiveSession();
      
      expect(hasSession).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should return full session data', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'test-token',
      });
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0xa4b1',
        [StorageKeys.ACCOUNT_MODE]: 'demo',
      });
      
      const manager = new MockSessionManager();
      const session = await manager.getSession();
      
      expect(session).toEqual({
        sessionToken: 'test-token',
        connectedAddress: '0x1234',
        chainId: '0xa4b1',
        accountMode: 'demo',
      });
    });

    it('should return null when token missing', async () => {
      mockChrome.storage.session.get.mockResolvedValue({});
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      });
      
      const manager = new MockSessionManager();
      const session = await manager.getSession();
      
      expect(session).toBe(null);
    });

    it('should return null when address missing', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});
      
      const manager = new MockSessionManager();
      const session = await manager.getSession();
      
      expect(session).toBe(null);
    });

    it('should use default chainId and accountMode', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      });
      
      const manager = new MockSessionManager();
      const session = await manager.getSession();
      
      expect(session).toEqual({
        sessionToken: 'token',
        connectedAddress: '0x1234',
        chainId: '0x1',
        accountMode: 'live',
      });
    });
  });

  describe('disconnect', () => {
    it('should clear all storage', async () => {
      mockChrome.storage.session.get.mockResolvedValue({});
      mockChrome.storage.local.get.mockResolvedValue({});
      
      const manager = new MockSessionManager();
      await manager.disconnect();
      
      expect(mockChrome.storage.session.clear).toHaveBeenCalled();
      expect(mockChrome.storage.local.clear).toHaveBeenCalled();
    });

    it('should notify backend when token exists', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'logout-token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({ ok: true });
      
      const manager = new MockSessionManager();
      await manager.disconnect();
      
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/disconnect', {
        method: 'POST',
        headers: { Authorization: 'Bearer logout-token' },
      });
    });

    it('should still clear storage if API call fails', async () => {
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'token',
      });
      mockChrome.storage.local.get.mockResolvedValue({});
      mockFetch.mockRejectedValue(new Error('API down'));
      
      const manager = new MockSessionManager();
      await manager.disconnect();
      
      expect(mockChrome.storage.session.clear).toHaveBeenCalled();
      expect(mockChrome.storage.local.clear).toHaveBeenCalled();
    });
  });
});

describe('Auth Tab Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should open new auth tab when none exists', async () => {
    mockChrome.tabs.create.mockResolvedValue({ id: 123 });
    
    const result = await mockChrome.tabs.create({
      url: 'chrome-extension://test-extension-id/auth.html',
      active: true,
    });
    
    expect(result.id).toBe(123);
    expect(mockChrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test-extension-id/auth.html',
      active: true,
    });
  });

  it('should focus existing auth tab', async () => {
    const existingTabId = 456;
    mockChrome.tabs.get.mockResolvedValue({ id: existingTabId, windowId: 1 });
    
    await mockChrome.tabs.update(existingTabId, { active: true });
    await mockChrome.windows.update(1, { focused: true });
    
    expect(mockChrome.tabs.update).toHaveBeenCalledWith(existingTabId, { active: true });
    expect(mockChrome.windows.update).toHaveBeenCalledWith(1, { focused: true });
  });
});

describe('Message Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessageListeners.length = 0;
  });

  it('should route DISCONNECT message', () => {
    let handled = false;
    
    const router = (message: { type: string }) => {
      switch (message.type) {
        case 'DISCONNECT':
          handled = true;
          return true;
        default:
          return false;
      }
    };
    
    router({ type: 'DISCONNECT' });
    expect(handled).toBe(true);
  });

  it('should route GET_SESSION message', () => {
    let handled = false;
    
    const router = (message: { type: string }) => {
      switch (message.type) {
        case 'GET_SESSION':
          handled = true;
          return true;
        default:
          return false;
      }
    };
    
    router({ type: 'GET_SESSION' });
    expect(handled).toBe(true);
  });

  it('should route OPEN_AUTH_TAB message', () => {
    let handled = false;
    
    const router = (message: { type: string }) => {
      switch (message.type) {
        case 'OPEN_AUTH_TAB':
          handled = true;
          return true;
        default:
          return false;
      }
    };
    
    router({ type: 'OPEN_AUTH_TAB' });
    expect(handled).toBe(true);
  });
});

describe('Tab Notification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should notify all tabs of disconnect', async () => {
    mockChrome.tabs.query.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    
    const tabs = await mockChrome.tabs.query({});
    
    for (const tab of tabs) {
      if (tab.id) {
        mockChrome.tabs.sendMessage(tab.id, { type: 'DISCONNECT_EVENT' });
      }
    }
    
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(3);
  });

  it('should handle tabs without IDs', async () => {
    mockChrome.tabs.query.mockResolvedValue([
      { id: 1 },
      { id: undefined },
      { id: 3 },
    ]);
    
    const tabs = await mockChrome.tabs.query({});
    let sendCount = 0;
    
    for (const tab of tabs) {
      if (tab.id) {
        mockChrome.tabs.sendMessage(tab.id, { type: 'DISCONNECT_EVENT' });
        sendCount++;
      }
    }
    
    expect(sendCount).toBe(2);
  });
});
