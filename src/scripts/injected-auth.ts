/**
 * Injected Auth Script
 * 
 * This script runs in the PAGE context (not content script context)
 * so it has direct access to window.ethereum for wallet interactions.
 * 
 * Communication flow:
 * 1. Content script sends CJ_WALLET_* messages via window.postMessage
 * 2. This script calls window.ethereum methods
 * 3. This script replies with CJ_WALLET_*_RESULT messages
 * 
 * Security Extension Handling:
 * - Detects security extensions (Pocket Universe, Wallet Guard, Fire, Blowfish)
 * - Uses request deduplication to prevent double-signing
 * - Prioritizes direct wallet provider over wrapped providers when possible
 */

// Types for wallet interaction
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  chainId?: string;
  selectedAddress?: string | null;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isPhantom?: boolean;
  providers?: EthereumProvider[];
  // Security extension markers
  isWrappedBySecurityExtension?: boolean;
  isPocketUniverse?: boolean;
  isWalletGuard?: boolean;
  isFire?: boolean;
  isBlowfish?: boolean;
}

interface EIP6963ProviderDetail {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
}

interface WalletWindow {
  ethereum?: EthereumProvider;
}

// Message types for content script <-> injected script communication
const WalletMessageType = {
  // Requests (from content script)
  CJ_WALLET_CHECK: 'CJ_WALLET_CHECK',
  CJ_WALLET_CONNECT: 'CJ_WALLET_CONNECT',
  CJ_WALLET_SIGN: 'CJ_WALLET_SIGN',
  
  // Responses (to content script)
  CJ_WALLET_CHECK_RESULT: 'CJ_WALLET_CHECK_RESULT',
  CJ_WALLET_CONNECT_RESULT: 'CJ_WALLET_CONNECT_RESULT',
  CJ_WALLET_SIGN_RESULT: 'CJ_WALLET_SIGN_RESULT',
} as const;

// ============================================================================
// Request Deduplication (prevents security extensions from double-prompting)
// ============================================================================

/** 
 * Track in-flight wallet requests to prevent duplicates from security extensions.
 * Key: method:params, Value: { promise, timestamp }
 * Requests expire after 60s to allow retries after failures
 */
const inFlightWalletRequests = new Map<string, { promise: Promise<unknown>; timestamp: number }>();

/** Request timeout - after this, allow new requests */
const REQUEST_DEDUP_TIMEOUT_MS = 60000;

/** Wallet operation timeout - reject if wallet doesn't respond */
const WALLET_REQUEST_TIMEOUT_MS = 45000; // 45s (longer than content.ts 30s timeout)

/** Custom error class for wallet timeouts */
class WalletTimeoutError extends Error {
  code: number;
  constructor(method: string) {
    super(`Wallet request timed out: ${method}`);
    this.name = 'WalletTimeoutError';
    this.code = 5006; // REQUEST_TIMEOUT error code
  }
}

/**
 * Create a timeout promise that rejects after specified ms
 */
function createTimeoutPromise(ms: number, method: string): { promise: Promise<never>; cleanup: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new WalletTimeoutError(method));
    }, ms);
  });
  return {
    promise,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Generate a unique key for request deduplication
 * For signing, only dedupe exact same message+address within timeout
 */
function getRequestKey(method: string, params?: unknown[]): string {
  // For eth_requestAccounts, just use method (no params to hash)
  if (method === 'eth_requestAccounts') {
    return method;
  }
  return `${method}:${JSON.stringify(params || [])}`;
}

/**
 * Execute a wallet request with deduplication and timeout.
 *
 * Features:
 * - Deduplication within a short window to prevent security extension double-prompts
 * - Timeout handling to prevent hung promises if wallet extension crashes
 * - Automatic cleanup of in-flight requests on completion or timeout
 */
async function deduplicatedRequest<T>(
  provider: EthereumProvider,
  method: string,
  params?: unknown[],
  timeoutMs: number = WALLET_REQUEST_TIMEOUT_MS
): Promise<T> {
  const key = getRequestKey(method, params);
  const now = Date.now();

  // Check if this exact request is already in flight AND not timed out
  const existing = inFlightWalletRequests.get(key);
  if (existing && (now - existing.timestamp) < REQUEST_DEDUP_TIMEOUT_MS) {
    console.debug('[CryptoJournal] Reusing in-flight request:', method);
    return existing.promise as Promise<T>;
  }

  // Clean up expired entry if any
  if (existing) {
    inFlightWalletRequests.delete(key);
  }

  // Create timeout with cleanup capability
  const timeout = createTimeoutPromise(timeoutMs, method);

  // Create the actual wallet request
  const walletRequest = provider.request({ method, params });

  // Race between wallet response and timeout
  const requestPromise = Promise.race([walletRequest, timeout.promise])
    .then((result) => {
      // Success - clean up timeout and in-flight tracking
      timeout.cleanup();
      inFlightWalletRequests.delete(key);
      return result;
    })
    .catch((error) => {
      // Error (including timeout) - clean up everything
      timeout.cleanup();
      inFlightWalletRequests.delete(key);
      throw error;
    });

  inFlightWalletRequests.set(key, { promise: requestPromise, timestamp: now });
  return requestPromise as Promise<T>;
}

// ============================================================================
// Provider Detection & Selection
// ============================================================================

/** Cache discovered providers from EIP-6963 */
const discoveredProviders: EIP6963ProviderDetail[] = [];

/**
 * Listen for EIP-6963 provider announcements
 */
function setupEIP6963Listener(): void {
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
    if (detail?.info?.rdns) {
      // Avoid duplicates
      const exists = discoveredProviders.some(p => p.info.uuid === detail.info.uuid);
      if (!exists) {
        discoveredProviders.push(detail);
        console.debug('[CryptoJournal] EIP-6963 provider discovered:', detail.info.name, detail.info.rdns);
      }
    }
  });
  
  // Request provider announcements
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/**
 * Check if a provider is a security extension wrapper
 */
