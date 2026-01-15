/**
 * Unit Tests for Session Synchronization
 * 
 * Tests the session sync functionality including:
 * - Popup-to-content session sync
 * - API-based session recovery
 * - Storage fallback logic
 * - Cross-tab synchronization
 */

import { StorageKeys } from '../types';
import { API_BASE_URL, API_ENDPOINTS } from '../config';

// ============================================================================
// Mock Setup
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      get: jest.fn() as jest.Mock<Promise<Record<string, unknown>>, [string | string[] | Record<string, unknown>]>,
      set: jest.fn((_data: Record<string, unknown>) => Promise.resolve()) as jest.Mock<Promise<void>, [Record<string, unknown>]>,
      remove: jest.fn((_keys: string | string[]) => Promise.resolve()) as jest.Mock<Promise<void>, [string | string[]]>,
      clear: jest.fn(() => Promise.resolve()) as jest.Mock<Promise<void>, []>,
    },
    session: {
      get: jest.fn() as jest.Mock<Promise<Record<string, unknown>>, [string | string[] | Record<string, unknown>]>,
      set: jest.fn((_data: Record<string, unknown>) => Promise.resolve()) as jest.Mock<Promise<void>, [Record<string, unknown>]>,
      remove: jest.fn((_keys: string | string[]) => Promise.resolve()) as jest.Mock<Promise<void>, [string | string[]]>,
      clear: jest.fn(() => Promise.resolve()) as jest.Mock<Promise<void>, []>,
    },
    sync: {
      get: jest.fn() as jest.Mock<Promise<Record<string, unknown>>, [string | string[] | Record<string, unknown>]>,
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    lastError: null as { message: string } | null,
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn((_tabId: number, _msg: unknown, callback?: (response: unknown) => void) => {
      if (callback) callback({});
      return Promise.resolve({});
    }) as jest.Mock,
    create: jest.fn(),
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window
const postedMessages: Array<{ data: unknown; origin: string }> = [];
const mockWindow = {
  postMessage: jest.fn((data: unknown, origin: string) => {
    postedMessages.push({ data, origin });
  }),
  location: {
    origin: 'http://localhost:3000',
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};
// @ts-expect-error - Mocking window
global.window = mockWindow;

// ============================================================================
// Helper Functions (Extracted from popup.ts)
// ============================================================================

async function getAppUrl(): Promise<string> {
  try {
    const result = await mockChrome.storage.sync.get('appUrl') as { appUrl?: string };
    return result.appUrl || 'http://localhost:3000';
  } catch {
    return 'http://localhost:3000';
  }
}

async function trySyncSessionFromTab(): Promise<boolean> {
  try {
    const [activeTab] = await mockChrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.id || !activeTab.url) {
      return false;
    }
    
    const isMainApp = activeTab.url.includes('localhost:3000') || 
                      activeTab.url.includes('cryptotradingjournal.xyz');
    
    if (!isMainApp) {
      return false;
    }
    
    const response = await new Promise<{ success: boolean; session?: { address: string; chainId: string; sessionToken?: string } }>((resolve) => {
      mockChrome.tabs.sendMessage(activeTab.id, { type: 'POPUP_GET_SESSION' }, resolve);
    });
    
    if (response?.success && response?.session) {
      await mockChrome.storage.local.set({
        [StorageKeys.CONNECTED_ADDRESS]: response.session.address,
        [StorageKeys.CHAIN_ID]: response.session.chainId,
      });
      
      if (response.session.sessionToken) {
        await mockChrome.storage.session.set({
          [StorageKeys.SESSION_TOKEN]: response.session.sessionToken,
        });
        await mockChrome.storage.local.set({
          [StorageKeys.SESSION_TOKEN]: response.session.sessionToken,
        });
      }
      
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

async function tryVerifySessionFromAPI(): Promise<{ address: string; chainId: string } | null> {
  try {
    const appUrl = await getAppUrl();
    
    const response = await fetch(`${appUrl}/api/auth/session`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.authenticated && data.address) {
      await mockChrome.storage.local.set({
        [StorageKeys.CONNECTED_ADDRESS]: data.address,
        [StorageKeys.CHAIN_ID]: data.chainId || '0x1',
      });
      
      return {
        address: data.address,
        chainId: data.chainId || '0x1',
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Session Synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postedMessages.length = 0;
    mockChrome.runtime.lastError = null;
    mockFetch.mockReset();
  });

  describe('trySyncSessionFromTab', () => {
    it('should return false when no active tab', async () => {
      mockChrome.tabs.query.mockResolvedValue([]);
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(false);
    });

    it('should return false when active tab has no URL', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(false);
    });

    it('should return false when active tab is not main app', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://google.com' }]);
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(false);
    });

    it('should sync session from localhost:3000 tab', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://localhost:3000/dashboard' }]);
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        callback({
          success: true,
          session: {
            address: '0x1234567890123456789012345678901234567890',
            chainId: '0x1',
            sessionToken: 'test-token',
          },
        });
      });
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(true);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
        [StorageKeys.CHAIN_ID]: '0x1',
      });
      expect(mockChrome.storage.session.set).toHaveBeenCalledWith({
        [StorageKeys.SESSION_TOKEN]: 'test-token',
      });
    });

    it('should sync session from production domain', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://cryptotradingjournal.xyz/trades' }]);
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        callback({
          success: true,
          session: {
            address: '0xabcdef1234567890abcdef1234567890abcdef12',
            chainId: '0x89',
            sessionToken: 'prod-token',
          },
        });
      });
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(true);
    });

    it('should handle content script not responding', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://localhost:3000' }]);
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        callback({ success: false });
      });
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(false);
    });

    it('should handle session without token', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://localhost:3000' }]);
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        callback({
          success: true,
          session: {
            address: '0x1234567890123456789012345678901234567890',
            chainId: '0x1',
            // No sessionToken
          },
        });
      });
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(true);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
        [StorageKeys.CHAIN_ID]: '0x1',
      });
      // session.set should not be called when there's no token
      expect(mockChrome.storage.session.set).not.toHaveBeenCalled();
    });

    it('should handle tabs.sendMessage error gracefully', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://localhost:3000' }]);
      // Simulate sendMessage failing by calling callback with no response
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        // Callback with empty/undefined response simulates an error scenario
        callback(undefined);
      });
      
      const result = await trySyncSessionFromTab();
      
      expect(result).toBe(false);
    });
  });

  describe('tryVerifySessionFromAPI', () => {
    it('should return null when API returns 401', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });
      
      const result = await tryVerifySessionFromAPI();
      
      expect(result).toBe(null);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/session',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
    });

    it('should return session when API confirms authentication', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          address: '0x1234567890123456789012345678901234567890',
          chainId: '0x1',
        }),
      });
      
      const result = await tryVerifySessionFromAPI();
      
      expect(result).toEqual({
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      });
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
        [StorageKeys.CHAIN_ID]: '0x1',
      });
    });

    it('should use default chainId when not provided', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          address: '0x1234567890123456789012345678901234567890',
          // No chainId
        }),
      });
      
      const result = await tryVerifySessionFromAPI();
      
      expect(result).toEqual({
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      });
    });

    it('should return null when not authenticated', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authenticated: false,
        }),
      });
      
      const result = await tryVerifySessionFromAPI();
      
      expect(result).toBe(null);
    });

    it('should handle network errors gracefully', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const result = await tryVerifySessionFromAPI();
      
      expect(result).toBe(null);
    });

    it('should use custom app URL from storage', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({ appUrl: 'https://custom.app' });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      });
      
      await tryVerifySessionFromAPI();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.app/api/auth/session',
        expect.any(Object)
      );
    });
  });

  describe('getAppUrl', () => {
    it('should return default URL when storage is empty', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      
      const url = await getAppUrl();
      
      expect(url).toBe('http://localhost:3000');
    });

    it('should return custom URL from storage', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({ appUrl: 'https://myapp.example.com' });
      
      const url = await getAppUrl();
      
      expect(url).toBe('https://myapp.example.com');
    });

    it('should return default URL on storage error', async () => {
      mockChrome.storage.sync.get.mockRejectedValue(new Error('Storage error'));
      
      const url = await getAppUrl();
      
      expect(url).toBe('http://localhost:3000');
    });
  });
});

