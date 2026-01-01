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
 */

// Types for wallet interaction
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  chainId?: string;
  selectedAddress?: string | null;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  providers?: EthereumProvider[];
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

/**
 * Get the best available Ethereum provider
 */
function getProvider(): EthereumProvider | null {
  const win = window as unknown as WalletWindow;
  const ethereum = win.ethereum;
  
  if (!ethereum) {
    return null;
  }
  
  // Check for multi-provider setup (common with multiple wallets)
  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    // Prefer MetaMask or Rabby
    const preferred = ethereum.providers.find(
      p => p.isMetaMask || p.isRabby || p.isBraveWallet
    );
    if (preferred) return preferred;
    return ethereum.providers[0];
  }
  
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
 * Check if wallet is available
 */
function handleWalletCheck(requestId: string): void {
  const provider = getProvider();
  const walletName = provider 
    ? (provider.isMetaMask ? 'MetaMask' : 
       provider.isRabby ? 'Rabby' : 
       provider.isBraveWallet ? 'Brave Wallet' : 'Unknown Wallet')
    : null;
    
  window.postMessage({
    type: WalletMessageType.CJ_WALLET_CHECK_RESULT,
    requestId,
    available: !!provider,
    walletName,
  }, '*');
}

/**
 * Connect wallet and get accounts
 */
async function handleWalletConnect(requestId: string): Promise<void> {
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
    
    // Request accounts
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
    
    if (!accounts || accounts.length === 0) {
      window.postMessage({
        type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
        requestId,
        success: false,
        error: 'No accounts returned',
      }, '*');
      return;
    }
    
    // Get chain ID
    const chainId = provider.chainId || await provider.request({ method: 'eth_chainId' }) as string;
    
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
      requestId,
      success: true,
      address: accounts[0],
      chainId,
    }, '*');
    
  } catch (err) {
    const error = err as { code?: number; message?: string };
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_CONNECT_RESULT,
      requestId,
      success: false,
      error: error.code === 4001 ? 'User rejected connection' : (error.message || 'Connection failed'),
      code: error.code,
    }, '*');
  }
}

/**
 * Sign a message with wallet
 */
async function handleWalletSign(requestId: string, message: string, address: string): Promise<void> {
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
    
    // personal_sign expects [message, address]
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, address],
    }) as string;
    
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_SIGN_RESULT,
      requestId,
      success: true,
      signature,
    }, '*');
    
  } catch (err) {
    const error = err as { code?: number; message?: string };
    window.postMessage({
      type: WalletMessageType.CJ_WALLET_SIGN_RESULT,
      requestId,
      success: false,
      error: error.code === 4001 ? 'User rejected signature' : (error.message || 'Signing failed'),
      code: error.code,
    }, '*');
  }
}

// Set up message listener
window.addEventListener('message', handleMessage);

// Signal that injected script is ready
window.postMessage({ type: 'CJ_INJECTED_READY' }, '*');

console.debug('[CryptoJournal] Injected auth script loaded');