function isSecurityExtensionProvider(provider: EthereumProvider): boolean {
  return !!(
    provider.isWrappedBySecurityExtension ||
    provider.isPocketUniverse ||
    provider.isWalletGuard ||
    provider.isFire ||
    provider.isBlowfish
  );
}

/**
 * Check if a provider RDNS indicates a security extension
 */
function isSecurityExtensionRdns(rdns: string): boolean {
  const securityRdns = [
    'app.pocketuniverse',
    'io.walletguard',
    'xyz.joinfire',
    'xyz.blowfish',
  ];
  return securityRdns.some(s => rdns.toLowerCase().includes(s));
}

/**
 * Get the best available Ethereum provider
 * Priority: MetaMask/Rabby > Phantom > Brave Wallet > Others
 * Avoids security extension wrappers when possible
 */
function getProvider(): EthereumProvider | null {
  const win = window as unknown as WalletWindow;
  const ethereum = win.ethereum;
  
  if (!ethereum) {
    return null;
  }
  
  // Priority order for wallets (MetaMask/Rabby first, Brave last since it intercepts aggressively)
  const priorityOrder = [
    (p: EthereumProvider) => p.isRabby,      // 1. Rabby (best UX)
    (p: EthereumProvider) => p.isMetaMask && !p.isBraveWallet, // 2. MetaMask (not Brave pretending)
    (p: EthereumProvider) => p.isPhantom,    // 3. Phantom
    (p: EthereumProvider) => p.isBraveWallet, // 4. Brave Wallet (last - intercepts other wallets)
  ];
  
  // First, try EIP-6963 providers (cleanest discovery method)
  for (const priorityCheck of priorityOrder) {
    for (const discovered of discoveredProviders) {
      // Skip security extensions
      if (isSecurityExtensionRdns(discovered.info.rdns)) {
        continue;
      }
      if (priorityCheck(discovered.provider)) {
        console.debug('[CryptoJournal] Using EIP-6963 provider:', discovered.info.name);
        return discovered.provider;
      }
    }
  }
  
  // Check for multi-provider setup (common with multiple wallets)
  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    // Filter out security extension wrappers
    const directWallets = ethereum.providers.filter(p => !isSecurityExtensionProvider(p));
    
    if (directWallets.length > 0) {
      // Find by priority
      for (const priorityCheck of priorityOrder) {
        const found = directWallets.find(priorityCheck);
        if (found) {
          console.debug('[CryptoJournal] Using direct wallet from providers array');
          return found;
        }
      }
      // Fallback to first direct wallet
      return directWallets[0];
    }
    
    // All are security wrappers - still try to find best wallet
    for (const priorityCheck of priorityOrder) {
      const found = ethereum.providers.find(priorityCheck);
      if (found) return found;
    }
    return ethereum.providers[0];
  }
  
  // Fallback to window.ethereum (may be wrapped by security extension)
  return ethereum;
}

/**
 * Handle messages from content script
 */
function handleMessage(event: MessageEvent): void {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  const data = event.data;
  if (!data || typeof data.type !== 'string') return;
  
  // Only handle CJ_WALLET_* messages
  if (!data.type.startsWith('CJ_WALLET_')) return;
  
  // Only process messages from content script (via InjectionService)
  // Ignore messages directly from main app to prevent double-handling
  if (data.source !== 'cj-content-script') return;
  
  const requestId = data.requestId;
  
  switch (data.type) {
    case WalletMessageType.CJ_WALLET_CHECK:
      handleWalletCheck(requestId);
      break;
      
    case WalletMessageType.CJ_WALLET_CONNECT:
      handleWalletConnect(requestId);
      break;
      
    case WalletMessageType.CJ_WALLET_SIGN:
      handleWalletSign(requestId, data.message, data.address);
      break;
  }
}

