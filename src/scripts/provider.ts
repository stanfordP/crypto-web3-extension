/**
 * EIP-1193 Ethereum Provider Implementation
 * Compliant with Ethereum Provider JavaScript API standard
 *
 * This provider acts as a bridge between dApps and the extension's
 * background script, which handles communication with actual wallets
 * and the main app's authentication system.
 */

import type {
  EthereumProvider,
  RequestArguments,
  ProviderRpcError,
  MessageType,
  Message,
  MessageResponse,
} from './types';

type EventListener = (...args: unknown[]) => void;

export class CryptoJournalProvider implements EthereumProvider {
  // Provider identification
  public readonly isCryptoJournal = true;
  public readonly isMetaMask = false; // Compatibility flag for dApps

  // Current state
  public chainId: string = '0x1'; // Default to Ethereum mainnet
  public selectedAddress: string | null = null;

  // Event listeners storage
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  // Request ID counter for message correlation
  private requestIdCounter = 0;

  // Pending requests (waiting for background response)
  private pendingRequests: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  // Inflight requests for deduplication
  private inflightRequests: Map<string, Promise<unknown>> = new Map();

  constructor() {
    this.setupMessageListener();
  }

  /**
   * Core EIP-1193 request method
   * All Ethereum interactions go through this method
   */
  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args;

    // Handle methods that can be resolved locally
    switch (method) {
      case 'eth_chainId':
        return this.chainId;

      case 'eth_accounts':
        return this.selectedAddress ? [this.selectedAddress] : [];

      case 'net_version':
        return parseInt(this.chainId, 16).toString();

      default: {
        // Deduplicate concurrent identical requests
        const cacheKey = `${method}:${JSON.stringify(params || [])}`;
        const existing = this.inflightRequests.get(cacheKey);
        if (existing) {
          return existing;
        }

        // Create new request
        const promise = this.sendMessageToBackground(method, params);
        this.inflightRequests.set(cacheKey, promise);

        try {
          return await promise;
        } finally {
          this.inflightRequests.delete(cacheKey);
        }
      }
    }
  }

  /**
   * Check if provider is connected
   */
  isConnected(): boolean {
    return this.selectedAddress !== null;
  }

  /**
   * Add event listener (EIP-1193 compliant)
   */
  on(eventName: string, listener: EventListener): void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener);
  }

  /**
   * Remove event listener
   */
  removeListener(eventName: string, listener: EventListener): void {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit event to all registered listeners
   */
  private emit(eventName: string, ...args: unknown[]): void {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in ${eventName} listener:`, error);
        }
      });
    }
  }

  /**
   * Send message to background script and wait for response
   */
  private async sendMessageToBackground(
    method: string,
    params?: unknown[] | Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${++this.requestIdCounter}`;

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject });

      // Determine message type from method
      const messageType = this.methodToMessageType(method);

      const message: Message = {
        type: messageType,
        payload: { method, params },
        requestId,
      };

      // Set up timeout (must be const and defined before cleanup)
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(this.createError(-32603, 'Request timeout'));
      }, 60000);

      // Cleanup function to prevent memory leaks
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
      };

      // Send to background script
      chrome.runtime.sendMessage(message, (response: MessageResponse) => {
        cleanup(); // Clear timeout and pending request

        // Handle Chrome runtime errors
        if (chrome.runtime.lastError) {
          reject(
            this.createError(
              -32603,
              `Extension error: ${chrome.runtime.lastError.message}`
            )
          );
          return;
        }

        // Handle response
        if (response.success) {
          resolve(response.data);
        } else {
          reject(this.createError(-32603, response.error || 'Unknown error'));
        }
      });
    });
  }

  /**
   * Map RPC method to internal message type
   */
  private methodToMessageType(method: string): MessageType {
    // This is imported from types, but we need to use the enum values
    switch (method) {
      case 'eth_requestAccounts':
        return 'REQUEST_ACCOUNTS' as MessageType;
      case 'personal_sign':
      case 'eth_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v4':
        return 'SIGN_MESSAGE' as MessageType;
      case 'eth_sendTransaction':
        return 'SEND_TRANSACTION' as MessageType;
      case 'wallet_switchEthereumChain':
        return 'SWITCH_CHAIN' as MessageType;
      case 'wallet_addEthereumChain':
        return 'ADD_CHAIN' as MessageType;
      default:
        // For unknown methods, use RPC_REQUEST which will forward to wallet
        return 'RPC_REQUEST' as MessageType;
    }
  }

  /**
   * Setup listener for events from background script
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: Message, _sender, sendResponse) => {
        this.handleBackgroundMessage(message);
        sendResponse({ success: true });
        return true; // Keep channel open for async response
      }
    );
  }

  /**
   * Handle events sent from background script
   */
  private handleBackgroundMessage(message: Message): void {
    switch (message.type) {
      case 'ACCOUNTS_CHANGED' as MessageType:
        this.handleAccountsChanged(message.payload as string[]);
        break;

      case 'CHAIN_CHANGED' as MessageType:
        this.handleChainChanged(message.payload as string);
        break;

      case 'CONNECT' as MessageType:
        this.handleConnect(message.payload as { chainId: string });
        break;

      case 'DISCONNECT_EVENT' as MessageType:
        this.handleDisconnect();
        break;

      default:
        // Unknown message type - ignore
        break;
    }
  }

  /**
   * Handle accounts changed event
   */
  private handleAccountsChanged(accounts: string[]): void {
    const newAddress = accounts.length > 0 ? accounts[0] : null;

    if (newAddress !== this.selectedAddress) {
      this.selectedAddress = newAddress;
      this.emit('accountsChanged', accounts);
    }
  }

  /**
   * Handle chain changed event
   */
  private handleChainChanged(chainId: string): void {
    if (chainId !== this.chainId) {
      this.chainId = chainId;
      this.emit('chainChanged', chainId);
    }
  }

  /**
   * Handle connect event
   */
  private handleConnect(connectInfo: { chainId: string }): void {
    this.chainId = connectInfo.chainId;
    this.emit('connect', connectInfo);
  }

  /**
   * Handle disconnect event
   */
  private handleDisconnect(): void {
    this.selectedAddress = null;
    this.emit('disconnect', this.createError(4900, 'Disconnected'));
  }

  /**
   * Create standardized error object
   */
  private createError(code: number, message: string, data?: unknown): ProviderRpcError {
    const error = new Error(message) as ProviderRpcError;
    error.code = code;
    error.data = data;
    return error;
  }

  /**
   * Initialize provider with saved state (called from content script)
   */
  async initialize(state: {
    address: string | null;
    chainId: string;
  }): Promise<void> {
    this.selectedAddress = state.address;
    this.chainId = state.chainId;
  }
}

/**
 * Factory function to create provider instance
 */
export function createProvider(): CryptoJournalProvider {
  return new CryptoJournalProvider();
}
