/**
 * Jest Setup - Mock Chrome APIs and global setup
 * 
 * NOTE: Node.js 25.x has known compatibility issues with jsdom.
 * If tests crash with "Cannot read properties of undefined (reading 'target')",
 * use Node.js LTS (20.x or 22.x) instead.
 * 
 * Recommended: nvm use 20 or nvm use 22
 */

// Mock navigator for node environment (when typeof navigator is undefined)
if (typeof navigator === 'undefined') {
  global.navigator = {
    onLine: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

// Mock window for node environment
if (typeof window === 'undefined') {
  global.window = {
    location: { href: '' },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    close: jest.fn(),
    ethereum: undefined,
  };
}

// Mock document for node environment
if (typeof document === 'undefined') {
  global.document = {
    createElement: jest.fn(() => ({
      classList: { add: jest.fn(), remove: jest.fn() },
      textContent: '',
      addEventListener: jest.fn(),
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
    })),
    getElementById: jest.fn(() => null),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    addEventListener: jest.fn(),
    readyState: 'complete',
  };
}

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

// Mock navigator.onLine - only when jsdom defines navigator
if (typeof navigator !== 'undefined' && Object.getOwnPropertyDescriptor(navigator, 'onLine')?.configurable !== false) {
  try {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  } catch {
    // Navigator might already be defined or not configurable
  }
}

// Workaround for jsdom event handling bug
// jsdom crashes with "Cannot read properties of undefined (reading 'target')"
// when handling unhandledrejection events with certain Promise rejections
// See: https://github.com/jsdom/jsdom/issues/3607
if (typeof window !== 'undefined') {
  const originalAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function(type, listener, options) {
    // Skip problematic event types that cause jsdom crashes
    if (type === 'unhandledrejection' || type === 'rejectionhandled') {
      return;
    }
    return originalAddEventListener(type, listener, options);
  };
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  mockChrome.runtime.lastError = null;
});
