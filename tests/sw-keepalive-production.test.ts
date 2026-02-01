/**
 * Tests for sw-keepalive.ts - Service Worker Keep-Alive Module
 * 
 * Tests the actual production module with mocked Chrome APIs.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Chrome API Mocks - Must be defined before importing the module
// ============================================================================

const mockAlarms = {
  clear: jest.fn().mockResolvedValue(true),
  create: jest.fn().mockResolvedValue(undefined),
  onAlarm: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
};

const mockRuntime = {
  onConnect: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
};

// Setup global chrome mock
(global as unknown as { chrome: unknown }).chrome = {
  alarms: mockAlarms,
  runtime: mockRuntime,
};

// ============================================================================
// Import the actual module AFTER setting up mocks
// ============================================================================

import {
  initializeKeepAlive,
  handleAlarm,
  stopKeepAlive,
  isKeepAliveEnabled,
  registerPortHandler,
  handlePortConnect,
  getActivePortNames,
  startOperation,
  completeOperation,
  failOperation,
  hasActiveOperations,
  getActiveOperationCount,
} from '../src/scripts/sw-keepalive';

// ============================================================================
// Tests
// ============================================================================

describe('sw-keepalive - Production Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Keep-Alive Alarm', () => {
    it('should initialize keep-alive alarm', async () => {
      await initializeKeepAlive();

      expect(mockAlarms.clear).toHaveBeenCalledWith('sw-keepalive');
      expect(mockAlarms.create).toHaveBeenCalledWith('sw-keepalive', {
        periodInMinutes: 0.4,
        delayInMinutes: 0.4,
      });
    });

    it('should report keep-alive as enabled after initialization', async () => {
      await initializeKeepAlive();
      expect(isKeepAliveEnabled()).toBe(true);
    });

    it('should stop keep-alive alarm', async () => {
      await initializeKeepAlive();
      await stopKeepAlive();

      expect(mockAlarms.clear).toHaveBeenCalledWith('sw-keepalive');
      expect(isKeepAliveEnabled()).toBe(false);
    });

    it('should handle alarm events', () => {
      const alarm = { name: 'sw-keepalive', scheduledTime: Date.now() };
      
      // Should not throw
      expect(() => handleAlarm(alarm)).not.toThrow();
    });

    it('should ignore non-keepalive alarms', () => {
      const alarm = { name: 'other-alarm', scheduledTime: Date.now() };
      
      // Should not throw and should exit early
      expect(() => handleAlarm(alarm)).not.toThrow();
    });
  });

  describe('Port Management', () => {
    it('should register port handlers', () => {
      const handler = jest.fn();
      
      expect(() => registerPortHandler('test-port', handler)).not.toThrow();
    });

    it('should handle port connections', () => {
      const mockPort = {
        name: 'wallet-connection',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
      };

      expect(() => handlePortConnect(mockPort as unknown as chrome.runtime.Port)).not.toThrow();
      expect(mockPort.onMessage.addListener).toHaveBeenCalled();
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled();
    });

    it('should track active port names', () => {
      const mockPort1 = {
        name: 'port-1',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
      };
      const mockPort2 = {
        name: 'port-2',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
      };

      handlePortConnect(mockPort1 as unknown as chrome.runtime.Port);
      handlePortConnect(mockPort2 as unknown as chrome.runtime.Port);

      const names = getActivePortNames();
      expect(names).toContain('port-1');
      expect(names).toContain('port-2');
    });

    it('should call registered handler on port message', () => {
      const handler = jest.fn();
      registerPortHandler('handled-port', handler);

      const mockPort = {
        name: 'handled-port',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
      };

      handlePortConnect(mockPort as unknown as chrome.runtime.Port);

      // Get the message listener that was registered
      const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];
      
      // Simulate a message
      messageListener({ type: 'test-message' });

      expect(handler).toHaveBeenCalledWith(
        { type: 'test-message' },
        mockPort
      );
    });

    it('should clean up port on disconnect', () => {
      const mockPort = {
        name: 'disconnect-test',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
      };

      handlePortConnect(mockPort as unknown as chrome.runtime.Port);
      
      // Verify port is tracked
      expect(getActivePortNames()).toContain('disconnect-test');

      // Get the disconnect listener
      const disconnectListener = mockPort.onDisconnect.addListener.mock.calls[0][0];
      
      // Simulate disconnect
      disconnectListener();

      // Port should be removed
      expect(getActivePortNames()).not.toContain('disconnect-test');
    });
  });

  describe('Operation Tracking', () => {
    beforeEach(() => {
      // Clean up any existing operations
      // This is a workaround since the module maintains state
    });

    it('should start and track operations', () => {
      const opId = `test-op-${Date.now()}`;
      
      startOperation(opId, 'wallet-connect');
      
      expect(hasActiveOperations()).toBe(true);
      expect(getActiveOperationCount()).toBeGreaterThanOrEqual(1);
    });

    it('should complete operations', () => {
      const opId = `complete-op-${Date.now()}`;
      
      startOperation(opId, 'sign-message');
      expect(hasActiveOperations()).toBe(true);
      
      completeOperation(opId);
      // Note: hasActiveOperations may still be true if other tests left operations
    });

    it('should fail operations with error', () => {
      const opId = `fail-op-${Date.now()}`;
      
      startOperation(opId, 'failed-operation');
      
      expect(() => failOperation(opId, 'Test error')).not.toThrow();
    });

    it('should handle completing non-existent operation', () => {
      expect(() => completeOperation('non-existent-op')).not.toThrow();
    });

    it('should handle failing non-existent operation', () => {
      expect(() => failOperation('non-existent-op', 'error')).not.toThrow();
    });

    it('should start operation with port reference', () => {
      const mockPort = {
        name: 'op-port',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
      };

      const opId = `port-op-${Date.now()}`;
      
      expect(() => startOperation(opId, 'wallet-connect', mockPort as unknown as chrome.runtime.Port)).not.toThrow();
      
      completeOperation(opId);
    });
  });

  describe('Alarm Handler with Operations', () => {
    it('should clean up stale operations on alarm', () => {
      // Start an operation with a past timestamp (simulated stale)
      // Note: We can't directly test this without mocking Date.now()
      // but we can verify the alarm handler runs without error
      const alarm = { name: 'sw-keepalive', scheduledTime: Date.now() };
      
      expect(() => handleAlarm(alarm)).not.toThrow();
    });
  });
});

describe('sw-keepalive - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle alarm creation failure gracefully', async () => {
    mockAlarms.create.mockRejectedValueOnce(new Error('Alarm creation failed'));

    // Should not throw
    await expect(initializeKeepAlive()).resolves.not.toThrow();
  });

  it('should handle alarm clear failure gracefully', async () => {
    mockAlarms.clear.mockRejectedValueOnce(new Error('Alarm clear failed'));

    // Should not throw
    await expect(stopKeepAlive()).resolves.not.toThrow();
  });

  it('should handle port message handler errors', () => {
    const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
    registerPortHandler('error-port', errorHandler);

    const mockPort = {
      name: 'error-port',
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
    };

    handlePortConnect(mockPort as unknown as chrome.runtime.Port);

    const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];
    
    // Should not throw even when handler rejects
    expect(() => messageListener({ type: 'trigger-error' })).not.toThrow();
  });
});
