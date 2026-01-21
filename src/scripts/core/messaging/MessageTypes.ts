/**
 * Message Types for CJ_* Protocol
 * 
 * Type definitions for all messages in the extension's communication protocol.
 * 
 * @module core/messaging/MessageTypes
 * @version 2.1.0
 */

import { ErrorCode, PageMessageType } from '../../types';

// ============================================================================
// Protocol Version
// ============================================================================

/**
 * Current protocol version
 * Format: major.minor.patch
 * - Major: Breaking changes
 * - Minor: New features, backward compatible
 * - Patch: Bug fixes
 */
export const PROTOCOL_VERSION = '2.1.0';

/**
 * Minimum supported protocol version for backward compatibility
 */
export const MIN_PROTOCOL_VERSION = '2.0.0';

/**
 * Maximum age for messages with timestamps (30 seconds)
 */
export const MESSAGE_MAX_AGE_MS = 30_000;

// ============================================================================
// Base Message Types
// ============================================================================

/**
 * Base message structure
 * 
 * @property type - Message type (CJ_* prefix)
 * @property requestId - Optional unique request identifier for response correlation
 * @property version - Protocol version (e.g., "2.1.0")
 * @property timestamp - Unix timestamp in milliseconds when message was created
 */
export interface BaseMessage {
  type: string;
  requestId?: string;
  /** Protocol version (e.g., "2.1.0") */
  version?: string;
  /** Unix timestamp in milliseconds */
  timestamp?: number;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a message with standard fields populated
 */
export function createMessage<T extends BaseMessage>(message: Omit<T, 'version' | 'timestamp' | 'requestId'> & { requestId?: string }): T {
  return {
    ...message,
    version: PROTOCOL_VERSION,
    timestamp: Date.now(),
    requestId: message.requestId || generateRequestId(),
  } as T;
}

/**
 * Check if a protocol version is supported
 */
export function isVersionSupported(version?: string): boolean {
  if (!version) return true; // Allow legacy messages without version
  const [major, minor] = version.split('.').map(Number);
  const [minMajor, minMinor] = MIN_PROTOCOL_VERSION.split('.').map(Number);
  if (major < minMajor) return false;
  if (major === minMajor && minor < minMinor) return false;
  return true;
}

/**
 * Check if a message timestamp is within acceptable age
 */
export function isTimestampValid(timestamp?: number, maxAgeMs: number = MESSAGE_MAX_AGE_MS): boolean {
  if (!timestamp) return true; // Allow legacy messages without timestamp
  const age = Date.now() - timestamp;
  return age >= 0 && age <= maxAgeMs;
}

/**
 * Message with success indicator
 */
export interface ResponseMessage extends BaseMessage {
  success: boolean;
}

/**
 * Error response message
 */
export interface ErrorMessage extends ResponseMessage {
  success: false;
  code: ErrorCode;
  message: string;
  originalType?: string;
}

// ============================================================================
// Inbound Messages (Main App → Extension)
// ============================================================================

/**
 * Check if extension is installed
 */
export interface CheckExtensionMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_CHECK_EXTENSION;
}

/**
 * Open auth flow (v1.1 legacy)
 */
export interface OpenAuthMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_OPEN_AUTH;
}

/**
 * Get current session
 */
export interface GetSessionMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_GET_SESSION;
}

/**
 * Disconnect and clear session
 */
export interface DisconnectMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_DISCONNECT;
}

/**
 * Connect wallet (v2.0)
 */
export interface WalletConnectMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_WALLET_CONNECT;
}

/**
 * Sign message (v2.0)
 */
export interface WalletSignMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_WALLET_SIGN;
  message: string;
  address: string;
}

/**
 * Store session (v2.0)
 */
export interface StoreSessionMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_STORE_SESSION;
  session: {
    sessionToken: string;
    address: string;
    chainId: string;
  };
}

/**
 * Clear session (v2.0)
 */
export interface ClearSessionMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_CLEAR_SESSION;
}

/**
 * Get session for popup
 */
export interface PopupGetSessionMessage extends BaseMessage {
  type: 'CJ_POPUP_GET_SESSION';
}

/**
 * Union of all inbound message types
 */
export type InboundMessage =
  | CheckExtensionMessage
  | OpenAuthMessage
  | GetSessionMessage
  | DisconnectMessage
  | WalletConnectMessage
  | WalletSignMessage
  | StoreSessionMessage
  | ClearSessionMessage
  | PopupGetSessionMessage;

// ============================================================================
// Outbound Messages (Extension → Main App)
// ============================================================================

/**
 * Extension present response
 */
export interface ExtensionPresentMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_EXTENSION_PRESENT;
}

/**
 * Auth opened response
 */
