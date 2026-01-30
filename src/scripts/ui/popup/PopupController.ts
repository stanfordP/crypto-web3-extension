/**
 * Popup Controller
 * 
 * Handles all business logic for the popup.
 * Uses dependency injection for testability.
 * 
 * @module ui/popup/PopupController
 */

import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter } from '../../adapters/types';
import type { PopupView, SessionDisplayData } from './PopupView';
import { truncateAddress, getNetworkName, formatAccountMode } from './PopupView';

// ============================================================================
// Types
// ============================================================================

/**
 * Storage keys used by popup
 */
export const PopupStorageKeys = {
  CONNECTED_ADDRESS: 'connectedAddress',
  CHAIN_ID: 'chainId',
  ACCOUNT_MODE: 'accountMode',
  SESSION_TOKEN: 'sessionToken',
  APP_URL: 'appUrl',
} as const;

/**
 * Session data from storage
 */
export interface StoredSessionData {
  connectedAddress?: string;
  chainId?: string;
  accountMode?: 'demo' | 'live';
  sessionToken?: string;
}

/**
 * API session response
 */
export interface ApiSessionResponse {
  authenticated: boolean;
  address?: string;
  chainId?: string;
}

/**
 * Tab session response
 */
export interface TabSessionResponse {
  success: boolean;
  session?: {
    address: string;
    chainId: string;
    sessionToken?: string;
  };
}

/**
 * Configuration for PopupController
 */
export interface PopupControllerConfig {
  defaultAppUrl: string;
  apiSessionEndpoint: string;
}

const DEFAULT_CONFIG: PopupControllerConfig = {
  defaultAppUrl: 'http://localhost:3000',
  apiSessionEndpoint: '/api/auth/session',
};

// ============================================================================
// PopupController Class
// ============================================================================

/**
 * PopupController handles all business logic for the popup.
 * It delegates UI updates to PopupView.
 */
export class PopupController {
  private config: PopupControllerConfig;
  private storageListener: ((
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string
  ) => void) | null = null;

