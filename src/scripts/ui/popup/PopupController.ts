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
  defaultAppUrl: 'https://cryptotradingjournal.xyz',
  apiSessionEndpoint: '/api/auth/session',
};

// ============================================================================
// Retry Configuration
// ============================================================================

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
} as const;

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
  private retryCount: number = 0;
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private storageDebounceId: ReturnType<typeof setTimeout> | null = null;
  private isCheckingSession: boolean = false;

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
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    if (this.storageDebounceId) {
      clearTimeout(this.storageDebounceId);
      this.storageDebounceId = null;
    }
  }

  // ============================================================================
  // Retry Logic
  // ============================================================================

  /**
   * Calculate exponential backoff delay
   */
  private getRetryDelay(): number {
    const delay = Math.min(
      RETRY_CONFIG.baseDelayMs * Math.pow(2, this.retryCount),
      RETRY_CONFIG.maxDelayMs
    );
    return delay;
  }

  /**
   * Schedule automatic retry
   */
  private scheduleRetry(): void {
    if (this.retryCount >= RETRY_CONFIG.maxRetries) {
      console.log('[PopupController] Max retries reached');
      return;
    }

    const delay = this.getRetryDelay();
    console.log(`[PopupController] Scheduling retry ${this.retryCount + 1}/${RETRY_CONFIG.maxRetries} in ${delay}ms`);

    this.retryTimeoutId = setTimeout(() => {
      this.retryCount++;
      this.checkSession();
    }, delay);
  }

  /**
   * Reset retry counter
   */
  private resetRetry(): void {
    this.retryCount = 0;
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
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
    this.resetRetry();
    await this.checkSession();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Check session state from storage and API
   * Protected against re-entry to prevent refresh loops
   */
  async checkSession(): Promise<void> {
    // Prevent re-entry - if already checking, skip
    if (this.isCheckingSession) {
      console.log('[PopupController] checkSession already in progress, skipping');
      return;
    }
    
    this.isCheckingSession = true;
    
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
        // Reset retry on success
        this.resetRetry();
      } else {
        this.view.showView('notConnected');
        // Update status indicators for Chrome reviewers
        await this.updateStatusIndicators();
      }
    } catch (error) {
      console.error('[PopupController] Failed to check session:', error);
      
      // Try to show cached session data if available
      try {
        const cachedData = await this.storage.localGet<StoredSessionData>([
          PopupStorageKeys.CONNECTED_ADDRESS,
          PopupStorageKeys.CHAIN_ID,
          PopupStorageKeys.ACCOUNT_MODE,
        ]);
        
        if (cachedData.connectedAddress) {
          console.log('[PopupController] Showing cached session data');
          this.displayConnectedState({
            connectedAddress: cachedData.connectedAddress,
            chainId: cachedData.chainId,
            accountMode: cachedData.accountMode,
          });
          // Show offline indicator with cached data
          this.view.updateOnlineStatus(false);
          return;
        }
      } catch {
        // Ignore storage errors
      }
      
      this.view.showView('notConnected');
      // Update status indicators even on error
      await this.updateStatusIndicators();
    } finally {
      // Always reset re-entry guard
      this.isCheckingSession = false;
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${appUrl}${this.config.apiSessionEndpoint}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log('[PopupController] API session check returned:', response.status);
        
        // Don't retry on client errors (4xx) - these won't resolve themselves
        // Only retry on server errors (5xx) which may be temporary
        if (response.status >= 500) {
          console.log('[PopupController] Server error, scheduling retry');
          this.scheduleRetry();
        } else if (response.status === 404) {
          // 404 = API endpoint doesn't exist yet, don't retry
          console.log('[PopupController] API endpoint not found (404), not retrying');
        } else if (response.status === 401 || response.status === 403) {
          // Auth errors - user not logged in, don't retry
          console.log('[PopupController] Not authenticated, no retry needed');
        }
        
        return null;
      }

      const data: ApiSessionResponse = await response.json();
      
      // Success - reset retry counter
      this.resetRetry();

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
      // Handle different error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log('[PopupController] API session check timed out');
          // Schedule retry for timeout (could be temporary network issue)
          this.scheduleRetry();
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          console.log('[PopupController] API session check failed - network error');
          // Only retry network errors if we haven't exceeded max retries
          if (this.retryCount < RETRY_CONFIG.maxRetries) {
            this.scheduleRetry();
          } else {
            console.log('[PopupController] Max retries reached, stopping');
          }
        } else {
          console.log('[PopupController] API session check failed:', error.message);
          // Don't retry unknown errors
        }
      } else {
        console.log('[PopupController] API session check failed:', error);
      }
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
   * Priority:
   * 1. User-configured appUrl from sync storage (for advanced users)
   * 2. If active tab is on localhost:3000, use localhost (for developers)
   * 3. Default to production URL (for regular users)
   */
  private async getAppUrl(): Promise<string> {
    try {
      // Check for user-configured URL first
      const result = await this.storage.syncGet<{ appUrl?: string }>(['appUrl']);
      if (result.appUrl) {
        return result.appUrl;
      }

      // Check if developer is on localhost (secondary option for developers)
      const [activeTab] = await this.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url?.includes('localhost:3000')) {
        return 'http://localhost:3000';
      }

      // Default to production URL for regular users
      return this.config.defaultAppUrl;
    } catch {
      return this.config.defaultAppUrl;
    }
  }

  /**
   * Set up storage change listener with debouncing
   * Prevents rapid re-checks when storage changes frequently
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
        // Debounce: Only check once per 500ms to prevent refresh loops
        if (this.storageDebounceId) {
          clearTimeout(this.storageDebounceId);
        }
        
        this.storageDebounceId = setTimeout(() => {
          console.log('[PopupController] Storage changed, checking session (debounced)');
          this.checkSession();
        }, 500);
      }
    };

    this.storage.onChanged(this.storageListener);
  }

  /**
   * Securely check if a URL is on an allowed domain
   * Uses hostname validation to prevent URL manipulation attacks
   */
  private isAllowedDomain(url: string | undefined): boolean {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Check for exact hostname matches or subdomains
      const allowedHosts = [
        'cryptotradingjournal.xyz',
        'www.cryptotradingjournal.xyz',
        'localhost',
      ];
      
      // Check for localhost with allowed ports
      if (hostname === 'localhost') {
        const port = urlObj.port;
        return port === '3000' || port === '3001';
      }
      
      // Check for exact match or subdomain of cryptotradingjournal.xyz
      return allowedHosts.includes(hostname) || 
             hostname.endsWith('.cryptotradingjournal.xyz');
    } catch {
      // Invalid URL
      return false;
    }
  }

  /**
   * Update status indicators for Chrome Web Store reviewers
   * Shows wallet detection and domain validation status
   */
  private async updateStatusIndicators(): Promise<void> {
    try {
      // Check if we're in a browser context with access to tabs
      const [activeTab] = await this.tabs.query({ active: true, currentWindow: true });
      
      // Check if on allowed domain using secure hostname validation
      const isAllowedDomain = this.isAllowedDomain(activeTab?.url);
      
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
              walletLabelEl.textContent = 'Web3 Wallet: Not Detected';
              walletLabelEl.className = 'status-label status-error';
              
              // Add link to MetaMask
              const linkEl = document.createElement('a');
              linkEl.href = 'https://metamask.io/download/';
              linkEl.target = '_blank';
              linkEl.className = 'status-link';
              linkEl.textContent = ' (Install MetaMask)';
              walletLabelEl.appendChild(linkEl);
            }
          } catch {
            // Content script not responding - show guidance
            walletStatusEl.textContent = '⚠️';
            walletLabelEl.textContent = 'Wallet: Checking requires page refresh';
            walletLabelEl.className = 'status-label status-warning';
          }
        } else {
          // Not on allowed domain - show guidance
          walletStatusEl.textContent = '⏳';
          walletLabelEl.textContent = 'Web3 Wallet: Requires MetaMask';
          walletLabelEl.className = 'status-label status-warning';
          
          // Add link to MetaMask
          const linkEl = document.createElement('a');
          linkEl.href = 'https://metamask.io/download/';
          linkEl.target = '_blank';
          linkEl.className = 'status-link';
          linkEl.textContent = ' (Get MetaMask)';
          walletLabelEl.appendChild(linkEl);
        }
      }

      // Update domain status
      const domainStatusEl = document.getElementById('domainStatus');
      const domainLabelEl = document.getElementById('domainStatusLabel');
      const gettingStartedEl = document.getElementById('gettingStarted');
      
      if (domainStatusEl && domainLabelEl) {
        // Clear any existing content
        domainLabelEl.textContent = '';
        
        if (isAllowedDomain) {
          domainStatusEl.textContent = '✅';
          domainLabelEl.textContent = 'Supported Domain: Yes';
          domainLabelEl.className = 'status-label status-success';
          // Hide getting started when on supported domain
          if (gettingStartedEl) {
            gettingStartedEl.classList.add('hidden');
          }
        } else {
          domainStatusEl.textContent = '⚠️';
          domainLabelEl.textContent = 'Domain: Visit supported site';
          domainLabelEl.className = 'status-label status-warning';
          
          // Add link to correct domain
          const linkEl = document.createElement('a');
          linkEl.href = 'https://cryptotradingjournal.xyz';
          linkEl.target = '_blank';
          linkEl.className = 'status-link';
          linkEl.textContent = ' (Go to cryptotradingjournal.xyz)';
          domainLabelEl.appendChild(linkEl);
          
          // Show getting started guide when off-site
          if (gettingStartedEl) {
            gettingStartedEl.classList.remove('hidden');
          }
        }
      }

      // Update CTA button text based on state (state-adaptive CTA)
      this.updateConnectButtonState(isAllowedDomain, walletStatusEl?.textContent === '✅');
    } catch (error) {
      console.error('[PopupController] Failed to update status indicators:', error);
    }
  }

  /**
   * Update the connect button text based on current state
   * State-adaptive CTA for better reviewer/user guidance
   */
  private updateConnectButtonState(isAllowedDomain: boolean, walletDetected: boolean): void {
    const connectButton = document.getElementById('connectButton');
    if (!connectButton) return;

    if (!walletDetected && !isAllowedDomain) {
      // No wallet detected and not on site - primary action is get MetaMask
      connectButton.textContent = 'Get MetaMask';
      connectButton.setAttribute('aria-label', 'Install MetaMask wallet extension');
      // Update click handler to open MetaMask
      connectButton.onclick = () => {
        window.open('https://metamask.io/download/', '_blank');
      };
    } else if (!isAllowedDomain) {
      // Has wallet but not on site - primary action is go to site
      connectButton.textContent = 'Open CTJ App';
      connectButton.setAttribute('aria-label', 'Open Crypto Trading Journal to connect your wallet');
      connectButton.onclick = () => {
        window.open('https://cryptotradingjournal.xyz/login', '_blank');
      };
    } else {
      // On site - primary action is connect (handled by main app)
      connectButton.textContent = 'Connect on Page';
      connectButton.setAttribute('aria-label', 'Use the Connect Wallet button on the page');
      connectButton.onclick = () => {
        window.close(); // Close popup, user should use the page button
      };
    }
  }
}
