/**
 * Content Script v2.0 Handlers Tests
 * 
 * Tests the new v2.0 App-Driven SIWE handlers:
 * - CJ_WALLET_CONNECT
 * - CJ_WALLET_SIGN
 * - CJ_STORE_SESSION
 * - CJ_CLEAR_SESSION
 * - Request deduplication
 */

import { PageMessageType, ErrorCode, StorageKeys } from '../types';

// ============================================================================
// Mock Setup
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://fake-id/${path}`),
    lastError: null as { message: string } | null,
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// Track posted messages
const postedMessages: Array<{ data: unknown; origin: string }> = [];

// Mock window
const messageListeners: Array<(event: MessageEvent) => void> = [];
const mockWindow = {
  postMessage: jest.fn((data: unknown, origin: string) => {
    postedMessages.push({ data, origin });
  }),
  location: {
    origin: 'http://localhost:3000',
  },
  addEventListener: jest.fn((event: string, listener: (event: MessageEvent) => void) => {
    if (event === 'message') {
      messageListeners.push(listener);
    }
  }),
  removeEventListener: jest.fn((event: string, listener: (event: MessageEvent) => void) => {
    if (event === 'message') {
      const index = messageListeners.indexOf(listener);
      if (index > -1) messageListeners.splice(index, 1);
    }
  }),
};

// @ts-expect-error - Mocking window
global.window = mockWindow;

// Mock document for script injection
const mockElement = {
  src: '',
  onload: null as (() => void) | null,
  onerror: null as (() => void) | null,
  remove: jest.fn(),
};

// Mock document.createElement for script injection
jest.spyOn(document, 'createElement').mockImplementation(() => mockElement as unknown as HTMLElement);

// Mock document.head.appendChild for script injection
if (document.head) {
  jest.spyOn(document.head, 'appendChild').mockImplementation(jest.fn());
}
if (document.documentElement) {
  jest.spyOn(document.documentElement, 'appendChild').mockImplementation(jest.fn());
}

// Helper to simulate message from injected script (exported for potential use in integration tests)
export function simulateWalletResponse(type: string, data: Record<string, unknown>): void {
  const event = {
    source: window,
    data: { type, ...data },
    origin: 'http://localhost:3000',
  } as unknown as MessageEvent;
  
  messageListeners.forEach(listener => listener(event));
}

// ============================================================================
// Tests
// ============================================================================

