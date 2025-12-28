/**
 * Shared TypeScript interfaces for the Web3 extension
 * Follows EIP-1193 and EIP-6963 standards
 */

// ============================================================================
// EIP-1193: Ethereum Provider JavaScript API
// ============================================================================

export interface EthereumProvider {
  // Core EIP-1193 methods
  request(args: RequestArguments): Promise<unknown>;

  // Connection methods
  isConnected(): boolean;

  // Event emitter
  on(eventName: string, listener: (...args: unknown[]) => void): void;
  removeListener(eventName: string, listener: (...args: unknown[]) => void): void;

  // Provider identification
  isCryptoJournal?: boolean;
  isMetaMask?: boolean; // Compatibility flag

  // Chain information
  chainId: string;
  selectedAddress: string | null;
}

export interface RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

// ============================================================================
// EIP-6963: Multi Injected Provider Discovery
// ============================================================================

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string; // Data URI
  rdns: string; // Reverse DNS (e.g., com.cryptojournal.wallet)
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EthereumProvider;
}

export interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: 'eip6963:announceProvider';
  detail: EIP6963ProviderDetail;
}

export interface EIP6963RequestProviderEvent extends Event {
  type: 'eip6963:requestProvider';
}

// ============================================================================
// Extension Messages (Background <-> Content Script)
// ============================================================================

export enum MessageType {
  // Authentication flow
  REQUEST_ACCOUNTS = 'REQUEST_ACCOUNTS',
  SIGN_MESSAGE = 'SIGN_MESSAGE',
  SEND_TRANSACTION = 'SEND_TRANSACTION',
  SWITCH_CHAIN = 'SWITCH_CHAIN',
  ADD_CHAIN = 'ADD_CHAIN',

  // Session management
  GET_SESSION = 'GET_SESSION',
  DISCONNECT = 'DISCONNECT',

  // Wallet operations (Background <-> Offscreen)
  WALLET_OPERATION = 'WALLET_OPERATION',

  // Generic RPC request (for unknown/passthrough methods)
  RPC_REQUEST = 'RPC_REQUEST',

  // Events from background to content
  ACCOUNTS_CHANGED = 'ACCOUNTS_CHANGED',
  CHAIN_CHANGED = 'CHAIN_CHANGED',
  CONNECT = 'CONNECT',
  DISCONNECT_EVENT = 'DISCONNECT_EVENT',
}

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
  requestId?: string;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

// ============================================================================
// API Communication (Extension <-> Main App)
// ============================================================================

export interface SIWEChallengeRequest {
  address: string;
  chainId: number;
  accountMode: 'demo' | 'live';
}

export interface SIWEChallengeResponse {
  message: string; // SIWE message to sign
  nonce: string;
}

export interface SIWEVerifyRequest {
  message: string;
  signature: string;
  accountMode: 'demo' | 'live';
}

export interface SIWEVerifyResponse {
  sessionToken: string;
  user: {
    id: string;
    address: string;
    accountMode: 'demo' | 'live';
  };
}

export interface SessionValidationResponse {
  valid: boolean;
  user?: {
    id: string;
    address: string;
    accountMode: 'demo' | 'live';
  };
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageData {
  sessionToken?: string;
  connectedAddress?: string;
  chainId?: string;
  accountMode?: 'demo' | 'live';
  lastConnected?: number;
}

export enum StorageKeys {
  SESSION_TOKEN = 'sessionToken',
  CONNECTED_ADDRESS = 'connectedAddress',
  CHAIN_ID = 'chainId',
  ACCOUNT_MODE = 'accountMode',
  LAST_CONNECTED = 'lastConnected',
}

// ============================================================================
// Chain Configuration
// ============================================================================

export interface ChainConfig {
  chainId: string; // Hex format (e.g., '0x1')
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  '0x1': {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://eth.llamarpc.com'],
    blockExplorerUrls: ['https://etherscan.io'],
  },
  '0x89': {
    chainId: '0x89',
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  '0xa4b1': {
    chainId: '0xa4b1',
    chainName: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://arbiscan.io'],
  },
  '0xa': {
    chainId: '0xa',
    chainName: 'Optimism',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.optimism.io'],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
  },
  '0x2105': {
    chainId: '0x2105',
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  '0x38': {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  '0xa86a': {
    chainId: '0xa86a',
    chainName: 'Avalanche C-Chain',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    blockExplorerUrls: ['https://snowtrace.io'],
  },
};

// ============================================================================
// Error Types
// ============================================================================

export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'ProviderRpcError';
  }
}

export enum RpcErrorCode {
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  CHAIN_DISCONNECTED = 4901,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
}