/**
 * Check if wallet is available and detect security extensions
 */
function handleWalletCheck(requestId?: string): void {
  const provider = getProvider();
  const walletName = provider 
    ? (provider.isMetaMask ? 'MetaMask' : 
       provider.isRabby ? 'Rabby' : 
       provider.isBraveWallet ? 'Brave Wallet' :
       provider.isPhantom ? 'Phantom' : 'Unknown Wallet')
    : null;
  
  // Detect security extensions
  const securityExtensions: string[] = [];
  for (const discovered of discoveredProviders) {
    if (isSecurityExtensionRdns(discovered.info.rdns)) {
      securityExtensions.push(discovered.info.name);
    }
  }
    
  window.postMessage({
    type: WalletMessageType.CJ_WALLET_CHECK_RESULT,
    requestId,
    available: !!provider,
    walletName,
    securityExtensions, // Let the app know what security extensions are present
  }, '*');
}

/**
 * Connect wallet and get accounts (with deduplication)
 */
async function handleWalletConnect(requestId?: string): Promise<void> {
  try {
    const provider = getProvider();
    if (!provider) {
      window.postMessage({
        type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
        requestId,
        success: false,
        error: 'No wallet detected',
      }, '*');
      return;
    }

    // If the wallet is locked, many wallets will keep the request pending until
    // the user unlocks the extension. Instead of letting the app hang for 30s,
    // fail fast with a clear instruction.
    const CONNECT_TIMEOUT_MS = 10_000;
    
    // Use deduplication to prevent double-prompts from security extensions
    const accounts = await deduplicatedRequest<string[]>(
      provider,
      'eth_requestAccounts',
      undefined,
      CONNECT_TIMEOUT_MS
    );
    
    if (!accounts || accounts.length === 0) {
      window.postMessage({
        type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
        requestId,
        success: false,
        error: 'No accounts returned',
      }, '*');
      return;
    }
    
    // Get chain ID (also deduplicated)
    const chainId = provider.chainId || await deduplicatedRequest<string>(
      provider,
      'eth_chainId',
      undefined,
      5_000
    );
    
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
      requestId,
      success: true,
      address: accounts[0],
      chainId,
    }, '*');
    
  } catch (err) {
    const error = err as { code?: number; message?: string; name?: string };
    const isTimeout = error.name === 'WalletTimeoutError' || error.code === 5006;
    const errorMessage = error.code === 4001
      ? 'User rejected connection'
      : isTimeout
        ? 'Wallet is locked or awaiting approval. Please unlock/approve in MetaMask or Rabby, then click Connect Wallet again.'
        : (error.message || 'Connection failed');

    window.postMessage({
      type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
      requestId,
      success: false,
      error: errorMessage,
      code: error.code,
      isTimeout,
    }, '*');
  }
}

/**
 * Sign a message with wallet (with deduplication and timeout)
 */
async function handleWalletSign(requestId: string | undefined, message: string, address: string): Promise<void> {
  try {
    const provider = getProvider();
    if (!provider) {
      window.postMessage({
        type: WalletMessageType.CJ_WALLET_SIGN_RESULT,
        requestId,
        success: false,
        error: 'No wallet detected',
      }, '*');
      return;
    }
    
    console.debug('[CryptoJournal] Signing message for address:', address.slice(0, 10) + '...');
    
    // Use deduplication - if Pocket Universe triggers the same sign request,
    // we return the same promise instead of creating a new wallet popup
    const signature = await deduplicatedRequest<string>(
      provider,
      'personal_sign',
      [message, address]
    );
    
    console.debug('[CryptoJournal] Message signed successfully');
    
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_SIGN_RESULT,
      requestId,
      success: true,
      signature,
    }, '*');
    
  } catch (err) {
    const error = err as { code?: number; message?: string; name?: string };
    const isTimeout = error.name === 'WalletTimeoutError' || error.code === 5006;
    const errorMessage = error.code === 4001
      ? 'User rejected signature'
      : isTimeout
        ? 'Wallet not responding - please check your wallet extension'
        : (error.message || 'Signing failed');

    console.debug('[CryptoJournal] Sign failed:', errorMessage, isTimeout ? '(timeout)' : '');
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_SIGN_RESULT,
      requestId,
      success: false,
      error: errorMessage,
      code: error.code,
      isTimeout,
    }, '*');
  }
}

// Initialize EIP-6963 listener before anything else
setupEIP6963Listener();

// Set up message listener
window.addEventListener('message', handleMessage);

// Signal that injected script is ready
// Note: InjectionService listens for this specific message type
window.postMessage({ type: 'CJ_WALLET_SCRIPT_READY' }, '*');

console.debug('[CryptoJournal] Injected auth script loaded (with security extension detection)');
