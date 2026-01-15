/**
 * Auth State Machine
 * 
 * Pure state machine for authentication flow.
 * Implements a finite state machine pattern for predictable auth state transitions.
 * 
 * States: idle → connecting → verifying → authenticated
 *                    ↓            ↓
 *                 error ←───── error
 * 
 * @module core/auth/AuthStateMachine
 */

/**
 * Authentication states
 */
export type AuthState =
  | 'idle'
  | 'connecting'
  | 'signing'
  | 'verifying'
  | 'authenticated'
  | 'error'
  | 'disconnecting';

/**
 * Authentication events that trigger state transitions
 */
export type AuthEvent =
  | { type: 'CONNECT'; address?: string }
  | { type: 'CONNECTED'; address: string; chainId: string }
  | { type: 'REQUEST_SIGNATURE' }
  | { type: 'SIGNATURE_RECEIVED'; signature: string }
  | { type: 'VERIFICATION_SUCCESS'; sessionToken?: string }
  | { type: 'VERIFICATION_FAILED'; error: string }
  | { type: 'DISCONNECT' }
  | { type: 'DISCONNECTED' }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'TIMEOUT' };

/**
 * Auth context - data accumulated during auth flow
 */
export interface AuthContext {
  address: string | null;
  chainId: string | null;
  signature: string | null;
  sessionToken: string | null;
  error: string | null;
  nonce: string | null;
  timestamp: number | null;
  attemptCount: number;
}

/**
 * Complete auth state with context
 */
export interface AuthStateData {
  state: AuthState;
  context: AuthContext;
  previousState: AuthState | null;
}

/**
 * Transition result
 */
export interface TransitionResult {
  newState: AuthStateData;
  actions: AuthAction[];
}

/**
 * Side effect actions to be performed after state transition
 */
export type AuthAction =
  | { type: 'SAVE_SESSION' }
  | { type: 'CLEAR_SESSION' }
  | { type: 'NOTIFY_CONNECTED' }
  | { type: 'NOTIFY_DISCONNECTED' }
  | { type: 'NOTIFY_ERROR'; error: string }
  | { type: 'LOG'; message: string; level: 'info' | 'warn' | 'error' }
  | { type: 'START_TIMEOUT'; duration: number }
  | { type: 'CANCEL_TIMEOUT' };

/**
 * Create initial auth context
 * Pure function
 */
export function createInitialContext(): AuthContext {
  return {
    address: null,
    chainId: null,
    signature: null,
    sessionToken: null,
    error: null,
    nonce: null,
    timestamp: null,
    attemptCount: 0,
  };
}

/**
 * Create initial auth state
 * Pure function
 */
export function createInitialState(): AuthStateData {
  return {
    state: 'idle',
    context: createInitialContext(),
    previousState: null,
  };
}

/**
 * Valid transitions map
 * Defines which events are valid for each state
 */
const VALID_TRANSITIONS: Record<AuthState, AuthEvent['type'][]> = {
  idle: ['CONNECT', 'RESET'],
  connecting: ['CONNECTED', 'ERROR', 'TIMEOUT', 'DISCONNECT', 'RESET'],
  signing: ['SIGNATURE_RECEIVED', 'ERROR', 'TIMEOUT', 'DISCONNECT', 'RESET'],
  verifying: ['VERIFICATION_SUCCESS', 'VERIFICATION_FAILED', 'TIMEOUT', 'DISCONNECT', 'RESET'],
  authenticated: ['DISCONNECT', 'RESET', 'ERROR'],
  error: ['CONNECT', 'RESET', 'DISCONNECT'],
  disconnecting: ['DISCONNECTED', 'ERROR', 'TIMEOUT', 'RESET'],
};

/**
 * Check if a transition is valid
 * Pure function
 */
export function isValidTransition(currentState: AuthState, event: AuthEvent): boolean {
  const validEvents = VALID_TRANSITIONS[currentState];
  return validEvents.includes(event.type);
}

