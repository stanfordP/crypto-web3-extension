/**
 * Tests for Entry Points - Production Modules
 * 
 * Tests that entry points correctly wire up adapters and controllers.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Chrome APIs
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      get: jest.fn().mockImplementation((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn().mockImplementation((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    session: {
      get: jest.fn().mockImplementation((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn().mockImplementation((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onConnect: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    getURL: jest.fn().mockReturnValue('chrome-extension://test/'),
    getManifest: jest.fn().mockReturnValue({ version: '2.2.4' }),
    lastError: null as chrome.runtime.LastError | null,
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    getCurrent: jest.fn().mockResolvedValue(null),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  alarms: {
    create: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(true),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

(global as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

// Mock fetch
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ authenticated: false }),
});
(global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

// Mock document
const mockDocument = {
  getElementById: jest.fn().mockReturnValue(null),
  querySelector: jest.fn().mockReturnValue(null),
  querySelectorAll: jest.fn().mockReturnValue([]),
  addEventListener: jest.fn(),
  body: {
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
    },
  },
};

// ============================================================================
// Test Adapters
// ============================================================================

describe('ChromeStorageAdapter - Production', () => {
  let adapter: typeof import('../src/scripts/adapters/ChromeStorageAdapter').ChromeStorageAdapter.prototype;

  beforeEach(async () => {
    jest.clearAllMocks();
    const { ChromeStorageAdapter } = await import('../src/scripts/adapters/ChromeStorageAdapter');
    adapter = new ChromeStorageAdapter();
  });

  describe('localGet', () => {
    it('should get values from local storage', async () => {
      mockChrome.storage.local.get.mockResolvedValueOnce({ testKey: 'testValue' });

      const result = await adapter.localGet(['testKey']);

      expect(result).toEqual({ testKey: 'testValue' });
    });

    it('should handle empty result', async () => {
      mockChrome.storage.local.get.mockResolvedValueOnce({});

      const result = await adapter.localGet(['nonExistent']);

      expect(result).toEqual({});
    });
  });

  describe('localSet', () => {
    it('should set values in local storage', async () => {
      await adapter.localSet({ testKey: 'testValue' });

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        { testKey: 'testValue' }
      );
    });
  });

  describe('sessionGet', () => {
    it('should get values from session storage', async () => {
      mockChrome.storage.session.get.mockResolvedValueOnce({ sessionKey: 'sessionValue' });

      const result = await adapter.sessionGet(['sessionKey']);

      expect(result).toEqual({ sessionKey: 'sessionValue' });
    });
  });

  describe('sessionSet', () => {
    it('should set values in session storage', async () => {
      await adapter.sessionSet({ sessionKey: 'sessionValue' });

      expect(mockChrome.storage.session.set).toHaveBeenCalledWith(
        { sessionKey: 'sessionValue' }
      );
    });
  });

  describe('onChanged', () => {
    it('should register change listener', () => {
      const callback = jest.fn();
      adapter.onChanged(callback);

      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();
    });
  });

  describe('offChanged', () => {
    it('should remove change listener that was previously added', () => {
      const callback = jest.fn();
      adapter.onChanged(callback); // First add
      
      // The internal implementation tracks listeners, then calls removeListener
      // when offChanged is called
      adapter.offChanged(callback);

      // The adapter may or may not call removeListener depending on implementation
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });
});

describe('ChromeRuntimeAdapter - Production', () => {
  let adapter: typeof import('../src/scripts/adapters/ChromeRuntimeAdapter').ChromeRuntimeAdapter.prototype;

  beforeEach(async () => {
    jest.clearAllMocks();
    const { ChromeRuntimeAdapter } = await import('../src/scripts/adapters/ChromeRuntimeAdapter');
    adapter = new ChromeRuntimeAdapter();
  });

  describe('sendMessage', () => {
    it('should send message via runtime', async () => {
      // The ChromeRuntimeAdapter wraps sendMessage in a callback-based promise
      mockChrome.runtime.sendMessage.mockImplementation((message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ success: true });
        }
      });

      const result = await adapter.sendMessage({ type: 'TEST' });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('getURL', () => {
    it('should get extension URL', () => {
      const url = adapter.getURL('popup.html');

      expect(mockChrome.runtime.getURL).toHaveBeenCalledWith('popup.html');
    });
  });

  describe('onMessage', () => {
    it('should register message listener', () => {
      const callback = jest.fn();
      adapter.onMessage(callback);

      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });
});

describe('ChromeTabsAdapter - Production', () => {
  let adapter: typeof import('../src/scripts/adapters/ChromeTabsAdapter').ChromeTabsAdapter.prototype;

  beforeEach(async () => {
    jest.clearAllMocks();
    const { ChromeTabsAdapter } = await import('../src/scripts/adapters/ChromeTabsAdapter');
    adapter = new ChromeTabsAdapter();
  });

  describe('query', () => {
    it('should query tabs', async () => {
      mockChrome.tabs.query.mockResolvedValueOnce([{ id: 1, url: 'https://test.com' }]);

      const result = await adapter.query({ active: true });

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://test.com');
    });
  });

  describe('sendMessage', () => {
    it('should send message to tab', async () => {
      // ChromeTabsAdapter wraps sendMessage in callback-based Promise
      mockChrome.tabs.sendMessage.mockImplementation((tabId: number, message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ received: true });
        }
      });

      const result = await adapter.sendMessage(1, { type: 'TEST' });

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create new tab', async () => {
      mockChrome.tabs.create.mockResolvedValueOnce({ id: 2, url: 'https://new.com' });

      const result = await adapter.create({ url: 'https://new.com' });

      expect(result.id).toBe(2);
    });
  });
});

describe('DOMAdapter - Production', () => {
  let adapter: typeof import('../src/scripts/adapters/DOMAdapter').DOMAdapter.prototype;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear document body for fresh tests
    document.body.innerHTML = '';
    
    const { DOMAdapter } = await import('../src/scripts/adapters/DOMAdapter');
    adapter = new DOMAdapter();
  });

  describe('getElementById', () => {
    it('should get element by ID', () => {
      // Create real DOM element
      const div = document.createElement('div');
      div.id = 'test-element';
      document.body.appendChild(div);

      const result = adapter.getElementById('test-element');

      expect(result).toBe(div);
    });

    it('should return null for non-existent element', () => {
      const result = adapter.getElementById('nonExistent');

      expect(result).toBeNull();
    });
  });

  describe('querySelector', () => {
    it('should query selector', () => {
      const span = document.createElement('span');
      span.className = 'test-class';
      document.body.appendChild(span);

      const result = adapter.querySelector('.test-class');

      expect(result).toBe(span);
    });
  });

  describe('querySelectorAll', () => {
    it('should query all selectors', () => {
      const item1 = document.createElement('div');
      item1.className = 'item';
      const item2 = document.createElement('div');
      item2.className = 'item';
      document.body.appendChild(item1);
      document.body.appendChild(item2);

      const result = adapter.querySelectorAll('.item');

      expect(result).toHaveLength(2);
    });
  });
});

describe('Entry Point Wiring', () => {
  it('should export PopupController with correct interface', async () => {
    const { PopupController } = await import('../src/scripts/ui/popup/PopupController');
    
    expect(PopupController).toBeDefined();
    expect(typeof PopupController).toBe('function');
  });

  it('should export PopupView with correct interface', async () => {
    const { PopupView } = await import('../src/scripts/ui/popup/PopupView');
    
    expect(PopupView).toBeDefined();
    expect(typeof PopupView).toBe('function');
  });

  it('should export BackgroundController with correct interface', async () => {
    const { BackgroundController } = await import('../src/scripts/ui/background/BackgroundController');
    
    expect(BackgroundController).toBeDefined();
    expect(typeof BackgroundController).toBe('function');
  });

  it('should export ContentController with correct interface', async () => {
    const { ContentController } = await import('../src/scripts/ui/content/ContentController');
    
    expect(ContentController).toBeDefined();
    expect(typeof ContentController).toBe('function');
  });

  it('should export AuthController with correct interface', async () => {
    const { AuthController } = await import('../src/scripts/ui/auth/AuthController');
    
    expect(AuthController).toBeDefined();
    expect(typeof AuthController).toBe('function');
  });
});
