/**
 * Storage Service
 * 
 * Centralized storage management for the extension.
 * Uses dependency injection for testability.
 * 
 * @module core/storage/StorageService
 */

import type { IStorageAdapter } from '../../adapters/types';

/**
 * Storage keys used throughout the extension
 */
export const StorageKeys = {
  SESSION: 'session',
  CONFIG: 'config',
} as const;

/**
 * Session data stored in extension storage
 */
export interface StoredSession {
  address: string;
  chainId: string;
  sessionToken?: string;
  connectedAt?: number;
  expiresAt?: number;
}

/**
 * App configuration stored in extension storage
 */
export interface StoredConfig {
  apiUrl?: string;
  debug?: boolean;
}

/**
 * Storage service configuration
 */
export interface StorageServiceConfig {
  /** Use session storage for sensitive data (default: true) */
  useSessionStorage: boolean;
}

const DEFAULT_CONFIG: StorageServiceConfig = {
  useSessionStorage: true,
};

/**
 * StorageService - Centralized storage management
 * 
 * Abstracts storage operations and provides a clean API for:
 * - Session management
 * - Configuration storage
 * - Storage change listening
 */
export class StorageService {
  private config: StorageServiceConfig;
  private changeCallbacks = new Set<(session: StoredSession | null, oldSession: StoredSession | null | undefined) => void>();
  private boundStorageChangeHandler: (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string
  ) => void;

  constructor(
    private storage: IStorageAdapter,
    config: Partial<StorageServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Bind the handler once for proper removal later
    this.boundStorageChangeHandler = this.handleStorageChange.bind(this);

    // Listen for storage changes
    this.storage.onChanged(this.boundStorageChangeHandler);
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Get the current session from storage
   */
  async getSession(): Promise<StoredSession | null> {
    try {
      if (this.config.useSessionStorage) {
        // Try session storage first (more secure, cleared on browser close)
        const sessionData = await this.storage.sessionGet<{
          [StorageKeys.SESSION]?: StoredSession
        }>([StorageKeys.SESSION]);

        const sessionValue = sessionData[StorageKeys.SESSION];
        if (sessionValue) {
          return sessionValue;
        }
      }

      // Fall back to local storage
      const localData = await this.storage.localGet<{
        [StorageKeys.SESSION]?: StoredSession
      }>([StorageKeys.SESSION]);

      return localData[StorageKeys.SESSION] ?? null;
    } catch (error) {
      console.error('[StorageService] Failed to get session:', error);
      return null;
    }
  }

  /**
   * Store a session
   */
  async setSession(session: StoredSession): Promise<void> {
    try {
      const sessionWithTimestamp = {
        ...session,
        connectedAt: session.connectedAt || Date.now(),
      };

      if (this.config.useSessionStorage) {
        // Store in session storage (more secure)
        await this.storage.sessionSet({
          [StorageKeys.SESSION]: sessionWithTimestamp,
        });
      }

      // Also store in local storage as backup
      await this.storage.localSet({
        [StorageKeys.SESSION]: sessionWithTimestamp,
      });
    } catch (error) {
      console.error('[StorageService] Failed to set session:', error);
      throw error;
    }
  }

  /**
   * Clear the current session
   */
  async clearSession(): Promise<void> {
    try {
      await this.storage.localRemove([StorageKeys.SESSION]);

      if (this.config.useSessionStorage) {
        await this.storage.sessionRemove([StorageKeys.SESSION]);
      }
    } catch (error) {
      console.error('[StorageService] Failed to clear session:', error);
      throw error;
    }
  }

  /**
   * Check if a session is expired
   * Pure function that takes session as parameter
   */
  isSessionExpired(session: StoredSession | null): boolean {
    if (!session) {
      return true;
    }
    if (!session.expiresAt) {
      return false; // No expiry set = never expires
    }
    return Date.now() > session.expiresAt;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get the app configuration
   */
  async getConfig(): Promise<StoredConfig | null> {
    try {
      const data = await this.storage.localGet<{
        [StorageKeys.CONFIG]?: StoredConfig
      }>([StorageKeys.CONFIG]);
      
      return data[StorageKeys.CONFIG] || null;
    } catch (error) {
      console.error('[StorageService] Failed to get config:', error);
      return null;
    }
  }

  /**
   * Set the app configuration
   */
  async setConfig(config: StoredConfig): Promise<void> {
    try {
      await this.storage.localSet({
        [StorageKeys.CONFIG]: config,
      });
    } catch (error) {
      console.error('[StorageService] Failed to set config:', error);
      throw error;
    }
  }

  // ============================================================================
  // Change Listeners
  // ============================================================================

  /**
   * Subscribe to session changes
   */
  onSessionChange(callback: (session: StoredSession | null, oldSession?: StoredSession | null) => void): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  /**
   * Handle storage change events
   */
  private handleStorageChange(
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    _areaName: string
  ): void {
    // Check for session changes in both local and session storage
    if (!(StorageKeys.SESSION in changes)) return;

    const change = changes[StorageKeys.SESSION];
    const newSession = (change.newValue as StoredSession | undefined) ?? null;
    const oldSession = (change.oldValue as StoredSession | undefined) ?? null;

    // Notify listeners
    for (const callback of this.changeCallbacks) {
      try {
        callback(newSession, oldSession);
      } catch (error) {
        console.error('[StorageService] Change callback error:', error);
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose of the service and clean up listeners
   */
  dispose(): void {
    this.storage.offChanged(this.boundStorageChangeHandler);
    this.changeCallbacks.clear();
  }
}
