/**
 * Jest Setup - Mock Chrome APIs and global setup
 */

// Mock chrome.runtime
const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({ success: true, data: {} });
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    lastError: null,
    getURL: jest.fn((path) => `chrome-extension://test-extension-id/${path}`),
  },
  storage: {
    local: {
      get: jest.fn((keys) => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve()),
    },
    session: {
      get: jest.fn((keys) => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    sendMessage: jest.fn((tabId, message, callback) => {
      if (callback) callback({ success: true });
    }),
  },
};

// Assign to global
global.chrome = mockChrome;

// Mock window.ethereum for tests
Object.defineProperty(global, 'ethereum', {
  value: undefined,
  writable: true,
  configurable: true,
});

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    status: 200,
    statusText: 'OK',
  })
);

// Mock AbortSignal.timeout
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  value: true,
  writable: true,
  configurable: true,
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockChrome.runtime.lastError = null;
});
