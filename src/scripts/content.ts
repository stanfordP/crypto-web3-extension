/**
 * Content Script - Injected into web pages
 *
 * Responsibilities:
 * 1. Inject EIP-1193 provider into window.ethereum (if not exists)
 * 2. Announce provider via EIP-6963 for multi-wallet discovery
 * 3. Bridge communication between page and background script
 * 4. Initialize provider with current session state
 * 5. Relay wallet operations to real wallet (MetaMask, etc.)
 *
 * IMPORTANT: Runs at document_start to inject before page scripts load
 */

import { createProvider } from './provider';
import { StorageKeys, MessageType } from './types';
import { PROVIDER_INFO, shouldInjectProvider } from './config';
import { contentLogger as logger } from './logger';
import type {
  EIP6963ProviderDetail,
  EIP6963ProviderInfo,
  StorageData,
  Message,
  MessageResponse,
} from './types';

// ============================================================================
// Service Worker Health Check
// ============================================================================

/** Track service worker health status */
let isServiceWorkerHealthy = true;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds

/**
 * Check if the service worker is responsive
 */
async function checkServiceWorkerHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Service worker health check timed out');
      resolve(false);
    }, 2000);

    try {
      chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          logger.debug('Service worker health check failed', {
            error: chrome.runtime.lastError.message
          });
          resolve(false);
        } else {
          resolve(response?.pong === true);
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      logger.debug('Service worker health check exception', { error: String(error) });
      resolve(false);
    }
  });
}

/**
 * Ensure service worker is healthy before critical operations
 * Performs check with caching to avoid excessive pings
 */
async function ensureServiceWorkerHealthy(): Promise<boolean> {
  const now = Date.now();

  // Use cached result if recent
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL && isServiceWorkerHealthy) {
    return true;
  }

  // Perform health check
  isServiceWorkerHealthy = await checkServiceWorkerHealth();
  lastHealthCheck = now;

  if (!isServiceWorkerHealthy) {
    // Try to wake up the service worker
    logger.info('Service worker appears inactive, attempting wake-up');

    // Send a few pings with delays
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      isServiceWorkerHealthy = await checkServiceWorkerHealth();
      if (isServiceWorkerHealthy) {
        logger.info('Service worker woke up successfully');
        break;
      }
    }
  }

  return isServiceWorkerHealthy;
}

// ============================================================================
// Wallet Relay - Bridge between background and real wallet (MetaMask)
// ============================================================================

interface WalletRelayRequest {
  type: 'CRYPTO_JOURNAL_WALLET_REQUEST';
  id: string;
  method: string;
  params?: unknown[];
}

