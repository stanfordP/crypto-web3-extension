/**
 * Auth View
 * 
 * Thin DOM layer that handles only UI rendering and DOM manipulation
 * for the full-page authentication experience.
 * No business logic - all logic delegated to AuthController.
 * 
 * @module ui/auth/AuthView
 */

import type { IDOMAdapter } from '../../adapters/types';
import { SUPPORTED_CHAINS } from '../../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Auth view sections
 */
export type AuthViewSection = 'loading' | 'noWallet' | 'connect' | 'connecting' | 'success' | 'error';

/**
 * Auth step indicator
 */
export interface AuthStep {
  id: string;
  name: string;
}

/**
 * Auth view elements
 */
export interface AuthElements {
  // Sections
  loading: HTMLElement;
  noWallet: HTMLElement;
  connect: HTMLElement;
  connecting: HTMLElement;
  success: HTMLElement;
  error: HTMLElement;

  // Buttons
  connectButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  retryButton: HTMLButtonElement;
  retryDetectionButton: HTMLButtonElement;
  closeErrorButton: HTMLButtonElement;
  openDashboardButton: HTMLButtonElement;

  // Connecting state
  connectingTitle: HTMLElement;
  connectingStatus: HTMLElement;

  // Success state
  successAddress: HTMLElement;
  successNetwork: HTMLElement;
  successMode: HTMLElement;

  // Error state
  errorMessage: HTMLElement;

  // Account mode radios
  accountModeRadios: NodeListOf<HTMLInputElement>;

  // Step indicators
  steps: HTMLElement[];
}

/**
 * Success display data
 */
export interface AuthSuccessData {
  address: string;
  chainId: string;
  accountMode: 'demo' | 'live';
}

/**
 * Event handlers that AuthView will call
 */
export interface AuthViewEventHandlers {
  onConnect: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRetryDetection: () => void;
  onCloseError: () => void;
  onOpenDashboard: () => void;
  onAccountModeChange: (mode: 'demo' | 'live') => void;
}

/**
 * Default auth steps configuration
 */
export const AUTH_STEPS: AuthStep[] = [
  { id: 'step1', name: 'Connect' },
  { id: 'step2', name: 'Challenge' },
  { id: 'step3', name: 'Sign' },
  { id: 'step4', name: 'Verify' },
];

// ============================================================================
// AuthView Class
// ============================================================================

/**
 * AuthView handles all DOM manipulation for the auth page.
 * It does not contain any business logic.
 */
export class AuthView {
  private elements: AuthElements;
  private handlers: AuthViewEventHandlers | null = null;

  constructor(
    private dom: IDOMAdapter,
    customElements?: Partial<AuthElements>
  ) {
    // Get DOM elements (can be overridden for testing)
    this.elements = {
      // Sections
      loading: customElements?.loading ?? this.getElement('loading'),
      noWallet: customElements?.noWallet ?? this.getElement('noWallet'),
      connect: customElements?.connect ?? this.getElement('connect'),
      connecting: customElements?.connecting ?? this.getElement('connecting'),
      success: customElements?.success ?? this.getElement('success'),
      error: customElements?.error ?? this.getElement('error'),

      // Buttons
      connectButton: customElements?.connectButton ?? this.getElement('connectButton') as HTMLButtonElement,
      cancelButton: customElements?.cancelButton ?? this.getElement('cancelButton') as HTMLButtonElement,
      retryButton: customElements?.retryButton ?? this.getElement('retryButton') as HTMLButtonElement,
      retryDetectionButton: customElements?.retryDetectionButton ?? this.getElement('retryDetectionButton') as HTMLButtonElement,
      closeErrorButton: customElements?.closeErrorButton ?? this.getElement('closeErrorButton') as HTMLButtonElement,
      openDashboardButton: customElements?.openDashboardButton ?? this.getElement('openDashboardButton') as HTMLButtonElement,

      // Connecting state
      connectingTitle: customElements?.connectingTitle ?? this.getElement('connectingTitle'),
      connectingStatus: customElements?.connectingStatus ?? this.getElement('connectingStatus'),

      // Success state
      successAddress: customElements?.successAddress ?? this.getElement('successAddress'),
      successNetwork: customElements?.successNetwork ?? this.getElement('successNetwork'),
      successMode: customElements?.successMode ?? this.getElement('successMode'),

      // Error state
      errorMessage: customElements?.errorMessage ?? this.getElement('errorMessage'),

      // Account mode radios
      accountModeRadios: customElements?.accountModeRadios ?? 
        this.dom.querySelectorAll<HTMLInputElement>('input[name="accountMode"]'),

      // Step indicators
      steps: customElements?.steps ?? AUTH_STEPS.map(s => this.getElement(s.id)),
    };
  }

