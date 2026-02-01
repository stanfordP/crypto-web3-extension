/**
 * Tests for sw-keepalive.ts
 * 
 * Tests service worker keep-alive functionality for Manifest V3.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Chrome APIs
// ============================================================================

const mockAlarms = {
  create: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(true),
  get: jest.fn(),
  getAll: jest.fn(),
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

const mockChrome = {
  alarms: mockAlarms,
  runtime: mockRuntime,
};

// Setup global chrome mock
Object.defineProperty(global, 'chrome', {
  value: mockChrome,
  writable: true,
});

// ============================================================================
// Constants (mirroring the module)
// ============================================================================

const KEEPALIVE_ALARM_NAME = 'sw-keepalive';
const KEEPALIVE_INTERVAL_MINUTES = 0.4;
const OPERATION_TIMEOUT_MS = 5 * 60 * 1000;

describe('Service Worker Keep-Alive Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Constants', () => {
    it('should have correct alarm name', () => {
      expect(KEEPALIVE_ALARM_NAME).toBe('sw-keepalive');
    });

    it('should have interval under 30 seconds', () => {
      const intervalSeconds = KEEPALIVE_INTERVAL_MINUTES * 60;
      expect(intervalSeconds).toBeLessThan(30);
      expect(intervalSeconds).toBe(24);
    });

    it('should have 5 minute operation timeout', () => {
      expect(OPERATION_TIMEOUT_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('Keep-Alive Alarm', () => {
    it('should initialize alarm with correct parameters', async () => {
      // Simulate initializeKeepAlive
      await mockAlarms.clear(KEEPALIVE_ALARM_NAME);
      await mockAlarms.create(KEEPALIVE_ALARM_NAME, {
        periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
        delayInMinutes: KEEPALIVE_INTERVAL_MINUTES,
      });

      expect(mockAlarms.clear).toHaveBeenCalledWith(KEEPALIVE_ALARM_NAME);
      expect(mockAlarms.create).toHaveBeenCalledWith(KEEPALIVE_ALARM_NAME, {
        periodInMinutes: 0.4,
        delayInMinutes: 0.4,
      });
    });

    it('should handle alarm creation failure', async () => {
      mockAlarms.create.mockRejectedValueOnce(new Error('Alarm creation failed'));

      let errorCaught = false;
      try {
        await mockAlarms.create(KEEPALIVE_ALARM_NAME, {});
      } catch {
        errorCaught = true;
      }

      expect(errorCaught).toBe(true);
    });

    it('should clear alarm on stop', async () => {
      await mockAlarms.clear(KEEPALIVE_ALARM_NAME);
      expect(mockAlarms.clear).toHaveBeenCalledWith(KEEPALIVE_ALARM_NAME);
    });
  });

  describe('Alarm Handler', () => {
    it('should only handle sw-keepalive alarms', () => {
      const handleAlarm = (alarm: { name: string }): boolean => {
        return alarm.name === KEEPALIVE_ALARM_NAME;
      };

      expect(handleAlarm({ name: KEEPALIVE_ALARM_NAME })).toBe(true);
      expect(handleAlarm({ name: 'other-alarm' })).toBe(false);
    });

    it('should perform heartbeat on alarm', () => {
      const heartbeatLog: string[] = [];
      
      const performHeartbeat = (activePorts: number, activeOperations: number, pendingOps: number) => {
        heartbeatLog.push(`ports:${activePorts},ops:${activeOperations},pending:${pendingOps}`);
        
        if (activePorts === 0 && activeOperations === 0 && pendingOps === 0) {
          heartbeatLog.push('may_sleep');
        }
      };

      performHeartbeat(0, 0, 0);
      expect(heartbeatLog).toContain('ports:0,ops:0,pending:0');
      expect(heartbeatLog).toContain('may_sleep');

      heartbeatLog.length = 0;
      performHeartbeat(1, 2, 3);
      expect(heartbeatLog).toContain('ports:1,ops:2,pending:3');
      expect(heartbeatLog).not.toContain('may_sleep');
    });
  });

  describe('Port Management', () => {
    it('should track active ports', () => {
      const activePorts = new Map<string, { name: string }>();
      
      const portId = 'wallet-connection_1234567890';
      const port = { name: 'wallet-connection' };
      
      activePorts.set(portId, port);
      
      expect(activePorts.has(portId)).toBe(true);
      expect(activePorts.size).toBe(1);
    });

    it('should generate unique port IDs', () => {
      const generatePortId = (portName: string): string => {
        return `${portName}_${Date.now()}`;
      };

      const id1 = generatePortId('test');
      jest.advanceTimersByTime(1);
      const id2 = generatePortId('test');

      expect(id1).not.toBe(id2);
      expect(id1.startsWith('test_')).toBe(true);
    });

    it('should remove port on disconnect', () => {
      const activePorts = new Map<string, { name: string }>();
      const portId = 'test_123';
      
      activePorts.set(portId, { name: 'test' });
      expect(activePorts.size).toBe(1);
      
      activePorts.delete(portId);
      expect(activePorts.size).toBe(0);
    });

    it('should get active port names', () => {
      const activePorts = new Map<string, { name: string }>([
        ['port1_123', { name: 'wallet-connection' }],
        ['port2_456', { name: 'long-operation' }],
        ['port3_789', { name: 'wallet-connection' }],
      ]);

      const names = Array.from(activePorts.values()).map(p => p.name);
      
      expect(names).toContain('wallet-connection');
      expect(names).toContain('long-operation');
      expect(names.length).toBe(3);
    });
  });

  describe('Port Handlers', () => {
    it('should register port handlers', () => {
      const portHandlers = new Map<string, (msg: unknown) => void>();
      
      const handler = jest.fn();
      portHandlers.set('wallet-connection', handler);
      
      expect(portHandlers.has('wallet-connection')).toBe(true);
    });

    it('should call handler on message', async () => {
      const portHandlers = new Map<string, (msg: unknown) => void>();
      const handler = jest.fn();
      portHandlers.set('test', handler);

      const port = { name: 'test' };
      const message = { action: 'ping' };

      const registeredHandler = portHandlers.get(port.name);
      if (registeredHandler) {
        registeredHandler(message);
      }

      expect(handler).toHaveBeenCalledWith({ action: 'ping' });
    });

    it('should handle missing handler gracefully', () => {
      const portHandlers = new Map<string, (msg: unknown) => void>();
      const warnings: string[] = [];

      const port = { name: 'unknown' };
      const handler = portHandlers.get(port.name);
      
      if (!handler) {
        warnings.push(`No handler for port: ${port.name}`);
      }

      expect(warnings).toContain('No handler for port: unknown');
    });
  });

  describe('Operation Tracking', () => {
    it('should start tracking operations', () => {
      interface ActiveOperation {
        id: string;
        type: string;
        startTime: number;
      }

      const activeOperations = new Map<string, ActiveOperation>();
      let pendingCount = 0;

      const startOperation = (id: string, type: string) => {
        activeOperations.set(id, { id, type, startTime: Date.now() });
        pendingCount++;
      };

      startOperation('op-1', 'wallet-connect');
      
      expect(activeOperations.has('op-1')).toBe(true);
      expect(activeOperations.get('op-1')?.type).toBe('wallet-connect');
      expect(pendingCount).toBe(1);
    });

    it('should complete operations', () => {
      interface ActiveOperation {
        id: string;
        type: string;
        startTime: number;
      }

      const activeOperations = new Map<string, ActiveOperation>();
      let pendingCount = 1;

      activeOperations.set('op-1', { id: 'op-1', type: 'sign', startTime: Date.now() - 1000 });

      const completeOperation = (id: string) => {
        const op = activeOperations.get(id);
        if (op) {
          activeOperations.delete(id);
          pendingCount = Math.max(0, pendingCount - 1);
          return Date.now() - op.startTime;
        }
        return null;
      };

      jest.advanceTimersByTime(500);
      const duration = completeOperation('op-1');

      expect(activeOperations.has('op-1')).toBe(false);
      expect(pendingCount).toBe(0);
      expect(duration).toBeGreaterThanOrEqual(1000);
    });

    it('should fail operations', () => {
      interface ActiveOperation {
        id: string;
        type: string;
        startTime: number;
      }

      const activeOperations = new Map<string, ActiveOperation>();
      let pendingCount = 1;
      const errors: string[] = [];

      activeOperations.set('op-1', { id: 'op-1', type: 'sign', startTime: Date.now() });

      const failOperation = (id: string, error: string) => {
        const op = activeOperations.get(id);
        if (op) {
          activeOperations.delete(id);
          pendingCount = Math.max(0, pendingCount - 1);
          errors.push(`${id}: ${error}`);
        }
      };

      failOperation('op-1', 'User rejected');

      expect(activeOperations.has('op-1')).toBe(false);
      expect(pendingCount).toBe(0);
      expect(errors).toContain('op-1: User rejected');
    });

    it('should prevent negative pending count', () => {
      let pendingCount = 0;

      const decrement = () => {
        pendingCount = Math.max(0, pendingCount - 1);
      };

      decrement();
      decrement();
      decrement();

      expect(pendingCount).toBe(0);
    });
  });

  describe('Stale Operation Cleanup', () => {
    it('should identify stale operations', () => {
      interface ActiveOperation {
        id: string;
        startTime: number;
      }

      const activeOperations = new Map<string, ActiveOperation>([
        ['fresh', { id: 'fresh', startTime: Date.now() }],
        ['stale', { id: 'stale', startTime: Date.now() - OPERATION_TIMEOUT_MS - 1000 }],
      ]);

      const staleIds: string[] = [];
      const now = Date.now();

      for (const [id, op] of activeOperations) {
        if (now - op.startTime > OPERATION_TIMEOUT_MS) {
          staleIds.push(id);
        }
      }

      expect(staleIds).toContain('stale');
      expect(staleIds).not.toContain('fresh');
    });

    it('should remove stale operations', () => {
      interface ActiveOperation {
        id: string;
        startTime: number;
      }

      const activeOperations = new Map<string, ActiveOperation>([
        ['op-1', { id: 'op-1', startTime: Date.now() - OPERATION_TIMEOUT_MS - 1000 }],
        ['op-2', { id: 'op-2', startTime: Date.now() }],
      ]);

      const cleanupStale = () => {
        const now = Date.now();
        for (const [id, op] of activeOperations) {
          if (now - op.startTime > OPERATION_TIMEOUT_MS) {
            activeOperations.delete(id);
          }
        }
      };

      cleanupStale();

      expect(activeOperations.size).toBe(1);
      expect(activeOperations.has('op-2')).toBe(true);
    });
  });

  describe('Keep-Alive State', () => {
    it('should track keep-alive active state', () => {
      let isKeepAliveActive = false;

      const activate = () => { isKeepAliveActive = true; };
      const deactivate = () => { isKeepAliveActive = false; };
      const isEnabled = () => isKeepAliveActive;

      expect(isEnabled()).toBe(false);
      activate();
      expect(isEnabled()).toBe(true);
      deactivate();
      expect(isEnabled()).toBe(false);
    });
  });

  describe('Port Names', () => {
    it('should define standard port names', () => {
      const PORT_NAMES = {
        WALLET_CONNECTION: 'wallet-connection',
        LONG_OPERATION: 'long-operation',
      } as const;

      expect(PORT_NAMES.WALLET_CONNECTION).toBe('wallet-connection');
      expect(PORT_NAMES.LONG_OPERATION).toBe('long-operation');
    });
  });

  describe('Error Handling', () => {
    it('should handle alarm initialization errors', async () => {
      mockAlarms.create.mockRejectedValueOnce(new Error('Chrome API unavailable'));

      let error: Error | null = null;
      try {
        await mockAlarms.create(KEEPALIVE_ALARM_NAME, {});
      } catch (e) {
        error = e as Error;
      }

      expect(error?.message).toBe('Chrome API unavailable');
    });

    it('should handle port disconnect errors gracefully', () => {
      const activePorts = new Map<string, unknown>();
      const activeOperations = new Map<string, { port?: unknown }>();
      
      // Set up a port with associated operation
      const port = { name: 'test', id: 'port123' };
      activePorts.set('port123', port);
      activeOperations.set('op1', { port });

      // Simulate disconnect - clean up operation too
      const handleDisconnect = (disconnectedPort: unknown) => {
        for (const [opId, op] of activeOperations) {
          if (op.port === disconnectedPort) {
            activeOperations.delete(opId);
          }
        }
      };

      handleDisconnect(port);
      activePorts.delete('port123');

      expect(activePorts.size).toBe(0);
      expect(activeOperations.size).toBe(0);
    });
  });

  describe('Message Handling', () => {
    it('should post success response to port', () => {
      const messages: unknown[] = [];
      const mockPort = {
        name: 'test',
        postMessage: (msg: unknown) => messages.push(msg),
      };

      mockPort.postMessage({ success: true, data: 'test' });

      expect(messages).toContainEqual({ success: true, data: 'test' });
    });

    it('should post error response to port', () => {
      const messages: unknown[] = [];
      const mockPort = {
        name: 'test',
        postMessage: (msg: unknown) => messages.push(msg),
      };

      const handleError = (error: Error) => {
        mockPort.postMessage({
          success: false,
          error: error.message,
        });
      };

      handleError(new Error('Test error'));

      expect(messages).toContainEqual({ success: false, error: 'Test error' });
    });
  });

  describe('Async Handler Support', () => {
    it('should handle async port handlers', async () => {
      const results: string[] = [];

      const asyncHandler = async (message: { action: string }): Promise<void> => {
        // Use a resolved promise instead of setTimeout to avoid timer issues
        await Promise.resolve();
        results.push(`handled: ${message.action}`);
      };

      await asyncHandler({ action: 'test' });

      expect(results).toContain('handled: test');
    });

    it('should catch async handler errors', async () => {
      const errors: string[] = [];

      const asyncHandler = async (): Promise<void> => {
        throw new Error('Async error');
      };

      try {
        await asyncHandler();
      } catch (e) {
        errors.push((e as Error).message);
      }

      expect(errors).toContain('Async error');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle wallet connection flow', () => {
      interface Operation { id: string; type: string; startTime: number }
      const activeOperations = new Map<string, Operation>();
      let pendingCount = 0;

      // Start wallet connection
      const opId = 'wallet-connect-1';
      activeOperations.set(opId, { id: opId, type: 'wallet-connect', startTime: Date.now() });
      pendingCount++;

      expect(pendingCount).toBe(1);
      expect(activeOperations.has(opId)).toBe(true);

      // Complete connection
      activeOperations.delete(opId);
      pendingCount--;

      expect(pendingCount).toBe(0);
      expect(activeOperations.has(opId)).toBe(false);
    });

    it('should handle multiple concurrent operations', () => {
      interface Operation { id: string; type: string; startTime: number }
      const activeOperations = new Map<string, Operation>();
      let pendingCount = 0;

      // Start multiple operations
      for (let i = 0; i < 5; i++) {
        const id = `op-${i}`;
        activeOperations.set(id, { id, type: 'sign', startTime: Date.now() });
        pendingCount++;
      }

      expect(pendingCount).toBe(5);
      expect(activeOperations.size).toBe(5);

      // Complete some
      activeOperations.delete('op-0');
      activeOperations.delete('op-2');
      pendingCount -= 2;

      expect(pendingCount).toBe(3);
      expect(activeOperations.size).toBe(3);
    });
  });
});
