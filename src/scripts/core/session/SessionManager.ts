/**
 * Session Manager
 * 
 * Pure session management logic extracted from content.ts and popup.ts.
 * Handles session state, validation, and synchronization.
 * 
 * @module core/session/SessionManager
 */

import type { StoredSession } from '../storage/StorageService';

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * 
 * SECURITY NOTE: Standard JavaScript `===` comparison may leak information
 * about string contents through timing differences. This function ensures
 * comparison time is independent of where strings differ.
 * 
 * TIMING PROPERTIES:
 * - Always iterates over max(a.length, b.length) characters
 * - Length difference is incorporated into result via XOR (no early exit)
 * - All operations are constant-time (no branching on secret data)
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 * @security Use for comparing sensitive values like session tokens
 */
export function constantTimeEqual(a: string | undefined, b: string | undefined): boolean {
  // Handle undefined cases - these are not timing-sensitive as undefined
  // is not a secret value (it indicates absence of a token)
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  
  const compareLength = Math.max(a.length, b.length);
  
  // Incorporate length difference into result using XOR
  // This avoids a separate length check that could leak timing info
  let result = a.length ^ b.length;
  
  for (let i = 0; i < compareLength; i++) {
    // Use charCodeAt with fallback to 0 for out-of-bounds
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    result |= charA ^ charB;
  }
  
  return result === 0;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  isValid: boolean;
  reason?: 'expired' | 'missing_address' | 'missing_token' | 'invalid_format';
}

/**
 * Session sync result
 */
export interface SessionSyncResult {
  success: boolean;
  session: StoredSession | null;
  source: 'storage' | 'api' | 'tab' | 'none';
}

/**
 * API session response
 */
export interface ApiSessionResponse {
  authenticated: boolean;
  address?: string;
  chainId?: string;
  expiresAt?: number;
}

/**
 * Validate a session object
 * Pure function - no side effects
 */
export function validateSession(
  session: StoredSession | null,
  now: number = Date.now()
): SessionValidationResult {
  if (!session) {
    return { isValid: false, reason: 'invalid_format' };
  }

  if (!session.address) {
    return { isValid: false, reason: 'missing_address' };
  }

  // Check if address is valid format (basic check)
  if (!isValidEthereumAddress(session.address)) {
    return { isValid: false, reason: 'invalid_format' };
  }

  // Check expiry
  if (session.expiresAt && now > session.expiresAt) {
    return { isValid: false, reason: 'expired' };
  }

  return { isValid: true };
}

/**
 * Check if a string is a valid Ethereum address
 * Pure function - no side effects
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Normalize an Ethereum address to checksum format
 * Pure function - simplified version without full checksum calculation
 */
export function normalizeAddress(address: string): string {
  if (!isValidEthereumAddress(address)) {
    return address;
  }
  // Return lowercase for consistency
  return address.toLowerCase();
}

/**
 * Parse API session response into StoredSession
 * Pure function - no side effects
 */
export function parseApiSessionResponse(
  response: ApiSessionResponse
): StoredSession | null {
  if (!response.authenticated || !response.address) {
    return null;
  }

  return {
    address: normalizeAddress(response.address),
    chainId: response.chainId || '0x1',
    expiresAt: response.expiresAt,
  };
}

/**
 * Compare two sessions for equality
 * Pure function - no side effects
 * 
 * @security Uses constant-time comparison for session tokens to prevent
 * timing side-channel attacks.
 */
export function sessionsEqual(
  a: StoredSession | null,
  b: StoredSession | null
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // Use constant-time comparison for sensitive sessionToken
  // Regular comparison is fine for non-sensitive fields
  return (
    normalizeAddress(a.address) === normalizeAddress(b.address) &&
    a.chainId === b.chainId &&
    constantTimeEqual(a.sessionToken, b.sessionToken)
  );
}

/**
 * Merge session data, preferring newer/more complete data
 * Pure function - no side effects
 */
export function mergeSession(
  existing: StoredSession | null,
  incoming: StoredSession | null
): StoredSession | null {
  if (!existing) return incoming;
  if (!incoming) return existing;

  return {
    address: incoming.address || existing.address,
    chainId: incoming.chainId || existing.chainId,
    sessionToken: incoming.sessionToken || existing.sessionToken,
    connectedAt: existing.connectedAt || incoming.connectedAt,
    expiresAt: incoming.expiresAt || existing.expiresAt,
  };
}

/**
 * Session state change event
 */
export interface SessionChangeEvent {
  type: 'connected' | 'disconnected' | 'updated' | 'expired';
  previousSession: StoredSession | null;
  currentSession: StoredSession | null;
  timestamp: number;
}

/**
 * Determine session change event type
 * Pure function - no side effects
 */
export function getSessionChangeType(
  previous: StoredSession | null,
  current: StoredSession | null
): SessionChangeEvent['type'] {
  if (!previous && current) return 'connected';
  if (previous && !current) return 'disconnected';
  if (previous && current && !sessionsEqual(previous, current)) return 'updated';
  return 'updated'; // Default
}

