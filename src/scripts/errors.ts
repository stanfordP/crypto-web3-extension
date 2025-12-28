/**
 * Structured Error Types for the Web3 Extension
 *
 * Provides typed errors for different failure modes with:
 * - Unique error codes for debugging
 * - User-friendly messages
 * - Contextual data for error tracking
 * - Retry-ability hints
 */

// ============================================================================
// Base Error Classes
// ============================================================================

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  WALLET = 'WALLET',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  EXTENSION = 'EXTENSION',
  API = 'API',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  PERMISSION = 'PERMISSION',
}

/**
 * Base error class for all extension errors
 */
export abstract class ExtensionError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(message: string, options?: { context?: Record<string, unknown>; retryable?: boolean }) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.context = options?.context;
    this.retryable = options?.retryable ?? false;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get user-friendly error message
   */
  abstract getUserMessage(): string;

  /**
   * Serialize for logging/tracking
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.getUserMessage(),
      timestamp: this.timestamp,
      context: this.context,
      retryable: this.retryable,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Network Errors
// ============================================================================

export class NetworkError extends ExtensionError {
  readonly code = 'NETWORK_ERROR';
  readonly category = ErrorCategory.NETWORK;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { context, retryable: true });
  }

  getUserMessage(): string {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
}

export class NetworkOfflineError extends ExtensionError {
  readonly code = 'NETWORK_OFFLINE';
  readonly category = ErrorCategory.NETWORK;

  constructor() {
    super('No internet connection detected', { retryable: true });
  }

  getUserMessage(): string {
    return 'You appear to be offline. Please check your internet connection.';
  }
}

export class NetworkTimeoutError extends ExtensionError {
  readonly code = 'NETWORK_TIMEOUT';
  readonly category = ErrorCategory.TIMEOUT;

  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`, {
      context: { endpoint, timeoutMs },
      retryable: true,
    });
  }

  getUserMessage(): string {
    return 'The request took too long. Please try again.';
  }
}

// ============================================================================
// API Errors
// ============================================================================

export class ApiError extends ExtensionError {
  readonly code = 'API_ERROR';
  readonly category = ErrorCategory.API;
  readonly statusCode: number;

  constructor(statusCode: number, message: string, context?: Record<string, unknown>) {
    super(message, {
      context: { ...context, statusCode },
      retryable: statusCode >= 500,
    });
    this.statusCode = statusCode;
  }

  getUserMessage(): string {
    if (this.statusCode >= 500) {
      return 'Server error. Please try again later.';
    }
    if (this.statusCode === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (this.statusCode === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (this.statusCode === 404) {
      return 'The requested resource was not found.';
    }
    return 'Request failed. Please try again.';
  }
}

export class RateLimitError extends ExtensionError {
  readonly code = 'RATE_LIMIT_ERROR';
  readonly category = ErrorCategory.RATE_LIMIT;
  readonly retryAfterMs: number;

  constructor(method: string, retryAfterMs: number = 1000) {
    super(`Rate limited: ${method}`, {
      context: { method, retryAfterMs },
      retryable: true,
    });
    this.retryAfterMs = retryAfterMs;
  }

  getUserMessage(): string {
    const seconds = Math.ceil(this.retryAfterMs / 1000);
    return `Too many requests. Please wait ${seconds} second${seconds > 1 ? 's' : ''} before trying again.`;
  }
}

// ============================================================================
// Wallet Errors
// ============================================================================

export class WalletNotFoundError extends ExtensionError {
  readonly code = 'WALLET_NOT_FOUND';
  readonly category = ErrorCategory.WALLET;

  constructor() {
    super('No external wallet detected');
  }

  getUserMessage(): string {
    return 'No wallet detected. Please install MetaMask, Brave Wallet, or another Web3 wallet.';
  }
}

export class WalletConnectionError extends ExtensionError {
  readonly code = 'WALLET_CONNECTION_ERROR';
  readonly category = ErrorCategory.WALLET;

  constructor(walletName: string, reason?: string) {
    super(`Failed to connect to ${walletName}: ${reason || 'Unknown error'}`, {
      context: { walletName, reason },
      retryable: true,
    });
  }

  getUserMessage(): string {
    return 'Failed to connect to your wallet. Please try again or use a different wallet.';
  }
}

export class WalletRejectedError extends ExtensionError {
  readonly code = 'WALLET_REJECTED';
  readonly category = ErrorCategory.WALLET;

  constructor(operation: string) {
    super(`User rejected ${operation}`, { context: { operation } });
  }

  getUserMessage(): string {
    return 'You rejected the request in your wallet. Please try again if this was unintentional.';
  }
}

export class WalletTimeoutError extends ExtensionError {
  readonly code = 'WALLET_TIMEOUT';
  readonly category = ErrorCategory.TIMEOUT;

  constructor(operation: string, timeoutMs: number) {
    super(`Wallet operation '${operation}' timed out`, {
      context: { operation, timeoutMs },
      retryable: true,
    });
  }

  getUserMessage(): string {
    return 'Wallet request timed out. Please check your wallet and try again.';
  }
}

export class WalletUnsupportedMethodError extends ExtensionError {
  readonly code = 'WALLET_UNSUPPORTED_METHOD';
  readonly category = ErrorCategory.WALLET;

  constructor(method: string) {
    super(`Unsupported wallet method: ${method}`, { context: { method } });
  }

  getUserMessage(): string {
    return 'This operation is not supported by your wallet.';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends ExtensionError {
  readonly code = 'AUTH_ERROR';
  readonly category = ErrorCategory.AUTH;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { context });
  }

  getUserMessage(): string {
    return 'Authentication failed. Please try signing in again.';
  }
}

export class SessionExpiredError extends ExtensionError {
  readonly code = 'SESSION_EXPIRED';
  readonly category = ErrorCategory.AUTH;

  constructor() {
    super('Session has expired');
  }

  getUserMessage(): string {
    return 'Your session has expired. Please sign in again.';
  }
}

export class InvalidSignatureError extends ExtensionError {
  readonly code = 'INVALID_SIGNATURE';
  readonly category = ErrorCategory.AUTH;

  constructor(reason?: string) {
    super(`Invalid signature: ${reason || 'Verification failed'}`, {
      context: { reason },
    });
  }

  getUserMessage(): string {
    return 'Signature verification failed. Please try signing in again.';
  }
}

export class SIWEError extends ExtensionError {
  readonly code = 'SIWE_ERROR';
  readonly category = ErrorCategory.AUTH;

  constructor(step: 'challenge' | 'sign' | 'verify', reason: string) {
    super(`SIWE ${step} failed: ${reason}`, { context: { step, reason } });
  }

  getUserMessage(): string {
    return 'Sign-in with Ethereum failed. Please try again.';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends ExtensionError {
  readonly code = 'VALIDATION_ERROR';
  readonly category = ErrorCategory.VALIDATION;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, { context: { field } });
    this.field = field;
  }

  getUserMessage(): string {
    return this.field ? `Invalid ${this.field}. Please check and try again.` : 'Invalid input. Please check and try again.';
  }
}

export class InvalidAddressError extends ExtensionError {
  readonly code = 'INVALID_ADDRESS';
  readonly category = ErrorCategory.VALIDATION;

  constructor(address: string) {
    super(`Invalid Ethereum address: ${address}`, { context: { address } });
  }

  getUserMessage(): string {
    return 'Invalid wallet address format.';
  }
}

export class InvalidChainError extends ExtensionError {
  readonly code = 'INVALID_CHAIN';
  readonly category = ErrorCategory.VALIDATION;

  constructor(chainId: string) {
    super(`Invalid or unsupported chain: ${chainId}`, { context: { chainId } });
  }

  getUserMessage(): string {
    return 'Unsupported blockchain network. Please switch to a supported network.';
  }
}

// ============================================================================
// Extension Errors
// ============================================================================

export class ExtensionCommunicationError extends ExtensionError {
  readonly code = 'EXTENSION_COMMUNICATION_ERROR';
  readonly category = ErrorCategory.EXTENSION;

  constructor(component: string, reason?: string) {
    super(`Extension communication error with ${component}: ${reason || 'Unknown'}`, {
      context: { component, reason },
      retryable: true,
    });
  }

  getUserMessage(): string {
    return 'Extension error. Please refresh the page and try again.';
  }
}

export class UnauthorizedSenderError extends ExtensionError {
  readonly code = 'UNAUTHORIZED_SENDER';
  readonly category = ErrorCategory.PERMISSION;

  constructor(origin: string) {
    super(`Unauthorized message sender: ${origin}`, { context: { origin } });
  }

  getUserMessage(): string {
    return 'Request blocked for security reasons.';
  }
}

export class TabNotFoundError extends ExtensionError {
  readonly code = 'TAB_NOT_FOUND';
  readonly category = ErrorCategory.EXTENSION;

  constructor() {
    super('No active tab found');
  }

  getUserMessage(): string {
    return 'Please open the Crypto Trading Journal and try again.';
  }
}

export class InvalidOriginError extends ExtensionError {
  readonly code = 'INVALID_ORIGIN';
  readonly category = ErrorCategory.PERMISSION;

  constructor(origin: string, allowedOrigins: string[]) {
    super(`Origin not allowed: ${origin}`, {
      context: { origin, allowedOrigins },
    });
  }

  getUserMessage(): string {
    return 'Please navigate to the Crypto Trading Journal app to connect your wallet.';
  }
}

// ============================================================================
// Error Factory
// ============================================================================

/**
 * Create appropriate error from HTTP response
 */
