/**
 * Tests for PopupController
 * 
 * Tests the popup UI controller that manages session display and user interactions.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Dependencies
// ============================================================================

const mockView = {
  initialize: jest.fn(),
  showView: jest.fn(),
  updateConnectedState: jest.fn(),
  updateOnlineStatus: jest.fn(),
  updateStatusIndicators: jest.fn(),
  getOnlineStatus: jest.fn().mockReturnValue(true),
  showError: jest.fn(),
};

const mockStorage = {
  localGet: jest.fn(),
  localSet: jest.fn(),
  sessionGet: jest.fn(),
  sessionSet: jest.fn(),
  onChanged: jest.fn(),
  offChanged: jest.fn(),
};

const mockTabs = {
  query: jest.fn(),
  sendMessage: jest.fn(),
  create: jest.fn(),
};

const mockConfig = {
  appUrl: 'https://cryptotradingjournal.xyz',
  apiSessionEndpoint: '/api/auth/session',
  apiDisconnectEndpoint: '/api/auth/disconnect',
};

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ============================================================================
// Test Controller Implementation
// ============================================================================

interface SessionData {
  connectedAddress?: string;
  chainId?: string;
  accountMode?: string;
  sessionToken?: string;
}

interface TabSessionResponse {
  success: boolean;
  session?: {
    address: string;
    chainId: string;
    sessionToken?: string;
  };
}

interface ApiSessionResponse {
  authenticated: boolean;
  address?: string;
  chainId?: string;
}

const PopupStorageKeys = {
  CONNECTED_ADDRESS: 'connectedAddress',
  CHAIN_ID: 'chainId',
  ACCOUNT_MODE: 'accountMode',
  SESSION_TOKEN: 'sessionToken',
} as const;

class TestPopupController {
  private view: typeof mockView;
  private storage: typeof mockStorage;
  private tabs: typeof mockTabs;
  private config: typeof mockConfig;
  private storageListener: ((changes: unknown) => void) | null = null;

  constructor(
    view: typeof mockView,
    storage: typeof mockStorage,
    tabs: typeof mockTabs,
    config: typeof mockConfig
  ) {
    this.view = view;
    this.storage = storage;
    this.tabs = tabs;
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.view.initialize({
      onConnect: () => this.handleConnect(),
      onDisconnect: () => this.handleDisconnect(),
      onOpenApp: () => this.handleOpenApp(),
      onRetry: () => this.handleRetry(),
    });

    this.setupStorageListener();

    if (!this.view.getOnlineStatus()) {
      this.view.updateOnlineStatus(false);
      return;
    }

    await this.checkSession();
  }

  destroy(): void {
    if (this.storageListener) {
      this.storage.offChanged(this.storageListener);
      this.storageListener = null;
    }
  }

  private setupStorageListener(): void {
    this.storageListener = (changes: unknown) => {
      this.handleStorageChange(changes);
    };
    this.storage.onChanged(this.storageListener);
  }

  private handleStorageChange(changes: unknown): void {
    // Handle storage changes
    if (changes && typeof changes === 'object') {
      const c = changes as Record<string, unknown>;
      if (c.connectedAddress) {
        void this.checkSession();
      }
    }
  }

  private async handleConnect(): Promise<void> {
    await this.openMainApp();
  }

  private async handleDisconnect(): Promise<void> {
    await this.disconnect();
  }

  private async handleOpenApp(): Promise<void> {
    await this.openTradingJournal();
  }

  private async handleRetry(): Promise<void> {
    await this.checkSession();
  }

  async checkSession(): Promise<void> {
    try {
      this.view.showView('loading');

      const localData = await this.storage.localGet<SessionData>([
        PopupStorageKeys.CONNECTED_ADDRESS,
        PopupStorageKeys.CHAIN_ID,
        PopupStorageKeys.ACCOUNT_MODE,
        PopupStorageKeys.SESSION_TOKEN,
      ]);

      const sessionData = await this.storage.sessionGet<{ sessionToken?: string }>([
        PopupStorageKeys.SESSION_TOKEN,
      ]);

      const hasAddress = !!localData?.connectedAddress;
      const token = sessionData?.sessionToken || localData?.sessionToken;
      const hasToken = !!token;

      let isConnected = hasAddress;

      if (!hasToken || !hasAddress) {
        const syncedFromTab = await this.trySyncSessionFromTab();
        
        if (syncedFromTab) {
          const newLocalData = await this.storage.localGet<SessionData>([
            PopupStorageKeys.CONNECTED_ADDRESS,
            PopupStorageKeys.CHAIN_ID,
            PopupStorageKeys.ACCOUNT_MODE,
          ]);

          isConnected = !!newLocalData?.connectedAddress;

          if (isConnected) {
            this.displayConnectedState({
              connectedAddress: newLocalData?.connectedAddress,
              chainId: newLocalData?.chainId,
              accountMode: newLocalData?.accountMode,
            });
            return;
          }
        }

        const apiSession = await this.tryVerifySessionFromAPI();
        if (apiSession) {
          isConnected = true;
          this.displayConnectedState({
            connectedAddress: apiSession.address,
            chainId: apiSession.chainId,
            accountMode: 'live',
          });
          return;
        }
      }

      if (isConnected) {
        this.displayConnectedState({
          connectedAddress: localData?.connectedAddress,
          chainId: localData?.chainId,
          accountMode: localData?.accountMode,
          sessionToken: token,
        });
      } else {
        this.view.showView('notConnected');
        await this.updateStatusIndicators();
      }
    } catch (error) {
      console.error('[PopupController] Failed to check session:', error);
      this.view.showView('notConnected');
      await this.updateStatusIndicators();
    }
  }

  private async trySyncSessionFromTab(): Promise<boolean> {
    try {
      const tabs = await this.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab?.id || !activeTab.url) {
        return false;
      }

      const isMainApp = activeTab.url.includes('localhost:3000') ||
                        activeTab.url.includes('cryptotradingjournal.xyz');

      if (!isMainApp) {
        return false;
      }

      const response = await this.tabs.sendMessage<unknown, TabSessionResponse>(
        activeTab.id, 
        { type: 'POPUP_GET_SESSION' }
      );

      if (response?.success && response?.session) {
        await this.storage.localSet({
          [PopupStorageKeys.CONNECTED_ADDRESS]: response.session.address,
          [PopupStorageKeys.CHAIN_ID]: response.session.chainId,
        });

        if (response.session.sessionToken) {
          await this.storage.sessionSet({
            [PopupStorageKeys.SESSION_TOKEN]: response.session.sessionToken,
          });
        }

        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private async tryVerifySessionFromAPI(): Promise<{ address: string; chainId: string } | null> {
    try {
      const response = await fetch(`${this.config.appUrl}${this.config.apiSessionEndpoint}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const data: ApiSessionResponse = await response.json();

      if (data.authenticated && data.address) {
        await this.storage.localSet({
          [PopupStorageKeys.CONNECTED_ADDRESS]: data.address,
          [PopupStorageKeys.CHAIN_ID]: data.chainId || '0x1',
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

  private displayConnectedState(data: SessionData): void {
    this.view.showView('connected');
    this.view.updateConnectedState({
      address: data.connectedAddress || '',
      chainId: data.chainId || '0x1',
      accountMode: data.accountMode || 'live',
    });
  }

  async disconnect(): Promise<void> {
    try {
      this.view.showView('loading');

      // Call API to disconnect
      await fetch(`${this.config.appUrl}${this.config.apiDisconnectEndpoint}`, {
        method: 'POST',
        credentials: 'include',
      });

      // Clear storage
      await this.storage.localSet({
        [PopupStorageKeys.CONNECTED_ADDRESS]: null,
        [PopupStorageKeys.CHAIN_ID]: null,
        [PopupStorageKeys.SESSION_TOKEN]: null,
      });

      await this.storage.sessionSet({
        [PopupStorageKeys.SESSION_TOKEN]: null,
      });

      this.view.showView('notConnected');
    } catch (error) {
      console.error('[PopupController] Disconnect failed:', error);
      this.view.showError('Failed to disconnect');
    }
  }

  async openMainApp(): Promise<void> {
    await this.tabs.create({ url: this.config.appUrl });
  }

  async openTradingJournal(): Promise<void> {
    await this.tabs.create({ url: `${this.config.appUrl}/trades` });
  }

  async updateStatusIndicators(): Promise<void> {
    // Check wallet availability
    const hasWallet = typeof (globalThis as unknown as { ethereum?: unknown }).ethereum !== 'undefined';
    
    // Check API availability
    let apiAvailable = false;
    try {
      const response = await fetch(`${this.config.appUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      apiAvailable = response.ok;
    } catch {
      apiAvailable = false;
    }

    this.view.updateStatusIndicators({
      walletDetected: hasWallet,
      apiAvailable,
      extensionVersion: '2.2.4',
    });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('PopupController', () => {
  let controller: TestPopupController;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockView.getOnlineStatus.mockReturnValue(true);
    mockStorage.localGet.mockResolvedValue({});
    mockStorage.sessionGet.mockResolvedValue({});
    mockStorage.localSet.mockResolvedValue(undefined);
    mockStorage.sessionSet.mockResolvedValue(undefined);
    mockTabs.query.mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: false }),
    });

    controller = new TestPopupController(mockView, mockStorage, mockTabs, mockConfig);
  });

  afterEach(() => {
    controller.destroy();
  });

  describe('Initialization', () => {
    it('should initialize view with event handlers', async () => {
      await controller.initialize();

      expect(mockView.initialize).toHaveBeenCalledWith({
        onConnect: expect.any(Function),
        onDisconnect: expect.any(Function),
        onOpenApp: expect.any(Function),
        onRetry: expect.any(Function),
      });
    });

    it('should set up storage listener', async () => {
      await controller.initialize();
      expect(mockStorage.onChanged).toHaveBeenCalled();
    });

    it('should check session on initialization', async () => {
      await controller.initialize();
      expect(mockStorage.localGet).toHaveBeenCalled();
    });

    it('should show offline status when not online', async () => {
      mockView.getOnlineStatus.mockReturnValue(false);
      
      await controller.initialize();
      
      expect(mockView.updateOnlineStatus).toHaveBeenCalledWith(false);
    });
  });

  describe('Session Checking', () => {
    it('should show loading view initially', async () => {
      await controller.checkSession();
      expect(mockView.showView).toHaveBeenCalledWith('loading');
    });

    it('should show connected state when session exists', async () => {
      mockStorage.localGet.mockResolvedValue({
        connectedAddress: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        accountMode: 'live',
      });
      mockStorage.sessionGet.mockResolvedValue({
        sessionToken: 'token123',
      });

      await controller.checkSession();

      expect(mockView.showView).toHaveBeenCalledWith('connected');
      expect(mockView.updateConnectedState).toHaveBeenCalledWith({
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        accountMode: 'live',
      });
    });

    it('should show not connected when no session', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});

      await controller.checkSession();

      expect(mockView.showView).toHaveBeenCalledWith('notConnected');
    });

    it('should try syncing from tab when no token', async () => {
      mockStorage.localGet.mockResolvedValue({
        connectedAddress: '0x123',
      });
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://cryptotradingjournal.xyz/trades' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        session: {
          address: '0x123',
          chainId: '0x1',
          sessionToken: 'synced-token',
        },
      });

      await controller.checkSession();

      expect(mockTabs.query).toHaveBeenCalled();
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
          address: '0xabc',
          chainId: '0x89',
        }),
      });

      await controller.checkSession();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://cryptotradingjournal.xyz/api/auth/session',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
    });

    it('should handle session check errors gracefully', async () => {
      mockStorage.localGet.mockRejectedValue(new Error('Storage error'));

      await controller.checkSession();

      expect(mockView.showView).toHaveBeenCalledWith('notConnected');
    });
  });

  describe('Tab Session Sync', () => {
    it('should sync from localhost tab', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'http://localhost:3000/dashboard' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        session: { address: '0x123', chainId: '0x1' },
      });

      await controller.checkSession();

      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        1,
        { type: 'POPUP_GET_SESSION' }
      );
    });

    it('should skip non-app tabs', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://google.com' }
      ]);

      await controller.checkSession();

      expect(mockTabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle tab without URL', async () => {
      mockStorage.localGet.mockResolvedValue({});
      mockStorage.sessionGet.mockResolvedValue({});
      mockTabs.query.mockResolvedValue([
        { id: 1 } // no url
      ]);

      await controller.checkSession();

      expect(mockTabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Disconnect', () => {
    it('should call disconnect API', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await controller.disconnect();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://cryptotradingjournal.xyz/api/auth/disconnect',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });

    it('should clear storage on disconnect', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await controller.disconnect();

      expect(mockStorage.localSet).toHaveBeenCalledWith({
        connectedAddress: null,
        chainId: null,
        sessionToken: null,
      });
      expect(mockStorage.sessionSet).toHaveBeenCalledWith({
        sessionToken: null,
      });
    });

    it('should show not connected after disconnect', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await controller.disconnect();

      expect(mockView.showView).toHaveBeenCalledWith('notConnected');
    });

    it('should handle disconnect errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await controller.disconnect();

      expect(mockView.showError).toHaveBeenCalledWith('Failed to disconnect');
    });
  });

  describe('Navigation', () => {
    it('should open main app', async () => {
      await controller.openMainApp();

      expect(mockTabs.create).toHaveBeenCalledWith({
        url: 'https://cryptotradingjournal.xyz',
      });
    });

    it('should open trading journal', async () => {
      await controller.openTradingJournal();

      expect(mockTabs.create).toHaveBeenCalledWith({
        url: 'https://cryptotradingjournal.xyz/trades',
      });
    });
  });

  describe('Status Indicators', () => {
    it('should update status indicators with wallet and API status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await controller.updateStatusIndicators();

      expect(mockView.updateStatusIndicators).toHaveBeenCalledWith({
        walletDetected: expect.any(Boolean),
        apiAvailable: true,
        extensionVersion: '2.2.4',
      });
    });

    it('should handle API health check failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await controller.updateStatusIndicators();

      expect(mockView.updateStatusIndicators).toHaveBeenCalledWith({
        walletDetected: expect.any(Boolean),
        apiAvailable: false,
        extensionVersion: '2.2.4',
      });
    });
  });

  describe('Cleanup', () => {
    it('should remove storage listener on destroy', async () => {
      await controller.initialize();
      controller.destroy();

      expect(mockStorage.offChanged).toHaveBeenCalled();
    });

    it('should handle destroy when no listener registered', () => {
      // Don't initialize, just destroy
      expect(() => controller.destroy()).not.toThrow();
    });
  });

  describe('Event Handlers', () => {
    it('should handle connect button click', async () => {
      await controller.initialize();

      // Get the onConnect handler and call it
      const initCall = mockView.initialize.mock.calls[0][0];
      await initCall.onConnect();

      expect(mockTabs.create).toHaveBeenCalled();
    });

    it('should handle disconnect button click', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await controller.initialize();

      const initCall = mockView.initialize.mock.calls[0][0];
      await initCall.onDisconnect();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/disconnect'),
        expect.any(Object)
      );
    });

    it('should handle open app button click', async () => {
      await controller.initialize();

      const initCall = mockView.initialize.mock.calls[0][0];
      await initCall.onOpenApp();

      expect(mockTabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('/trades'),
      });
    });

    it('should handle retry button click', async () => {
      await controller.initialize();
      mockStorage.localGet.mockClear();

      const initCall = mockView.initialize.mock.calls[0][0];
      await initCall.onRetry();

      // Should re-check session
      expect(mockStorage.localGet).toHaveBeenCalled();
    });
  });

  describe('Storage Change Handling', () => {
    it('should re-check session on address change', async () => {
      await controller.initialize();
      
      // Clear previous calls
      mockStorage.localGet.mockClear();

      // Get the storage listener and trigger it
      const storageListener = mockStorage.onChanged.mock.calls[0][0];
      storageListener({ connectedAddress: { newValue: '0xnew' } });

      // Should trigger re-check
      expect(mockStorage.localGet).toHaveBeenCalled();
    });
  });
});

describe('PopupController Edge Cases', () => {
  let controller: TestPopupController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockView.getOnlineStatus.mockReturnValue(true);
    mockStorage.localGet.mockResolvedValue({});
    mockStorage.sessionGet.mockResolvedValue({});
    mockTabs.query.mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    controller = new TestPopupController(mockView, mockStorage, mockTabs, mockConfig);
  });

  afterEach(() => {
    controller.destroy();
  });

  it('should handle API 401 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await controller.checkSession();

    expect(mockView.showView).toHaveBeenCalledWith('notConnected');
  });

  it('should handle malformed API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(null),
    });

    await controller.checkSession();

    expect(mockView.showView).toHaveBeenCalledWith('notConnected');
  });

  it('should handle tab message error', async () => {
    mockStorage.localGet.mockResolvedValue({ connectedAddress: '0x123' });
    mockStorage.sessionGet.mockResolvedValue({});
    mockTabs.query.mockResolvedValue([
      { id: 1, url: 'https://cryptotradingjournal.xyz' }
    ]);
    mockTabs.sendMessage.mockRejectedValue(new Error('Tab closed'));

    await controller.checkSession();

    // Should still complete without crashing
    expect(mockView.showView).toHaveBeenCalled();
  });

  it('should handle storage set failure during disconnect', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockStorage.localSet.mockRejectedValueOnce(new Error('Storage full'));

    await controller.disconnect();

    // Should still attempt to show not connected
    expect(mockView.showView).toHaveBeenCalled();
  });
});
