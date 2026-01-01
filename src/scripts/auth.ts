/**
 * Auth Page Script - Full-page authentication experience
 *
 * This script runs in the auth.html page (extension tab context).
 * Extension pages have access to window.ethereum directly (MetaMask injects there).
 *
 * Flow:
 * 1. Detect available wallets
 * 2. User clicks "Connect"
 * 3. Request accounts from wallet (MetaMask popup)
 * 4. Get SIWE challenge from API
 * 5. Sign message with wallet (MetaMask popup)
 * 6. Verify signature with API
 * 7. Store session in chrome.storage
 * 8. Redirect to main app or close tab
 */

import { apiClient, handleApiError } from './api';
import { API_BASE_URL, DEFAULTS } from './config';
import { StorageKeys, SUPPORTED_CHAINS } from './types';
import type { EthereumProvider } from './types';

// ============================================================================
// Types
// ============================================================================

interface AuthState {
  step: 'loading' | 'noWallet' | 'connect' | 'connecting' | 'success' | 'error';
  address?: string;
  chainId?: string;
  accountMode: 'demo' | 'live';
  error?: string;
}

interface AuthStep {
  id: string;
  name: string;
}

const AUTH_STEPS: AuthStep[] = [
  { id: 'step1', name: 'Connect' },
  { id: 'step2', name: 'Challenge' },
  { id: 'step3', name: 'Sign' },
  { id: 'step4', name: 'Verify' },
];

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Sections
  loading: document.getElementById('loading') as HTMLElement,
  noWallet: document.getElementById('noWallet') as HTMLElement,
  connect: document.getElementById('connect') as HTMLElement,
  connecting: document.getElementById('connecting') as HTMLElement,
  success: document.getElementById('success') as HTMLElement,
  error: document.getElementById('error') as HTMLElement,

  // Buttons
  connectButton: document.getElementById('connectButton') as HTMLButtonElement,
  cancelButton: document.getElementById('cancelButton') as HTMLButtonElement,
  retryButton: document.getElementById('retryButton') as HTMLButtonElement,
  retryDetectionButton: document.getElementById('retryDetectionButton') as HTMLButtonElement,
  closeErrorButton: document.getElementById('closeErrorButton') as HTMLButtonElement,
  openDashboardButton: document.getElementById('openDashboardButton') as HTMLButtonElement,

  // Connecting state
  connectingTitle: document.getElementById('connectingTitle') as HTMLElement,
  connectingStatus: document.getElementById('connectingStatus') as HTMLElement,

  // Success state
  successAddress: document.getElementById('successAddress') as HTMLElement,
  successNetwork: document.getElementById('successNetwork') as HTMLElement,
  successMode: document.getElementById('successMode') as HTMLElement,

  // Error state
  errorMessage: document.getElementById('errorMessage') as HTMLElement,

  // Account mode radios
  accountModeRadios: document.querySelectorAll<HTMLInputElement>('input[name="accountMode"]'),

  // Step indicators
  steps: AUTH_STEPS.map(s => document.getElementById(s.id) as HTMLElement),
};

// ============================================================================
// State
// ============================================================================

const state: AuthState = {
  step: 'loading',
  accountMode: 'live',
};

let currentStepIndex = 0;
let isConnecting = false;

// Store detected providers from EIP-6963
const detectedProviders: EthereumProvider[] = [];

// ============================================================================
// Wallet Detection
// ============================================================================

/**
 * Get the Ethereum provider (MetaMask, Brave Wallet, Rabby, etc.)
 * Tries multiple detection methods:
 * 1. EIP-6963 announced providers (modern standard)
 * 2. window.ethereum direct injection
 * 3. Multi-provider array (providers property)
 */
function getEthereumProvider(): EthereumProvider | null {
  // First, try EIP-6963 detected providers (most reliable for modern wallets)
  if (detectedProviders.length > 0) {
    const validProvider = detectedProviders.find(p => !p.isCryptoJournal);
    if (validProvider) {
      console.log('[auth] Using EIP-6963 detected provider');
      return validProvider;
    }
  }

  // Fallback to window.ethereum
  const ethereum = (window as unknown as { ethereum?: EthereumProvider }).ethereum;

  if (!ethereum) {
    console.log('[auth] No window.ethereum found');
    return null;
  }

  // Check for multi-provider setup (common with multiple wallets)
  const providers = (ethereum as unknown as { providers?: EthereumProvider[] }).providers;
  if (Array.isArray(providers) && providers.length > 0) {
    console.log('[auth] Found multi-provider setup with', providers.length, 'providers');
    const validProvider = providers.find(p => !p.isCryptoJournal);
    if (validProvider) {
      console.log('[auth] Using provider from multi-provider array:', 
        validProvider.isMetaMask ? 'MetaMask' : 
        validProvider.isRabby ? 'Rabby' : 
        validProvider.isBraveWallet ? 'Brave' : 'Unknown');
      return validProvider;
    }
  }

  // Skip our own provider if it's the only one
  if (ethereum.isCryptoJournal) {
    console.log('[auth] Only found our own provider, no external wallet');
    return null;
  }

  console.log('[auth] Using direct window.ethereum:',
    ethereum.isMetaMask ? 'MetaMask' : 
    (ethereum as unknown as { isRabby?: boolean }).isRabby ? 'Rabby' : 
    ethereum.isBraveWallet ? 'Brave' : 'Unknown');
  return ethereum;
}

