/**
 * Service Worker State Management
 * 
 * Handles state persistence across service worker restarts in Manifest V3.
 * Service workers can be terminated by the browser when idle, so we need
 * to persist important state and restore it on wake-up.
 */

// ============================================================================
// Types
// ============================================================================

export interface PendingRequest {
  id: string;
  method: string;
  params?: unknown[];
  timestamp: number;
  tabId?: number;
}

export interface ServiceWorkerState {
  /** Pending requests that haven't been completed */
  pendingRequests: PendingRequest[];
  /** Last known connected address */
  lastAddress: string | null;
  /** Last known chain ID */
  lastChainId: string;
  /** Timestamp of last activity */
  lastActivity: number;
}

// ============================================================================
// Storage Keys
// ============================================================================

const STATE_STORAGE_KEY = 'serviceWorkerState';
const STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes - clean up old pending requests

// ============================================================================
// State Management
// ============================================================================

/**
 * Save service worker state to chrome.storage.session
 * Session storage persists across service worker restarts but clears on browser close
 */
export async function saveState(state: Partial<ServiceWorkerState>): Promise<void> {
  const existing = await getState();
  const newState: ServiceWorkerState = {
    ...existing,
    ...state,
    lastActivity: Date.now(),
  };
  await chrome.storage.session.set({ [STATE_STORAGE_KEY]: newState });
}

/**
 * Get current service worker state
 */
export async function getState(): Promise<ServiceWorkerState> {
  const result = await chrome.storage.session.get(STATE_STORAGE_KEY);
  return result[STATE_STORAGE_KEY] || {
    pendingRequests: [],
    lastAddress: null,
    lastChainId: '0x1',
    lastActivity: Date.now(),
  };
}

/**
 * Clear all state
 */
export async function clearState(): Promise<void> {
  await chrome.storage.session.remove(STATE_STORAGE_KEY);
}

// ============================================================================
// Pending Request Management
// ============================================================================

/**
 * Add a pending request to state
 */
export async function addPendingRequest(request: Omit<PendingRequest, 'timestamp'>): Promise<void> {
  const state = await getState();
  
  // Clean up expired requests
  const now = Date.now();
  state.pendingRequests = state.pendingRequests.filter(
    (r) => now - r.timestamp < STATE_EXPIRY_MS
  );
  
  // Add new request
  state.pendingRequests.push({
    ...request,
    timestamp: now,
  });
  
  await saveState({ pendingRequests: state.pendingRequests });
}

/**
 * Remove a pending request from state
 */
export async function removePendingRequest(requestId: string): Promise<void> {
  const state = await getState();
  state.pendingRequests = state.pendingRequests.filter((r) => r.id !== requestId);
  await saveState({ pendingRequests: state.pendingRequests });
}

/**
 * Get all pending requests
 */
export async function getPendingRequests(): Promise<PendingRequest[]> {
  const state = await getState();
  const now = Date.now();
  
  // Filter out expired requests
  return state.pendingRequests.filter(
    (r) => now - r.timestamp < STATE_EXPIRY_MS
  );
}

/**
 * Check if there are any pending requests
 */
export async function hasPendingRequests(): Promise<boolean> {
  const requests = await getPendingRequests();
  return requests.length > 0;
}

// ============================================================================
// Session State Management
// ============================================================================

/**
 * Update the last known connection state
 */
export async function updateConnectionState(
  address: string | null,
  chainId: string
): Promise<void> {
  await saveState({
    lastAddress: address,
    lastChainId: chainId,
  });
}

/**
 * Get the last known connection state
 */
export async function getConnectionState(): Promise<{
  address: string | null;
  chainId: string;
}> {
  const state = await getState();
  return {
    address: state.lastAddress,
    chainId: state.lastChainId,
  };
}

// ============================================================================
// Service Worker Lifecycle
// ============================================================================

/**
 * Initialize service worker state on startup
 * Call this when the service worker starts
 */
export async function initializeOnWakeUp(): Promise<void> {
  const state = await getState();
  
  // Log if we have pending requests (useful for debugging)
  if (state.pendingRequests.length > 0) {
    console.log(
      `[Service Worker] Restored with ${state.pendingRequests.length} pending requests`
    );
    
    // Clean up expired requests
    const now = Date.now();
    const validRequests = state.pendingRequests.filter(
      (r) => now - r.timestamp < STATE_EXPIRY_MS
    );
    
    if (validRequests.length !== state.pendingRequests.length) {
      await saveState({ pendingRequests: validRequests });
      console.log(
        `[Service Worker] Cleaned up ${state.pendingRequests.length - validRequests.length} expired requests`
      );
    }
  }
}

/**
 * Record activity to prevent unnecessary state cleanup
 */
export async function recordActivity(): Promise<void> {
  await saveState({ lastActivity: Date.now() });
}
