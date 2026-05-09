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
  USER_ID: 'userId',
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
  userId?: string;
  accountMode?: 'demo' | 'live';
  sessionToken?: string;
}

/**
 * API session response
 */
export interface ApiSessionResponse {
  authenticated: boolean;
  address?: string;
  chainId?: string | number;
  userId?: string;
  user_id?: string;
  user?: {
    id?: string;
  };
  data?: {
    authenticated?: boolean;
    address?: string;
    chainId?: string | number;
    userId?: string;
    user_id?: string;
    user?: {
      id?: string;
    };
  };
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
    userId?: string;
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

const PUBLISHED_EXTENSION_ID = 'cphjlogninjhlkeldohmihhpaaafnheb';
const REMOTE_VERSION_URL = 'https://stanfordp.github.io/crypto-web3-extension/version.json';

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
  private ctaButtonState: 'get-metamask' | 'open-ctj' | 'connect-on-page' = 'open-ctj'; // Default to safest state

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

    await this.initializeBuildMetadata();

    // Check session state
    await this.checkSession();
  }

  /**
   * Load build metadata and remote version status.
   */
  private async initializeBuildMetadata(): Promise<void> {
    const localVersion = await this.getLocalVersion();
    const isPublishedBuild = this.runtime.id === PUBLISHED_EXTENSION_ID;

    this.updateExtensionMeta(
      localVersion,
      isPublishedBuild ? 'CWS' : 'BETA',
      isPublishedBuild ? 'success' : 'warning',
    );

    const remoteVersion = await this.getRemoteVersion();
    if (remoteVersion && this.isRemoteVersionNewer(remoteVersion, localVersion)) {
      this.updateVersionNotice(`Update available: v${remoteVersion}`);
      return;
    }

    this.updateVersionNotice(
      isPublishedBuild ? undefined : 'Sideloaded build — updates are manual.'
    );
  }

  private updateExtensionMeta(
    version: string,
    badgeLabel?: string,
    badgeTone: 'success' | 'warning' = 'warning',
  ): void {
    const maybeView = this.view as PopupView & {
      updateExtensionMeta?: (version: string, badgeLabel?: string, badgeTone?: 'success' | 'warning') => void;
    };

    if (typeof maybeView.updateExtensionMeta === 'function') {
      maybeView.updateExtensionMeta(version, badgeLabel, badgeTone);
    }
  }

  private updateVersionNotice(message?: string): void {
    const maybeView = this.view as PopupView & {
      updateVersionNotice?: (message?: string) => void;
    };

    if (typeof maybeView.updateVersionNotice === 'function') {
      maybeView.updateVersionNotice(message);
    }
  }

  /**
   * Read the local manifest version.
   */
  private async getLocalVersion(): Promise<string> {
    try {
      const response = await fetch(this.runtime.getURL('manifest.json'));
      if (!response.ok) {
        return 'unknown';
      }

      const manifest = (await response.json()) as { version?: string };
      return manifest.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Fetch the latest published/sideload build version from the hosted manifest.
   */
  private async getRemoteVersion(): Promise<string | null> {
    try {
      const response = await fetch(REMOTE_VERSION_URL, { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { version?: string };
      return typeof payload.version === 'string' ? payload.version : null;
    } catch {
      return null;
    }
  }

  /**
   * Compare semantic versions to detect newer remote builds.
   */
  private isRemoteVersionNewer(remoteVersion: string, localVersion: string): boolean {
    const remoteParts = remoteVersion.split('.').map((part) => Number.parseInt(part, 10));
    const localParts = localVersion.split('.').map((part) => Number.parseInt(part, 10));
    const maxLength = Math.max(remoteParts.length, localParts.length);

    for (let index = 0; index < maxLength; index += 1) {
      const remote = remoteParts[index] ?? 0;
      const local = localParts[index] ?? 0;

      if (Number.isNaN(remote) || Number.isNaN(local)) {
        return false;
      }

      if (remote > local) {
        return true;
      }

      if (remote < local) {
        return false;
      }
    }

    return false;
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
    // Handle state-adaptive CTA behavior
    if (this.ctaButtonState === 'get-metamask') {
      // Open MetaMask download page
      window.open('https://metamask.io/download/', '_blank');
    } else if (this.ctaButtonState === 'open-ctj') {
      // Open CTJ app
      await this.openMainApp();
    } else {
      // On supported page - close popup so user can use the page button
      window.close();
    }
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
        PopupStorageKeys.USER_ID,
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
            PopupStorageKeys.USER_ID,
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
              userId: newLocalData.userId,
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
          userId: localData.userId,
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
        const userId = await this.resolveUserIdForSessionWrite(
          response.session.address,
          response.session.userId,
        );

        // Store the synced session
        await this.storage.localSet({
          [PopupStorageKeys.CONNECTED_ADDRESS]: response.session.address,
          [PopupStorageKeys.CHAIN_ID]: response.session.chainId,
          ...(userId ? { [PopupStorageKeys.USER_ID]: userId } : {}),
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
  private async tryVerifySessionFromAPI(): Promise<{ address: string; chainId: string; userId?: string } | null> {
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
      const sessionData = this.unwrapApiSessionResponse(data);
      
      // Success - reset retry counter
      this.resetRetry();

      if (sessionData.authenticated && sessionData.address) {
        const userId = await this.resolveUserIdForSessionWrite(
          sessionData.address,
          this.extractUserId(data) ?? this.extractUserId(sessionData),
        );

        console.log('[PopupController] API confirmed session for:', sessionData.address.slice(0, 10) + '...');

        // Store in local storage for consistency
        await this.storage.localSet({
          [PopupStorageKeys.CONNECTED_ADDRESS]: sessionData.address,
          [PopupStorageKeys.CHAIN_ID]: this.normalizeChainId(sessionData.chainId),
          ...(userId ? { [PopupStorageKeys.USER_ID]: userId } : {}),
        });

        return {
          address: sessionData.address,
          chainId: this.normalizeChainId(sessionData.chainId),
          ...(userId ? { userId } : {}),
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
      if (activeTab?.url) {
        try {
          const url = new URL(activeTab.url);
          if (url.hostname === 'localhost' && url.port === '3000') {
            return 'http://localhost:3000';
          }
        } catch {
          // If URL parsing fails, fall through to default app URL
        }
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
        changes[PopupStorageKeys.USER_ID] ||
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

  private unwrapApiSessionResponse(payload: ApiSessionResponse): ApiSessionResponse {
    return payload.data ? { ...payload, ...payload.data } : payload;
  }

  private extractUserId(value: unknown): string | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.userId === 'string' && record.userId.trim()) {
      return record.userId;
    }

    if (typeof record.user_id === 'string' && record.user_id.trim()) {
      return record.user_id;
    }

    if (typeof record.user === 'object' && record.user !== null) {
      const directUserId = typeof (record.user as { id?: unknown }).id === 'string'
        ? (record.user as { id: string }).id
        : undefined;

      return directUserId || this.extractUserId(record.user);
    }

    if (typeof record.data === 'object' && record.data !== null) {
      return this.extractUserId(record.data);
    }

    return undefined;
  }

  private normalizeChainId(chainId: string | number | undefined): string {
    if (typeof chainId === 'string' && chainId.trim()) {
      return chainId;
    }

    if (typeof chainId === 'number' && Number.isFinite(chainId)) {
      return `0x${chainId.toString(16)}`;
    }

    return '0x1';
  }

  private async resolveUserIdForSessionWrite(
    address: string,
    userId?: string,
  ): Promise<string | undefined> {
    if (userId) {
      return userId;
    }

    const existing = await this.storage.localGet<StoredSessionData>([
      PopupStorageKeys.CONNECTED_ADDRESS,
      PopupStorageKeys.USER_ID,
    ]);

    if (existing.connectedAddress && existing.userId && this.sameAddress(existing.connectedAddress, address)) {
      return existing.userId;
    }

    await this.storage.localRemove(PopupStorageKeys.USER_ID);
    return undefined;
  }

  private sameAddress(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
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
      // Determine wallet state: true if detected on allowed domain, unknown (true) if not on domain yet
      const walletDetected = isAllowedDomain ? walletStatusEl?.textContent === '✅' : true;
      this.updateConnectButtonState(isAllowedDomain, walletDetected);
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

    if (!walletDetected && isAllowedDomain) {
      // No wallet detected on allowed domain - primary action is get MetaMask
      this.ctaButtonState = 'get-metamask';
      connectButton.textContent = 'Get MetaMask';
      connectButton.setAttribute('aria-label', 'Install MetaMask extension');
    } else if (!isAllowedDomain) {
      // Not on allowed domain (wallet state unknown) - primary action is go to site
      this.ctaButtonState = 'open-ctj';
      connectButton.textContent = 'Open CTJ App';
      connectButton.setAttribute('aria-label', 'Open Crypto Trading Journal to connect MetaMask');
    } else {
      // On site with wallet - primary action is connect (handled by main app)
      this.ctaButtonState = 'connect-on-page';
      connectButton.textContent = 'Connect on Page';
      connectButton.setAttribute('aria-label', 'Use the Connect button on the page to link MetaMask');
    }
  }
}