export function createApiError(response: Response, body?: { error?: string }): ApiError {
  const message = body?.error || response.statusText || `HTTP ${response.status}`;
  return new ApiError(response.status, message, {
    url: response.url,
    statusText: response.statusText,
  });
}

/**
 * Create appropriate error from unknown error
 */
export function normalizeError(error: unknown): ExtensionError {
  if (error instanceof ExtensionError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return new NetworkError(error.message);
    }

    if (message.includes('timeout')) {
      return new NetworkTimeoutError('unknown', 60000);
    }

    if (message.includes('rejected') || message.includes('denied')) {
      return new WalletRejectedError('unknown operation');
    }

    // Default to generic extension error
    return new ExtensionCommunicationError('unknown', error.message);
  }

  return new ExtensionCommunicationError('unknown', String(error));
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ExtensionError) {
    return error.retryable;
  }
  return false;
}

/**
 * Get user-friendly message from any error
 */
export function getUserErrorMessage(error: unknown): string {
  if (error instanceof ExtensionError) {
    return error.getUserMessage();
  }

  if (error instanceof Error) {
    // Don't expose internal error messages to users
    return 'An unexpected error occurred. Please try again.';
  }

  return 'An unexpected error occurred. Please try again.';
}

// ============================================================================
// RPC Error Codes (EIP-1193)
// ============================================================================

export const RPC_ERROR_CODES = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RESOURCE_NOT_FOUND: -32001,
  RESOURCE_UNAVAILABLE: -32002,
  TRANSACTION_REJECTED: -32003,
  METHOD_NOT_SUPPORTED: -32004,
} as const;

/**
 * Create RPC-style error for provider responses
 */
export function createRpcError(
  code: number,
  message: string,
  data?: unknown
): { code: number; message: string; data?: unknown } {
  return {
    code,
    message,
    ...(data !== undefined && { data }),
  };
}