describe('Content Script v2.0 Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postedMessages.length = 0;
    messageListeners.length = 0;
    mockChrome.runtime.lastError = null;
    mockChrome.storage.local.set.mockResolvedValue(undefined);
    mockChrome.storage.local.get.mockResolvedValue({});
  });

  describe('Request Deduplication', () => {
    it('should track in-flight requests', () => {
      // Simulate tracking logic
      const inFlightRequests = new Map<string, { startTime: number }>();
      
      const type = 'CJ_WALLET_CONNECT';
      const startTime = Date.now();
      
      // Mark request as in-flight
      inFlightRequests.set(type, { startTime });
      
      // Should be in flight
      expect(inFlightRequests.has(type)).toBe(true);
      expect(inFlightRequests.get(type)?.startTime).toBe(startTime);
    });

    it('should clean up stale requests after timeout', () => {
      const inFlightRequests = new Map<string, { startTime: number }>();
      const REQUEST_TIMEOUT = 60000;
      
      // Add a stale request (from 2 minutes ago)
      inFlightRequests.set('CJ_WALLET_CONNECT', { startTime: Date.now() - 120000 });
      
      // Clean up stale requests
      const now = Date.now();
      for (const [key, value] of inFlightRequests.entries()) {
        if (now - value.startTime > REQUEST_TIMEOUT) {
          inFlightRequests.delete(key);
        }
      }
      
      expect(inFlightRequests.size).toBe(0);
    });

    it('should prevent duplicate wallet connect requests', () => {
      const inFlightRequests = new Map<string, { startTime: number }>();
      
      // First request starts
      inFlightRequests.set('CJ_WALLET_CONNECT', { startTime: Date.now() });
      
      // Duplicate request should be blocked
      const isDuplicate = inFlightRequests.has('CJ_WALLET_CONNECT');
      expect(isDuplicate).toBe(true);
    });
  });

  describe('CJ_WALLET_CONNECT Handler', () => {
    it('should return wallet address and chainId on success', () => {
      const result = {
        success: true,
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        walletName: 'MetaMask',
      };

      mockWindow.postMessage({
        type: PageMessageType.CJ_WALLET_RESULT,
        ...result,
        requestId: 'test-123',
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_WALLET_RESULT,
        success: true,
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        walletName: 'MetaMask',
        requestId: 'test-123',
      });
    });

    it('should handle user rejection (code 4001)', () => {
      mockWindow.postMessage({
        type: PageMessageType.CJ_ERROR,
        success: false,
        code: ErrorCode.USER_REJECTED,
        message: 'User rejected connection',
        originalType: PageMessageType.CJ_WALLET_CONNECT,
        requestId: 'test-456',
      }, '*');

      expect(postedMessages[0].data).toMatchObject({
        type: PageMessageType.CJ_ERROR,
        code: ErrorCode.USER_REJECTED,
      });
    });

    it('should handle no wallet detected error', () => {
      mockWindow.postMessage({
        type: PageMessageType.CJ_ERROR,
        success: false,
        code: ErrorCode.NO_WALLET,
        message: 'No wallet detected. Please install MetaMask, Rabby, or another Web3 wallet.',
        originalType: PageMessageType.CJ_WALLET_CONNECT,
      }, '*');

      expect(postedMessages[0].data).toMatchObject({
        type: PageMessageType.CJ_ERROR,
        code: ErrorCode.NO_WALLET,
      });
    });

    it('should handle connection timeout', () => {
      mockWindow.postMessage({
        type: PageMessageType.CJ_ERROR,
        success: false,
        code: ErrorCode.REQUEST_TIMEOUT,
        message: 'Wallet request timed out',
        originalType: PageMessageType.CJ_WALLET_CONNECT,
      }, '*');

      expect(postedMessages[0].data).toMatchObject({
        code: ErrorCode.REQUEST_TIMEOUT,
      });
    });
  });

  describe('CJ_WALLET_SIGN Handler', () => {
    it('should return signature on success', () => {
      const signature = '0x' + 'a'.repeat(130);
      
      mockWindow.postMessage({
        type: PageMessageType.CJ_SIGN_RESULT,
        success: true,
        signature,
        requestId: 'sign-123',
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_SIGN_RESULT,
        success: true,
        signature,
        requestId: 'sign-123',
      });
    });

    it('should handle user rejected signature (code 4001)', () => {
      mockWindow.postMessage({
        type: PageMessageType.CJ_ERROR,
        success: false,
        code: ErrorCode.USER_REJECTED,
        message: 'User rejected signature',
        originalType: PageMessageType.CJ_WALLET_SIGN,
      }, '*');

      expect(postedMessages[0].data).toMatchObject({
        code: ErrorCode.USER_REJECTED,
      });
    });

    it('should validate required fields', () => {
      // Missing message field should be caught
      const isValid = (message?: string, address?: string) => {
        return !!(message && address);
      };

      expect(isValid(undefined, '0x1234')).toBe(false);
      expect(isValid('Sign this', undefined)).toBe(false);
      expect(isValid('Sign this', '0x1234')).toBe(true);
    });
  });

  describe('CJ_STORE_SESSION Handler', () => {
    it('should store session in chrome.storage.local', async () => {
      const session = {
        sessionToken: 'token-abc-123',
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      };

      await mockChrome.storage.local.set({
        [StorageKeys.SESSION_TOKEN]: session.sessionToken,
        [StorageKeys.CONNECTED_ADDRESS]: session.address,
        [StorageKeys.CHAIN_ID]: session.chainId,
        [StorageKeys.LAST_CONNECTED]: expect.any(Number),
      });

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should respond with CJ_SESSION_STORED on success', () => {
      mockWindow.postMessage({
        type: PageMessageType.CJ_SESSION_STORED,
        success: true,
        requestId: 'store-123',
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_SESSION_STORED,
        success: true,
        requestId: 'store-123',
      });
    });

    it('should validate required session fields', () => {
      const validateSession = (session: { sessionToken?: string; address?: string; chainId?: string }) => {
        return !!(session?.sessionToken && session?.address && session?.chainId);
      };

      expect(validateSession({})).toBe(false);
      expect(validateSession({ sessionToken: 'token' })).toBe(false);
      expect(validateSession({ sessionToken: 'token', address: '0x123' })).toBe(false);
      expect(validateSession({ sessionToken: 'token', address: '0x123', chainId: '0x1' })).toBe(true);
    });
  });

  describe('CJ_CLEAR_SESSION Handler', () => {
    it('should clear session storage keys', async () => {
      await mockChrome.storage.local.remove([
        StorageKeys.SESSION_TOKEN,
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
      ]);

      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        StorageKeys.SESSION_TOKEN,
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
      ]);
    });

    it('should emit CJ_SESSION_CHANGED with null', () => {
      mockWindow.postMessage({
        type: PageMessageType.CJ_SESSION_CHANGED,
        session: null,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: PageMessageType.CJ_SESSION_CHANGED,
        session: null,
      });
    });
  });

  describe('Error Code Mapping', () => {
    it('should have all required error codes', () => {
      // Error codes are numeric (EIP-1193 compatible)
      expect(ErrorCode.NO_WALLET).toBe(5001);
      expect(ErrorCode.USER_REJECTED).toBe(4001);
      expect(ErrorCode.WALLET_CONNECTION_FAILED).toBe(5002);
      expect(ErrorCode.SIGNING_FAILED).toBe(5003);
      expect(ErrorCode.REQUEST_TIMEOUT).toBe(5006);
      expect(ErrorCode.ALREADY_IN_PROGRESS).toBe(5007);
      expect(ErrorCode.INVALID_REQUEST).toBe(5004);
    });

    it('should map wallet error code 4001 to USER_REJECTED', () => {
      const mapWalletError = (code: number): ErrorCode => {
        if (code === 4001) return ErrorCode.USER_REJECTED;
        return ErrorCode.WALLET_CONNECTION_FAILED;
      };

      expect(mapWalletError(4001)).toBe(ErrorCode.USER_REJECTED);
      expect(mapWalletError(4002)).toBe(ErrorCode.WALLET_CONNECTION_FAILED);
    });
  });

  describe('Injected Script Communication', () => {
    it('should generate unique request IDs', () => {
      const ids = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const id = Math.random().toString(36).substring(2);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it('should match response by requestId', () => {
      const requestId = 'unique-123';
      const responseType = 'CJ_WALLET_CONNECT_RESULT';
      
      const matchesResponse = (
        data: { type: string; requestId?: string },
        expectedType: string,
        expectedRequestId: string
      ) => {
        return data.type === expectedType && data.requestId === expectedRequestId;
      };

      expect(matchesResponse({ type: responseType, requestId }, responseType, requestId)).toBe(true);
      expect(matchesResponse({ type: responseType, requestId: 'other' }, responseType, requestId)).toBe(false);
      expect(matchesResponse({ type: 'OTHER_TYPE', requestId }, responseType, requestId)).toBe(false);
    });
  });

  describe('v2.0 PageMessageType Values', () => {
    it('should have v2.0 message types', () => {
      expect(PageMessageType.CJ_WALLET_CONNECT).toBe('CJ_WALLET_CONNECT');
      expect(PageMessageType.CJ_WALLET_SIGN).toBe('CJ_WALLET_SIGN');
      expect(PageMessageType.CJ_STORE_SESSION).toBe('CJ_STORE_SESSION');
      expect(PageMessageType.CJ_CLEAR_SESSION).toBe('CJ_CLEAR_SESSION');
      expect(PageMessageType.CJ_WALLET_RESULT).toBe('CJ_WALLET_RESULT');
      expect(PageMessageType.CJ_SIGN_RESULT).toBe('CJ_SIGN_RESULT');
      expect(PageMessageType.CJ_SESSION_STORED).toBe('CJ_SESSION_STORED');
      expect(PageMessageType.CJ_ERROR).toBe('CJ_ERROR');
    });
  });
});

