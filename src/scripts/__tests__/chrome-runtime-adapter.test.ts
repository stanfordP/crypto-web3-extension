/**
 * Chrome Runtime Adapter Tests
 * 
 * Tests for the Chrome runtime adapter wrapper
 */

import { ChromeRuntimeAdapter } from '../adapters/ChromeRuntimeAdapter';
import type { MessageListener } from '../adapters/types';

// ============================================================================
// Chrome API Mock
// ============================================================================

const mockMessageListeners = new Set<(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean | void>();
let mockLastError: { message: string } | null = null;

const mockChromeRuntime = {
  id: 'test-extension-id',
  get lastError() {
    return mockLastError;
  },
  sendMessage: jest.fn((_message: unknown, callback?: (response: unknown) => void) => {
    if (callback) {
      callback({ success: true });
    }
  }),
  getURL: jest.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
  onMessage: {
    addListener: jest.fn((listener: (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean | void) => {
      mockMessageListeners.add(listener);
    }),
    removeListener: jest.fn((listener: (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean | void) => {
      mockMessageListeners.delete(listener);
    }),
  },
};

// Set up global chrome mock
(global as unknown as { chrome: { runtime: typeof mockChromeRuntime } }).chrome = {
  runtime: mockChromeRuntime,
};

// Helper to simulate message from content script
function simulateMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  return new Promise((resolve) => {
    for (const listener of mockMessageListeners) {
      const sendResponse = (response?: unknown) => resolve(response);
      listener(message, sender, sendResponse);
    }
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('ChromeRuntimeAdapter', () => {
  let adapter: ChromeRuntimeAdapter;

  beforeEach(() => {
    mockMessageListeners.clear();
    mockLastError = null;
    jest.clearAllMocks();
    
    adapter = new ChromeRuntimeAdapter();
  });

  afterEach(() => {
    adapter.destroy();
  });

  describe('id', () => {
    it('should return extension id', () => {
      expect(adapter.id).toBe('test-extension-id');
    });
  });

  describe('lastError', () => {
    it('should return null when no error', () => {
      expect(adapter.lastError).toBeNull();
    });

    it('should return error message when error exists', () => {
      mockLastError = { message: 'Test error' };
      
      // Need to create new adapter after setting lastError
      const newAdapter = new ChromeRuntimeAdapter();
      expect(newAdapter.lastError).toEqual({ message: 'Test error' });
      newAdapter.destroy();
    });
  });

  describe('sendMessage', () => {
    it('should send message via chrome.runtime', async () => {
      const message = { type: 'TEST', data: 'hello' };
      
      await adapter.sendMessage(message);

      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
        message,
        expect.any(Function)
      );
    });

    it('should resolve with response', async () => {
      mockChromeRuntime.sendMessage.mockImplementationOnce((_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ data: 'response' });
      });

      const result = await adapter.sendMessage({ type: 'TEST' });

      expect(result).toEqual({ data: 'response' });
    });

    it('should reject on chrome.runtime.lastError', async () => {
      mockChromeRuntime.sendMessage.mockImplementationOnce((_message: unknown, callback?: (response: unknown) => void) => {
        mockLastError = { message: 'Send error' };
        if (callback) callback(undefined);
      });

      await expect(adapter.sendMessage({ type: 'TEST' })).rejects.toThrow('Send error');
    });
  });

  describe('getURL', () => {
    it('should return full extension URL', () => {
      const url = adapter.getURL('popup.html');

      expect(url).toBe('chrome-extension://test-extension-id/popup.html');
      expect(mockChromeRuntime.getURL).toHaveBeenCalledWith('popup.html');
    });
  });

  describe('onMessage', () => {
    it('should register message listener', () => {
      const listener: MessageListener = jest.fn();
      
      adapter.onMessage(listener);

      expect(mockChromeRuntime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should convert sender to RuntimeMessageSender format', async () => {
      const listener: MessageListener = jest.fn((_message, _sender, sendResponse) => {
        sendResponse({ received: true });
      });
      
      adapter.onMessage(listener);

      const chromeSender: chrome.runtime.MessageSender = {
        id: 'sender-id',
        url: 'https://example.com',
        tab: {
          id: 1,
          index: 0,
          windowId: 1,
          highlighted: true,
          active: true,
          pinned: false,
          incognito: false,
          selected: false,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
          url: 'https://example.com/page',
          title: 'Example Page',
        },
        frameId: 0,
      };

      await simulateMessage({ type: 'TEST' }, chromeSender);

      expect(listener).toHaveBeenCalledWith(
        { type: 'TEST' },
        {
          id: 'sender-id',
          url: 'https://example.com',
          tab: {
            id: 1,
            url: 'https://example.com/page',
            title: 'Example Page',
          },
          frameId: 0,
        },
        expect.any(Function)
      );
    });

    it('should handle listener that returns a Promise', async () => {
      const listener: MessageListener = jest.fn(async (_message, _sender, _sendResponse) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { async: true };
      });
      
      adapter.onMessage(listener);

      await simulateMessage({ type: 'ASYNC_TEST' }, { id: 'test' });
      
      // Note: The actual response handling depends on how the chrome listener wrapper works
    });
  });

  describe('offMessage', () => {
    it('should remove message listener', () => {
      const listener: MessageListener = jest.fn();
      
      adapter.onMessage(listener);
      adapter.offMessage(listener);

      expect(mockChromeRuntime.onMessage.removeListener).toHaveBeenCalled();
    });

    it('should handle removing non-existent listener', () => {
      const listener: MessageListener = jest.fn();
      
      // Should not throw
      expect(() => adapter.offMessage(listener)).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('should remove all message listeners', () => {
      const listener1: MessageListener = jest.fn();
      const listener2: MessageListener = jest.fn();
      
      adapter.onMessage(listener1);
      adapter.onMessage(listener2);
      adapter.destroy();

      // Should have removed both listeners
      expect(mockChromeRuntime.onMessage.removeListener).toHaveBeenCalledTimes(2);
    });
  });
});
