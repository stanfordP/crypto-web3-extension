/**
 * Auth Controller
 * 
 * Handles all business logic for the full-page authentication experience.
 * Uses dependency injection for testability.
 * 
 * @module ui/auth/AuthController
 */

import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter, IDOMAdapter } from '../../adapters/types';
import type { AuthView, AuthSuccessData } from './AuthView';
import type { EthereumProvider, SIWEChallengeRequest, SIWEChallengeResponse, SIWEVerifyRequest, SIWEVerifyResponse } from '../../types';
import { StorageKeys } from '../../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Auth state
 */
export interface AuthState {
  step: 'loading' | 'noWallet' | 'connect' | 'connecting' | 'success' | 'error';
  address?: string;
  chainId?: string;
  accountMode: 'demo' | 'live';
  error?: string;
}

/**
 * EIP-6963 Provider detail
 */
export interface EIP6963ProviderDetail {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
}

/**
 * API client interface for AuthController
 */
export interface AuthApiClient {
  getSIWEChallenge(request: SIWEChallengeRequest): Promise<SIWEChallengeResponse>;
  verifySIWE(request: SIWEVerifyRequest): Promise<SIWEVerifyResponse>;
}

/**
 * Configuration for AuthController
 */
export interface AuthControllerConfig {
  apiBaseUrl: string;
  dashboardPath: string;
  walletDetectionAttempts: number;
  walletDetectionInitialDelay: number;
  autoRedirectDelay: number;
}

const DEFAULT_CONFIG: AuthControllerConfig = {
  apiBaseUrl: 'http://localhost:3000',
  dashboardPath: '/',
  walletDetectionAttempts: 5,
  walletDetectionInitialDelay: 300,
  autoRedirectDelay: 2000,
};

// ============================================================================
// AuthController Class
// ============================================================================

/**
 * AuthController handles all business logic for the auth page.
 * It delegates UI updates to AuthView.
 */
export class AuthController {
  private config: AuthControllerConfig;
  private state: AuthState;
  private isConnecting: boolean = false;
  private currentStepIndex: number = 0;
  private detectedProviders: EthereumProvider[] = [];
  private walletEventHandlers: {
    accountsChanged?: (accounts: unknown) => void;
    chainChanged?: (chainId: unknown) => void;
  } = {};

  constructor(
    private storage: IStorageAdapter,
    private runtime: IRuntimeAdapter,
    private tabs: ITabsAdapter,
    private dom: IDOMAdapter,
    private view: AuthView,
    private apiClient: AuthApiClient,
    config?: Partial<AuthControllerConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      step: 'loading',
      accountMode: 'live',
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the auth controller
   */
  initialize(): void {
    // Initialize view with event handlers
    this.view.initialize({
      onConnect: () => this.handleConnect(),
      onCancel: () => this.handleCancel(),
      onRetry: () => this.handleRetry(),
      onRetryDetection: () => this.handleRetryDetection(),
      onCloseError: () => this.handleCloseError(),
      onOpenDashboard: () => this.handleOpenDashboard(),
      onAccountModeChange: (mode) => this.handleAccountModeChange(mode),
    });

    // Setup EIP-6963 provider detection
    this.setupEIP6963Detection();

    // Start wallet detection
    this.startWalletDetection();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Remove wallet event listeners
    const provider = this.getEthereumProvider();
    if (provider && this.walletEventHandlers.accountsChanged) {
      provider.removeListener('accountsChanged', this.walletEventHandlers.accountsChanged);
    }
    if (provider && this.walletEventHandlers.chainChanged) {
      provider.removeListener('chainChanged', this.walletEventHandlers.chainChanged);
    }
    this.walletEventHandlers = {};
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle connect button click
   */
  private async handleConnect(): Promise<void> {
    await this.authenticate();
  }

  /**
   * Handle cancel button click
   */
  private handleCancel(): void {
    this.isConnecting = false;
    this.state.step = 'connect';
    this.view.showSection('connect');
  }

  /**
   * Handle retry button click (from error state)
   */
  private handleRetry(): void {
    this.view.showSection('connect');
  }

  /**
   * Handle retry detection button click (from noWallet state)
   */
  private handleRetryDetection(): void {
    this.startWalletDetection();
  }

  /**
   * Handle close error button click
   */
  private handleCloseError(): void {
    this.view.closeWindow();
  }

  /**
   * Handle open dashboard button click
   */
  private handleOpenDashboard(): void {
    this.openDashboard();
  }

  /**
   * Handle account mode change
   */
  private handleAccountModeChange(mode: 'demo' | 'live'): void {
    this.state.accountMode = mode;
  }

  // ============================================================================
  // Wallet Detection
  // ============================================================================

  /**
   * Setup EIP-6963 provider detection (modern wallet discovery standard)
   * This allows wallets like Rabby to announce themselves
   */
  private setupEIP6963Detection(): void {
    this.dom.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
      const detail = event.detail as EIP6963ProviderDetail;
      if (detail?.provider && !detail.provider.isCryptoJournal) {
        console.log('[AuthController] EIP-6963: Provider announced:', detail.info?.name || 'Unknown');
        this.detectedProviders.push(detail.provider);
        
        // If we're showing noWallet, switch to connect
        if (this.state.step === 'noWallet') {
          this.state.step = 'connect';
          this.view.showSection('connect');
        }
      }
    }) as EventListener);