interface WalletRelayResponse {
  type: 'CRYPTO_JOURNAL_WALLET_RESPONSE';
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Pending wallet requests waiting for response from page script
const pendingWalletRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

/**
 * Inject the wallet relay script into the page context
 * This script can access window.ethereum (MetaMask, etc.)
 */
function injectWalletRelayScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-wallet.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

/**
 * Send a wallet operation request to the page context
 */
function sendWalletRequest(method: string, params?: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `wallet_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Set timeout for wallet operations (60 seconds)
    const timeoutId = setTimeout(() => {
      pendingWalletRequests.delete(id);
      reject(new Error('Wallet operation timed out'));
    }, 60000);

    pendingWalletRequests.set(id, { resolve, reject, timeoutId });

    const request: WalletRelayRequest = {
      type: 'CRYPTO_JOURNAL_WALLET_REQUEST',
      id,
      method,
      params,
    };

    window.postMessage(request, '*');
  });
}

/**
 * Listen for wallet responses from the page script
 */
function setupWalletResponseListener(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data as WalletRelayResponse;
    if (data?.type !== 'CRYPTO_JOURNAL_WALLET_RESPONSE') return;

    const pending = pendingWalletRequests.get(data.id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    pendingWalletRequests.delete(data.id);

    if (data.success) {
      pending.resolve(data.data);
    } else {
      pending.reject(new Error(data.error || 'Wallet operation failed'));
    }
  });
}

/**
 * Handle wallet operation requests from background script
 */
function setupBackgroundWalletRelay(): void {
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message.type !== MessageType.WALLET_OPERATION) {
      return false;
    }

    const { method, params } = message.payload as { method: string; params?: unknown[] };

    sendWalletRequest(method, params)
      .then((data) => {
        sendResponse({
          success: true,
          data,
          requestId: message.requestId,
        } as MessageResponse);
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId: message.requestId,
        } as MessageResponse);
      });

    return true; // Keep channel open for async response
  });
}

/**
 * EIP-6963 Provider Information
 * This identifies our wallet to dApps using the discovery protocol
 */
const providerInfo: EIP6963ProviderInfo = {
  uuid: PROVIDER_INFO.uuid,
  name: PROVIDER_INFO.name,
  icon: PROVIDER_INFO.icon,
  rdns: PROVIDER_INFO.rdns,
};

// Global provider instance for event updates
let globalProvider: ReturnType<typeof createProvider> | null = null;

/**
 * Initialize and inject provider into page (SYNCHRONOUS)
 */
function injectProvider(): void {
  // Only inject on pages matching our allowed origins
  const currentOrigin = window.location.origin;
  
  if (!shouldInjectProvider(currentOrigin)) {
    logger.debug('Not injecting provider on non-target origin', { origin: currentOrigin });
    return; // Don't inject on non-target pages
  }

  // Create provider instance SYNCHRONOUSLY
  const provider = createProvider();
  globalProvider = provider;

  // ========================================================================
  // EIP-1193: Inject into window.ethereum (safe mode) - SYNCHRONOUS
  // ========================================================================

  if (!window.ethereum) {
    // No existing provider - safe to inject as primary
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: false,
      configurable: false,
    });

    logger.info('Provider injected as window.ethereum');
  } else {
    // Another wallet is already installed (MetaMask, Rabby, etc.)
    // Store our provider under a custom namespace
    Object.defineProperty(window, 'cryptoJournal', {
      value: provider,
      writable: false,
      configurable: false,
    });

    logger.info('Provider available at window.cryptoJournal (window.ethereum already exists)');
  }

  // ========================================================================
  // EIP-6963: Multi Injected Provider Discovery
  // ========================================================================

  const providerDetail: EIP6963ProviderDetail = {
    info: providerInfo,
    provider: provider,
  };

  // Announce our provider to the page
  function announceProvider(): void {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze(providerDetail),
      })
    );
  }

  // Listen for discovery requests from dApps
  window.addEventListener('eip6963:requestProvider', () => {
    announceProvider();
  });

  // Initial announcement
  announceProvider();

  logger.debug('EIP-6963 provider announced');

  // Initialize provider state ASYNCHRONOUSLY (non-blocking)
  initializeProviderState(provider).catch((error) => {
    logger.error('Failed to initialize provider state', { error: String(error) });
  });
}

/**
 * Initialize provider state from storage (ASYNC, non-blocking)
 */
async function initializeProviderState(provider: ReturnType<typeof createProvider>): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
    ]);

    const storageData = result as StorageData;

    await provider.initialize({
      address: storageData.connectedAddress || null,
      chainId: storageData.chainId || '0x1',
    });

    logger.debug('Provider state initialized', {
      address: storageData.connectedAddress,
      chainId: storageData.chainId,
    });
  } catch (error) {
    logger.error('Provider initialization error', { error: String(error) });
  }
}

/**
 * Setup communication with background script for state updates
 * Uses EVENT-BASED updates instead of page reload for better UX
 */
function setupBackgroundSync(): void {
  if (!globalProvider) {
    logger.warn('No provider instance for background sync');
    return;
  }

  // Listen for storage changes from background script
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !globalProvider) return;

    // Update provider and emit events instead of reloading
    if (changes[StorageKeys.CONNECTED_ADDRESS]) {
      const oldAddress = changes[StorageKeys.CONNECTED_ADDRESS].oldValue as string | null;
      const newAddress = changes[StorageKeys.CONNECTED_ADDRESS].newValue as string | null;

      if (oldAddress !== newAddress) {
        logger.info('Account changed', { oldAddress, newAddress });

        // Update provider state
        globalProvider.selectedAddress = newAddress;

        // Emit accountsChanged event (EIP-1193)
        const accounts = newAddress ? [newAddress] : [];
        globalProvider['emit']('accountsChanged', accounts);
      }
    }

    if (changes[StorageKeys.CHAIN_ID]) {
      const oldChainId = changes[StorageKeys.CHAIN_ID].oldValue as string;
      const newChainId = changes[StorageKeys.CHAIN_ID].newValue as string;

      if (oldChainId !== newChainId) {
        logger.info('Chain changed', { oldChainId, newChainId });

        // Update provider state
        globalProvider.chainId = newChainId;

        // Emit chainChanged event (EIP-1193)
        globalProvider['emit']('chainChanged', newChainId);
      }
    }
  });

  // Set up periodic health check
  setupPeriodicHealthCheck();
}

/**
 * Set up periodic health check to monitor service worker status
 */
function setupPeriodicHealthCheck(): void {
  // Check health every 30 seconds when page is visible
  const PERIODIC_CHECK_INTERVAL = 30000;

  const performPeriodicCheck = async () => {
    if (document.visibilityState !== 'visible') return;

    const wasHealthy = isServiceWorkerHealthy;
    await ensureServiceWorkerHealthy();

    // Log state changes
    if (wasHealthy && !isServiceWorkerHealthy) {
      logger.warn('Service worker became unresponsive');
    } else if (!wasHealthy && isServiceWorkerHealthy) {
      logger.info('Service worker recovered');

      // Re-sync provider state after recovery
      if (globalProvider) {
        await initializeProviderState(globalProvider);
      }
    }
  };

  // Start periodic checks
  setInterval(performPeriodicCheck, PERIODIC_CHECK_INTERVAL);

  // Also check when page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      performPeriodicCheck();
    }
  });

  logger.debug('Periodic health check initialized');
}

// ========================================================================
// Initialization
// ========================================================================

/**
 * Initialize all content script functionality
 */
async function initialize(): Promise<void> {
  logger.info('Content script initializing');

  // 1. Set up wallet response listener first (before injecting script)
  setupWalletResponseListener();

  // 2. Inject the wallet relay script into page context
  // This MUST happen early for wallet requests to work
  injectWalletRelayScript();

  // 3. Set up relay for background wallet operations
  setupBackgroundWalletRelay();

  // 4. Inject our provider
  injectProvider();

  // 5. Set up background sync for state changes
  setupBackgroundSync();

  // 6. Perform initial health check (async, non-blocking)
  ensureServiceWorkerHealthy().then((healthy) => {
    if (healthy) {
      logger.info('Content script initialized, service worker healthy');
    } else {
      logger.warn('Content script initialized, but service worker not responding');
    }
  });
}

// CRITICAL: Inject wallet relay script IMMEDIATELY (even before DOM ready)
// This ensures it's available when wallet operations are requested
try {
  setupWalletResponseListener();
  injectWalletRelayScript();
  setupBackgroundWalletRelay();
  logger.info('Early wallet relay setup complete');
} catch (e) {
  logger.error('Early wallet relay setup failed', { error: String(e) });
}

// Run full initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize().catch((error) => {
      logger.error('Content script initialization failed', { error: String(error) });
    });
  });
} else {
  initialize().catch((error) => {
    logger.error('Content script initialization failed', { error: String(error) });
  });
}

// Add type declaration for window.ethereum and window.cryptoJournal
declare global {
  interface Window {
    ethereum?: unknown;
    cryptoJournal?: unknown;
  }
}

export {};
