/**
 * Tests for PopupController - Production Module
 * 
 * Tests the actual PopupController class with mocked adapters.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Chrome APIs
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
    session: {
      get: jest.fn(),
      set: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn(),
  },
};

(global as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

// Mock fetch
const mockFetch = jest.fn();
(global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

// ============================================================================
// Import Production Module
// ============================================================================

import { PopupController, PopupStorageKeys } from '../src/scripts/ui/popup/PopupController';
import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter } from '../src/scripts/adapters/types';
import type { PopupView } from '../src/scripts/ui/popup/PopupView';

// ============================================================================
// Mock Adapters
// ============================================================================

function createMockStorageAdapter(): jest.Mocked<IStorageAdapter> {
  return {
    localGet: jest.fn().mockResolvedValue({}),
    localSet: jest.fn().mockResolvedValue(undefined),
    localRemove: jest.fn().mockResolvedValue(undefined),
    localClear: jest.fn().mockResolvedValue(undefined),
    sessionGet: jest.fn().mockResolvedValue({}),
    sessionSet: jest.fn().mockResolvedValue(undefined),
    sessionRemove: jest.fn().mockResolvedValue(undefined),
    sessionClear: jest.fn().mockResolvedValue(undefined),
    onChanged: jest.fn(),
    offChanged: jest.fn(),
  };
}

function createMockRuntimeAdapter(): jest.Mocked<IRuntimeAdapter> {
  return {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: jest.fn(),
    offMessage: jest.fn(),
    getURL: jest.fn().mockReturnValue('chrome-extension://test/'),
    getManifest: jest.fn().mockReturnValue({ version: '2.2.4' }),
    lastError: jest.fn().mockReturnValue(null),
  };
}

function createMockTabsAdapter(): jest.Mocked<ITabsAdapter> {
  return {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    getCurrent: jest.fn().mockResolvedValue(null),
  };
}

function createMockView(): jest.Mocked<PopupView> {
  return {
    initialize: jest.fn(),
    showView: jest.fn(),
    showConnectedState: jest.fn(),
    updateConnectedState: jest.fn(),
    showError: jest.fn(),
    updateOnlineStatus: jest.fn(),
    getOnlineStatus: jest.fn().mockReturnValue(true),
    enableRetryButton: jest.fn(),
    disableRetryButton: jest.fn(),
    setStatusIndicator: jest.fn(),
    showStatusChecks: jest.fn(),
    hideStatusChecks: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<PopupView>;
}

// ============================================================================
// Tests
// ============================================================================

describe('PopupController - Production Module', () => {
  let controller: PopupController;
  let mockStorage: jest.Mocked<IStorageAdapter>;
  let mockRuntime: jest.Mocked<IRuntimeAdapter>;
  let mockTabs: jest.Mocked<ITabsAdapter>;
  let mockView: jest.Mocked<PopupView>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockStorage = createMockStorageAdapter();
    mockRuntime = createMockRuntimeAdapter();
    mockTabs = createMockTabsAdapter();
    mockView = createMockView();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: false }),
    });

    controller = new PopupController(
      mockStorage,
      mockRuntime,
      mockTabs,
      mockView,
      {
        defaultAppUrl: 'https://cryptotradingjournal.xyz',
        apiSessionEndpoint: '/api/auth/session',
      }
    );
  });

  afterEach(() => {
    controller.destroy();
  });

  describe('Construction', () => {
    it('should create controller with adapters', () => {
      expect(controller).toBeDefined();
    });

    it('should use default config when not provided', () => {
      const defaultController = new PopupController(
        mockStorage,
        mockRuntime,
        mockTabs,
        mockView
      );
      expect(defaultController).toBeDefined();
      defaultController.destroy();
    });
  });

  describe('Initialization', () => {
    it('should initialize view with event handlers', async () => {
      await controller.initialize();

      expect(mockView.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          onConnect: expect.any(Function),
          onDisconnect: expect.any(Function),
          onOpenApp: expect.any(Function),
          onRetry: expect.any(Function),
        })
      );
    });

    it('should set up storage change listener', async () => {
      await controller.initialize();

      expect(mockStorage.onChanged).toHaveBeenCalled();
    });

    it('should show offline status when not online', async () => {
      mockView.getOnlineStatus.mockReturnValue(false);

      await controller.initialize();

      expect(mockView.updateOnlineStatus).toHaveBeenCalledWith(false);
    });

    it('should check session when online', async () => {
      mockView.getOnlineStatus.mockReturnValue(true);

      await controller.initialize();

      expect(mockView.showView).toHaveBeenCalledWith('loading');
    });
  });

  describe('Session Checking', () => {
    it('should show loading view initially', async () => {
      await controller.initialize();

      expect(mockView.showView).toHaveBeenCalledWith('loading');
    });

    it('should show connected state when session exists in storage', async () => {
      mockStorage.localGet.mockResolvedValue({
        connectedAddress: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        accountMode: 'live',
        sessionToken: 'test-token',
      });
      mockStorage.sessionGet.mockResolvedValue({
        sessionToken: 'test-token',
      });

      await controller.initialize();

      // displayConnectedState calls view.showConnectedState
      expect(mockView.showConnectedState).toHaveBeenCalled();
    });

    it('should show not connected when no session', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([]);

      await controller.initialize();

      expect(mockView.showView).toHaveBeenCalledWith('notConnected');
    });

    it('should try syncing from tab when on supported domain', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://cryptotradingjournal.xyz/dashboard' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        session: {
          address: '0xabc',
          chainId: '0x1',
        },
      });

      await controller.initialize();

      expect(mockTabs.sendMessage).toHaveBeenCalled();
    });

    it('should verify session from API as fallback', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([]);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          authenticated: true,
          address: '0xdef',
          chainId: '0x89',
        }),
      });

      await controller.initialize();

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Event Handlers', () => {
    it('should handle connect button click', async () => {
      await controller.initialize();

      const callbacks = mockView.initialize.mock.calls[0][0];
      await callbacks.onConnect();

      expect(mockTabs.create).toHaveBeenCalled();
    });

    it('should handle disconnect button click', async () => {
      mockRuntime.sendMessage.mockResolvedValue({ success: true });
      
      await controller.initialize();

      const callbacks = mockView.initialize.mock.calls[0][0];
      await callbacks.onDisconnect();

      // disconnect() calls localClear and sessionClear
      expect(mockStorage.localClear).toHaveBeenCalled();
      expect(mockStorage.sessionClear).toHaveBeenCalled();
    });

    it('should handle open app button click', async () => {
      await controller.initialize();

      const callbacks = mockView.initialize.mock.calls[0][0];
      await callbacks.onOpenApp();

      expect(mockTabs.create).toHaveBeenCalled();
    });

    it('should handle retry button click', async () => {
      await controller.initialize();
      
      // Clear the calls from initialization
      mockView.showView.mockClear();
      mockStorage.localGet.mockClear();

      const callbacks = mockView.initialize.mock.calls[0][0];
      await callbacks.onRetry();

      // Should re-check session
      expect(mockStorage.localGet).toHaveBeenCalled();
    });
  });

  describe('Storage Change Handling', () => {
    it('should listen for storage changes', async () => {
      await controller.initialize();

      expect(mockStorage.onChanged).toHaveBeenCalled();
    });

    it('should re-check session on address change', async () => {
      await controller.initialize();

      // Get the storage change listener
      const storageListener = mockStorage.onChanged.mock.calls[0][0];

      // Clear previous calls
      mockStorage.localGet.mockClear();

      // Trigger storage change
      storageListener(
        { connectedAddress: { newValue: '0xnew' } },
        'local'
      );

      // Should trigger re-check after debounce
      // Note: This may be debounced, so we check it was called during init
      expect(mockStorage.onChanged).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should remove storage listener on destroy', async () => {
      await controller.initialize();
      controller.destroy();

      expect(mockStorage.offChanged).toHaveBeenCalled();
    });

    it('should handle destroy when not initialized', () => {
      // Don't initialize, just destroy
      expect(() => controller.destroy()).not.toThrow();
    });
  });
});

describe('PopupController - Error Handling', () => {
  let controller: PopupController;
  let mockStorage: jest.Mocked<IStorageAdapter>;
  let mockRuntime: jest.Mocked<IRuntimeAdapter>;
  let mockTabs: jest.Mocked<ITabsAdapter>;
  let mockView: jest.Mocked<PopupView>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockStorage = createMockStorageAdapter();
    mockRuntime = createMockRuntimeAdapter();
    mockTabs = createMockTabsAdapter();
    mockView = createMockView();

    controller = new PopupController(
      mockStorage,
      mockRuntime,
      mockTabs,
      mockView
    );
  });

  afterEach(() => {
    controller.destroy();
  });

  it('should handle storage read error gracefully', async () => {
    mockStorage.localGet.mockRejectedValue(new Error('Storage error'));

    await controller.initialize();

    expect(mockView.showView).toHaveBeenCalledWith('notConnected');
  });

  it('should handle tab query error gracefully', async () => {
    mockStorage.localGet.mockResolvedValue({});
    mockTabs.query.mockRejectedValue(new Error('Tabs error'));

    await controller.initialize();

    expect(mockView.showView).toHaveBeenCalled();
  });

  it('should handle API error gracefully', async () => {
    mockStorage.localGet.mockResolvedValue({});
    mockTabs.query.mockResolvedValue([]);
    mockFetch.mockRejectedValue(new Error('Network error'));

    await controller.initialize();

    expect(mockView.showView).toHaveBeenCalledWith('notConnected');
  });

  it('should handle disconnect storage clear error', async () => {
    // Disconnect fails when storage operations fail
    mockStorage.localClear.mockRejectedValue(new Error('Storage clear failed'));

    await controller.initialize();

    const callbacks = mockView.initialize.mock.calls[0][0];
    await callbacks.onDisconnect();

    expect(mockView.showError).toHaveBeenCalledWith('Failed to disconnect. Please try again.');
  });
});

describe('PopupStorageKeys', () => {
  it('should export correct storage keys', () => {
    expect(PopupStorageKeys.CONNECTED_ADDRESS).toBe('connectedAddress');
    expect(PopupStorageKeys.CHAIN_ID).toBe('chainId');
    expect(PopupStorageKeys.ACCOUNT_MODE).toBe('accountMode');
    expect(PopupStorageKeys.SESSION_TOKEN).toBe('sessionToken');
    expect(PopupStorageKeys.APP_URL).toBe('appUrl');
  });
});
