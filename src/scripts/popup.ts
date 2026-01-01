/**
 * Popup Script - Extension popup UI logic
 *
 * Responsibilities:
 * 1. Display connection status
 * 2. Open auth page for wallet connection (Extension-First flow)
 * 3. Show connected account information
 * 4. Handle disconnection
 *
 * Note: Actual wallet connection happens in auth.html/auth.ts
 * This popup is primarily for status display and quick actions.
 */

import { StorageKeys, SUPPORTED_CHAINS } from './types';
import type { StorageData } from './types';

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
// Session Management
// ============================================================================

/**
 * Check session state from storage
 */
async function checkSession(): Promise<void> {
  try {
    showView('loading');

    // Read non-sensitive data from local storage (persistent)
    const localResult = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
    ]);

    // Read sensitive data from session storage (cleared on browser close)
    const sessionResult = await chrome.storage.session.get([
      StorageKeys.SESSION_TOKEN,
    ]);

    // Check if we have a valid session (need both address AND token)
    const hasSession = !!(
      localResult[StorageKeys.CONNECTED_ADDRESS] &&
      sessionResult[StorageKeys.SESSION_TOKEN]
    );

    if (hasSession) {
      await displayConnectedState({
        connectedAddress: localResult[StorageKeys.CONNECTED_ADDRESS] as string,
        chainId: localResult[StorageKeys.CHAIN_ID] as string,
        accountMode: localResult[StorageKeys.ACCOUNT_MODE] as 'demo' | 'live',
        sessionToken: sessionResult[StorageKeys.SESSION_TOKEN] as string,
      });
    } else {
      showView('notConnected');
    }
  } catch (error) {
    console.error('[Popup] Failed to check session:', error);
    showView('notConnected');
  }
}

/**
 * Display the connected state with session info
 */
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
// Wallet Connection (Opens Auth Page)
// ============================================================================

/**
 * Open the main app for wallet connection
 * v2.0: Authentication is handled by the main app, not the extension
 */
async function openMainApp(): Promise<void> {
  try {
    // Open the main app in a new tab
    const appUrl = await getAppUrl();
    await chrome.tabs.create({ url: appUrl, active: true });
    // Close the popup
    window.close();
  } catch (error) {
    console.error('[Popup] Failed to open main app:', error);
    showError('Failed to open Trading Journal. Please try again.');
  }
}

/**
 * Disconnect the current session
 */
async function disconnect(): Promise<void> {
  try {
    showView('loading');

    // Get current session token for API call (stored in session storage)
    const result = await chrome.storage.session.get([StorageKeys.SESSION_TOKEN]);
    const sessionToken = result[StorageKeys.SESSION_TOKEN] as string | undefined;

    // Notify backend if we have a token
    if (sessionToken) {
      try {
        // Send disconnect to background which will call API
        await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
      } catch {
        // API call failed, but we should still clear local state
        console.warn('[Popup] Backend disconnect failed, clearing local state');
      }
    }

    // Clear all local storage
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();

    showView('notConnected');
  } catch (error) {
    console.error('[Popup] Disconnect failed:', error);
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
  const chain = SUPPORTED_CHAINS[chainId];
  if (chain) {
    return chain.chainName.replace(' Mainnet', '').replace(' Chain', '');
  }
  return `Chain ${parseInt(chainId, 16)}`;
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

  const offlineIndicator = document.getElementById('offlineIndicator');

  if (!online) {
    showError('You are offline. Please check your internet connection.');
    elements.connectButton.setAttribute('disabled', 'true');
    if (offlineIndicator) offlineIndicator.classList.remove('hidden');
  } else {
    elements.connectButton.removeAttribute('disabled');
    if (offlineIndicator) offlineIndicator.classList.add('hidden');
    // Re-check session when coming back online
    checkSession();
  }
}

/**
 * Create offline indicator element
 */
function createOfflineIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.id = 'offlineIndicator';
  indicator.className = 'offline-indicator hidden';
  indicator.innerHTML = `
    <span class="offline-icon">&#9888;</span>
    <span class="offline-text">Offline</span>
  `;
  return indicator;
}

// Add offline indicator to DOM
const offlineIndicator = createOfflineIndicator();
document.body.insertBefore(offlineIndicator, document.body.firstChild);

// Listen for online/offline events
window.addEventListener('online', () => updateOnlineStatus(true));
window.addEventListener('offline', () => updateOnlineStatus(false));

// ============================================================================
// Event Listeners
// ============================================================================

elements.connectButton.addEventListener('click', () => {
  if (!isOnline) {
    showError('Cannot connect while offline. Please check your internet connection.');
    return;
  }
  openMainApp();
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

/**
 * Initialize the popup
 */
async function initializePopup(): Promise<void> {
  try {
    // Check online status first
    if (!navigator.onLine) {
      updateOnlineStatus(false);
      return;
    }

    // Check session state
    await checkSession();
  } catch (error) {
    console.error('[Popup] Initialization failed:', error);
    showError('Failed to initialize. Please try again.');
  }
}

// Initialize on load
initializePopup();

// Listen for storage changes (session updates)
// Need to listen to both local and session storage areas
chrome.storage.onChanged.addListener((changes, areaName) => {
  // Check for address/chain changes in local storage
  const localSessionChanged = areaName === 'local' && (
    changes[StorageKeys.CONNECTED_ADDRESS] ||
    changes[StorageKeys.CHAIN_ID]
  );

  // Check for token changes in session storage
  const tokenChanged = areaName === 'session' &&
    changes[StorageKeys.SESSION_TOKEN];

  if (localSessionChanged || tokenChanged) {
    checkSession();
  }
});

export {};