  constructor(
    private storage: IStorageAdapter,
    private runtime: IRuntimeAdapter,
    private tabs: ITabsAdapter,
    private view: PopupView,
    config?: Partial<PopupControllerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the popup controller
   */
  async initialize(): Promise<void> {
    // Initialize view with event handlers
    this.view.initialize({
      onConnect: () => this.handleConnect(),
      onDisconnect: () => this.handleDisconnect(),
      onOpenApp: () => this.handleOpenApp(),
      onRetry: () => this.handleRetry(),
    });

    // Set up storage change listener
    this.setupStorageListener();

    // Check initial online status
    if (!this.view.getOnlineStatus()) {
      this.view.updateOnlineStatus(false);
      return;
    }

    // Check session state
    await this.checkSession();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.storageListener) {
      this.storage.offChanged(this.storageListener);
      this.storageListener = null;
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle connect button click
   */
  private async handleConnect(): Promise<void> {
    await this.openMainApp();
  }

  /**
   * Handle disconnect button click
   */
  private async handleDisconnect(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Handle open app button click
   */
  private async handleOpenApp(): Promise<void> {
    await this.openTradingJournal();
  }

  /**
   * Handle retry button click
   */
  private async handleRetry(): Promise<void> {
    await this.checkSession();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Check session state from storage and API
   */
  async checkSession(): Promise<void> {
    try {
      this.view.showView('loading');

      // Read storage data
      const localData = await this.storage.localGet<StoredSessionData>([
        PopupStorageKeys.CONNECTED_ADDRESS,
        PopupStorageKeys.CHAIN_ID,
        PopupStorageKeys.ACCOUNT_MODE,
        PopupStorageKeys.SESSION_TOKEN,
      ]);

      const sessionData = await this.storage.sessionGet<{ sessionToken?: string }>([
        PopupStorageKeys.SESSION_TOKEN,
      ]);

      const hasAddress = !!localData.connectedAddress;
      const token = sessionData.sessionToken || localData.sessionToken;
      const hasToken = !!token;

      let isConnected = hasAddress;

      // If token is missing, try to sync from tab or API
      if (!hasToken || !hasAddress) {
        const syncedFromTab = await this.trySyncSessionFromTab();
        
        if (syncedFromTab) {
          const newLocalData = await this.storage.localGet<StoredSessionData>([
            PopupStorageKeys.CONNECTED_ADDRESS,
            PopupStorageKeys.CHAIN_ID,
            PopupStorageKeys.ACCOUNT_MODE,
            PopupStorageKeys.SESSION_TOKEN,
          ]);
          const newSessionData = await this.storage.sessionGet<{ sessionToken?: string }>([
            PopupStorageKeys.SESSION_TOKEN,
          ]);

          isConnected = !!newLocalData.connectedAddress;

          if (isConnected) {
            this.displayConnectedState({
              connectedAddress: newLocalData.connectedAddress,
              chainId: newLocalData.chainId,
              accountMode: newLocalData.accountMode,
              sessionToken: newSessionData.sessionToken || newLocalData.sessionToken,
            });
            return;
          }
        }

        // Try API session verification
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
          connectedAddress: localData.connectedAddress,
          chainId: localData.chainId,
          accountMode: localData.accountMode,
          sessionToken: token,
        });
      } else {
        this.view.showView('notConnected');
        // Update status indicators for Chrome reviewers
        await this.updateStatusIndicators();
      }
    } catch (error) {
      console.error('[PopupController] Failed to check session:', error);
      this.view.showView('notConnected');
      // Update status indicators even on error
      await this.updateStatusIndicators();
    }
  }

  /**
   * Try to sync session from active tab
   */
  private async trySyncSessionFromTab(): Promise<boolean> {
    try {
      const [activeTab] = await this.tabs.query({ active: true, currentWindow: true });

      if (!activeTab?.id || !activeTab.url) {
        return false;
      }

      // Check if it's the main app
      const isMainApp = activeTab.url.includes('localhost:3000') ||
                        activeTab.url.includes('cryptotradingjournal.xyz');

      if (!isMainApp) {
        return false;
      }

      console.log('[PopupController] Active tab is main app, querying for session...');

      const response = await this.tabs.sendMessage<
        { type: string },
        TabSessionResponse
      >(activeTab.id, { type: 'POPUP_GET_SESSION' });

      if (response?.success && response?.session) {
        console.log('[PopupController] Got session from tab:', response.session.address);

        // Store the synced session
        await this.storage.localSet({
          [PopupStorageKeys.CONNECTED_ADDRESS]: response.session.address,
          [PopupStorageKeys.CHAIN_ID]: response.session.chainId,
        });

        if (response.session.sessionToken) {
          await this.storage.sessionSet({
            [PopupStorageKeys.SESSION_TOKEN]: response.session.sessionToken,
          });
          await this.storage.localSet({
            [PopupStorageKeys.SESSION_TOKEN]: response.session.sessionToken,
          });
        }

        return true;
      }

      return false;
    } catch (error) {
      console.log('[PopupController] Could not sync from tab:', error);
      return false;
    }
  }

  /**
   * Try to verify session from API
   */
  private async tryVerifySessionFromAPI(): Promise<{ address: string; chainId: string } | null> {
    try {
      const appUrl = await this.getAppUrl();
      console.log('[PopupController] Checking session via API...');

      const response = await fetch(`${appUrl}${this.config.apiSessionEndpoint}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.log('[PopupController] API session check returned:', response.status);
        return null;
      }

      const data: ApiSessionResponse = await response.json();

      if (data.authenticated && data.address) {
        console.log('[PopupController] API confirmed session for:', data.address.slice(0, 10) + '...');

        // Store in local storage for consistency
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
    } catch (error) {
      console.log('[PopupController] API session check failed:', error);
      return null;
    }
  }

  /**
   * Display connected state
   */
  private displayConnectedState(session: StoredSessionData): void {
    const displayData: SessionDisplayData = {
      address: session.connectedAddress || '',
      shortAddress: truncateAddress(session.connectedAddress || ''),
      networkName: getNetworkName(session.chainId || '0x1'),
      accountMode: formatAccountMode(session.accountMode),
    };

    this.view.showConnectedState(displayData);
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Open the main app for wallet connection
   */
  async openMainApp(): Promise<void> {
    try {
      const appUrl = await this.getAppUrl();
      await this.tabs.create({ url: appUrl, active: true });
      this.view.close();
    } catch (error) {
      console.error('[PopupController] Failed to open main app:', error);
      this.view.showError('Failed to open Trading Journal. Please try again.');
    }
  }

  /**
   * Disconnect the current session
   */
  async disconnect(): Promise<void> {
    try {
      this.view.showView('loading');

      // Get current session token
      const result = await this.storage.sessionGet<{ sessionToken?: string }>([
        PopupStorageKeys.SESSION_TOKEN,
      ]);
      const sessionToken = result.sessionToken;

      // Notify backend if we have a token
      if (sessionToken) {
        try {
          await this.runtime.sendMessage({ type: 'DISCONNECT' });
        } catch {
          console.warn('[PopupController] Backend disconnect failed, clearing local state');
        }
      }

      // Clear all storage
      await this.storage.localClear();
      await this.storage.sessionClear();

      this.view.showView('notConnected');
    } catch (error) {
      console.error('[PopupController] Disconnect failed:', error);
      this.view.showError('Failed to disconnect. Please try again.');
    }
  }

  /**
   * Open the trading journal app
   */
  async openTradingJournal(): Promise<void> {
    const appUrl = await this.getAppUrl();
    await this.tabs.create({ url: `${appUrl}/dashboard`, active: true });
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get configured app URL
   */
  private async getAppUrl(): Promise<string> {
    try {
      const result = await this.storage.syncGet<{ appUrl?: string }>(['appUrl']);
      return result.appUrl || this.config.defaultAppUrl;
    } catch {
      return this.config.defaultAppUrl;
    }
  }

  /**
   * Set up storage change listener
   */
  private setupStorageListener(): void {
    this.storageListener = (changes, areaName) => {
      const localSessionChanged = areaName === 'local' && (
        changes[PopupStorageKeys.CONNECTED_ADDRESS] ||
        changes[PopupStorageKeys.CHAIN_ID] ||
        changes[PopupStorageKeys.SESSION_TOKEN]
      );

      const tokenChanged = areaName === 'session' &&
        changes[PopupStorageKeys.SESSION_TOKEN];

      if (localSessionChanged || tokenChanged) {
        this.checkSession();
      }
    };

    this.storage.onChanged(this.storageListener);
  }

  /**
   * Update status indicators for Chrome Web Store reviewers
   * Shows wallet detection and domain validation status
   */
  private async updateStatusIndicators(): Promise<void> {
    try {
      // Check if we're in a browser context with access to tabs
      const [activeTab] = await this.tabs.query({ active: true, currentWindow: true });
      
      // Check if on allowed domain first
      const isAllowedDomain = activeTab?.url && (
        activeTab.url.includes('cryptotradingjournal.xyz') ||
        activeTab.url.includes('localhost:3000') ||
        activeTab.url.includes('localhost:3001')
      );
      
      // Update wallet status
      const walletStatusEl = document.getElementById('walletStatus');
      const walletLabelEl = document.getElementById('walletStatusLabel');
      
      if (walletStatusEl && walletLabelEl) {
        // Clear any existing content
        walletLabelEl.textContent = '';
        
        // If on allowed domain, try to check wallet through content script
        if (isAllowedDomain && activeTab?.id) {
          try {
            const response = await this.tabs.sendMessage<
              { type: string },
              { success: boolean; walletAvailable: boolean; walletName?: string }
            >(activeTab.id, { type: 'POPUP_CHECK_WALLET' });
            
            if (response?.success && response.walletAvailable) {
              walletStatusEl.textContent = '✅';
              const walletName = response.walletName || 'Web3 Wallet';
              walletLabelEl.textContent = `${walletName}: Detected`;
              walletLabelEl.className = 'status-label status-success';
            } else {
              // Wallet not found on supported domain
              walletStatusEl.textContent = '❌';
              walletLabelEl.textContent = 'Web3 Wallet: Not Detected ';
              walletLabelEl.className = 'status-label status-error';
              
              // Add link to MetaMask
              const linkEl = document.createElement('a');
              linkEl.href = 'https://metamask.io/download/';
              linkEl.target = '_blank';
              linkEl.className = 'status-link';
              linkEl.textContent = '(Install MetaMask)';
              walletLabelEl.appendChild(linkEl);
            }
          } catch {
            // Content script not responding - show guidance
            walletStatusEl.textContent = '⚠️';
            walletLabelEl.textContent = 'Wallet: Checking requires page refresh ';
            walletLabelEl.className = 'status-label status-warning';
          }
        } else {
          // Not on allowed domain - show guidance
          walletStatusEl.textContent = '⏳';
          walletLabelEl.textContent = 'Web3 Wallet: Requires MetaMask ';
          walletLabelEl.className = 'status-label status-warning';
          
          // Add link to MetaMask
          const linkEl = document.createElement('a');
          linkEl.href = 'https://metamask.io/download/';
          linkEl.target = '_blank';
          linkEl.className = 'status-link';
          linkEl.textContent = '(Get MetaMask)';
          walletLabelEl.appendChild(linkEl);
        }
      }

      // Update domain status
      const domainStatusEl = document.getElementById('domainStatus');
      const domainLabelEl = document.getElementById('domainStatusLabel');
      
      if (domainStatusEl && domainLabelEl) {
        // Clear any existing content
        domainLabelEl.textContent = '';
        
        if (isAllowedDomain) {
          domainStatusEl.textContent = '✅';
          domainLabelEl.textContent = 'Supported Domain: Yes';
          domainLabelEl.className = 'status-label status-success';
        } else {
          domainStatusEl.textContent = '⚠️';
          domainLabelEl.textContent = 'Domain: Visit CTJ site ';
          domainLabelEl.className = 'status-label status-warning';
          
          // Add link to correct domain
          const linkEl = document.createElement('a');
          linkEl.href = 'https://cryptotradingjournal.xyz';
          linkEl.target = '_blank';
          linkEl.className = 'status-link';
          linkEl.textContent = '(Go to cryptotradingjournal.xyz)';
          domainLabelEl.appendChild(linkEl);
        }
      }
    } catch (error) {
      console.error('[PopupController] Failed to update status indicators:', error);
    }
  }
}