/**
 * Create a session change event
 * Pure function - no side effects
 */
export function createSessionChangeEvent(
  previous: StoredSession | null,
  current: StoredSession | null,
  timestamp: number = Date.now()
): SessionChangeEvent {
  return {
    type: getSessionChangeType(previous, current),
    previousSession: previous,
    currentSession: current,
    timestamp,
  };
}

/**
 * Format session for display (truncated address)
 * Pure function - no side effects
 */
export function formatSessionForDisplay(session: StoredSession | null): {
  address: string;
  shortAddress: string;
  chainId: string;
  chainName: string;
  isConnected: boolean;
} {
  if (!session) {
    return {
      address: '',
      shortAddress: '',
      chainId: '',
      chainName: 'Not Connected',
      isConnected: false,
    };
  }

  return {
    address: session.address,
    shortAddress: truncateAddress(session.address),
    chainId: session.chainId,
    chainName: getChainName(session.chainId),
    isConnected: true,
  };
}

/**
 * Truncate an address for display
 * Pure function - no side effects
 */
export function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get chain name from chain ID
 * Pure function - no side effects
 */
export function getChainName(chainId: string): string {
  const chainNames: Record<string, string> = {
    '0x1': 'Ethereum',
    '0x89': 'Polygon',
    '0xa4b1': 'Arbitrum One',
    '0xa': 'Optimism',
    '0x2105': 'Base',
    '0x38': 'BNB Chain',
    '0xe708': 'Linea',
    '0x144': 'zkSync Era',
    '0xaa36a7': 'Sepolia',
    '0x13882': 'Polygon Amoy',
  };

  if (chainId in chainNames) {
    return chainNames[chainId];
  }

  // Parse hex to decimal for unknown chains
  const decimal = parseInt(chainId, 16);
  return isNaN(decimal) ? 'Unknown' : `Chain ${decimal}`;
}

/**
 * SessionManager class for stateful session operations
 * Uses dependency injection for storage and API
 */
export class SessionManager {
  private currentSession: StoredSession | null = null;
  private changeListeners = new Set<(event: SessionChangeEvent) => void>();

  constructor(
    private getStorageSession: () => Promise<StoredSession | null>,
    private setStorageSession: (session: StoredSession) => Promise<void>,
    private clearStorageSession: () => Promise<void>,
    private fetchApiSession?: () => Promise<ApiSessionResponse | null>
  ) {}

  /**
   * Get current session (from cache)
   */
  getCachedSession(): StoredSession | null {
    return this.currentSession;
  }

  /**
   * Load session from storage
   */
  async loadSession(): Promise<StoredSession | null> {
    try {
      this.currentSession = await this.getStorageSession();
      return this.currentSession;
    } catch (error) {
      console.error('[SessionManager] Failed to load session:', error);
      return null;
    }
  }

  /**
   * Save session to storage
   */
  async saveSession(session: StoredSession): Promise<void> {
    const previous = this.currentSession;
    try {
      await this.setStorageSession(session);
      this.currentSession = session;
      this.notifyListeners(createSessionChangeEvent(previous, session));
    } catch (error) {
      console.error('[SessionManager] Failed to save session:', error);
      throw error;
    }
  }

  /**
   * Clear session from storage
   */
  async clearSession(): Promise<void> {
    const previous = this.currentSession;
    try {
      await this.clearStorageSession();
      this.currentSession = null;
      this.notifyListeners(createSessionChangeEvent(previous, null));
    } catch (error) {
      console.error('[SessionManager] Failed to clear session:', error);
      throw error;
    }
  }

  /**
   * Sync session from multiple sources
   * Tries storage first, then API as fallback
   */
  async syncSession(): Promise<SessionSyncResult> {
    // Try storage first
    const storageSession = await this.loadSession();
    const validation = validateSession(storageSession);

    if (validation.isValid && storageSession) {
      return {
        success: true,
        session: storageSession,
        source: 'storage',
      };
    }

    // If storage session is expired, clear it
    if (validation.reason === 'expired') {
      await this.clearSession();
    }

    // Try API fallback
    if (this.fetchApiSession) {
      try {
        const apiResponse = await this.fetchApiSession();
        if (apiResponse) {
          const apiSession = parseApiSessionResponse(apiResponse);
          if (apiSession) {
            await this.saveSession(apiSession);
            return {
              success: true,
              session: apiSession,
              source: 'api',
            };
          }
        }
      } catch (error) {
        console.error('[SessionManager] API session fetch failed:', error);
      }
    }

    return {
      success: false,
      session: null,
      source: 'none',
    };
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    return validateSession(this.currentSession).isValid;
  }

  /**
   * Subscribe to session changes
   */
  onSessionChange(listener: (event: SessionChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Notify listeners of session change
   */
  private notifyListeners(event: SessionChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[SessionManager] Listener error:', error);
      }
    }
  }
}
