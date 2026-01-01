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
  isMetaMask?: boolean; // MetaMask compatibility flag
  isRabby?: boolean;    // Rabby wallet flag
  isBraveWallet?: boolean; // Brave wallet flag
  isPhantom?: boolean;  // Phantom wallet flag

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
// Page Messages (Main App <-> Extension via postMessage)
// ============================================================================

/**
 * Message types for communication between main app and extension
 * These are sent via window.postMessage and handled by the content script
 *
 * v1.1 (Legacy): CJ_OPEN_AUTH triggers full auth flow in extension
 * v2.0 (New): App controls SIWE flow, extension is pure wallet bridge
 */
export enum PageMessageType {
  // ============================================================================
  // Main App -> Extension (v1.1 Legacy - still supported)
  // ============================================================================
  CJ_CHECK_EXTENSION = 'CJ_CHECK_EXTENSION',   // Check if extension is installed
  CJ_OPEN_AUTH = 'CJ_OPEN_AUTH',               // Request to open auth page (legacy, triggers full flow)
  CJ_GET_SESSION = 'CJ_GET_SESSION',           // Get current session
  CJ_DISCONNECT = 'CJ_DISCONNECT',             // Logout/disconnect

  // ============================================================================
  // Main App -> Extension (v2.0 New - App-Driven SIWE)
  // ============================================================================
  /** Direct wallet connect - returns address/chainId, app handles SIWE */
  CJ_WALLET_CONNECT = 'CJ_WALLET_CONNECT',
  /** Direct message sign - app provides SIWE message, extension returns signature */
  CJ_WALLET_SIGN = 'CJ_WALLET_SIGN',
  /** Store session after app verifies signature */
  CJ_STORE_SESSION = 'CJ_STORE_SESSION',
  /** Clear session (alternative to CJ_DISCONNECT) */
  CJ_CLEAR_SESSION = 'CJ_CLEAR_SESSION',

  // ============================================================================
  // Extension -> Main App (v1.1 Legacy)
  // ============================================================================
  CJ_EXTENSION_PRESENT = 'CJ_EXTENSION_PRESENT', // Extension is installed
  CJ_AUTH_OPENED = 'CJ_AUTH_OPENED',             // Auth page was opened
  CJ_SESSION_RESPONSE = 'CJ_SESSION_RESPONSE',   // Session response
  CJ_SESSION_CHANGED = 'CJ_SESSION_CHANGED',     // Session state changed
  CJ_DISCONNECT_RESPONSE = 'CJ_DISCONNECT_RESPONSE', // Disconnect response

  // ============================================================================
  // Extension -> Main App (v2.0 New)
  // ============================================================================
  /** Wallet connection result with address and chainId */
  CJ_WALLET_RESULT = 'CJ_WALLET_RESULT',
  /** Signature result from CJ_WALLET_SIGN */
  CJ_SIGN_RESULT = 'CJ_SIGN_RESULT',
  /** Session stored confirmation */
  CJ_SESSION_STORED = 'CJ_SESSION_STORED',
  /** Error response with code and message */
  CJ_ERROR = 'CJ_ERROR',
}

/**
 * Session data shared with main app
 * 
 * SECURITY NOTE (v2.1): sessionToken is intentionally NOT included here.
 * The session token is stored only in chrome.storage.session (ephemeral)
 * and is NEVER exposed to the page via postMessage.
 * 
 * The app should verify session validity via /api/auth/session endpoint.
 */
export interface PageSession {
  address: string;
  chainId: string;
  accountMode?: 'demo' | 'live';
  isConnected?: boolean;
}

/**
 * Message from main app to extension
 */
export interface PageMessage {
  type: PageMessageType;
  payload?: unknown;
}

/**
 * Session response message
 */
export interface SessionResponseMessage {
  type: PageMessageType.CJ_SESSION_RESPONSE;
  session: PageSession | null;
  /** Indicates whether a valid session token exists (without exposing it) */
  hasValidToken?: boolean;
}

/**
 * Disconnect response message
 */
export interface DisconnectResponseMessage {
  type: PageMessageType.CJ_DISCONNECT_RESPONSE;
  success: boolean;
}

// ============================================================================
// v2.0 Message Interfaces (App-Driven SIWE)
// ============================================================================

/**
 * v2.0: Request to connect wallet (no SIWE, just get address)
 */
export interface WalletConnectMessage {
  type: PageMessageType.CJ_WALLET_CONNECT;
  /** Optional request ID for tracking */
  requestId?: string;
}

/**
 * v2.0: Request to sign a message (app provides SIWE message)
 */
export interface WalletSignMessage {
  type: PageMessageType.CJ_WALLET_SIGN;
  /** The SIWE message to sign */
  message: string;
  /** The address to sign with (must match connected wallet) */
  address: string;
  /** Optional request ID for tracking */
  requestId?: string;
}

/**
 * v2.0: Store session after app verifies signature
 */
export interface StoreSessionMessage {
  type: PageMessageType.CJ_STORE_SESSION;
  /** Session data to store */
  session: {
    sessionToken: string;
    address: string;
    chainId: string;
  };
  /** Optional request ID for tracking */
  requestId?: string;
}

/**
 * v2.0: Clear session (alternative to CJ_DISCONNECT)
 */
export interface ClearSessionMessage {
  type: PageMessageType.CJ_CLEAR_SESSION;
  /** Optional request ID for tracking */
  requestId?: string;
}

/**
 * v2.0: Wallet connection result
 */
export interface WalletResultMessage {
  type: PageMessageType.CJ_WALLET_RESULT;
  success: true;
  address: string;
  chainId: string;
  /** Detected wallet name */
  walletName?: string;
  /** Request ID if provided */
  requestId?: string;
}

/**
 * v2.0: Signature result
 */
export interface SignResultMessage {
  type: PageMessageType.CJ_SIGN_RESULT;
  success: true;
  signature: string;
  /** Request ID if provided */
  requestId?: string;
}

/**
 * v2.0: Session stored confirmation
 */
export interface SessionStoredMessage {
  type: PageMessageType.CJ_SESSION_STORED;
  success: boolean;
  /** Request ID if provided */
  requestId?: string;
}

/**
 * v2.0: Error response with code and message
 */
export interface ErrorMessage {
  type: PageMessageType.CJ_ERROR;
  success: false;
  /** Error code (follows EIP-1193 codes where applicable) */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original request type that caused the error */
  originalType?: string;
  /** Request ID if provided */
  requestId?: string;
}

/**
 * Error codes for CJ_ERROR messages
 * Uses EIP-1193 codes where applicable
 */
export enum ErrorCode {
  // EIP-1193 standard errors
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  CHAIN_DISCONNECTED = 4901,

  // Extension-specific errors
  NO_WALLET = 5001,
  WALLET_CONNECTION_FAILED = 5002,
  SIGNING_FAILED = 5003,
  INVALID_REQUEST = 5004,
  SESSION_STORAGE_FAILED = 5005,
  REQUEST_TIMEOUT = 5006,
  ALREADY_IN_PROGRESS = 5007,
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
