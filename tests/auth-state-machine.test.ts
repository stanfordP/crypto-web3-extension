/**
 * Tests for AuthStateMachine
 * 
 * Tests the pure state machine logic for authentication flow.
 */

import {
  createInitialState,
  createInitialContext,
  transition,
  isValidTransition,
  getStateDescription,
  isTerminalState,
  isConnected,
  isPendingState,
  type AuthEvent,
  type AuthState,
} from '../src/scripts/core/auth/AuthStateMachine';

describe('AuthStateMachine', () => {
  describe('createInitialState', () => {
    it('should create initial state with idle state', () => {
      const state = createInitialState();
      expect(state.state).toBe('idle');
      expect(state.previousState).toBeNull();
    });

    it('should create initial context with null values', () => {
      const state = createInitialState();
      expect(state.context.address).toBeNull();
      expect(state.context.chainId).toBeNull();
      expect(state.context.signature).toBeNull();
      expect(state.context.sessionToken).toBeNull();
      expect(state.context.error).toBeNull();
      expect(state.context.attemptCount).toBe(0);
    });
  });

  describe('isValidTransition', () => {
    it('should allow CONNECT from idle', () => {
      expect(isValidTransition('idle', { type: 'CONNECT' })).toBe(true);
    });

    it('should allow CONNECTED from connecting', () => {
      expect(isValidTransition('connecting', { type: 'CONNECTED', address: '0x123', chainId: '0x1' })).toBe(true);
    });

    it('should not allow CONNECTED from idle', () => {
      expect(isValidTransition('idle', { type: 'CONNECTED', address: '0x123', chainId: '0x1' })).toBe(false);
    });

    it('should allow ERROR from any non-idle state', () => {
      expect(isValidTransition('connecting', { type: 'ERROR', error: 'test' })).toBe(true);
      expect(isValidTransition('signing', { type: 'ERROR', error: 'test' })).toBe(true);
      expect(isValidTransition('authenticated', { type: 'ERROR', error: 'test' })).toBe(true);
    });

    it('should allow DISCONNECT from authenticated', () => {
      expect(isValidTransition('authenticated', { type: 'DISCONNECT' })).toBe(true);
    });

    it('should allow RESET from any state', () => {
      const states: AuthState[] = ['idle', 'connecting', 'signing', 'verifying', 'authenticated', 'error', 'disconnecting'];
      states.forEach((state) => {
        expect(isValidTransition(state, { type: 'RESET' })).toBe(true);
      });
    });
  });

  describe('transition - idle state', () => {
    it('should transition to connecting on CONNECT', () => {
      const state = createInitialState();
      const result = transition(state, { type: 'CONNECT' });

      expect(result.newState.state).toBe('connecting');
      expect(result.newState.previousState).toBe('idle');
      expect(result.newState.context.attemptCount).toBe(1);
    });

    it('should transition to connecting with address on CONNECT with address', () => {
      const state = createInitialState();
      const result = transition(state, { type: 'CONNECT', address: '0x1234567890123456789012345678901234567890' });

      expect(result.newState.state).toBe('connecting');
      expect(result.newState.context.address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should reset on RESET from idle', () => {
      const state = createInitialState();
      const result = transition(state, { type: 'RESET' });

      expect(result.newState.state).toBe('idle');
      expect(result.actions).toContainEqual({ type: 'CLEAR_SESSION' });
    });

    it('should not transition on invalid event', () => {
      const state = createInitialState();
      const result = transition(state, { type: 'CONNECTED', address: '0x123', chainId: '0x1' });

      expect(result.newState.state).toBe('idle');
      expect(result.actions).toContainEqual(
        expect.objectContaining({ type: 'LOG', level: 'warn' })
      );
    });
  });

  describe('transition - connecting state', () => {
    const connectingState = () => {
      const initial = createInitialState();
      return transition(initial, { type: 'CONNECT' }).newState;
    };

    it('should transition to signing on CONNECTED', () => {
      const state = connectingState();
      const result = transition(state, { 
        type: 'CONNECTED', 
        address: '0x1234567890123456789012345678901234567890', 
        chainId: '0x1' 
      });

      expect(result.newState.state).toBe('signing');
      expect(result.newState.context.address).toBe('0x1234567890123456789012345678901234567890');
      expect(result.newState.context.chainId).toBe('0x1');
      expect(result.actions).toContainEqual({ type: 'CANCEL_TIMEOUT' });
    });

    it('should transition to error on ERROR', () => {
      const state = connectingState();
      const result = transition(state, { type: 'ERROR', error: 'Connection failed' });

      expect(result.newState.state).toBe('error');
      expect(result.newState.context.error).toBe('Connection failed');
      expect(result.actions).toContainEqual({ type: 'NOTIFY_ERROR', error: 'Connection failed' });
    });

    it('should transition to error on TIMEOUT', () => {
      const state = connectingState();
      const result = transition(state, { type: 'TIMEOUT' });

      expect(result.newState.state).toBe('error');
      expect(result.newState.context.error).toBe('Connection timeout');
    });

    it('should reset on DISCONNECT', () => {
      const state = connectingState();
      const result = transition(state, { type: 'DISCONNECT' });

      expect(result.newState.state).toBe('idle');
      expect(result.actions).toContainEqual({ type: 'CLEAR_SESSION' });
    });
  });

  describe('transition - signing state', () => {
    const signingState = () => {
      let state = createInitialState();
      state = transition(state, { type: 'CONNECT' }).newState;
      state = transition(state, { 
        type: 'CONNECTED', 
        address: '0x1234567890123456789012345678901234567890', 
        chainId: '0x1' 
      }).newState;
      return state;
    };

    it('should transition to verifying on SIGNATURE_RECEIVED', () => {
      const state = signingState();
      const result = transition(state, { type: 'SIGNATURE_RECEIVED', signature: '0xsig123' });

      expect(result.newState.state).toBe('verifying');
      expect(result.newState.context.signature).toBe('0xsig123');
    });

    it('should transition to error on ERROR', () => {
      const state = signingState();
      const result = transition(state, { type: 'ERROR', error: 'User rejected' });

      expect(result.newState.state).toBe('error');
      expect(result.newState.context.error).toBe('User rejected');
    });

    it('should transition to error on TIMEOUT', () => {
      const state = signingState();
      const result = transition(state, { type: 'TIMEOUT' });

      expect(result.newState.state).toBe('error');
      expect(result.newState.context.error).toBe('Signature timeout');
    });
  });

  describe('transition - verifying state', () => {
    const verifyingState = () => {
      let state = createInitialState();
      state = transition(state, { type: 'CONNECT' }).newState;
      state = transition(state, { 
        type: 'CONNECTED', 
        address: '0x1234567890123456789012345678901234567890', 
        chainId: '0x1' 
      }).newState;
      state = transition(state, { type: 'SIGNATURE_RECEIVED', signature: '0xsig' }).newState;
      return state;
    };

    it('should transition to authenticated on VERIFICATION_SUCCESS', () => {
      const state = verifyingState();
      const result = transition(state, { type: 'VERIFICATION_SUCCESS', sessionToken: 'token123' });

      expect(result.newState.state).toBe('authenticated');
      expect(result.newState.context.sessionToken).toBe('token123');
      expect(result.actions).toContainEqual({ type: 'SAVE_SESSION' });
      expect(result.actions).toContainEqual({ type: 'NOTIFY_CONNECTED' });
    });

    it('should transition to error on VERIFICATION_FAILED', () => {
      const state = verifyingState();
      const result = transition(state, { type: 'VERIFICATION_FAILED', error: 'Invalid signature' });

      expect(result.newState.state).toBe('error');
      expect(result.newState.context.error).toBe('Invalid signature');
      expect(result.actions).toContainEqual({ type: 'NOTIFY_ERROR', error: 'Invalid signature' });
    });
  });

  describe('transition - authenticated state', () => {
    const authenticatedState = () => {
      let state = createInitialState();
      state = transition(state, { type: 'CONNECT' }).newState;
      state = transition(state, { 
        type: 'CONNECTED', 
        address: '0x1234567890123456789012345678901234567890', 
        chainId: '0x1' 
      }).newState;
      state = transition(state, { type: 'SIGNATURE_RECEIVED', signature: '0xsig' }).newState;
      state = transition(state, { type: 'VERIFICATION_SUCCESS' }).newState;
      return state;
    };

    it('should transition to disconnecting on DISCONNECT', () => {
      const state = authenticatedState();
      const result = transition(state, { type: 'DISCONNECT' });

      expect(result.newState.state).toBe('disconnecting');
      expect(result.actions).toContainEqual({ type: 'START_TIMEOUT', duration: 10000 });
    });

    it('should reset on RESET', () => {
      const state = authenticatedState();
      const result = transition(state, { type: 'RESET' });

      expect(result.newState.state).toBe('idle');
      expect(result.actions).toContainEqual({ type: 'CLEAR_SESSION' });
      expect(result.actions).toContainEqual({ type: 'NOTIFY_DISCONNECTED' });
    });

    it('should transition to error on ERROR', () => {
      const state = authenticatedState();
      const result = transition(state, { type: 'ERROR', error: 'Session expired' });

      expect(result.newState.state).toBe('error');
      expect(result.actions).toContainEqual({ type: 'CLEAR_SESSION' });
    });
  });

  describe('transition - error state', () => {
    const errorState = () => {
      let state = createInitialState();
      state = transition(state, { type: 'CONNECT' }).newState;
      state = transition(state, { type: 'ERROR', error: 'Test error' }).newState;
      return state;
    };

    it('should transition to connecting on CONNECT (retry)', () => {
      const state = errorState();
      expect(state.context.attemptCount).toBe(1);

      const result = transition(state, { type: 'CONNECT' });

      expect(result.newState.state).toBe('connecting');
      expect(result.newState.context.attemptCount).toBe(2);
      expect(result.newState.context.error).toBeNull();
    });

    it('should reset on RESET', () => {
      const state = errorState();
      const result = transition(state, { type: 'RESET' });

      expect(result.newState.state).toBe('idle');
    });

    it('should reset on DISCONNECT', () => {
      const state = errorState();
      const result = transition(state, { type: 'DISCONNECT' });

      expect(result.newState.state).toBe('idle');
    });
  });

  describe('transition - disconnecting state', () => {
    const disconnectingState = () => {
      let state = createInitialState();
      state = transition(state, { type: 'CONNECT' }).newState;
      state = transition(state, { 
        type: 'CONNECTED', 
        address: '0x1234567890123456789012345678901234567890', 
        chainId: '0x1' 
      }).newState;
      state = transition(state, { type: 'SIGNATURE_RECEIVED', signature: '0xsig' }).newState;
      state = transition(state, { type: 'VERIFICATION_SUCCESS' }).newState;
      state = transition(state, { type: 'DISCONNECT' }).newState;
      return state;
    };

    it('should transition to idle on DISCONNECTED', () => {
      const state = disconnectingState();
      const result = transition(state, { type: 'DISCONNECTED' });

      expect(result.newState.state).toBe('idle');
      expect(result.actions).toContainEqual({ type: 'CLEAR_SESSION' });
      expect(result.actions).toContainEqual({ type: 'NOTIFY_DISCONNECTED' });
    });

    it('should transition to idle on TIMEOUT', () => {
      const state = disconnectingState();
      const result = transition(state, { type: 'TIMEOUT' });

      expect(result.newState.state).toBe('idle');
    });

    it('should transition to idle on ERROR (graceful)', () => {
      const state = disconnectingState();
      const result = transition(state, { type: 'ERROR', error: 'Disconnect failed' });

      expect(result.newState.state).toBe('idle');
      expect(result.actions).toContainEqual({ type: 'CLEAR_SESSION' });
    });
  });

  describe('helper functions', () => {
    describe('getStateDescription', () => {
      it('should return correct descriptions', () => {
        expect(getStateDescription('idle')).toBe('Ready to connect');
        expect(getStateDescription('connecting')).toBe('Connecting to wallet...');
        expect(getStateDescription('signing')).toBe('Please sign the message...');
        expect(getStateDescription('verifying')).toBe('Verifying signature...');
        expect(getStateDescription('authenticated')).toBe('Connected');
        expect(getStateDescription('error')).toBe('Connection error');
        expect(getStateDescription('disconnecting')).toBe('Disconnecting...');
      });
    });

    describe('isTerminalState', () => {
      it('should identify terminal states', () => {
        expect(isTerminalState('authenticated')).toBe(true);
        expect(isTerminalState('error')).toBe(true);
      });

      it('should identify non-terminal states', () => {
        expect(isTerminalState('idle')).toBe(false);
        expect(isTerminalState('connecting')).toBe(false);
        expect(isTerminalState('signing')).toBe(false);
        expect(isTerminalState('verifying')).toBe(false);
        expect(isTerminalState('disconnecting')).toBe(false);
      });
    });

    describe('isConnected', () => {
      it('should identify authenticated as connected', () => {
        expect(isConnected('authenticated')).toBe(true);
      });

      it('should identify other states as not connected', () => {
        expect(isConnected('idle')).toBe(false);
        expect(isConnected('connecting')).toBe(false);
        expect(isConnected('error')).toBe(false);
      });
    });

    describe('isPendingState', () => {
      it('should identify pending states', () => {
        expect(isPendingState('connecting')).toBe(true);
        expect(isPendingState('signing')).toBe(true);
        expect(isPendingState('verifying')).toBe(true);
        expect(isPendingState('disconnecting')).toBe(true);
      });

      it('should identify non-pending states', () => {
        expect(isPendingState('idle')).toBe(false);
        expect(isPendingState('authenticated')).toBe(false);
        expect(isPendingState('error')).toBe(false);
      });
    });
  });
});