describe('Content Script Session Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  // Simulate handlePopupGetSession behavior
  async function handlePopupGetSession(): Promise<{ success: boolean; session?: { address: string; chainId: string; sessionToken?: string } }> {
    try {
      const localResult = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.SESSION_TOKEN,
      ]);

      const sessionResult = await mockChrome.storage.session.get([
        StorageKeys.SESSION_TOKEN,
      ]);

      const address = localResult[StorageKeys.CONNECTED_ADDRESS] as string | undefined;
      const chainId = localResult[StorageKeys.CHAIN_ID] as string | undefined;
      const sessionToken = (sessionResult[StorageKeys.SESSION_TOKEN] as string | undefined) ||
        (localResult[StorageKeys.SESSION_TOKEN] as string | undefined);

      if (address && sessionToken) {
        return {
          success: true,
          session: {
            address,
            chainId: chainId || '0x1',
            sessionToken,
          }
        };
      }
      
      // Fallback: Check main app's session API
      try {
        const apiResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SESSION_VALIDATE}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        
        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.authenticated && apiData.address) {
            await mockChrome.storage.local.set({
              [StorageKeys.CONNECTED_ADDRESS]: apiData.address,
              [StorageKeys.CHAIN_ID]: apiData.chainId || '0x1',
            });
            
            return {
              success: true,
              session: {
                address: apiData.address,
                chainId: apiData.chainId || '0x1',
              }
            };
          }
        }
      } catch {
        // API check failed
      }

      if (address) {
        return {
          success: true,
          session: {
            address,
            chainId: chainId || '0x1',
            sessionToken,
          }
        };
      }

      return { success: false };
    } catch {
      return { success: false };
    }
  }

  it('should return session from storage when both address and token exist', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      [StorageKeys.CHAIN_ID]: '0xa4b1',
      [StorageKeys.SESSION_TOKEN]: 'local-token',
    });
    mockChrome.storage.session.get.mockResolvedValue({
      [StorageKeys.SESSION_TOKEN]: 'session-token',
    });

    const result = await handlePopupGetSession();

    expect(result.success).toBe(true);
    expect(result.session?.address).toBe('0x1234');
    expect(result.session?.chainId).toBe('0xa4b1');
    expect(result.session?.sessionToken).toBe('session-token');
  });

  it('should prefer session storage token over local storage token', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      [StorageKeys.SESSION_TOKEN]: 'old-local-token',
    });
    mockChrome.storage.session.get.mockResolvedValue({
      [StorageKeys.SESSION_TOKEN]: 'fresh-session-token',
    });

    const result = await handlePopupGetSession();

    expect(result.session?.sessionToken).toBe('fresh-session-token');
  });

  it('should fallback to local storage token when session storage is empty', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      [StorageKeys.SESSION_TOKEN]: 'local-fallback-token',
    });
    mockChrome.storage.session.get.mockResolvedValue({});

    const result = await handlePopupGetSession();

    expect(result.success).toBe(true);
    expect(result.session?.sessionToken).toBe('local-fallback-token');
  });

  it('should fallback to API when no token in storage', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
    });
    mockChrome.storage.session.get.mockResolvedValue({});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        authenticated: true,
        address: '0xFromAPI',
        chainId: '0x89',
      }),
    });

    const result = await handlePopupGetSession();

    expect(result.success).toBe(true);
    expect(result.session?.address).toBe('0xFromAPI');
  });

  it('should return partial session when API also fails', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
    });
    mockChrome.storage.session.get.mockResolvedValue({});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await handlePopupGetSession();

    expect(result.success).toBe(true);
    expect(result.session?.address).toBe('0x1234');
    expect(result.session?.sessionToken).toBeUndefined();
  });

  it('should return success: false when no address and API fails', async () => {
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.session.get.mockResolvedValue({});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await handlePopupGetSession();

    expect(result.success).toBe(false);
  });

  it('should use default chainId when not in storage or API', async () => {
    mockChrome.storage.local.get.mockResolvedValue({
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
      [StorageKeys.SESSION_TOKEN]: 'token',
    });
    mockChrome.storage.session.get.mockResolvedValue({});

    const result = await handlePopupGetSession();

    expect(result.session?.chainId).toBe('0x1');
  });
});

