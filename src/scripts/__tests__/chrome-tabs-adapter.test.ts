/**
 * ChromeTabsAdapter Tests
 *
 * Tests for the Chrome tabs API adapter.
 */

import { ChromeTabsAdapter } from '../adapters/ChromeTabsAdapter';

// Mock chrome.tabs and chrome.windows API
const mockChrome = {
  tabs: {
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    sendMessage: jest.fn(),
    remove: jest.fn(),
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  windows: {
    update: jest.fn(),
  },
  runtime: {
    lastError: null as { message: string } | null,
  },
};

// Assign mock to global
(global as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

describe('ChromeTabsAdapter', () => {
  let adapter: ChromeTabsAdapter;

  beforeEach(() => {
    adapter = new ChromeTabsAdapter();
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  // ==========================================================================
  // query tests
  // ==========================================================================

  describe('query', () => {
    it('should query tabs and map results to TabInfo', async () => {
      const mockTabs = [
        { id: 1, url: 'https://example.com', title: 'Example', active: true, windowId: 1 },
        { id: 2, url: 'https://test.com', title: 'Test', active: false, windowId: 1 },
      ];
      mockChrome.tabs.query.mockResolvedValue(mockTabs);

      const result = await adapter.query({ active: true });

      expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        windowId: 1,
      });
    });

    it('should handle empty results', async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      const result = await adapter.query({});

      expect(result).toEqual([]);
    });

    it('should pass through query options', async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      await adapter.query({ active: true, currentWindow: true, url: '*://example.com/*' });

      expect(mockChrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
        url: '*://example.com/*',
      });
    });
  });

  // ==========================================================================
  // get tests
  // ==========================================================================

  describe('get', () => {
    it('should get tab by ID', async () => {
      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', active: true, windowId: 1 };
      mockChrome.tabs.get.mockResolvedValue(mockTab);

      const result = await adapter.get(1);

      expect(mockChrome.tabs.get).toHaveBeenCalledWith(1);
      expect(result).toEqual({
        id: 1,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        windowId: 1,
      });
    });

    it('should propagate errors from chrome.tabs.get', async () => {
      mockChrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      await expect(adapter.get(999)).rejects.toThrow('Tab not found');
    });
  });

  // ==========================================================================
  // create tests
  // ==========================================================================

  describe('create', () => {
    it('should create tab with options', async () => {
      const mockTab = { id: 1, url: 'https://example.com', title: '', active: true, windowId: 1 };
      mockChrome.tabs.create.mockResolvedValue(mockTab);

      const result = await adapter.create({ url: 'https://example.com', active: true });

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com', active: true });
      expect(result).toEqual({
        id: 1,
        url: 'https://example.com',
        title: '',
        active: true,
        windowId: 1,
      });
    });

    it('should create tab with minimal options', async () => {
      const mockTab = { id: 2, url: undefined, title: undefined, active: true, windowId: 1 };
      mockChrome.tabs.create.mockResolvedValue(mockTab);

      const result = await adapter.create({});

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({});
      expect(result.id).toBe(2);
    });
  });

  // ==========================================================================
  // update tests
  // ==========================================================================

  describe('update', () => {
    it('should update tab with active property', async () => {
      const mockTab = { id: 1, url: 'https://example.com', title: 'Example', active: true, windowId: 1 };
      mockChrome.tabs.update.mockResolvedValue(mockTab);

      const result = await adapter.update(1, { active: true });

      expect(mockChrome.tabs.update).toHaveBeenCalledWith(1, { active: true });
      expect(result.active).toBe(true);
    });

    it('should update tab with url property', async () => {
      const mockTab = { id: 1, url: 'https://new-url.com', title: 'New', active: true, windowId: 1 };
      mockChrome.tabs.update.mockResolvedValue(mockTab);

      const result = await adapter.update(1, { url: 'https://new-url.com' });

      expect(mockChrome.tabs.update).toHaveBeenCalledWith(1, { url: 'https://new-url.com' });
      expect(result.url).toBe('https://new-url.com');
    });
  });

  // ==========================================================================
  // focusWindow tests
  // ==========================================================================

  describe('focusWindow', () => {
    it('should focus window by ID', async () => {
      mockChrome.windows.update.mockResolvedValue({});

      await adapter.focusWindow(1);

      expect(mockChrome.windows.update).toHaveBeenCalledWith(1, { focused: true });
    });
  });

  // ==========================================================================
  // sendMessage tests
  // ==========================================================================

  describe('sendMessage', () => {
    it('should send message to tab and return response', async () => {
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        callback({ success: true, data: 'test' });
      });

      const result = await adapter.sendMessage(1, { type: 'TEST' });

      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { type: 'TEST' },
        expect.any(Function)
      );
      expect(result).toEqual({ success: true, data: 'test' });
    });

    it('should reject on chrome.runtime.lastError', async () => {
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, _message, callback) => {
        mockChrome.runtime.lastError = { message: 'Tab does not exist' };
        callback(undefined);
      });

      await expect(adapter.sendMessage(999, { type: 'TEST' })).rejects.toThrow('Tab does not exist');
    });
  });

  // ==========================================================================
  // remove tests
  // ==========================================================================

  describe('remove', () => {
    it('should remove tab by ID', async () => {
      mockChrome.tabs.remove.mockResolvedValue(undefined);

      await adapter.remove(1);

      expect(mockChrome.tabs.remove).toHaveBeenCalledWith(1);
    });
  });

  // ==========================================================================
  // Tab listener tests
  // ==========================================================================

  describe('addTabListener', () => {
    it('should add onRemoved listener', () => {
      const listener = jest.fn();

      adapter.addTabListener('onRemoved', listener);

      expect(mockChrome.tabs.onRemoved.addListener).toHaveBeenCalledWith(listener);
    });

    it('should add onUpdated listener', () => {
      const listener = jest.fn();

      adapter.addTabListener('onUpdated', listener);

      expect(mockChrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(listener);
    });
  });

  describe('removeTabListener', () => {
    it('should remove onRemoved listener', () => {
      const listener = jest.fn();

      adapter.removeTabListener('onRemoved', listener);

      expect(mockChrome.tabs.onRemoved.removeListener).toHaveBeenCalledWith(listener);
    });

    it('should remove onUpdated listener', () => {
      const listener = jest.fn();

      adapter.removeTabListener('onUpdated', listener);

      expect(mockChrome.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
    });
  });
});
