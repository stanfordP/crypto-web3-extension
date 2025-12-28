/**
 * Service Worker Keep-Alive Module
 *
 * Implements multiple strategies to keep the Manifest V3 service worker active:
 * 1. Chrome Alarms - Periodic wake-up every 25 seconds
 * 2. Port Management - Keep connections alive during long operations
 * 3. Activity Tracking - Monitor and extend lifetime during active operations
 *
 * MV3 Limitations:
 * - Service workers terminate after 30 seconds of inactivity
 * - Maximum lifetime of 5 minutes with continuous activity
 * - No persistent background pages
 * 
 * CRITICAL: Alarm and port listeners are registered SYNCHRONOUSLY at module load
 * to ensure they're available even before async initialization completes.
 */

import { backgroundLogger as logger } from './logger';

// ============================================================================
// Constants
// ============================================================================

const KEEPALIVE_ALARM_NAME = 'sw-keepalive';
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // 24 seconds (under 30s limit)
const OPERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max operation time
const PORT_NAMES = {
  WALLET_CONNECTION: 'wallet-connection',
  LONG_OPERATION: 'long-operation',
} as const;

// ============================================================================
// Types
// ============================================================================

interface ActiveOperation {
  id: string;
  type: string;
  startTime: number;
  port?: chrome.runtime.Port;
}

interface PortMessageHandler {
  (message: unknown, port: chrome.runtime.Port): void | Promise<void>;
}

// ============================================================================
// State
// ============================================================================

/** Active ports that keep the service worker alive */
const activePorts = new Map<string, chrome.runtime.Port>();

/** Currently running operations */
const activeOperations = new Map<string, ActiveOperation>();

/** Port message handlers by port name */
const portHandlers = new Map<string, PortMessageHandler>();

/** Whether keep-alive is currently active */
let isKeepAliveActive = false;

/** Pending operations count - keep alive while > 0 */
let pendingOperationsCount = 0;

// ============================================================================
// Chrome Alarms Keep-Alive
// ============================================================================

/**
 * Initialize the keep-alive alarm
 * Called on service worker startup
 */
export async function initializeKeepAlive(): Promise<void> {
  try {
    // Clear any existing alarm
    await chrome.alarms.clear(KEEPALIVE_ALARM_NAME);

    // Create periodic alarm
    await chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
      periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
      delayInMinutes: KEEPALIVE_INTERVAL_MINUTES,
    });

    isKeepAliveActive = true;
    logger.info('Keep-alive alarm initialized', {
      intervalSeconds: KEEPALIVE_INTERVAL_MINUTES * 60
    });
  } catch (error) {
    logger.error('Failed to initialize keep-alive alarm', { error: String(error) });
  }
}

/**
 * Handle alarm events
 * Must be called from background script's alarm listener
 */
export function handleAlarm(alarm: chrome.alarms.Alarm): void {
  if (alarm.name !== KEEPALIVE_ALARM_NAME) return;

  // Clean up stale operations
  cleanupStaleOperations();

  // Log heartbeat for debugging
  logger.debug('Keep-alive heartbeat', {
    activePorts: activePorts.size,
    activeOperations: activeOperations.size,
    pendingOperations: pendingOperationsCount,
  });

  // If no active work, we can let the service worker sleep
  // The alarm will wake it up again
  if (activePorts.size === 0 && activeOperations.size === 0 && pendingOperationsCount === 0) {
    logger.debug('No active work, service worker may sleep until next alarm');
  }
}

/**
 * Stop the keep-alive alarm (e.g., when extension is disabled)
 */
export async function stopKeepAlive(): Promise<void> {
  try {
    await chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
    isKeepAliveActive = false;
    logger.info('Keep-alive alarm stopped');
  } catch (error) {
    logger.error('Failed to stop keep-alive alarm', { error: String(error) });
  }
}

/**
 * Check if keep-alive is currently active
 */
export function isKeepAliveEnabled(): boolean {
  return isKeepAliveActive;
}

// ============================================================================
// Port-Based Keep-Alive
// ============================================================================

/**
 * Register a handler for a specific port name
 */
export function registerPortHandler(portName: string, handler: PortMessageHandler): void {
  portHandlers.set(portName, handler);
  logger.debug('Port handler registered', { portName });
}

/**
 * Handle new port connections
 * Must be called from background script's onConnect listener
 */
