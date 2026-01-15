/**
 * Popup View
 * 
 * Thin DOM layer that handles only UI rendering and DOM manipulation.
 * No business logic - all logic delegated to PopupController.
 * 
 * @module ui/popup/PopupView
 */

import type { IDOMAdapter } from '../../adapters/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Popup view state
 */
export type PopupViewState = 'loading' | 'notConnected' | 'connected' | 'error';

/**
 * Connected session display data
 */
export interface SessionDisplayData {
  address: string;
  shortAddress: string;
  networkName: string;
  accountMode: string;
}

/**
 * Popup view elements
 */
export interface PopupElements {
  loading: HTMLElement;
  notConnected: HTMLElement;
  connected: HTMLElement;
  error: HTMLElement;
  connectButton: HTMLElement;
  disconnectButton: HTMLElement;
  openAppButton: HTMLElement;
  retryButton: HTMLElement;
  address: HTMLElement;
  network: HTMLElement;
  accountMode: HTMLElement;
  errorMessage: HTMLElement;
  offlineIndicator?: HTMLElement;
}

/**
 * Event handlers that PopupView will call
 */
export interface PopupViewEventHandlers {
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenApp: () => void;
  onRetry: () => void;
}

// ============================================================================
// PopupView Class
// ============================================================================

/**
 * PopupView handles all DOM manipulation for the popup.
 * It does not contain any business logic.
 */
export class PopupView {
  private elements: PopupElements;
  private handlers: PopupViewEventHandlers | null = null;
  private isOnline: boolean = true;

  constructor(
    private dom: IDOMAdapter,
    customElements?: Partial<PopupElements>
  ) {
    // Get DOM elements (can be overridden for testing)
    this.elements = {
      loading: customElements?.loading ?? this.getElement('loading'),
      notConnected: customElements?.notConnected ?? this.getElement('notConnected'),
      connected: customElements?.connected ?? this.getElement('connected'),
      error: customElements?.error ?? this.getElement('error'),
      connectButton: customElements?.connectButton ?? this.getElement('connectButton'),
      disconnectButton: customElements?.disconnectButton ?? this.getElement('disconnectButton'),
      openAppButton: customElements?.openAppButton ?? this.getElement('openAppButton'),
      retryButton: customElements?.retryButton ?? this.getElement('retryButton'),
      address: customElements?.address ?? this.getElement('address'),
      network: customElements?.network ?? this.getElement('network'),
      accountMode: customElements?.accountMode ?? this.getElement('accountMode'),
      errorMessage: customElements?.errorMessage ?? this.getElement('errorMessage'),
      offlineIndicator: customElements?.offlineIndicator ?? dom.getElementById('offlineIndicator') ?? undefined,
    };
  }

  /**
   * Get element by ID or throw if not found
   */
  private getElement(id: string): HTMLElement {
    const element = this.dom.getElementById(id);
    if (!element) {
      throw new Error(`[PopupView] Element not found: #${id}`);
    }
    return element;
  }

  /**
   * Initialize event handlers
   */
  initialize(handlers: PopupViewEventHandlers): void {
    this.handlers = handlers;
    this.setupEventListeners();
    this.createOfflineIndicator();
    this.setupOnlineListeners();
  }

  /**
   * Set up click event listeners on buttons
   */
  private setupEventListeners(): void {
    if (!this.handlers) return;

    this.elements.connectButton.addEventListener('click', () => {
      if (!this.isOnline) {
        this.showError('Cannot connect while offline. Please check your internet connection.');
        return;
      }
      this.handlers!.onConnect();
    });

    this.elements.disconnectButton.addEventListener('click', () => {
      this.handlers!.onDisconnect();
    });

    this.elements.openAppButton.addEventListener('click', () => {
      this.handlers!.onOpenApp();
    });

    this.elements.retryButton.addEventListener('click', () => {
      if (!this.isOnline) {
        this.showError('Cannot retry while offline. Please check your internet connection.');
        return;
      }
      this.handlers!.onRetry();
    });
  }

  /**
   * Create and insert offline indicator element
   */
  private createOfflineIndicator(): void {
    if (this.elements.offlineIndicator) return;

    // Create indicator (in real DOM)
    const indicator = document.createElement('div');
    indicator.id = 'offlineIndicator';
    indicator.className = 'offline-indicator hidden';
    indicator.innerHTML = `
      <span class="offline-icon">&#9888;</span>
      <span class="offline-text">Offline</span>
    `;
    
    document.body.insertBefore(indicator, document.body.firstChild);
    this.elements.offlineIndicator = indicator;
  }

  /**
   * Set up online/offline event listeners
   */
  private setupOnlineListeners(): void {
    this.dom.addWindowListener('online', () => {
      this.updateOnlineStatus(true);
      this.handlers?.onRetry();
    });

    this.dom.addWindowListener('offline', () => {
      this.updateOnlineStatus(false);
    });
  }

  // ============================================================================
  // Public View Methods
  // ============================================================================

  /**
   * Show a specific view state
   */
  showView(state: PopupViewState): void {
    // Hide all sections
    this.elements.loading.classList.add('hidden');
    this.elements.notConnected.classList.add('hidden');
    this.elements.connected.classList.add('hidden');
    this.elements.error.classList.add('hidden');

    // Show selected section
    switch (state) {
      case 'loading':
        this.elements.loading.classList.remove('hidden');
        break;
      case 'notConnected':
        this.elements.notConnected.classList.remove('hidden');
        break;
      case 'connected':
        this.elements.connected.classList.remove('hidden');
        break;
      case 'error':
        this.elements.error.classList.remove('hidden');
        break;
    }
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    this.elements.errorMessage.textContent = message;
    this.showView('error');
  }

  /**
   * Update connected state display
   */
  showConnectedState(data: SessionDisplayData): void {
    this.elements.address.textContent = data.shortAddress;
    this.elements.network.textContent = data.networkName;
    this.elements.accountMode.textContent = data.accountMode;
    this.showView('connected');
  }

  /**
   * Update online/offline status
   */
  updateOnlineStatus(online: boolean): void {
    this.isOnline = online;

    if (!online) {
      this.showError('You are offline. Please check your internet connection.');
      this.elements.connectButton.setAttribute('disabled', 'true');
      this.elements.offlineIndicator?.classList.remove('hidden');
    } else {
      this.elements.connectButton.removeAttribute('disabled');
      this.elements.offlineIndicator?.classList.add('hidden');
    }
  }

  /**
   * Get current online status
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Close the popup window
   */
  close(): void {
    this.dom.closeWindow();
  }
}

// ============================================================================
// Utility Functions (Pure)
// ============================================================================

/**
 * Truncate an Ethereum address for display
 */
export function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Chain ID to network name mapping
 */
const NETWORK_NAMES: Record<string, string> = {
  '0x1': 'Ethereum',
  '0x89': 'Polygon',
  '0xa86a': 'Avalanche',
  '0xa4b1': 'Arbitrum',
  '0xa': 'Optimism',
  '0x2105': 'Base',
  '0x38': 'BNB Chain',
};

/**
 * Get network name from chain ID
 */
export function getNetworkName(chainId: string): string {
  return NETWORK_NAMES[chainId] || `Chain ${parseInt(chainId, 16)}`;
}

/**
 * Format account mode for display
 */
export function formatAccountMode(mode: 'demo' | 'live' | undefined): string {
  return mode === 'demo' ? 'Demo Mode' : 'Live Trading';
}
