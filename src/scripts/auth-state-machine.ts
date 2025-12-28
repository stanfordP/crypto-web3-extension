/**
 * Resumable Authentication State Machine
 *
 * Implements a state machine for the SIWE authentication flow that can
 * survive service worker restarts. Each step is persisted to storage,
 * allowing the flow to resume from where it left off.
 *
 * Flow Steps:
 * 1. IDLE -> REQUESTING_ACCOUNTS
 * 2. REQUESTING_ACCOUNTS -> ACCOUNTS_RECEIVED
 * 3. ACCOUNTS_RECEIVED -> GETTING_CHALLENGE
 * 4. GETTING_CHALLENGE -> CHALLENGE_RECEIVED
 * 5. CHALLENGE_RECEIVED -> SIGNING_MESSAGE
 * 6. SIGNING_MESSAGE -> MESSAGE_SIGNED
 * 7. MESSAGE_SIGNED -> VERIFYING_SIGNATURE
 * 8. VERIFYING_SIGNATURE -> AUTHENTICATED
 * 9. AUTHENTICATED -> IDLE (cleanup)
 *
 * Error states can occur at any step and trigger cleanup.
 */

import { backgroundLogger as logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export enum AuthState {
  IDLE = 'IDLE',
  REQUESTING_ACCOUNTS = 'REQUESTING_ACCOUNTS',
  ACCOUNTS_RECEIVED = 'ACCOUNTS_RECEIVED',
  GETTING_CHALLENGE = 'GETTING_CHALLENGE',
  CHALLENGE_RECEIVED = 'CHALLENGE_RECEIVED',
  SIGNING_MESSAGE = 'SIGNING_MESSAGE',
  MESSAGE_SIGNED = 'MESSAGE_SIGNED',
  VERIFYING_SIGNATURE = 'VERIFYING_SIGNATURE',
  AUTHENTICATED = 'AUTHENTICATED',
  ERROR = 'ERROR',
}

export interface AuthFlowData {
  /** Current state in the auth flow */
  state: AuthState;

  /** Unique ID for this auth flow instance */
  flowId: string;

  /** Timestamp when flow started */
  startedAt: number;

  /** Timestamp of last state change */
  lastUpdatedAt: number;

  /** Account mode (demo or live) */
  accountMode: 'demo' | 'live';

  /** Connected wallet accounts */
  accounts?: string[];

  /** Primary address being authenticated */
  address?: string;

  /** Current chain ID */
  chainId?: string;

  /** Chain ID as number */
  chainIdNumber?: number;

  /** SIWE challenge message from backend */
  challengeMessage?: string;

  /** Nonce from challenge */
  nonce?: string;

  /** Prepared message for signing */
  messageToSign?: string;

  /** Signature from wallet */
  signature?: string;

  /** Session token from verification */
  sessionToken?: string;

  /** Error message if failed */
  error?: string;

  /** Number of retry attempts */
  retryCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const AUTH_FLOW_STORAGE_KEY = 'authFlowState';
const MAX_FLOW_AGE_MS = 10 * 60 * 1000; // 10 minutes max for auth flow
const MAX_RETRIES = 3;

// ============================================================================
// State Management
// ============================================================================

/**
 * Get current auth flow state from storage
 */
export async function getAuthFlowState(): Promise<AuthFlowData | null> {
  try {
    const result = await chrome.storage.session.get(AUTH_FLOW_STORAGE_KEY);
    const data = result[AUTH_FLOW_STORAGE_KEY] as AuthFlowData | undefined;

    if (!data) return null;

    // Check if flow is too old
    if (Date.now() - data.startedAt > MAX_FLOW_AGE_MS) {
      logger.warn('Auth flow expired', {
        flowId: data.flowId,
        ageMs: Date.now() - data.startedAt
      });
      await clearAuthFlowState();
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Failed to get auth flow state', { error: String(error) });
    return null;
  }
}

/**
 * Save auth flow state to storage
 */
export async function saveAuthFlowState(data: Partial<AuthFlowData>): Promise<void> {
  try {
    const existing = await getAuthFlowState();
    const newState: AuthFlowData = {
      ...existing,
      ...data,
      lastUpdatedAt: Date.now(),
    } as AuthFlowData;

    await chrome.storage.session.set({ [AUTH_FLOW_STORAGE_KEY]: newState });
    logger.debug('Auth flow state saved', { state: newState.state, flowId: newState.flowId });
  } catch (error) {
    logger.error('Failed to save auth flow state', { error: String(error) });
  }
}

/**
 * Clear auth flow state
 */
export async function clearAuthFlowState(): Promise<void> {
  try {
    await chrome.storage.session.remove(AUTH_FLOW_STORAGE_KEY);
    logger.debug('Auth flow state cleared');
  } catch (error) {
    logger.error('Failed to clear auth flow state', { error: String(error) });
  }
}

/**
 * Check if there's an active auth flow
 */
export async function hasActiveAuthFlow(): Promise<boolean> {
  const state = await getAuthFlowState();
  return state !== null && state.state !== AuthState.IDLE && state.state !== AuthState.ERROR;
}

// ============================================================================
// State Transitions
// ============================================================================

/**
 * Start a new auth flow
 */
export async function startAuthFlow(accountMode: 'demo' | 'live'): Promise<AuthFlowData> {
  // Check for existing flow
  const existing = await getAuthFlowState();
  if (existing && existing.state !== AuthState.IDLE && existing.state !== AuthState.ERROR) {
    logger.info('Resuming existing auth flow', {
      flowId: existing.flowId,
      currentState: existing.state
    });
    return existing;
  }

  const flowId = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newFlow: AuthFlowData = {
    state: AuthState.IDLE,
    flowId,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    accountMode,
    retryCount: 0,
  };

  await saveAuthFlowState(newFlow);
  logger.info('New auth flow started', { flowId, accountMode });

  return newFlow;
}

/**
 * Transition to next state
 */
export async function transitionTo(
  nextState: AuthState,
  data?: Partial<AuthFlowData>
): Promise<AuthFlowData> {
  const current = await getAuthFlowState();
  if (!current) {
    throw new Error('No active auth flow to transition');
  }

  // Validate transition
  if (!isValidTransition(current.state, nextState)) {
    logger.warn('Invalid state transition attempted', {
      from: current.state,
      to: nextState
    });
    throw new Error(`Invalid transition from ${current.state} to ${nextState}`);
  }

  const updated: AuthFlowData = {
    ...current,
    ...data,
    state: nextState,
    lastUpdatedAt: Date.now(),
  };

  await saveAuthFlowState(updated);
  logger.debug('Auth flow transitioned', {
    flowId: updated.flowId,
    from: current.state,
    to: nextState
  });

  return updated;
}

/**
 * Transition to error state
 */
export async function transitionToError(error: string): Promise<AuthFlowData> {
  const current = await getAuthFlowState();
  if (!current) {
    // Create minimal error state if no flow exists
    const errorFlow: AuthFlowData = {
      state: AuthState.ERROR,
      flowId: 'error_' + Date.now(),
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      accountMode: 'live',
      error,
      retryCount: 0,
    };
    await saveAuthFlowState(errorFlow);
    return errorFlow;
  }

  const updated: AuthFlowData = {
    ...current,
    state: AuthState.ERROR,
    error,
    lastUpdatedAt: Date.now(),
  };

  await saveAuthFlowState(updated);
  logger.error('Auth flow error', {
    flowId: updated.flowId,
    previousState: current.state,
    error
  });

  return updated;
}

/**
 * Check if a state transition is valid
 */
function isValidTransition(from: AuthState, to: AuthState): boolean {
  // Error can be reached from any state
  if (to === AuthState.ERROR) return true;

  // IDLE can be reached from AUTHENTICATED or ERROR (reset)
  if (to === AuthState.IDLE) {
    return from === AuthState.AUTHENTICATED || from === AuthState.ERROR;
  }

  const validTransitions: Record<AuthState, AuthState[]> = {
    [AuthState.IDLE]: [AuthState.REQUESTING_ACCOUNTS],
    [AuthState.REQUESTING_ACCOUNTS]: [AuthState.ACCOUNTS_RECEIVED],
    [AuthState.ACCOUNTS_RECEIVED]: [AuthState.GETTING_CHALLENGE],
    [AuthState.GETTING_CHALLENGE]: [AuthState.CHALLENGE_RECEIVED],
    [AuthState.CHALLENGE_RECEIVED]: [AuthState.SIGNING_MESSAGE],
    [AuthState.SIGNING_MESSAGE]: [AuthState.MESSAGE_SIGNED],
    [AuthState.MESSAGE_SIGNED]: [AuthState.VERIFYING_SIGNATURE],
    [AuthState.VERIFYING_SIGNATURE]: [AuthState.AUTHENTICATED],
    [AuthState.AUTHENTICATED]: [AuthState.IDLE],
    [AuthState.ERROR]: [AuthState.IDLE, AuthState.REQUESTING_ACCOUNTS], // Allow retry
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Check if retry is allowed
 */
export async function canRetry(): Promise<boolean> {
  const state = await getAuthFlowState();
  if (!state) return true; // No state means fresh start
  return state.retryCount < MAX_RETRIES;
}

/**
 * Increment retry count
 */
export async function incrementRetryCount(): Promise<number> {
  const state = await getAuthFlowState();
  if (!state) return 0;

  const newCount = state.retryCount + 1;
  await saveAuthFlowState({ retryCount: newCount });
  return newCount;
}

/**
 * Reset retry count
 */
export async function resetRetryCount(): Promise<void> {
  await saveAuthFlowState({ retryCount: 0 });
}

// ============================================================================
// Flow Resumption
// ============================================================================

/**
 * Get the step to resume from after a service worker restart
 */
export async function getResumePoint(): Promise<{
  canResume: boolean;
  state: AuthState;
  flowData: AuthFlowData | null;
}> {
  const flowData = await getAuthFlowState();

  if (!flowData) {
    return { canResume: false, state: AuthState.IDLE, flowData: null };
  }

  // Can only resume from certain states
  const resumableStates = [
    AuthState.ACCOUNTS_RECEIVED,
    AuthState.CHALLENGE_RECEIVED,
    AuthState.MESSAGE_SIGNED,
  ];

  if (resumableStates.includes(flowData.state)) {
    logger.info('Auth flow can be resumed', {
      flowId: flowData.flowId,
      fromState: flowData.state
    });
    return { canResume: true, state: flowData.state, flowData };
  }

  // For non-resumable states (e.g., in the middle of wallet interaction),
  // we need to start over from a safe point
  if (flowData.state === AuthState.REQUESTING_ACCOUNTS ||
      flowData.state === AuthState.SIGNING_MESSAGE ||
      flowData.state === AuthState.VERIFYING_SIGNATURE) {
    logger.warn('Auth flow interrupted in non-resumable state, will retry step', {
      flowId: flowData.flowId,
      interruptedState: flowData.state
    });

    // Go back to the previous stable state
    const safeState = getPreviousSafeState(flowData.state);
    await saveAuthFlowState({ state: safeState });
    return { canResume: true, state: safeState, flowData: { ...flowData, state: safeState } };
  }

  return { canResume: false, state: flowData.state, flowData };
}

/**
 * Get previous safe state to resume from
 */
function getPreviousSafeState(currentState: AuthState): AuthState {
  const safeStateMap: Record<AuthState, AuthState> = {
    [AuthState.IDLE]: AuthState.IDLE,
    [AuthState.REQUESTING_ACCOUNTS]: AuthState.IDLE,
    [AuthState.ACCOUNTS_RECEIVED]: AuthState.ACCOUNTS_RECEIVED,
    [AuthState.GETTING_CHALLENGE]: AuthState.ACCOUNTS_RECEIVED,
    [AuthState.CHALLENGE_RECEIVED]: AuthState.CHALLENGE_RECEIVED,
    [AuthState.SIGNING_MESSAGE]: AuthState.CHALLENGE_RECEIVED,
    [AuthState.MESSAGE_SIGNED]: AuthState.MESSAGE_SIGNED,
    [AuthState.VERIFYING_SIGNATURE]: AuthState.MESSAGE_SIGNED,
    [AuthState.AUTHENTICATED]: AuthState.AUTHENTICATED,
    [AuthState.ERROR]: AuthState.IDLE,
  };

  return safeStateMap[currentState] || AuthState.IDLE;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Complete the auth flow successfully
 */
export async function completeAuthFlow(): Promise<void> {
  const state = await getAuthFlowState();
  if (state) {
    logger.info('Auth flow completed successfully', {
      flowId: state.flowId,
      durationMs: Date.now() - state.startedAt
    });
  }
  await clearAuthFlowState();
}

/**
 * Abort the auth flow
 */
export async function abortAuthFlow(reason: string): Promise<void> {
  const state = await getAuthFlowState();
  if (state) {
    logger.warn('Auth flow aborted', {
      flowId: state.flowId,
      lastState: state.state,
      reason
    });
  }
  await clearAuthFlowState();
}

// ============================================================================
// Exports
// ============================================================================

export const AuthStateMachine = {
  getState: getAuthFlowState,
  saveState: saveAuthFlowState,
  clearState: clearAuthFlowState,
  hasActiveFlow: hasActiveAuthFlow,
  startFlow: startAuthFlow,
  transitionTo,
  transitionToError,
  canRetry,
  incrementRetryCount,
  resetRetryCount,
  getResumePoint,
  completeFlow: completeAuthFlow,
  abortFlow: abortAuthFlow,
};
