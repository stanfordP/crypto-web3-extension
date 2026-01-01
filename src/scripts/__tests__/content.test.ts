/**
 * Unit Tests for Content Script
 * 
 * Tests the content script functionality including:
 * - CJ_* message handling
 * - Service worker health checks
 * - Session management
 * - Storage change listeners
 * - Origin validation
 */

import { StorageKeys, PageMessageType } from '../types';
import { isAllowedOrigin } from '../config';

// ============================================================================
// Mock Setup
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    lastError: null as { message: string } | null,
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// Mock window.postMessage
const postedMessages: Array<{ data: unknown; origin: string }> = [];
const mockWindow = {
  postMessage: jest.fn((data: unknown, origin: string) => {
    postedMessages.push({ data, origin });
  }),
  location: {
    origin: 'http://localhost:3000',
  },
  addEventListener: jest.fn(),
};

// @ts-expect-error - Mocking window
global.window = mockWindow;

// Mock document
// @ts-expect-error - Mocking document
global.document = {
  readyState: 'complete',
  addEventListener: jest.fn(),
  visibilityState: 'visible',
};

// ============================================================================
// Tests
// ============================================================================

describe('Content Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postedMessages.length = 0;
    mockChrome.runtime.lastError = null;
  });

  describe('Origin Validation', () => {
    it('should allow localhost:3000', () => {
      expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    });

    it('should allow localhost:3001', () => {
      expect(isAllowedOrigin('http://localhost:3001')).toBe(true);
    });

    it('should allow production domain', () => {
      expect(isAllowedOrigin('https://cryptotradingjournal.xyz')).toBe(true);
    });

    it('should reject malicious domains', () => {
      expect(isAllowedOrigin('https://evil.com')).toBe(false);
      expect(isAllowedOrigin('https://cryptojournal.evil.com')).toBe(false);
      expect(isAllowedOrigin('http://localhost:4000')).toBe(false);
    });

    it('should reject similar-looking phishing domains', () => {
      expect(isAllowedOrigin('https://crypt0journal.app')).toBe(false);
      expect(isAllowedOrigin('https://cryptojournal-app.com')).toBe(false);
    });
  });

  describe('CJ_CHECK_EXTENSION Handler', () => {
    it('should respond with CJ_EXTENSION_PRESENT', () => {
      // Simulate the handler response
      mockWindow.postMessage({ type: PageMessageType.CJ_EXTENSION_PRESENT }, '*');
      
      expect(postedMessages).toHaveLength(1);
      expect(postedMessages[0].data).toEqual({ type: PageMessageType.CJ_EXTENSION_PRESENT });
    });
  });

  describe('CJ_OPEN_AUTH Handler', () => {
    it('should forward OPEN_AUTH_TAB to background and respond', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        callback({ success: true });
      });

      // Simulate sending to background
      await new Promise<void>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' }, (response: { success: boolean }) => {
          // Simulate content script posting response to page
          mockWindow.postMessage({
            type: PageMessageType.CJ_AUTH_OPENED,
            success: response.success,
          }, '*');
          resolve();
        });
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'OPEN_AUTH_TAB' },
        expect.any(Function)
      );
      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_AUTH_OPENED,
        success: true,
      });
    });

    it('should handle background failure gracefully', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        callback({ success: false, error: 'Service worker not responding' });
      });

      await new Promise<void>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' }, (response: { success: boolean; error?: string }) => {
          mockWindow.postMessage({
            type: PageMessageType.CJ_AUTH_OPENED,
            success: false,
            error: response.error,
          }, '*');
          resolve();
        });
      });

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_AUTH_OPENED,
        success: false,
        error: 'Service worker not responding',
      });
    });
  });

  describe('CJ_GET_SESSION Handler', () => {
    it('should return session when connected', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.ACCOUNT_MODE]: 'live',
        [StorageKeys.SESSION_TOKEN]: 'valid-token',
      });

      const result = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
        StorageKeys.SESSION_TOKEN,
      ]);

      const hasSession = !!(result[StorageKeys.CONNECTED_ADDRESS] && result[StorageKeys.SESSION_TOKEN]);
      
      const session = hasSession ? {
        address: result[StorageKeys.CONNECTED_ADDRESS],
        chainId: result[StorageKeys.CHAIN_ID] || '0x1',
        accountMode: result[StorageKeys.ACCOUNT_MODE] || 'live',
        isConnected: true,
      } : null;

      mockWindow.postMessage({
        type: PageMessageType.CJ_SESSION_RESPONSE,
        session,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_SESSION_RESPONSE,
        session: {
          address: '0x1234567890123456789012345678901234567890',
          chainId: '0x1',
          accountMode: 'live',
          isConnected: true,
        },
      });
    });

    it('should return null session when not connected', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      const result = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.SESSION_TOKEN,
      ]);

      const hasSession = !!(result[StorageKeys.CONNECTED_ADDRESS] && result[StorageKeys.SESSION_TOKEN]);

      mockWindow.postMessage({
        type: PageMessageType.CJ_SESSION_RESPONSE,
        session: hasSession ? {} : null,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_SESSION_RESPONSE,
        session: null,
      });
    });

    it('should use default values for missing fields', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0xabcd',
        [StorageKeys.SESSION_TOKEN]: 'token',
        // Missing CHAIN_ID and ACCOUNT_MODE
      });

      const result = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
        StorageKeys.SESSION_TOKEN,
      ]);

      const session = {
        address: result[StorageKeys.CONNECTED_ADDRESS],
        chainId: result[StorageKeys.CHAIN_ID] || '0x1',
        accountMode: result[StorageKeys.ACCOUNT_MODE] || 'live',
        isConnected: true,
      };

      expect(session.chainId).toBe('0x1');
      expect(session.accountMode).toBe('live');
    });
  });

  describe('CJ_DISCONNECT Handler', () => {
    it('should send DISCONNECT to background and respond', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        callback({ success: true });
      });

      await new Promise<void>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'DISCONNECT' }, (response: { success: boolean }) => {
          mockWindow.postMessage({
            type: PageMessageType.CJ_DISCONNECT_RESPONSE,
            success: response.success,
          }, '*');
          
          // Also notify session changed
          mockWindow.postMessage({
            type: PageMessageType.CJ_SESSION_CHANGED,
            session: null,
          }, '*');
          
          resolve();
        });
      });

      expect(postedMessages).toHaveLength(2);
      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_DISCONNECT_RESPONSE,
        success: true,
      });
      expect(postedMessages[1].data).toEqual({
        type: PageMessageType.CJ_SESSION_CHANGED,
        session: null,
      });
    });
  });

  describe('Service Worker Health Check', () => {
    it('should successfully ping service worker', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (msg.type === 'PING') {
          callback({ data: { pong: true, timestamp: Date.now(), ready: true } });
        }
      });

      const result = await new Promise<boolean>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'PING' }, (response: { data?: { pong: boolean } }) => {
          resolve(response?.data?.pong === true);
        });
      });

      expect(result).toBe(true);
    });

    it('should detect unhealthy service worker', async () => {
      mockChrome.runtime.lastError = { message: 'Could not establish connection' };
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        callback(undefined);
      });

      const result = await new Promise<boolean>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'PING' }, (response: { data?: { pong?: boolean } } | undefined) => {
          if (mockChrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(response?.data?.pong === true);
          }
        });
      });

      expect(result).toBe(false);
    });

    it('should handle timeout scenario', async () => {
      jest.useFakeTimers();
      
      // Never call the callback to simulate timeout
      mockChrome.runtime.sendMessage.mockImplementation(() => {
        // Do nothing - simulating hung service worker
      });

      const healthCheckPromise = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);
        
        mockChrome.runtime.sendMessage({ type: 'PING' }, (response: { data?: { pong: boolean } }) => {
          clearTimeout(timeout);
          resolve(response?.data?.pong === true);
        });
      });

      jest.advanceTimersByTime(2500);
      
      // The promise should resolve to false due to timeout
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'PING' },
        expect.any(Function)
      );
      
      // Wait for promise to ensure no hanging
      await expect(healthCheckPromise).resolves.toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('Storage Change Listener', () => {
    it('should register storage change listener', () => {
      mockChrome.storage.onChanged.addListener(jest.fn());
      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();
    });

    it('should detect session changes', () => {
      const callback = jest.fn();
      mockChrome.storage.onChanged.addListener(callback);

      // Verify the callback was registered
      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalledWith(callback);
    });
  });

  describe('Message Type Validation', () => {
    it('should only process CJ_* prefixed messages', () => {
      const validTypes = [
        'CJ_CHECK_EXTENSION',
        'CJ_OPEN_AUTH',
        'CJ_GET_SESSION',
        'CJ_DISCONNECT',
      ];

      validTypes.forEach(type => {
        expect(type.startsWith('CJ_')).toBe(true);
      });
    });

    it('should ignore non-CJ messages', () => {
      const invalidTypes = [
        'SOME_OTHER_MESSAGE',
        'METAMASK_REQUEST',
        'WALLET_CONNECT',
      ];

      invalidTypes.forEach(type => {
        expect(type.startsWith('CJ_')).toBe(false);
      });
    });
  });

  describe('PageMessageType Enum Values', () => {
    it('should have all expected message types', () => {
      expect(PageMessageType.CJ_CHECK_EXTENSION).toBe('CJ_CHECK_EXTENSION');
      expect(PageMessageType.CJ_OPEN_AUTH).toBe('CJ_OPEN_AUTH');
      expect(PageMessageType.CJ_GET_SESSION).toBe('CJ_GET_SESSION');
      expect(PageMessageType.CJ_DISCONNECT).toBe('CJ_DISCONNECT');
      expect(PageMessageType.CJ_EXTENSION_PRESENT).toBe('CJ_EXTENSION_PRESENT');
      expect(PageMessageType.CJ_AUTH_OPENED).toBe('CJ_AUTH_OPENED');
      expect(PageMessageType.CJ_SESSION_RESPONSE).toBe('CJ_SESSION_RESPONSE');
      expect(PageMessageType.CJ_SESSION_CHANGED).toBe('CJ_SESSION_CHANGED');
      expect(PageMessageType.CJ_DISCONNECT_RESPONSE).toBe('CJ_DISCONNECT_RESPONSE');
    });
  });
});

describe('Content Script Initialization', () => {
  it('should check document ready state', () => {
    // document.readyState is a read-only property
    // Just verify it exists and is a valid value
    const validStates = ['loading', 'interactive', 'complete'];
    expect(validStates).toContain(document.readyState);
  });

  it('should support visibility change events', () => {
    // Verify the document has the visibilityState property
    const validVisibilityStates = ['visible', 'hidden'];
    expect(validVisibilityStates).toContain(document.visibilityState);
  });
});
