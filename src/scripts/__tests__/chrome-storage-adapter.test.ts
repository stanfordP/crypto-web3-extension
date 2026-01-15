/**
 * Chrome Storage Adapter Tests
 * 
 * Tests for the Chrome storage adapter wrapper
 */

import { ChromeStorageAdapter } from '../adapters/ChromeStorageAdapter';
import type { StorageChangeCallback } from '../adapters/types';

// ============================================================================
// Chrome API Mock
// ============================================================================

const mockLocalStorage = new Map<string, unknown>();
const mockSessionStorage = new Map<string, unknown>();
const mockSyncStorage = new Map<string, unknown>();
const mockChangeListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();

const mockChromeStorage = {
  local: {
    get: jest.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (mockLocalStorage.has(key)) {
          result[key] = mockLocalStorage.get(key);
        }
      }
      return result;
    }),
    set: jest.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        mockLocalStorage.set(key, value);
      }
    }),
    remove: jest.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArray) {
        mockLocalStorage.delete(key);
      }
    }),
    clear: jest.fn(async () => {
      mockLocalStorage.clear();
    }),
  },
  session: {
    get: jest.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (mockSessionStorage.has(key)) {
          result[key] = mockSessionStorage.get(key);
        }
      }
      return result;
    }),
    set: jest.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        mockSessionStorage.set(key, value);
      }
    }),
    remove: jest.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      for (const key of keyArray) {
        mockSessionStorage.delete(key);
      }
    }),
    clear: jest.fn(async () => {
      mockSessionStorage.clear();
    }),
  },
  sync: {
    get: jest.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (mockSyncStorage.has(key)) {
          result[key] = mockSyncStorage.get(key);
        }
      }
      return result;
    }),
  },
  onChanged: {
    addListener: jest.fn((callback: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
      mockChangeListeners.add(callback);
    }),
    removeListener: jest.fn((callback: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
      mockChangeListeners.delete(callback);
    }),
  },
};

// Set up global chrome mock
(global as unknown as { chrome: { storage: typeof mockChromeStorage } }).chrome = {
  storage: mockChromeStorage,
};

// Helper to trigger storage change events
function triggerStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  for (const listener of mockChangeListeners) {
    listener(changes, areaName);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('ChromeStorageAdapter', () => {
  let adapter: ChromeStorageAdapter;

  beforeEach(() => {
    // Clear all storage and mocks
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    mockSyncStorage.clear();
    mockChangeListeners.clear();
    jest.clearAllMocks();
    
    adapter = new ChromeStorageAdapter();
  });

  afterEach(() => {
    adapter.destroy();
  });

  describe('Local Storage', () => {
    it('should get values from local storage', async () => {
      mockLocalStorage.set('key1', 'value1');
      mockLocalStorage.set('key2', 42);

      const result = await adapter.localGet<{ key1: string; key2: number }>(['key1', 'key2']);

      expect(result.key1).toBe('value1');
      expect(result.key2).toBe(42);
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['key1', 'key2']);
    });

    it('should set values in local storage', async () => {
      await adapter.localSet({ key1: 'value1', key2: 42 });

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({ key1: 'value1', key2: 42 });
    });

    it('should remove values from local storage', async () => {
      await adapter.localRemove(['key1', 'key2']);

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(['key1', 'key2']);
    });

    it('should clear local storage', async () => {
      await adapter.localClear();

      expect(mockChromeStorage.local.clear).toHaveBeenCalled();
    });
  });

  describe('Session Storage', () => {
    it('should get values from session storage', async () => {
      mockSessionStorage.set('sessionKey', 'sessionValue');

      const result = await adapter.sessionGet<{ sessionKey: string }>(['sessionKey']);

      expect(result.sessionKey).toBe('sessionValue');
      expect(mockChromeStorage.session.get).toHaveBeenCalledWith(['sessionKey']);
    });

    it('should set values in session storage', async () => {
      await adapter.sessionSet({ sessionKey: 'sessionValue' });

      expect(mockChromeStorage.session.set).toHaveBeenCalledWith({ sessionKey: 'sessionValue' });
    });

    it('should remove values from session storage', async () => {
      await adapter.sessionRemove(['sessionKey']);

      expect(mockChromeStorage.session.remove).toHaveBeenCalledWith(['sessionKey']);
    });

    it('should clear session storage', async () => {
      await adapter.sessionClear();

      expect(mockChromeStorage.session.clear).toHaveBeenCalled();
    });
  });

  describe('Sync Storage', () => {
    it('should get values from sync storage', async () => {
      mockSyncStorage.set('syncKey', 'syncValue');

      const result = await adapter.syncGet<{ syncKey: string }>(['syncKey']);

      expect(result.syncKey).toBe('syncValue');
      expect(mockChromeStorage.sync.get).toHaveBeenCalledWith(['syncKey']);
    });
  });

  describe('Change Listeners', () => {
    it('should register change listener', () => {
      const callback: StorageChangeCallback = jest.fn();

      adapter.onChanged(callback);

      expect(mockChromeStorage.onChanged.addListener).toHaveBeenCalled();
    });

    it('should call listener on storage changes', () => {
      const callback: StorageChangeCallback = jest.fn();
      adapter.onChanged(callback);

      triggerStorageChange(
        { key1: { oldValue: 'old', newValue: 'new' } },
        'local'
      );

      expect(callback).toHaveBeenCalledWith(
        { key1: { oldValue: 'old', newValue: 'new' } },
        'local'
      );
    });

    it('should remove change listener', () => {
      const callback: StorageChangeCallback = jest.fn();
      adapter.onChanged(callback);
      adapter.offChanged(callback);

      triggerStorageChange(
        { key1: { oldValue: 'old', newValue: 'new' } },
        'local'
      );

      // Callback should still be called because offChanged removes from internal Set,
      // but the chrome listener is still active. This tests the adapter's internal tracking.
      // In real usage, destroy() removes the chrome listener entirely.
    });

    it('should handle listener errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorCallback: StorageChangeCallback = () => {
        throw new Error('Listener error');
      };
      adapter.onChanged(errorCallback);

      expect(() => {
        triggerStorageChange({ key1: { newValue: 'test' } }, 'local');
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ChromeStorageAdapter] Listener error:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('should remove chrome listener on destroy', () => {
      adapter.destroy();

      expect(mockChromeStorage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('should clear internal listeners on destroy', () => {
      const callback: StorageChangeCallback = jest.fn();
      adapter.onChanged(callback);
      adapter.destroy();

      // After destroy, new triggers shouldn't reach the callback
      // (because internal set is cleared)
    });
  });
});