export interface AuthOpenedMessage extends ResponseMessage {
  type: typeof PageMessageType.CJ_AUTH_OPENED;
  error?: string;
}

/**
 * Session response
 */
export interface SessionResponseMessage extends ResponseMessage {
  type: typeof PageMessageType.CJ_SESSION_RESPONSE;
  session: {
    address: string;
    chainId: string;
    sessionToken?: string;
  } | null;
}

/**
 * Session changed notification
 */
export interface SessionChangedMessage extends BaseMessage {
  type: typeof PageMessageType.CJ_SESSION_CHANGED;
  session: {
    address: string;
    chainId: string;
    sessionToken?: string;
  } | null;
}

/**
 * Disconnect response
 */
export interface DisconnectResponseMessage extends ResponseMessage {
  type: typeof PageMessageType.CJ_DISCONNECT_RESPONSE;
}

/**
 * Wallet connection result (v2.0)
 */
export interface WalletResultMessage extends ResponseMessage {
  type: typeof PageMessageType.CJ_WALLET_RESULT;
  address?: string;
  chainId?: string;
  walletName?: string;
  error?: string;
}

/**
 * Signature result (v2.0)
 */
export interface SignResultMessage extends ResponseMessage {
  type: typeof PageMessageType.CJ_SIGN_RESULT;
  signature?: string;
  error?: string;
}

/**
 * Session stored confirmation (v2.0)
 */
export interface SessionStoredMessage extends ResponseMessage {
  type: typeof PageMessageType.CJ_SESSION_STORED;
}

/**
 * Union of all outbound message types
 */
export type OutboundMessage =
  | ExtensionPresentMessage
  | AuthOpenedMessage
  | SessionResponseMessage
  | SessionChangedMessage
  | DisconnectResponseMessage
  | WalletResultMessage
  | SignResultMessage
  | SessionStoredMessage
  | ErrorMessage;

// ============================================================================
// Wallet Messages (Content Script ↔ Injected Script)
// ============================================================================

export const WalletMessageType = {
  CJ_WALLET_CHECK: 'CJ_WALLET_CHECK',
  CJ_WALLET_CHECK_RESULT: 'CJ_WALLET_CHECK_RESULT',
  CJ_WALLET_CONNECT: 'CJ_WALLET_CONNECT',
  CJ_WALLET_CONNECT_RESULT: 'CJ_WALLET_CONNECT_RESULT',
  CJ_WALLET_SIGN: 'CJ_WALLET_SIGN',
  CJ_WALLET_SIGN_RESULT: 'CJ_WALLET_SIGN_RESULT',
} as const;

/**
 * Wallet check request
 */
export interface WalletCheckRequest extends BaseMessage {
  type: typeof WalletMessageType.CJ_WALLET_CHECK;
}

/**
 * Wallet check result
 */
export interface WalletCheckResult extends BaseMessage {
  type: typeof WalletMessageType.CJ_WALLET_CHECK_RESULT;
  available: boolean;
  walletName?: string;
}

/**
 * Wallet connect request (internal)
 */
export interface WalletConnectRequest extends BaseMessage {
  type: typeof WalletMessageType.CJ_WALLET_CONNECT;
}

/**
 * Wallet connect result (internal)
 */
export interface WalletConnectResult extends BaseMessage {
  type: typeof WalletMessageType.CJ_WALLET_CONNECT_RESULT;
  success: boolean;
  address?: string;
  chainId?: string;
  walletName?: string;
  error?: string;
  code?: number;
}

/**
 * Wallet sign request (internal)
 */
export interface WalletSignRequest extends BaseMessage {
  type: typeof WalletMessageType.CJ_WALLET_SIGN;
  message: string;
  address: string;
}

/**
 * Wallet sign result (internal)
 */
export interface WalletSignResult extends BaseMessage {
  type: typeof WalletMessageType.CJ_WALLET_SIGN_RESULT;
  success: boolean;
  signature?: string;
  error?: string;
  code?: number;
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Result of routing a message
 */
export interface RouteResult {
  /** Handler key for the message */
  handlerKey: string;
  /** Whether the message is exempt from rate limiting */
  exemptFromRateLimit: boolean;
  /** Required fields for the message */
  requiredFields?: string[];
}

/**
 * Message handler function signature
 */
export type MessageHandler<T extends BaseMessage = BaseMessage> = (
  message: T
) => Promise<void>;

/**
 * Message handler registration
 */
export interface HandlerRegistration<T extends BaseMessage = BaseMessage> {
  /** Handler function */
  handler: MessageHandler<T>;
  /** Whether to skip rate limiting */
  exemptFromRateLimit?: boolean;
  /** Required message fields */
  requiredFields?: string[];
}
