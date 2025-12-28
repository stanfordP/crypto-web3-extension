/**
 * Popup Script - Extension popup UI logic
 *
 * Responsibilities:
 * 1. Display connection status
 * 2. Trigger wallet connection via background script
 * 3. Show connected account information
 * 4. Handle disconnection
 */

import { StorageKeys } from './types';
import type {
  Message,
  MessageResponse,
  MessageType,
  StorageData,
} from './types';

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  loading: document.getElementById('loading')!,
  notConnected: document.getElementById('notConnected')!,
  connected: document.getElementById('connected')!,
  error: document.getElementById('error')!,

  connectButton: document.getElementById('connectButton')!,
  disconnectButton: document.getElementById('disconnectButton')!,
  openAppButton: document.getElementById('openAppButton')!,
  retryButton: document.getElementById('retryButton')!,

  address: document.getElementById('address')!,
  network: document.getElementById('network')!,
  accountMode: document.getElementById('accountMode')!,
  errorMessage: document.getElementById('errorMessage')!,
};

// ============================================================================
// State Management
// ============================================================================

type ViewState = 'loading' | 'notConnected' | 'connected' | 'error';

function showView(view: ViewState): void {
  // Hide all sections
  elements.loading.classList.add('hidden');
  elements.notConnected.classList.add('hidden');
  elements.connected.classList.add('hidden');
  elements.error.classList.add('hidden');

  // Show selected section
  switch (view) {
    case 'loading':
      elements.loading.classList.remove('hidden');
      break;
    case 'notConnected':
      elements.notConnected.classList.remove('hidden');
      break;
    case 'connected':
      elements.connected.classList.remove('hidden');
      break;
    case 'error':
      elements.error.classList.remove('hidden');
      break;
  }
}

function showError(message: string): void {
  elements.errorMessage.textContent = message;
  showView('error');
}

// ============================================================================
// Port Names (must match background.ts)
// ============================================================================

const PORT_NAMES = {
  WALLET_CONNECTION: 'wallet-connection',
  LONG_OPERATION: 'long-operation',
} as const;

// ============================================================================
// Communication with Background Script
// ============================================================================

/**
 * Wake up the service worker by pinging it
 * This ensures the background script is active before sending messages
 * Returns both wake status and whether the service worker is fully ready
 */
async function wakeUpServiceWorker(): Promise<{ awake: boolean; ready: boolean; mainLoaded: boolean; error: string | null }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('[Popup] Service worker ping timed out');
      resolve({ awake: false, ready: false, mainLoaded: false, error: 'Ping timeout' });
    }, 8000); // Increased timeout to 8 seconds (cold-start friendly)

    try {
      chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.log('[Popup] Service worker wake-up ping failed:', chrome.runtime.lastError.message);
          resolve({ awake: false, ready: false, mainLoaded: false, error: chrome.runtime.lastError.message || null });
        } else if (response?.success && response?.data?.pong === true) {
          const { ready, mainLoaded, error } = response.data;
          console.log('[Popup] Service worker responded', { ready, mainLoaded, error });
          resolve({ 
            awake: true, 
            ready: ready === true, 
            mainLoaded: mainLoaded === true,
            error: error || null 
          });
        } else if (response?.pong === true) {
          // Legacy response format
          resolve({ awake: true, ready: true, mainLoaded: true, error: null });
        } else {
          resolve({ awake: false, ready: false, mainLoaded: false, error: 'Invalid response' });
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      console.log('[Popup] Service worker ping error:', error);
      resolve({ awake: false, ready: false, mainLoaded: false, error: String(error) });
    }
  });
}

/**
 * Send message with exponential backoff retry logic
 */