  /**
   * Get element by ID or throw if not found
   */
  private getElement(id: string): HTMLElement {
    const element = this.dom.getElementById(id);
    if (!element) {
      throw new Error(`[AuthView] Element not found: #${id}`);
    }
    return element;
  }

  /**
   * Initialize event handlers
   */
  initialize(handlers: AuthViewEventHandlers): void {
    this.handlers = handlers;
    this.setupEventListeners();
  }

  /**
   * Set up click event listeners on buttons
   */
  private setupEventListeners(): void {
    if (!this.handlers) return;

    // Connect button
    this.elements.connectButton.addEventListener('click', () => {
      this.handlers!.onConnect();
    });

    // Cancel button
    this.elements.cancelButton.addEventListener('click', () => {
      this.handlers!.onCancel();
    });

    // Retry button
    this.elements.retryButton.addEventListener('click', () => {
      this.handlers!.onRetry();
    });

    // Retry detection button
    this.elements.retryDetectionButton.addEventListener('click', () => {
      this.handlers!.onRetryDetection();
    });

    // Close error button
    this.elements.closeErrorButton.addEventListener('click', () => {
      this.handlers!.onCloseError();
    });

    // Open dashboard button
    this.elements.openDashboardButton.addEventListener('click', () => {
      this.handlers!.onOpenDashboard();
    });

    // Account mode radios
    this.elements.accountModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.handlers!.onAccountModeChange(target.value as 'demo' | 'live');
      });
    });
  }

  // ============================================================================
  // Section Management
  // ============================================================================

  /**
   * Show a specific section, hide all others
   */
  showSection(section: AuthViewSection): void {
    const sections: AuthViewSection[] = ['loading', 'noWallet', 'connect', 'connecting', 'success', 'error'];

    sections.forEach(s => {
      const el = this.elements[s];
      if (s === section) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  // ============================================================================
  // Step Progress
  // ============================================================================

  /**
   * Update step progress indicators
   */
  updateStepProgress(activeIndex: number): void {
    this.elements.steps.forEach((step, index) => {
      step.classList.remove('active', 'completed');
      if (index < activeIndex) {
        step.classList.add('completed');
      } else if (index === activeIndex) {
        step.classList.add('active');
      }
    });
  }

  // ============================================================================
  // Connecting State
  // ============================================================================

  /**
   * Update connecting status text
   */
  updateConnectingStatus(title: string, status: string): void {
    this.elements.connectingTitle.textContent = title;
    this.elements.connectingStatus.textContent = status;
  }

  // ============================================================================
  // Success State
  // ============================================================================

  /**
   * Show success state with authentication details
   */
  showSuccess(data: AuthSuccessData): void {
    this.elements.successAddress.textContent = this.formatAddress(data.address);
    this.elements.successNetwork.textContent = this.getNetworkName(data.chainId);
    this.elements.successMode.textContent = data.accountMode === 'live' ? 'Live Trading' : 'Demo Mode';
    this.showSection('success');
  }

  // ============================================================================
  // Error State
  // ============================================================================

  /**
   * Show error state with message
   */
  showError(message: string): void {
    this.elements.errorMessage.textContent = message;
    this.showSection('error');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format address for display (truncate)
   */
  formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Get network name from chain ID
   */
  getNetworkName(chainId: string): string {
    const chain = SUPPORTED_CHAINS[chainId];
    if (chain) {
      return chain.chainName;
    }
    // Convert hex to decimal for display
    const decimal = parseInt(chainId, 16);
    return `Chain ${decimal}`;
  }

  /**
   * Get the currently selected account mode
   */
  getSelectedAccountMode(): 'demo' | 'live' {
    const checked = this.dom.querySelector<HTMLInputElement>('input[name="accountMode"]:checked');
    return (checked?.value as 'demo' | 'live') || 'live';
  }

  /**
   * Close the auth page window
   */
  closeWindow(): void {
    this.dom.closeWindow();
  }
}