describe('Storage Change Synchronization', () => {
  it('should detect session changes in local storage', () => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {
      [StorageKeys.CONNECTED_ADDRESS]: {
        oldValue: undefined,
        newValue: '0x1234',
      },
    };
    
    const localSessionChanged = (
      changes[StorageKeys.CONNECTED_ADDRESS] ||
      changes[StorageKeys.CHAIN_ID] ||
      changes[StorageKeys.ACCOUNT_MODE] ||
      changes[StorageKeys.SESSION_TOKEN]
    );
    
    expect(!!localSessionChanged).toBe(true);
  });

  it('should detect token changes in session storage', () => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {
      [StorageKeys.SESSION_TOKEN]: {
        oldValue: undefined,
        newValue: 'new-token',
      },
    };
    
    const tokenChanged = !!changes[StorageKeys.SESSION_TOKEN];
    
    expect(tokenChanged).toBe(true);
  });

  it('should ignore unrelated storage changes', () => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {
      'unrelated_key': {
        oldValue: 'old',
        newValue: 'new',
      },
    };
    
    const localSessionChanged = (
      changes[StorageKeys.CONNECTED_ADDRESS] ||
      changes[StorageKeys.CHAIN_ID] ||
      changes[StorageKeys.ACCOUNT_MODE] ||
      changes[StorageKeys.SESSION_TOKEN]
    );
    
    expect(!!localSessionChanged).toBe(false);
  });
});
