/**
 * Session module exports
 * @module core/session
 */

export {
  // Types
  type SessionValidationResult,
  type SessionSyncResult,
  type ApiSessionResponse,
  type SessionChangeEvent,
  // Pure functions
  validateSession,
  isValidEthereumAddress,
  normalizeAddress,
  parseApiSessionResponse,
  sessionsEqual,
  mergeSession,
  getSessionChangeType,
  createSessionChangeEvent,
  formatSessionForDisplay,
  truncateAddress,
  getChainName,
  // Class
  SessionManager,
} from './SessionManager';