/**
 * Setup EIP-6963 provider detection (modern wallet discovery standard)
 * This allows wallets like Rabby to announce themselves
 */
function setupEIP6963Detection(): void {
  // Listen for provider announcements
  window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
    const detail = event.detail as { info: { name: string }; provider: EthereumProvider };
    if (detail?.provider && !detail.provider.isCryptoJournal) {
      console.log('[auth] EIP-6963: Provider announced:', detail.info?.name || 'Unknown');
      detectedProviders.push(detail.provider);
      
      // If we're showing noWallet, switch to connect
      if (state.step === 'noWallet') {
        showSection('connect');
      }
    }
  }) as EventListener);

  // Request providers to announce themselves
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/**
 * Check if a wallet is available
 */
function hasWallet(): boolean {
  return getEthereumProvider() !== null;
}

// ============================================================================
// UI Updates
// ============================================================================

/**
 * Show a specific section, hide all others
 */
function showSection(section: keyof typeof elements): void {
  const sections: (keyof typeof elements)[] = ['loading', 'noWallet', 'connect', 'connecting', 'success', 'error'];

  sections.forEach(s => {
    const el = elements[s] as HTMLElement;
    if (s === section) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

/**
 * Update step progress indicators
 */
function updateStepProgress(activeIndex: number): void {
  elements.steps.forEach((step, index) => {
    step.classList.remove('active', 'completed');
    if (index < activeIndex) {
      step.classList.add('completed');
    } else if (index === activeIndex) {
      step.classList.add('active');
    }
  });
}

/**
 * Update connecting status text
 */
function updateConnectingStatus(title: string, status: string): void {
  elements.connectingTitle.textContent = title;
  elements.connectingStatus.textContent = status;
}

/**
 * Format address for display (truncate)
 */
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get network name from chain ID
 */
function getNetworkName(chainId: string): string {
  const chain = SUPPORTED_CHAINS[chainId];
  if (chain) {
    return chain.chainName;
  }
  // Convert hex to decimal for display
  const decimal = parseInt(chainId, 16);
  return `Chain ${decimal}`;
}

/**
 * Show error state
 */
function showError(message: string): void {
  state.step = 'error';
  state.error = message;
  elements.errorMessage.textContent = message;
  showSection('error');
}

/**
 * Show success state
 */
function showSuccess(address: string, chainId: string, mode: 'demo' | 'live'): void {
  state.step = 'success';
  elements.successAddress.textContent = formatAddress(address);
  elements.successNetwork.textContent = getNetworkName(chainId);
  elements.successMode.textContent = mode === 'live' ? 'Live Trading' : 'Demo Mode';
  showSection('success');
}

// ============================================================================
// Authentication Flow
// ============================================================================

/**
 * Main authentication flow
 */
async function authenticate(): Promise<void> {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const provider = getEthereumProvider();
    if (!provider) {
      throw new Error('No wallet detected');
    }

    // Get selected account mode
    const modeRadio = document.querySelector<HTMLInputElement>('input[name="accountMode"]:checked');
    state.accountMode = (modeRadio?.value as 'demo' | 'live') || 'live';

    // Show connecting state
    showSection('connecting');
    currentStepIndex = 0;
    updateStepProgress(currentStepIndex);
    updateConnectingStatus('Connecting...', 'Please approve the connection in your wallet.');

    // Step 1: Request accounts
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned from wallet');
    }

    const address = accounts[0];
    state.address = address;

    // Get chain ID
    const chainId = await provider.request({ method: 'eth_chainId' }) as string;
    state.chainId = chainId;

    // Step 2: Get SIWE challenge
    currentStepIndex = 1;
    updateStepProgress(currentStepIndex);
    updateConnectingStatus('Getting Challenge...', 'Requesting authentication challenge from server.');

    const chainIdNumber = parseInt(chainId, 16);
    const challengeResponse = await apiClient.getSIWEChallenge({
      address,
      chainId: chainIdNumber,
      accountMode: state.accountMode,
    });

    // Step 3: Sign message
    currentStepIndex = 2;
    updateStepProgress(currentStepIndex);
    updateConnectingStatus('Sign Message', 'Please sign the message in your wallet to authenticate.');

    // personal_sign expects [message, address]
    const signature = await provider.request({
      method: 'personal_sign',
      params: [challengeResponse.message, address],
    }) as string;

    // Step 4: Verify signature
    currentStepIndex = 3;
    updateStepProgress(currentStepIndex);
    updateConnectingStatus('Verifying...', 'Verifying your signature with the server.');

    const verifyResponse = await apiClient.verifySIWE({
      message: challengeResponse.message,
      signature,
      accountMode: state.accountMode,
    });

    // Store session
    await chrome.storage.local.set({
      [StorageKeys.SESSION_TOKEN]: verifyResponse.sessionToken,
      [StorageKeys.CONNECTED_ADDRESS]: address,
      [StorageKeys.CHAIN_ID]: chainId,
      [StorageKeys.ACCOUNT_MODE]: state.accountMode,
      [StorageKeys.LAST_CONNECTED]: Date.now(),
    });

    // Also store in session storage for background script
    await chrome.storage.session.set({
      sessionToken: verifyResponse.sessionToken,
    });

    // Notify background script of successful auth
    try {
      await chrome.runtime.sendMessage({
        type: 'AUTH_SUCCESS',
        payload: {
          address,
          chainId,
          accountMode: state.accountMode,
        },
      });
    } catch {
      // Background might not be listening, that's okay
      console.log('[Auth] Background notification skipped');
    }

    // Show success
    showSuccess(address, chainId, state.accountMode);

    // Auto-redirect after delay
    setTimeout(() => {
      openDashboard();
    }, 2000);

  } catch (error) {
    console.error('[Auth] Authentication failed:', error);

    // Handle user rejection
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('user rejected') || message.includes('user denied') || message.includes('4001')) {
        showError('You rejected the request. Please try again when ready.');
        return;
      }
    }

    // Handle API errors
    const errorMessage = handleApiError(error);
    showError(errorMessage);
  } finally {
    isConnecting = false;
  }
}

