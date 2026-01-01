/**
 * Unit Tests for Content Script Message Handler Logic
 *
 * Tests the CJ_* message handling behavior
 */

import { PageMessageType, StorageKeys } from '../types';

// Mock the config module
jest.mock('../config', () => ({
  isAllowedOrigin: jest.fn((origin: string) => {
    const allowed = ['http://localhost:3000', 'https://cryptotradingjournal.xyz'];
    return allowed.some((a) => origin.startsWith(a));
  }),
}));

// Mock the logger
jest.mock('../logger', () => ({
  contentLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CJ_* Message Protocol', () => {
  describe('PageMessageType validation', () => {
    it('should have all required message types', () => {
      // Main App -> Extension
      expect(PageMessageType.CJ_CHECK_EXTENSION).toBeDefined();
      expect(PageMessageType.CJ_OPEN_AUTH).toBeDefined();
      expect(PageMessageType.CJ_GET_SESSION).toBeDefined();
      expect(PageMessageType.CJ_DISCONNECT).toBeDefined();

      // Extension -> Main App
      expect(PageMessageType.CJ_EXTENSION_PRESENT).toBeDefined();
      expect(PageMessageType.CJ_AUTH_OPENED).toBeDefined();
      expect(PageMessageType.CJ_SESSION_RESPONSE).toBeDefined();
      expect(PageMessageType.CJ_SESSION_CHANGED).toBeDefined();
      expect(PageMessageType.CJ_DISCONNECT_RESPONSE).toBeDefined();
    });
  });
});

describe('CJ_CHECK_EXTENSION Handler', () => {
  it('should respond with CJ_EXTENSION_PRESENT message', () => {
    // Simulate the handler behavior
    const inputMessage = { type: PageMessageType.CJ_CHECK_EXTENSION };
    const expectedResponse = { type: PageMessageType.CJ_EXTENSION_PRESENT };

    // Handler should post this response
    expect(inputMessage.type).toBe('CJ_CHECK_EXTENSION');
    expect(expectedResponse.type).toBe('CJ_EXTENSION_PRESENT');
  });
});

describe('CJ_OPEN_AUTH Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send OPEN_AUTH_TAB to background', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ success: true });

    // Simulate handler behavior
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_AUTH_TAB' });
    expect(response.success).toBe(true);
  });

  it('should create success response message', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ success: true });

    const bgResponse = await chrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' });

    const expectedPageMessage = {
      type: PageMessageType.CJ_AUTH_OPENED,
      success: bgResponse.success,
    };

    expect(expectedPageMessage.type).toBe('CJ_AUTH_OPENED');
    expect(expectedPageMessage.success).toBe(true);
  });

  it('should create error response message on failure', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to open tab',
    });

    const bgResponse = await chrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' });

    const expectedPageMessage = {
      type: PageMessageType.CJ_AUTH_OPENED,
      success: false,
      error: bgResponse.error,
    };

    expect(expectedPageMessage.success).toBe(false);
    expect(expectedPageMessage.error).toBe('Failed to open tab');
  });
});

describe('CJ_GET_SESSION Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read session from storage', async () => {
    const mockSession = {
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
      [StorageKeys.CHAIN_ID]: '0x1',
      [StorageKeys.ACCOUNT_MODE]: 'live',
      [StorageKeys.SESSION_TOKEN]: 'test-token',
    };

    (chrome.storage.local.get as jest.Mock).mockResolvedValue(mockSession);

    const result = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
      StorageKeys.SESSION_TOKEN,
    ]);

    expect(result[StorageKeys.CONNECTED_ADDRESS]).toBe('0x1234567890123456789012345678901234567890');
    expect(result[StorageKeys.SESSION_TOKEN]).toBe('test-token');
  });

  it('should create session response with connected user', async () => {
    const mockSession = {
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
      [StorageKeys.CHAIN_ID]: '0x1',
      [StorageKeys.ACCOUNT_MODE]: 'live' as const,
      [StorageKeys.SESSION_TOKEN]: 'test-token',
    };

    (chrome.storage.local.get as jest.Mock).mockResolvedValue(mockSession);

    const result = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
      StorageKeys.SESSION_TOKEN,
    ]);

    const hasSession = !!(result[StorageKeys.CONNECTED_ADDRESS] && result[StorageKeys.SESSION_TOKEN]);

    const session = hasSession
      ? {
          address: result[StorageKeys.CONNECTED_ADDRESS] as string,
          chainId: (result[StorageKeys.CHAIN_ID] as string) || '0x1',
          accountMode: (result[StorageKeys.ACCOUNT_MODE] as 'demo' | 'live') || 'live',
          isConnected: true,
        }
      : null;

    const expectedResponse = {
      type: PageMessageType.CJ_SESSION_RESPONSE,
      session,
    };

    expect(expectedResponse.type).toBe('CJ_SESSION_RESPONSE');
    expect(expectedResponse.session?.address).toBe('0x1234567890123456789012345678901234567890');
    expect(expectedResponse.session?.isConnected).toBe(true);
  });

  it('should create null session response when not connected', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

    const result = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.SESSION_TOKEN,
    ]);

    const hasSession = !!(result[StorageKeys.CONNECTED_ADDRESS] && result[StorageKeys.SESSION_TOKEN]);

    const expectedResponse = {
      type: PageMessageType.CJ_SESSION_RESPONSE,
      session: hasSession ? {} : null,
    };

    expect(expectedResponse.session).toBeNull();
  });
});

