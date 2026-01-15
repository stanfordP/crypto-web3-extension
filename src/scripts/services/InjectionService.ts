/**
 * InjectionService - Handles wallet script injection and communication
 *
 * Extracted from content.ts to enable testing and separation of concerns.
 * Manages the lifecycle of the injected wallet script and message passing.
 */

import type { IDOMAdapter } from '../adapters/types';
import { contentLogger as logger } from '../logger';

// ============================================================================
// Types
// ============================================================================

/** Wallet message types for injected script communication */
export const WalletMessageType = {
  CJ_WALLET_CHECK: 'CJ_WALLET_CHECK',
  CJ_WALLET_CHECK_RESULT: 'CJ_WALLET_CHECK_RESULT',
  CJ_WALLET_CONNECT: 'CJ_WALLET_CONNECT',
  CJ_WALLET_CONNECT_RESULT: 'CJ_WALLET_CONNECT_RESULT',
  CJ_WALLET_SIGN: 'CJ_WALLET_SIGN',
  CJ_WALLET_SIGN_RESULT: 'CJ_WALLET_SIGN_RESULT',
} as const;

export type WalletMessageTypeKey = keyof typeof WalletMessageType;

/** Wallet check result */
export interface WalletCheckResult {
  available: boolean;
  walletName: string | null;
}

/** Wallet connect result */
export interface WalletConnectResult {
  success: boolean;
  address?: string;
  chainId?: string;
  error?: string;
  code?: number;
}

/** Wallet sign result */
export interface WalletSignResult {
  success: boolean;
  signature?: string;
  error?: string;
  code?: number;
}

/** Dependencies for InjectionService */
export interface InjectionServiceDeps {
  domAdapter: IDOMAdapter;
  logger?: typeof logger;
}

// ============================================================================
// InjectionService Class
// ============================================================================

export class InjectionService {
  private domAdapter: IDOMAdapter;
  private logger: typeof logger;
  private injectedScriptReady = false;
  private injectionPromise: Promise<void> | null = null;
  private messageHandlers = new Map<string, (data: unknown) => void>();
  private messageListener: ((event: Event) => void) | null = null;

  /** Retry configuration for injection */
  private readonly INJECTION_RETRIES = 4;
  private readonly INITIAL_RETRY_DELAY = 200;

  /** Timeout for wallet messages */
  private readonly WALLET_MESSAGE_TIMEOUT = 30000;

  constructor(deps: InjectionServiceDeps) {
    this.domAdapter = deps.domAdapter;
    this.logger = deps.logger || logger;
  }

  /**
   * Get injection state (for testing)
   */
  isReady(): boolean {
    return this.injectedScriptReady;
  }

  /**
   * Initialize the service by setting up message listener
   */
  initialize(): void {
    if (this.messageListener) {
      this.logger.debug('InjectionService already initialized');
      return;
    }

    // Wrap handler to cast Event to MessageEvent
    this.messageListener = (event: Event) => {
      this.handleWalletMessage(event as MessageEvent);
    };
    this.domAdapter.addEventListener('message', this.messageListener);
    this.logger.debug('InjectionService initialized');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.messageListener) {
      this.domAdapter.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    this.messageHandlers.clear();
    this.injectedScriptReady = false;
    this.injectionPromise = null;
    this.logger.debug('InjectionService cleaned up');
  }

  /**
   * Handle incoming wallet messages from injected script
   */
  private handleWalletMessage(event: MessageEvent): void {
    // Only accept messages from same origin
    if (event.origin !== this.domAdapter.getOrigin()) return;

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Handle injected script ready signal
    if (data.type === 'CJ_WALLET_SCRIPT_READY') {
      this.injectedScriptReady = true;
      this.logger.debug('Injected script ready');
      return;
    }

    // Handle wallet result messages
    const handler = this.messageHandlers.get(data.type);
    if (handler) {
      handler(data);
      this.messageHandlers.delete(data.type);
    }
  }