async function sendMessageWithRetry<T = unknown>(
  message: Message,
  maxRetries = 5,
  baseDelayMs = 300
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Always try to wake up service worker first on retries
      if (attempt > 0) {
        const wakeResult = await wakeUpServiceWorker();
        if (!wakeResult.awake) {
          console.log(`[Popup] Service worker not awake on attempt ${attempt + 1}`);
        }
      }

      const result = await new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 30000);

        chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Unknown error'));
            return;
          }

          if (!response) {
            reject(new Error('No response from background script'));
            return;
          }

          if (response.success) {
            resolve(response.data as T);
          } else {
            reject(new Error(response.error || 'Unknown error'));
          }
        });
      });

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message;

      // Check if error is retryable
      const isRetryable =
        errorMessage.includes('Receiving end does not exist') ||
        errorMessage.includes('Extension context invalidated') ||
        errorMessage.includes('Could not establish connection') ||
        errorMessage.includes('No response') ||
        errorMessage.includes('timed out');

      if (!isRetryable || attempt === maxRetries - 1) {
        break;
      }

      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`[Popup] Retry ${attempt + 1}/${maxRetries} in ${delay}ms:`, errorMessage);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Send message using port-based communication for long operations
 * Ports keep the service worker alive during the operation
 */
function sendMessageViaPort<T = unknown>(
  message: Message,
  portName: string = PORT_NAMES.WALLET_CONNECTION
): Promise<T> {
  return new Promise((resolve, reject) => {
    let port: chrome.runtime.Port | null = null;
    let timeoutId: ReturnType<typeof setTimeout>;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (port) {
        try {
          port.disconnect();
        } catch {
          // Port already disconnected
        }
        port = null;
      }
    };

    try {
      port = chrome.runtime.connect({ name: portName });

      // Set up message handler
      port.onMessage.addListener((response: MessageResponse<T>) => {
        if (resolved) return;
        resolved = true;
        cleanup();

        if (response.success) {
          resolve(response.data as T);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      });

      // Handle disconnection
      port.onDisconnect.addListener(() => {
        if (resolved) return;
        resolved = true;
        cleanup();

        const error = chrome.runtime.lastError;
        reject(new Error(error?.message || 'Port disconnected unexpectedly'));
      });

      // Set timeout for long operations (2 minutes)
      timeoutId = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new Error('Operation timed out'));
      }, 120000);

      // Send the message
      port.postMessage(message);

    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Legacy send message function (uses retry logic)
 */
function sendMessage<T = unknown>(message: Message, retries = 3): Promise<T> {
  return sendMessageWithRetry<T>(message, retries);
}

// ============================================================================
// Session Management
// ============================================================================

async function checkSession(): Promise<void> {
  try {
    showView('loading');

    const session = await sendMessage<StorageData>({
      type: 'GET_SESSION' as MessageType,
    });

    if (session && session.connectedAddress) {
      await displayConnectedState(session);
    } else {
      showView('notConnected');
    }
  } catch (error) {
    console.error('Failed to check session:', error);
    showView('notConnected');
  }
}

async function displayConnectedState(session: StorageData): Promise<void> {
  // Display address (truncated)
  if (session.connectedAddress) {
    elements.address.textContent = truncateAddress(session.connectedAddress);
  }

  // Display network
  if (session.chainId) {
    elements.network.textContent = getNetworkName(session.chainId);
  }

  // Display account mode
  if (session.accountMode) {
    elements.accountMode.textContent =
      session.accountMode === 'demo' ? 'Demo Mode' : 'Live Trading';
  }

  showView('connected');
}

// ============================================================================
// Wallet Connection
// ============================================================================

async function connectWallet(): Promise<void> {
  try {
    showView('loading');

    // Ensure service worker is awake before long operation
    const wakeResult = await wakeUpServiceWorker();
    if (!wakeResult.awake) {
      console.log('[Popup] Service worker not immediately ready, proceeding with port connection');
    }

    // Get selected account mode
    const accountModeInput = document.querySelector(
      'input[name="accountMode"]:checked'
    ) as HTMLInputElement;
    const accountMode = (accountModeInput?.value as 'demo' | 'live') || 'live';

    // Use port-based communication for the long-running SIWE flow
    // This keeps the service worker alive during wallet interaction
    await sendMessageViaPort<string[]>(
      {
        type: 'REQUEST_ACCOUNTS' as MessageType,
        payload: { accountMode },
        requestId: `connect_${Date.now()}`,
      },
      PORT_NAMES.WALLET_CONNECTION
    );

    // Refresh session state
    await checkSession();
  } catch (error) {
    console.error('Connection failed:', error);
    showError(
      error instanceof Error
        ? error.message
        : 'Failed to connect wallet. Please make sure you have MetaMask or Brave Wallet installed.'
    );
  }
}

async function disconnect(): Promise<void> {
  try {
    showView('loading');

    await sendMessage({
      type: 'DISCONNECT' as MessageType,
    });

    showView('notConnected');
  } catch (error) {
    console.error('Disconnect failed:', error);
    showError('Failed to disconnect. Please try again.');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getNetworkName(chainId: string): string {
  const networks: Record<string, string> = {
    '0x1': 'Ethereum',
    '0x89': 'Polygon',
    '0xa4b1': 'Arbitrum',
    '0xa': 'Optimism',
    '0x2105': 'Base',
    '0x38': 'BNB Chain',
    '0xa86a': 'Avalanche',
  };

  return networks[chainId] || `Chain ${parseInt(chainId, 16)}`;
}

// Default app URL (can be overridden in chrome.storage.sync)
const DEFAULT_APP_URL = 'http://localhost:3000';

/**
 * Get configured app URL from storage or use default
 */
async function getAppUrl(): Promise<string> {
  try {
    const result = await chrome.storage.sync.get('appUrl');
    return result.appUrl || DEFAULT_APP_URL;
  } catch {
    return DEFAULT_APP_URL;
  }
}

/**
 * Open the trading journal app in a new tab
 */
async function openTradingJournal(): Promise<void> {
  const appUrl = await getAppUrl();
  chrome.tabs.create({
    url: `${appUrl}/dashboard`,
  });
}

// ============================================================================
// Offline Detection
// ============================================================================

let isOnline = navigator.onLine;

/**
 * Update UI based on online status
 */
function updateOnlineStatus(online: boolean): void {
  isOnline = online;
  
  if (!online) {
    showError('You are offline. Please check your internet connection.');
    elements.connectButton.setAttribute('disabled', 'true');
  } else {
    elements.connectButton.removeAttribute('disabled');
    // Re-check session when coming back online
    checkSession();
  }
}

/**
 * Add visual indicator for offline status
 */
function createOfflineIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.id = 'offlineIndicator';
  indicator.className = 'offline-indicator hidden';
  indicator.innerHTML = `
    <span class="offline-icon">⚠️</span>
    <span class="offline-text">Offline</span>
  `;
  return indicator;
}

// Add offline indicator to DOM
const offlineIndicator = createOfflineIndicator();
document.body.insertBefore(offlineIndicator, document.body.firstChild);

// Listen for online/offline events
window.addEventListener('online', () => {
  updateOnlineStatus(true);
  offlineIndicator.classList.add('hidden');
});

window.addEventListener('offline', () => {
  updateOnlineStatus(false);
  offlineIndicator.classList.remove('hidden');
});

// ============================================================================
// Event Listeners
// ============================================================================

elements.connectButton.addEventListener('click', () => {
  if (!isOnline) {
    showError('Cannot connect while offline. Please check your internet connection.');
    return;
  }
  connectWallet();
});

elements.disconnectButton.addEventListener('click', () => {
  disconnect();
});

elements.openAppButton.addEventListener('click', () => {
  openTradingJournal();
});

elements.retryButton.addEventListener('click', () => {
  if (!isOnline) {
    showError('Cannot retry while offline. Please check your internet connection.');
    return;
  }
  checkSession();
});

// ============================================================================
// Initialization
// ============================================================================

// Initialize with timeout protection
// Note: MV3 service workers can have a slow cold start on some machines.
const INIT_TIMEOUT = 60000; // 60 seconds
const MAX_WAKE_RETRIES = 8;
const WAKE_BASE_DELAY = 150; // ms

/**
 * Ensure the service worker is awake before proceeding
 * Uses exponential backoff with jitter for better reliability
 * Now also waits for service worker to be fully ready
 */
async function ensureServiceWorkerAwake(): Promise<boolean> {
  let lastWakeResult = { awake: false, ready: false, mainLoaded: false, error: null as string | null };
  
  for (let i = 0; i < MAX_WAKE_RETRIES; i++) {
    const wakeResult = await wakeUpServiceWorker();
    lastWakeResult = wakeResult;
    
    // Log detailed status
    console.log(`[Popup] Wake attempt ${i + 1}/${MAX_WAKE_RETRIES}:`, {
      awake: wakeResult.awake,
      mainLoaded: wakeResult.mainLoaded,
      ready: wakeResult.ready,
      error: wakeResult.error
    });
    
    // Best case: fully ready
    if (wakeResult.awake && wakeResult.ready) {
      console.log(`[Popup] Service worker is awake and ready`);
      return true;
    }
    
    // Service worker is awake, main module loaded, but not fully initialized yet
    if (wakeResult.awake && wakeResult.mainLoaded && !wakeResult.ready) {
      console.log(`[Popup] Main module loaded, waiting for full initialization...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    
    // Service worker is awake but main module hasn't loaded yet
    if (wakeResult.awake && !wakeResult.mainLoaded) {
      console.log(`[Popup] Bootstrap awake, waiting for main module to load...`);
      // Check if there's a module load error
      if (wakeResult.error) {
        console.error(`[Popup] Module load error:`, wakeResult.error);
        showError(`Extension error: ${wakeResult.error}`);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }

    // Exponential backoff with jitter
    const baseDelay = WAKE_BASE_DELAY * Math.pow(1.5, i);
    const jitter = Math.random() * 100;
    const delay = Math.min(baseDelay + jitter, 2000); // Cap at 2 seconds

    console.log(`[Popup] Service worker not responding, retrying in ${Math.round(delay)}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // If we got awake (bootstrap responded) but not fully ready, check for errors
  if (lastWakeResult.awake) {
    if (lastWakeResult.error) {
      console.error('[Popup] Service worker has error:', lastWakeResult.error);
      showError(`Extension initialization error: ${lastWakeResult.error}`);
      return false;
    }
    console.log('[Popup] Service worker bootstrap is awake, proceeding...', {
      mainLoaded: lastWakeResult.mainLoaded,
      ready: lastWakeResult.ready
    });
    return true;
  }

  console.warn('[Popup] Service worker wake-up failed after all retries');
  return false;
}

/**
 * Initialize the popup with robust error handling
 */
async function initializePopup(): Promise<void> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Initialization timeout')), INIT_TIMEOUT);
  });

  try {
    // Check online status first
    if (!navigator.onLine) {
      updateOnlineStatus(false);
      offlineIndicator.classList.remove('hidden');
      return;
    }

    // Run the full init flow under ONE timeout (wake-up + session check)
    await Promise.race([
      (async () => {
        // Ensure service worker is awake before checking session
        const isAwake = await ensureServiceWorkerAwake();
        if (!isAwake) {
          // Service worker may still be starting up - proceed anyway
          // The session check will use retry logic
          console.log('[Popup] Proceeding with session check despite wake-up issues');
        }

        await checkSession();
      })(),
      timeoutPromise,
    ]);
  } catch (error) {
    console.error('[Popup] Initialization failed:', error);

    // Show more specific error message based on the error
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        showError('Connection timed out. The extension may be initializing. Please try again.');
      } else if (error.message.includes('Receiving end does not exist')) {
        showError('Extension is reloading. Please close and reopen this popup.');
      } else {
        showError(`Failed to initialize: ${error.message}`);
      }
    } else {
      showError('Failed to initialize. Please try again.');
    }
  }
}

// Check session on popup open
initializePopup();

// Listen for storage changes (session updates from background)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' || areaName === 'session') {
    if (
      changes[StorageKeys.CONNECTED_ADDRESS] ||
      changes[StorageKeys.SESSION_TOKEN]
    ) {
      checkSession();
    }
  }
});

export {};
