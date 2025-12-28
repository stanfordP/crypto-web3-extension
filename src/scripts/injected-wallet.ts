/**
 * Injected Wallet Script - Runs in PAGE context
 *
 * This script is injected into the page to access window.ethereum (MetaMask, etc.)
 * It communicates with the content script via window.postMessage.
 *
 * Flow: Background → Content Script → This Script → window.ethereum
 */

interface WalletRequest {
  type: 'CRYPTO_JOURNAL_WALLET_REQUEST';
  id: string;
  method: string;
  params?: unknown[];
}

interface WalletResponse {
  type: 'CRYPTO_JOURNAL_WALLET_RESPONSE';
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Validation & Security
// ============================================================================

/**
 * Allowlist of permitted wallet methods
 * Only these methods can be relayed to the real wallet
 */
const ALLOWED_METHODS = new Set([
  // Account methods
  'eth_requestAccounts',
  'eth_accounts',
  // Chain methods
  'eth_chainId',
  'net_version',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  // Signing methods
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  // Transaction methods
  'eth_sendTransaction',
  // Read methods
  'eth_call',
  'eth_getBalance',
  'eth_getTransactionReceipt',
]);

/**
 * Validate request structure
 */
function isValidWalletRequest(data: unknown): data is WalletRequest {
  if (!data || typeof data !== 'object') return false;

  const request = data as Record<string, unknown>;

  // Check required fields
  if (request.type !== 'CRYPTO_JOURNAL_WALLET_REQUEST') return false;
  if (typeof request.id !== 'string' || request.id.length === 0) return false;
  if (typeof request.method !== 'string' || request.method.length === 0) return false;

  // Validate id format (must be wallet_ prefix with timestamp)
  if (!request.id.startsWith('wallet_')) return false;

  // Validate method is allowed
  if (!ALLOWED_METHODS.has(request.method)) return false;

  // Validate params if present
  if (request.params !== undefined && !Array.isArray(request.params)) return false;

  return true;
}

// ============================================================================
// Wallet Provider Access
// ============================================================================

// Get the real wallet provider (MetaMask, Brave Wallet, etc.)
function getRealWalletProvider(): unknown {
  // Check for our custom provider and skip it
  const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;

  if (!ethereum) {
    return null;
  }

  // If our provider is primary, look for the real one
  const provider = ethereum as { isCryptoJournal?: boolean; providers?: unknown[] };

  if (provider.isCryptoJournal) {
    // Check for multi-provider setup (EIP-6963)
    if (Array.isArray(provider.providers)) {
      return provider.providers.find(
        (p: unknown) => !(p as { isCryptoJournal?: boolean }).isCryptoJournal
      );
    }
    return null; // Only our provider is available
  }

  return ethereum;
}

// Handle wallet operation requests
async function handleWalletRequest(request: WalletRequest): Promise<WalletResponse> {
  const { id, method, params } = request;

  try {
    const provider = getRealWalletProvider() as {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    } | null;

    if (!provider) {
      throw new Error('No external wallet detected. Please install MetaMask or Brave Wallet.');
    }

    let result: unknown;

    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
      case 'eth_chainId':
      case 'net_version':
        result = await provider.request({ method, params: params || [] });
        break;

      case 'personal_sign': {
        // personal_sign params: [message, address]
        result = await provider.request({ method, params });
        break;
      }

      case 'eth_sign': {
        // eth_sign params: [address, message]
        result = await provider.request({ method, params });
        break;
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v4': {
        result = await provider.request({ method, params });
        break;
      }

      case 'eth_sendTransaction': {
        result = await provider.request({ method, params });
        break;
      }

      case 'wallet_switchEthereumChain': {
        result = await provider.request({ method, params });
        break;
      }

      case 'wallet_addEthereumChain': {
        result = await provider.request({ method, params });
        break;
      }

      default:
        // Forward any other method to the provider
        result = await provider.request({ method, params: params || [] });
    }

    return {
      type: 'CRYPTO_JOURNAL_WALLET_RESPONSE',
      id,
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      type: 'CRYPTO_JOURNAL_WALLET_RESPONSE',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown wallet error',
    };
  }
}

// Listen for wallet requests from content script
window.addEventListener('message', async (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;

  // Validate request structure and method allowlist
  if (!isValidWalletRequest(event.data)) return;

  const response = await handleWalletRequest(event.data);
  window.postMessage(response, '*');
});

// Announce that the wallet relay is ready
window.postMessage({ type: 'CRYPTO_JOURNAL_WALLET_READY' }, '*');

console.log('[Crypto Journal] Wallet relay script initialized');