    // Request providers to announce themselves
    const requestEvent = new Event('eip6963:requestProvider');
    this.dom.addWindowListener('message', () => {}); // Ensure window is available
    window.dispatchEvent(requestEvent);
  }

  /**
   * Start wallet detection with exponential backoff
   */
  private startWalletDetection(): void {
    this.state.step = 'loading';
    this.view.showSection('loading');

    const checkWallet = (attempt: number): void => {
      console.log(`[AuthController] Wallet detection attempt ${attempt}/${this.config.walletDetectionAttempts}`);
      
      if (this.hasWallet()) {
        console.log('[AuthController] Wallet detected!');
        this.state.step = 'connect';
        this.view.showSection('connect');
        this.setupWalletEventListeners();
        return;
      }
      
      if (attempt < this.config.walletDetectionAttempts) {
        // Exponential backoff: 200ms, 400ms, 800ms, 1600ms
        const delay = 200 * Math.pow(2, attempt - 1);
        setTimeout(() => checkWallet(attempt + 1), delay);
      } else {
        console.log('[AuthController] No wallet detected after all attempts');
        this.state.step = 'noWallet';
        this.view.showSection('noWallet');
      }
    };

    // Start checking after initial delay
    setTimeout(() => checkWallet(1), this.config.walletDetectionInitialDelay);
  }

  /**
   * Get the Ethereum provider (MetaMask, Brave Wallet, Rabby, etc.)
   */
  getEthereumProvider(): EthereumProvider | null {
    // First, try EIP-6963 detected providers (most reliable for modern wallets)
    if (this.detectedProviders.length > 0) {
      const validProvider = this.detectedProviders.find(p => !p.isCryptoJournal);
      if (validProvider) {
        console.log('[AuthController] Using EIP-6963 detected provider');
        return validProvider;
      }
    }

    // Fallback to window.ethereum
    const win = window as unknown as { ethereum?: EthereumProvider };
    const ethereum = win.ethereum;

    if (!ethereum) {
      console.log('[AuthController] No window.ethereum found');
      return null;
    }

    // Check for multi-provider setup (common with multiple wallets)
    const providers = (ethereum as unknown as { providers?: EthereumProvider[] }).providers;
    if (Array.isArray(providers) && providers.length > 0) {
      console.log('[AuthController] Found multi-provider setup with', providers.length, 'providers');
      const validProvider = providers.find(p => !p.isCryptoJournal);
      if (validProvider) {
        console.log('[AuthController] Using provider from multi-provider array:', 
          this.getProviderName(validProvider));
        return validProvider;
      }
    }

    // Skip our own provider if it's the only one
    if (ethereum.isCryptoJournal) {
      console.log('[AuthController] Only found our own provider, no external wallet');
      return null;
    }

    console.log('[AuthController] Using direct window.ethereum:', this.getProviderName(ethereum));
    return ethereum;
  }

  /**
   * Get provider name for logging
   */
  private getProviderName(provider: EthereumProvider): string {
    if (provider.isMetaMask) return 'MetaMask';
    if (provider.isRabby) return 'Rabby';
    if (provider.isBraveWallet) return 'Brave';
    return 'Unknown';
  }

  /**
   * Check if a wallet is available
   */
  hasWallet(): boolean {
    return this.getEthereumProvider() !== null;
  }

  /**
   * Setup wallet event listeners
   */
  private setupWalletEventListeners(): void {
    const provider = this.getEthereumProvider();
    if (!provider) return;

    this.walletEventHandlers.accountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        // User disconnected their wallet
        this.view.showSection('connect');
      }
    };

    this.walletEventHandlers.chainChanged = (chainId: unknown) => {
      this.state.chainId = chainId as string;
    };

    provider.on('accountsChanged', this.walletEventHandlers.accountsChanged);
    provider.on('chainChanged', this.walletEventHandlers.chainChanged);
  }

  // ============================================================================
  // Authentication Flow
  // ============================================================================

  /**
   * Main authentication flow
   */
  async authenticate(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const provider = this.getEthereumProvider();
      if (!provider) {
        throw new Error('No wallet detected');
      }

      // Get selected account mode from view
      this.state.accountMode = this.view.getSelectedAccountMode();

      // Show connecting state
      this.state.step = 'connecting';
      this.view.showSection('connecting');
      this.currentStepIndex = 0;
      this.view.updateStepProgress(this.currentStepIndex);
      this.view.updateConnectingStatus('Connecting...', 'Please approve the connection in your wallet.');

      // Step 1: Request accounts
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet');
      }

      const address = accounts[0];
      this.state.address = address;

      // Get chain ID
      const chainId = await provider.request({ method: 'eth_chainId' }) as string;
      this.state.chainId = chainId;

      // Step 2: Get SIWE challenge
      this.currentStepIndex = 1;
      this.view.updateStepProgress(this.currentStepIndex);
      this.view.updateConnectingStatus('Getting Challenge...', 'Requesting authentication challenge from server.');

      const chainIdNumber = parseInt(chainId, 16);
      const challengeResponse = await this.apiClient.getSIWEChallenge({
        address,
        chainId: chainIdNumber,
        accountMode: this.state.accountMode,
      });

      // Step 3: Sign message
      this.currentStepIndex = 2;
      this.view.updateStepProgress(this.currentStepIndex);
      this.view.updateConnectingStatus('Sign Message', 'Please sign the message in your wallet to authenticate.');

      // personal_sign expects [message, address]
      const signature = await provider.request({
        method: 'personal_sign',
        params: [challengeResponse.message, address],
      }) as string;

      // Step 4: Verify signature
      this.currentStepIndex = 3;
      this.view.updateStepProgress(this.currentStepIndex);
      this.view.updateConnectingStatus('Verifying...', 'Verifying your signature with the server.');

      const verifyResponse = await this.apiClient.verifySIWE({
        message: challengeResponse.message,
        signature,
        accountMode: this.state.accountMode,
      });

      // Store session
      await this.storeSession(verifyResponse.sessionToken, address, chainId);

      // Notify background script of successful auth
      await this.notifyAuthSuccess(address, chainId);

      // Show success
      this.state.step = 'success';
      const successData: AuthSuccessData = {
        address,
        chainId,
        accountMode: this.state.accountMode,
      };
      this.view.showSuccess(successData);

      // Auto-redirect after delay
      setTimeout(() => {
        this.openDashboard();
      }, this.config.autoRedirectDelay);

    } catch (error) {
      console.error('[AuthController] Authentication failed:', error);
      this.handleAuthError(error);
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Store session in chrome storage
   */
  private async storeSession(sessionToken: string, address: string, chainId: string): Promise<void> {
    await this.storage.localSet({
      [StorageKeys.SESSION_TOKEN]: sessionToken,
      [StorageKeys.CONNECTED_ADDRESS]: address,
      [StorageKeys.CHAIN_ID]: chainId,
      [StorageKeys.ACCOUNT_MODE]: this.state.accountMode,
      [StorageKeys.LAST_CONNECTED]: Date.now(),
    });

    // Also store in session storage for background script
    await this.storage.sessionSet({
      sessionToken,
    });
  }

  /**
   * Notify background script of successful authentication
   */
  private async notifyAuthSuccess(address: string, chainId: string): Promise<void> {
    try {
      await this.runtime.sendMessage({
        type: 'AUTH_SUCCESS',
        payload: {
          address,
          chainId,
          accountMode: this.state.accountMode,
        },
      });
    } catch {
      // Background might not be listening, that's okay
      console.log('[AuthController] Background notification skipped');
    }
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(error: unknown): void {
    // Handle user rejection
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('user rejected') || message.includes('user denied') || message.includes('4001')) {
        this.showError('You rejected the request. Please try again when ready.');
        return;
      }
    }

    // Handle API errors
    const errorMessage = this.formatApiError(error);
    this.showError(errorMessage);
  }

  /**
   * Format API error message
   */
  private formatApiError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * Show error state
   */
  private showError(message: string): void {
    this.state.step = 'error';
    this.state.error = message;
    this.view.showError(message);
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  /**
   * Open the dashboard in main app
   */
  openDashboard(): void {
    const dashboardUrl = `${this.config.apiBaseUrl}${this.config.dashboardPath}`;

    // Try to open in existing tab if possible
    this.tabs.query({ url: `${this.config.apiBaseUrl}/*` }).then((tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        // Update existing tab and focus it
        this.tabs.update(tabs[0].id, { url: dashboardUrl, active: true });
      } else {
        // Open new tab
        this.tabs.create({ url: dashboardUrl });
      }

      // Close this auth tab
      this.view.closeWindow();
    }).catch((error) => {
      console.error('[AuthController] Failed to open dashboard:', error);
      // Fallback: just open new tab
      this.tabs.create({ url: dashboardUrl });
      this.view.closeWindow();
    });
  }

  // ============================================================================
  // Getters for Testing
  // ============================================================================

  /**
   * Get current state (for testing)
   */
  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Get detected providers count (for testing)
   */
  getDetectedProvidersCount(): number {
    return this.detectedProviders.length;
  }

  /**
   * Get current step index (for testing)
   */
  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  /**
   * Check if currently connecting (for testing)
   */
  getIsConnecting(): boolean {
    return this.isConnecting;
  }
}