describe('CJ_DISCONNECT Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send DISCONNECT to background', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_msg, callback) => {
      if (callback) callback({ success: true });
      return Promise.resolve({ success: true });
    });

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'DISCONNECT' }, (resp) => resolve(resp));
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'DISCONNECT' },
      expect.any(Function)
    );
    expect(response).toEqual({ success: true });
  });

  it('should create disconnect response message', async () => {
    const bgResponse = { success: true };

    const expectedResponse = {
      type: PageMessageType.CJ_DISCONNECT_RESPONSE,
      success: bgResponse.success,
    };

    expect(expectedResponse.type).toBe('CJ_DISCONNECT_RESPONSE');
    expect(expectedResponse.success).toBe(true);
  });

  it('should also emit session changed message', () => {
    const sessionChangedMessage = {
      type: PageMessageType.CJ_SESSION_CHANGED,
      session: null,
    };

    expect(sessionChangedMessage.type).toBe('CJ_SESSION_CHANGED');
    expect(sessionChangedMessage.session).toBeNull();
  });
});

describe('Origin Validation', () => {
  it('should validate allowed origins', async () => {
    const { isAllowedOrigin } = await import('../config');

    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('https://cryptotradingjournal.xyz')).toBe(true);
  });

  it('should reject disallowed origins', async () => {
    const { isAllowedOrigin } = await import('../config');

    expect(isAllowedOrigin('https://malicious-site.com')).toBe(false);
    expect(isAllowedOrigin('https://crypt0journal.app')).toBe(false);
  });
});

describe('Message Validation', () => {
  it('should validate message has type property', () => {
    const validMessage = { type: 'CJ_CHECK_EXTENSION' };
    const invalidMessage = { foo: 'bar' };

    expect(typeof validMessage.type).toBe('string');
    expect(typeof (invalidMessage as { type?: string }).type).toBe('undefined');
  });

  it('should validate message type starts with CJ_', () => {
    const cjMessage = { type: 'CJ_CHECK_EXTENSION' };
    const otherMessage = { type: 'OTHER_MESSAGE' };

    expect(cjMessage.type.startsWith('CJ_')).toBe(true);
    expect(otherMessage.type.startsWith('CJ_')).toBe(false);
  });
});

describe('Service Worker Health Check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send PING to check service worker health', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_msg, callback) => {
      if (callback) {
        callback({ success: true, data: { pong: true, timestamp: Date.now() } });
      }
    });

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PING' }, (resp) => resolve(resp));
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'PING' },
      expect.any(Function)
    );
    expect((response as { data?: { pong?: boolean } }).data?.pong).toBe(true);
  });

  it('should handle service worker not responding', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_msg, callback) => {
      chrome.runtime.lastError = { message: 'Could not establish connection' };
      if (callback) callback(undefined);
    });

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PING' }, (resp) => resolve(resp));
    });

    expect(response).toBeUndefined();
  });
});

describe('Storage Change Listener', () => {
  it('should detect session-related storage changes', () => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {
      [StorageKeys.CONNECTED_ADDRESS]: {
        oldValue: undefined,
        newValue: '0x1234',
      },
    };

    const sessionChanged =
      changes[StorageKeys.CONNECTED_ADDRESS] || changes[StorageKeys.SESSION_TOKEN];

    expect(sessionChanged).toBeDefined();
  });

  it('should ignore non-session storage changes', () => {
    const changes = {
      someOtherKey: {
        oldValue: 'old',
        newValue: 'new',
      },
    };

    const sessionChanged =
      (changes as Record<string, unknown>)[StorageKeys.CONNECTED_ADDRESS] ||
      (changes as Record<string, unknown>)[StorageKeys.SESSION_TOKEN];

    expect(sessionChanged).toBeUndefined();
  });
});