/**
 * Open the dashboard in main app
 */
function openDashboard(): void {
  const dashboardUrl = `${API_BASE_URL}${DEFAULTS.DASHBOARD_PATH}`;

  // Try to open in existing tab if possible
  chrome.tabs.query({ url: `${API_BASE_URL}/*` }, (tabs) => {
    if (tabs.length > 0 && tabs[0].id) {
      // Update existing tab and focus it
      chrome.tabs.update(tabs[0].id, { url: dashboardUrl, active: true });
    } else {
      // Open new tab
      chrome.tabs.create({ url: dashboardUrl });
    }

    // Close this auth tab
    window.close();
  });
}

/**
 * Cancel the current authentication attempt
 */
function cancelAuth(): void {
  isConnecting = false;
  showSection('connect');
}

/**
 * Retry wallet detection
 */
function retryDetection(): void {
  initialize();
}

/**
 * Close the auth page
 */
function closeAuthPage(): void {
  window.close();
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners(): void {
  // Connect button
  elements.connectButton.addEventListener('click', () => {
    authenticate();
  });

  // Cancel button
  elements.cancelButton.addEventListener('click', () => {
    cancelAuth();
  });

  // Retry button
  elements.retryButton.addEventListener('click', () => {
    showSection('connect');
  });

  // Retry detection button
  elements.retryDetectionButton.addEventListener('click', () => {
    retryDetection();
  });

  // Close error button
  elements.closeErrorButton.addEventListener('click', () => {
    closeAuthPage();
  });

  // Open dashboard button
  elements.openDashboardButton.addEventListener('click', () => {
    openDashboard();
  });

  // Account mode selection
  elements.accountModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      state.accountMode = target.value as 'demo' | 'live';
    });
  });

  // Listen for wallet events
  const provider = getEthereumProvider();
  if (provider) {
    provider.on('accountsChanged', (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        // User disconnected their wallet
        showSection('connect');
      }
    });

    provider.on('chainChanged', (chainId: unknown) => {
      state.chainId = chainId as string;
    });
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the auth page
 */
function initialize(): void {
  showSection('loading');

  // Setup EIP-6963 detection for modern wallets like Rabby
  setupEIP6963Detection();

  // Wallet injection can take time, especially for:
  // - Rabby (injects asynchronously)
  // - Multiple wallet extensions competing
  // - Extension pages vs regular pages
  // We use multiple checks with increasing delays
  
  const checkWallet = (attempt: number, maxAttempts: number): void => {
    console.log(`[auth] Wallet detection attempt ${attempt}/${maxAttempts}`);
    
    if (hasWallet()) {
      console.log('[auth] Wallet detected!');
      showSection('connect');
      return;
    }
    
    if (attempt < maxAttempts) {
      // Exponential backoff: 200ms, 400ms, 800ms, 1600ms
      const delay = 200 * Math.pow(2, attempt - 1);
      setTimeout(() => checkWallet(attempt + 1, maxAttempts), delay);
    } else {
      console.log('[auth] No wallet detected after all attempts');
      showSection('noWallet');
    }
  };

  // Start checking after initial 300ms delay (allow initial injection)
  setTimeout(() => checkWallet(1, 5), 300);
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initialize();
});