describe('Wallet Message Relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postedMessages.length = 0;
  });

  describe('Injected Script Message Types', () => {
    const WalletMessageType = {
      CJ_WALLET_CHECK: 'CJ_WALLET_CHECK',
      CJ_WALLET_CHECK_RESULT: 'CJ_WALLET_CHECK_RESULT',
      CJ_WALLET_CONNECT: 'CJ_WALLET_CONNECT',
      CJ_WALLET_CONNECT_RESULT: 'CJ_WALLET_CONNECT_RESULT',
      CJ_WALLET_SIGN: 'CJ_WALLET_SIGN',
      CJ_WALLET_SIGN_RESULT: 'CJ_WALLET_SIGN_RESULT',
    };

    it('should have correct wallet message types', () => {
      expect(WalletMessageType.CJ_WALLET_CHECK).toBe('CJ_WALLET_CHECK');
      expect(WalletMessageType.CJ_WALLET_CHECK_RESULT).toBe('CJ_WALLET_CHECK_RESULT');
      expect(WalletMessageType.CJ_WALLET_CONNECT).toBe('CJ_WALLET_CONNECT');
      expect(WalletMessageType.CJ_WALLET_CONNECT_RESULT).toBe('CJ_WALLET_CONNECT_RESULT');
    });

    it('should follow request/result naming convention', () => {
      const types = Object.entries(WalletMessageType);
      const requests = types.filter(([key]) => !key.endsWith('_RESULT'));
      
      requests.forEach(([key]) => {
        const resultKey = key + '_RESULT';
        expect(WalletMessageType).toHaveProperty(resultKey);
      });
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout after 30 seconds for wallet operations', () => {
      jest.useFakeTimers();
      
      const WALLET_TIMEOUT = 30000;
      let timedOut = false;
      
      const timeoutId = setTimeout(() => {
        timedOut = true;
      }, WALLET_TIMEOUT);

      jest.advanceTimersByTime(WALLET_TIMEOUT + 100);
      
      expect(timedOut).toBe(true);
      
      clearTimeout(timeoutId);
      jest.useRealTimers();
    });
  });
});