export function handlePortConnect(port: chrome.runtime.Port): void {
  const portId = `${port.name}_${Date.now()}`;

  activePorts.set(portId, port);
  logger.debug('Port connected', { portName: port.name, portId });

  // Set up message handler
  port.onMessage.addListener((message) => {
    const handler = portHandlers.get(port.name);
    if (handler) {
      Promise.resolve(handler(message, port)).catch((error) => {
        logger.error('Port message handler error', {
          portName: port.name,
          error: String(error)
        });
        port.postMessage({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    } else {
      logger.warn('No handler for port', { portName: port.name });
    }
  });

  // Clean up on disconnect
  port.onDisconnect.addListener(() => {
    activePorts.delete(portId);
    logger.debug('Port disconnected', { portName: port.name, portId });

    // Clean up any operations associated with this port
    for (const [opId, op] of activeOperations) {
      if (op.port === port) {
        activeOperations.delete(opId);
        logger.debug('Cleaned up operation for disconnected port', { operationId: opId });
      }
    }
  });
}

/**
 * Get all active port names (for debugging)
 */
export function getActivePortNames(): string[] {
  return Array.from(activePorts.values()).map(p => p.name);
}

// ============================================================================
// Operation Tracking
// ============================================================================

/**
 * Start tracking a long-running operation
 * This signals that the service worker should stay alive
 */
export function startOperation(id: string, type: string, port?: chrome.runtime.Port): void {
  activeOperations.set(id, {
    id,
    type,
    startTime: Date.now(),
    port,
  });
  pendingOperationsCount++;
  logger.debug('Operation started', { id, type, totalPending: pendingOperationsCount });
}

/**
 * Complete a tracked operation
 */
export function completeOperation(id: string): void {
  const operation = activeOperations.get(id);
  if (operation) {
    const duration = Date.now() - operation.startTime;
    activeOperations.delete(id);
    pendingOperationsCount = Math.max(0, pendingOperationsCount - 1);
    logger.debug('Operation completed', {
      id,
      type: operation.type,
      durationMs: duration,
      totalPending: pendingOperationsCount
    });
  }
}

/**
 * Fail a tracked operation
 */
export function failOperation(id: string, error: string): void {
  const operation = activeOperations.get(id);
  if (operation) {
    const duration = Date.now() - operation.startTime;
    activeOperations.delete(id);
    pendingOperationsCount = Math.max(0, pendingOperationsCount - 1);
    logger.warn('Operation failed', {
      id,
      type: operation.type,
      durationMs: duration,
      error,
      totalPending: pendingOperationsCount
    });
  }
}

/**
 * Check if there are any active operations
 */
export function hasActiveOperations(): boolean {
  return activeOperations.size > 0 || pendingOperationsCount > 0;
}

/**
 * Get count of active operations
 */
export function getActiveOperationCount(): number {
  return activeOperations.size;
}

/**
 * Clean up operations that have exceeded the timeout
 */
function cleanupStaleOperations(): void {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [id, op] of activeOperations) {
    if (now - op.startTime > OPERATION_TIMEOUT_MS) {
      staleIds.push(id);
    }
  }

  for (const id of staleIds) {
    failOperation(id, 'Operation timed out');
  }

  if (staleIds.length > 0) {
    logger.warn('Cleaned up stale operations', { count: staleIds.length });
  }
}

// ============================================================================
// Service Worker Lifecycle Helpers
// ============================================================================

/**
 * Extend service worker lifetime during critical operations
 * Uses a combination of storage writes and self-messaging
 */
export async function extendLifetime(): Promise<void> {
  // Write to storage to trigger activity
  await chrome.storage.session.set({
    _lastActivity: Date.now(),
    _operationCount: activeOperations.size,
  });
}

/**
 * Create a keep-alive promise that resolves after a delay
 * Useful for wrapping async operations
 */
export function withKeepAlive<T>(
  operationId: string,
  operationType: string,
  operation: () => Promise<T>
): Promise<T> {
  startOperation(operationId, operationType);

  return operation()
    .then((result) => {
      completeOperation(operationId);
      return result;
    })
    .catch((error) => {
      failOperation(operationId, error instanceof Error ? error.message : String(error));
      throw error;
    });
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Set up alarm listener
 * Must be called during service worker initialization
 */
export function setupAlarmListener(): void {
  chrome.alarms.onAlarm.addListener(handleAlarm);
  logger.debug('Alarm listener set up');
}

/**
 * Set up port connection listener
 * Must be called during service worker initialization
 */
export function setupPortListener(): void {
  chrome.runtime.onConnect.addListener(handlePortConnect);
  logger.debug('Port listener set up');
}

/**
 * Full initialization - call this from background.ts
 */
export async function initializeServiceWorkerKeepAlive(): Promise<void> {
  // Note: Listeners are set up synchronously via the module-level registration below
  // This function only initializes the alarm
  await initializeKeepAlive();

  logger.info('Service worker keep-alive fully initialized');
}

// ============================================================================
// CRITICAL: Register listeners synchronously at module load
// This ensures they're available even if the service worker wakes up mid-message
// ============================================================================

// Register alarm listener immediately
chrome.alarms.onAlarm.addListener(handleAlarm);

// Register port listener immediately
chrome.runtime.onConnect.addListener(handlePortConnect);

// ============================================================================
// Exports
// ============================================================================

export const PortNames = PORT_NAMES;