/**
 * Apply state transition
 * Pure function - returns new state and actions to perform
 */
export function transition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  const { state } = currentState;

  // Check if transition is valid
  if (!isValidTransition(state, event)) {
    return {
      newState: currentState,
      actions: [
        {
          type: 'LOG',
          message: `Invalid transition: ${state} + ${event.type}`,
          level: 'warn',
        },
      ],
    };
  }

  // Process transition based on current state and event
  switch (state) {
    case 'idle':
      return handleIdleTransition(currentState, event);
    case 'connecting':
      return handleConnectingTransition(currentState, event);
    case 'signing':
      return handleSigningTransition(currentState, event);
    case 'verifying':
      return handleVerifyingTransition(currentState, event);
    case 'authenticated':
      return handleAuthenticatedTransition(currentState, event);
    case 'error':
      return handleErrorTransition(currentState, event);
    case 'disconnecting':
      return handleDisconnectingTransition(currentState, event);
    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from idle state
 * Pure function
 */
function handleIdleTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'CONNECT':
      return {
        newState: {
          state: 'connecting',
          context: {
            ...currentState.context,
            address: event.address || null,
            timestamp: Date.now(),
            attemptCount: currentState.context.attemptCount + 1,
          },
          previousState: 'idle',
        },
        actions: [
          { type: 'START_TIMEOUT', duration: 30000 },
          { type: 'LOG', message: 'Starting connection...', level: 'info' },
        ],
      };

    case 'RESET':
      return {
        newState: createInitialState(),
        actions: [{ type: 'CLEAR_SESSION' }],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from connecting state
 * Pure function
 */
function handleConnectingTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'CONNECTED':
      return {
        newState: {
          state: 'signing',
          context: {
            ...currentState.context,
            address: event.address,
            chainId: event.chainId,
            error: null,
          },
          previousState: 'connecting',
        },
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'START_TIMEOUT', duration: 60000 },
          { type: 'LOG', message: `Connected: ${event.address}`, level: 'info' },
        ],
      };

    case 'ERROR':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: event.error,
          },
          previousState: 'connecting',
        },
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'NOTIFY_ERROR', error: event.error },
        ],
      };

    case 'TIMEOUT':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: 'Connection timeout',
          },
          previousState: 'connecting',
        },
        actions: [{ type: 'NOTIFY_ERROR', error: 'Connection timeout' }],
      };

    case 'DISCONNECT':
    case 'RESET':
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'CLEAR_SESSION' },
        ],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from signing state
 * Pure function
 */
function handleSigningTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'SIGNATURE_RECEIVED':
      return {
        newState: {
          state: 'verifying',
          context: {
            ...currentState.context,
            signature: event.signature,
            error: null,
          },
          previousState: 'signing',
        },
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'START_TIMEOUT', duration: 30000 },
          { type: 'LOG', message: 'Signature received, verifying...', level: 'info' },
        ],
      };

    case 'ERROR':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: event.error,
          },
          previousState: 'signing',
        },
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'NOTIFY_ERROR', error: event.error },
        ],
      };

    case 'TIMEOUT':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: 'Signature timeout',
          },
          previousState: 'signing',
        },
        actions: [{ type: 'NOTIFY_ERROR', error: 'Signature timeout' }],
      };

    case 'DISCONNECT':
    case 'RESET':
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'CLEAR_SESSION' },
        ],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from verifying state
 * Pure function
 */
function handleVerifyingTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'VERIFICATION_SUCCESS':
      return {
        newState: {
          state: 'authenticated',
          context: {
            ...currentState.context,
            sessionToken: event.sessionToken || null,
            error: null,
          },
          previousState: 'verifying',
        },
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'SAVE_SESSION' },
          { type: 'NOTIFY_CONNECTED' },
          { type: 'LOG', message: 'Authentication successful', level: 'info' },
        ],
      };

    case 'VERIFICATION_FAILED':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: event.error,
          },
          previousState: 'verifying',
        },
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'NOTIFY_ERROR', error: event.error },
        ],
      };

    case 'TIMEOUT':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: 'Verification timeout',
          },
          previousState: 'verifying',
        },
        actions: [{ type: 'NOTIFY_ERROR', error: 'Verification timeout' }],
      };

    case 'DISCONNECT':
    case 'RESET':
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'CLEAR_SESSION' },
        ],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from authenticated state
 * Pure function
 */
function handleAuthenticatedTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'DISCONNECT':
      return {
        newState: {
          state: 'disconnecting',
          context: currentState.context,
          previousState: 'authenticated',
        },
        actions: [
          { type: 'START_TIMEOUT', duration: 10000 },
          { type: 'LOG', message: 'Disconnecting...', level: 'info' },
        ],
      };

    case 'RESET':
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CLEAR_SESSION' },
          { type: 'NOTIFY_DISCONNECTED' },
        ],
      };

    case 'ERROR':
      return {
        newState: {
          state: 'error',
          context: {
            ...currentState.context,
            error: event.error,
          },
          previousState: 'authenticated',
        },
        actions: [
          { type: 'CLEAR_SESSION' },
          { type: 'NOTIFY_ERROR', error: event.error },
        ],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from error state
 * Pure function
 */
function handleErrorTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'CONNECT':
      return {
        newState: {
          state: 'connecting',
          context: {
            ...createInitialContext(),
            address: event.address || null,
            timestamp: Date.now(),
            attemptCount: currentState.context.attemptCount + 1,
          },
          previousState: 'error',
        },
        actions: [
          { type: 'START_TIMEOUT', duration: 30000 },
          { type: 'LOG', message: 'Retrying connection...', level: 'info' },
        ],
      };

    case 'RESET':
    case 'DISCONNECT':
      return {
        newState: createInitialState(),
        actions: [{ type: 'CLEAR_SESSION' }],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Handle transitions from disconnecting state
 * Pure function
 */
function handleDisconnectingTransition(
  currentState: AuthStateData,
  event: AuthEvent
): TransitionResult {
  switch (event.type) {
    case 'DISCONNECTED':
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'CLEAR_SESSION' },
          { type: 'NOTIFY_DISCONNECTED' },
        ],
      };

    case 'ERROR':
      // Even on error during disconnect, we should reset
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'CLEAR_SESSION' },
          { type: 'LOG', message: `Disconnect error: ${event.error}`, level: 'warn' },
        ],
      };

    case 'TIMEOUT':
      // Force disconnect on timeout
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CLEAR_SESSION' },
          { type: 'NOTIFY_DISCONNECTED' },
        ],
      };

    case 'RESET':
      return {
        newState: createInitialState(),
        actions: [
          { type: 'CANCEL_TIMEOUT' },
          { type: 'CLEAR_SESSION' },
        ],
      };

    default:
      return { newState: currentState, actions: [] };
  }
}

/**
 * Get human-readable state description
 * Pure function
 */
export function getStateDescription(state: AuthState): string {
  const descriptions: Record<AuthState, string> = {
    idle: 'Ready to connect',
    connecting: 'Connecting to wallet...',
    signing: 'Please sign the message...',
    verifying: 'Verifying signature...',
    authenticated: 'Connected',
    error: 'Connection error',
    disconnecting: 'Disconnecting...',
  };
  return descriptions[state];
}

/**
 * Check if state is a terminal state (cannot transition without reset)
 * Pure function
 */
export function isTerminalState(state: AuthState): boolean {
  return state === 'authenticated' || state === 'error';
}

/**
 * Check if state represents an active connection
 * Pure function
 */
export function isConnected(state: AuthState): boolean {
  return state === 'authenticated';
}

/**
 * Check if state is a loading/pending state
 * Pure function
 */
export function isPendingState(state: AuthState): boolean {
  return ['connecting', 'signing', 'verifying', 'disconnecting'].includes(state);
}