  /**
   * Inject the wallet script into the page context
   * Uses retry logic with exponential backoff
   */
  async injectWalletScript(): Promise<void> {
    // Already ready
    if (this.injectedScriptReady) {
      return;
    }

    // Reuse existing injection attempt
    if (this.injectionPromise) {
      return this.injectionPromise;
    }

    this.injectionPromise = this.performInjection();
    return this.injectionPromise;
  }

  /**
   * Perform the actual injection with retry logic
   */
  private async performInjection(): Promise<void> {
    // Try injection with retries
    for (let attempt = 0; attempt <= this.INJECTION_RETRIES; attempt++) {
      if (this.injectedScriptReady) {
        this.logger.debug('Injected script ready (confirmed via message)');
        return;
      }

      if (attempt > 0) {
        // Exponential backoff: 200ms, 400ms, 800ms, 1600ms
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        this.logger.debug(`Retrying wallet script injection (attempt ${attempt + 1})`, { delay });
        await this.sleep(delay);
      }

      try {
        await this.tryInjectScript();
      } catch (error) {
        this.logger.warn(`Injection attempt ${attempt + 1} failed`, { error: String(error) });
      }
    }

    // Final check after all retries
    if (!this.injectedScriptReady) {
      this.logger.warn('Wallet script did not signal ready after all retries, proceeding anyway');
    }
  }

  /**
   * Actually inject the script element
   */
  private async tryInjectScript(): Promise<void> {
    // Check if script is already injected
    if (this.domAdapter.querySelector('script[data-cj-wallet]')) {
      this.logger.debug('Wallet script already injected');
      return;
    }

    // Create and inject script
    // Note: File is at root of dist/, not in scripts/ folder
    const scriptUrl = this.domAdapter.getExtensionUrl('injected-auth.js');
    if (!scriptUrl) {
      throw new Error('Failed to get injected script URL');
    }

    const script = this.domAdapter.createElement('script');
    script.src = scriptUrl;
    script.setAttribute('data-cj-wallet', 'true');

    // Wait for script to load
    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load injected script'));

      const head = this.domAdapter.querySelector('head');
      if (head) {
        head.appendChild(script);
      } else {
        // Fallback: append to documentElement
        const docElement = this.domAdapter.querySelector('html');
        if (docElement) {
          docElement.appendChild(script);
        } else {
          reject(new Error('No suitable parent element for script injection'));
        }
      }
    });

    this.logger.debug('Wallet script injected');

    // Give script time to initialize
    await this.sleep(50);
  }

  /**
   * Send a message to the injected wallet script and wait for response
   */
  async sendWalletMessage<T>(
    type: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    // Ensure script is injected
    await this.injectWalletScript();

    return new Promise((resolve, reject) => {
      const resultType = `${type}_RESULT`;

      // Set up response handler
      const timeoutId = setTimeout(() => {
        this.messageHandlers.delete(resultType);
        reject(new Error(`Wallet message ${type} timed out after ${this.WALLET_MESSAGE_TIMEOUT}ms`));
      }, this.WALLET_MESSAGE_TIMEOUT);

      this.messageHandlers.set(resultType, (responseData: unknown) => {
        clearTimeout(timeoutId);
        resolve(responseData as T);
      });

      // Send message to page context
      // Include source marker so injected script knows this is from content script
      this.domAdapter.postMessage(
        { type, source: 'cj-content-script', ...data },
        this.domAdapter.getOrigin()
      );

      this.logger.debug(`Sent wallet message: ${type}`);
    });
  }

  /**
   * Check if wallet is available
   */
  async checkWallet(): Promise<WalletCheckResult> {
    return this.sendWalletMessage<WalletCheckResult>(WalletMessageType.CJ_WALLET_CHECK);
  }

  /**
   * Connect to wallet
   */
  async connectWallet(): Promise<WalletConnectResult> {
    return this.sendWalletMessage<WalletConnectResult>(WalletMessageType.CJ_WALLET_CONNECT);
  }

  /**
   * Sign a message with wallet
   */
  async signMessage(message: string, address: string): Promise<WalletSignResult> {
    return this.sendWalletMessage<WalletSignResult>(WalletMessageType.CJ_WALLET_SIGN, {
      message,
      address,
    });
  }

  /**
   * Helper to sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
