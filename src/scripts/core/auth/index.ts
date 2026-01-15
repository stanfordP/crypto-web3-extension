/**
 * Auth module exports
 * @module core/auth
 */

export {
  // Types
  type AuthState,
  type AuthEvent,
  type AuthContext,
  type AuthStateData,
  type TransitionResult,
  type AuthAction,
  // Pure functions
  createInitialContext,
  createInitialState,
  isValidTransition,
  transition,
  getStateDescription,
  isTerminalState,
  isConnected,
  isPendingState,
} from './AuthStateMachine';

export {
  // Types
  type SiweMessageFields,
  type ChallengeResponse,
  type VerifyResponse,
  type ParsedSiweMessage,
  type SiweValidationResult,
  // Message creation
  createSiweMessage,
  createDefaultSiweFields,
  // Message parsing
  parseSiweMessage,
  // Validation
  validateSiweMessage,
  isValidEthereumAddress,
  generateNonce,
  // Chain ID helpers
  hexToChainId,
  chainIdToHex,
  getChainName,
  // Challenge flow helpers
  createChallengeRequest,
  createVerifyRequest,
  isChallengeValid,
} from './SiweFlow';
