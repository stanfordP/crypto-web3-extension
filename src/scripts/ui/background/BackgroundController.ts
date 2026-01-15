/**
 * BackgroundController - Service Worker Message Handler
 *
 * Extracted from background-main.ts to enable testing and separation of concerns.
 * Handles:
 * - Session management (GET_SESSION, DISCONNECT)
 * - Auth tab management (OPEN_AUTH_TAB, AUTH_SUCCESS)
 * - PING responses
 * - Origin validation
 *
 * Dependencies are injected via constructor for testability.
 */

import type {
  IStorageAdapter,
  IRuntimeAdapter,
  ITabsAdapter,
  RuntimeMessageSender,
} from '../../adapters/types';
import { backgroundLogger as logger } from '../../logger';
import type { Message, MessageResponse, StorageData } from '../../types';
import { StorageKeys, MessageType } from '../../types';

// ============================================================================
// Types
// ============================================================================

/** Dependencies for BackgroundController */
export interface BackgroundControllerDeps {
  storageAdapter: IStorageAdapter;
  runtimeAdapter: IRuntimeAdapter;
  tabsAdapter: ITabsAdapter;
  alarmsAdapter: unknown; // Reserved for future alarm-based features
  allowedOrigins: readonly string[];
  apiClient?: ApiClientInterface;
  logger?: typeof logger;
}

/** Minimal API client interface needed by BackgroundController */
export interface ApiClientInterface {
  validateSession(token: string): Promise<{ valid: boolean }>;
  disconnect(token: string): Promise<void | { success: boolean }>;
}

/** Session data returned by getSession */
export interface SessionData {
  sessionToken: string;
  connectedAddress: string;
  chainId: string;
  accountMode: string;
}

// ============================================================================
// Storage Keys by Security Level
// ============================================================================

// Keys for session storage (cleared on browser close) - SENSITIVE DATA
const SESSION_STORAGE_KEYS = [StorageKeys.SESSION_TOKEN] as const;

// ============================================================================
// BackgroundController Class
// ============================================================================

export class BackgroundController {
  private storageAdapter: IStorageAdapter;
  private runtimeAdapter: IRuntimeAdapter;
  private tabsAdapter: ITabsAdapter;
  private allowedOrigins: readonly string[];
  private apiClient?: ApiClientInterface;
  private logger: typeof logger;

  /** Currently open auth tab ID (prevents duplicates) */
  private openAuthTabId: number | null = null;

  /** Service worker ready state */
  private isReady = false;

  /** Message listener reference for cleanup */
  private messageListener: ((
    message: Message,
    sender: RuntimeMessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => boolean) | null = null;

  /** Activity listener reference */
  private activityListener: (() => boolean) | null = null;

  /** Tab removed listener for auth tab tracking */
  private tabRemovedListener: ((tabId: number) => void) | null = null;

  constructor(deps: BackgroundControllerDeps) {
    this.storageAdapter = deps.storageAdapter;
    this.runtimeAdapter = deps.runtimeAdapter;
    this.tabsAdapter = deps.tabsAdapter;
    // deps.alarmsAdapter reserved for future use
    this.allowedOrigins = deps.allowedOrigins;
    this.apiClient = deps.apiClient;
    this.logger = deps.logger || logger;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the controller
   */
  async initialize(): Promise<void> {
    // Set up message listener
    this.messageListener = this.handleRuntimeMessage.bind(this);
    this.runtimeAdapter.addMessageListener(this.messageListener);

    // Set up activity tracking listener
    this.activityListener = () => {
      // Just return false to not interfere with other listeners
      return false;
    };
    this.runtimeAdapter.addMessageListener(this.activityListener);

    // Enable session storage access for content scripts
    await this.enableSessionStorageAccess();

    this.isReady = true;
    this.logger.info('BackgroundController initialized');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.messageListener) {
      this.runtimeAdapter.removeMessageListener(this.messageListener);
      this.messageListener = null;
    }

    if (this.activityListener) {
      this.runtimeAdapter.removeMessageListener(this.activityListener);
      this.activityListener = null;
    }

    if (this.tabRemovedListener) {
      this.tabsAdapter.removeTabListener('onRemoved', this.tabRemovedListener);
      this.tabRemovedListener = null;
    }

    this.isReady = false;
    this.logger.debug('BackgroundController cleaned up');
  }

  /**
   * Get ready state
   */
  getIsReady(): boolean {
    return this.isReady;
  }

  // ==========================================================================
  // Storage Helpers
  // ==========================================================================

  /**
   * Enable session storage access for content scripts
   */
  private async enableSessionStorageAccess(): Promise<void> {
    try {
      await this.storageAdapter.setSessionAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS');
      this.logger.debug('Session storage access level set for content scripts');
    } catch (error) {
      this.logger.error('Failed to set session storage access level', { error: String(error) });
    }
  }

  /**
   * Get a value from appropriate storage based on key sensitivity
   */
  private async getStorageValue<K extends StorageKeys>(key: K): Promise<StorageData[K] | undefined> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    if (isSecure) {
      const result = await this.storageAdapter.getSession<Record<string, unknown>>(key);
      return result[key] as StorageData[K] | undefined;
    }
    const result = await this.storageAdapter.getLocal<Record<string, unknown>>(key);
    return result[key] as StorageData[K] | undefined;
  }

  /**
   * Clear all storage (both session and local)
   */
  private async clearAllStorage(): Promise<void> {
    await Promise.all([
      this.storageAdapter.clear('session'),
      this.storageAdapter.clear('local'),
    ]);
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Check if user has active session
   */
  async hasActiveSession(): Promise<boolean> {
    const token = await this.getStorageValue(StorageKeys.SESSION_TOKEN);
    if (!token) return false;

    if (!this.apiClient) {
      // No API client - assume session is valid if token exists
      return true;
    }

    try {
      const validation = await this.apiClient.validateSession(token);
      return validation.valid;
    } catch (error) {
      this.logger.error('Session validation failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Get current session info
   */
  async getSession(): Promise<SessionData | null> {
    const [token, address, chainId, accountMode] = await Promise.all([
      this.getStorageValue(StorageKeys.SESSION_TOKEN),
      this.getStorageValue(StorageKeys.CONNECTED_ADDRESS),
      this.getStorageValue(StorageKeys.CHAIN_ID),
      this.getStorageValue(StorageKeys.ACCOUNT_MODE),
    ]);

    if (!token || !address) return null;

    return {
      sessionToken: token,
      connectedAddress: address,
      chainId: chainId || '0x1',
      accountMode: accountMode || 'live',
    };
  }

  /**
   * Clear session and disconnect
   */
  async disconnect(): Promise<void> {
    const token = await this.getStorageValue(StorageKeys.SESSION_TOKEN);

    // Notify backend
    if (token && this.apiClient) {
      try {
        await this.apiClient.disconnect(token);
      } catch (error) {
        this.logger.error('Backend disconnect failed', { error: String(error) });
      }
    }

    // Clear local storage
    await this.clearAllStorage();

    // Notify content scripts
    await this.notifyDisconnect();
  }

  /**
   * Notify all content scripts of disconnect
   */
  private async notifyDisconnect(): Promise<void> {
    try {
      const tabs = await this.tabsAdapter.query({});
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await this.tabsAdapter.sendMessage(tab.id, {
              type: 'DISCONNECT_EVENT',
            });
          } catch {
            // Tab might not have content script, ignore
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to notify tabs of disconnect', { error: String(error) });
    }
  }

  // ==========================================================================
  // Auth Tab Management
  // ==========================================================================

  /**
   * Open the auth page in a new tab or focus existing
   */
  async openAuthTab(): Promise<{ success: boolean; tabId?: number; error?: string }> {
    try {
      // Check if auth tab is already open
      if (this.openAuthTabId !== null) {
        try {
          const existingTab = await this.tabsAdapter.get(this.openAuthTabId);
          if (existingTab) {
            // Focus the existing tab
            await this.tabsAdapter.update(this.openAuthTabId, { active: true });
            if (existingTab.windowId) {
              await this.tabsAdapter.focusWindow(existingTab.windowId);
            }
            this.logger.debug('Focused existing auth tab', { tabId: this.openAuthTabId });
            return { success: true, tabId: this.openAuthTabId };
          }
        } catch {
          // Tab no longer exists, clear the reference
          this.openAuthTabId = null;
        }
      }

      // Create new auth tab
      const authUrl = this.runtimeAdapter.getURL('auth.html');
      const newTab = await this.tabsAdapter.create({ url: authUrl, active: true });

      if (newTab.id) {
        this.openAuthTabId = newTab.id;
        this.logger.info('Opened new auth tab', { tabId: newTab.id });

        // Listen for tab close to clear the reference
        this.tabRemovedListener = (tabId: number) => {
          if (tabId === this.openAuthTabId) {
            this.openAuthTabId = null;
            if (this.tabRemovedListener) {
              this.tabsAdapter.removeTabListener('onRemoved', this.tabRemovedListener);
              this.tabRemovedListener = null;
            }
            this.logger.debug('Auth tab closed', { tabId });
          }
        };
        this.tabsAdapter.addTabListener('onRemoved', this.tabRemovedListener);

        return { success: true, tabId: newTab.id };
      }

      return { success: false, error: 'Failed to create auth tab' };
    } catch (error) {
      this.logger.error('Failed to open auth tab', { error: String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Handle auth success notification
   */
  handleAuthSuccess(): void {
    this.openAuthTabId = null;
    this.logger.info('Auth success notification received');
  }

  // ==========================================================================
  // Origin Validation
  // ==========================================================================

  /**
   * Validate message sender origin
   */
  validateSenderOrigin(sender: RuntimeMessageSender): boolean {
    const extensionId = this.runtimeAdapter.id;

    // Messages from our extension (popup, auth page, etc.)
    if (!sender.tab && sender.id === extensionId) {
      return true; // Trusted extension origin
    }

    // Messages from extension pages (auth.html)
    if (sender.url?.startsWith(`chrome-extension://${extensionId}`)) {
      return true;
    }

    // Messages from content scripts (has tab URL)
    if (sender.tab?.url) {
      try {
        const senderOrigin = new URL(sender.tab.url).origin;
        return this.allowedOrigins.some((allowed) =>
          senderOrigin.startsWith(allowed.replace('/*', '').replace('*', ''))
        );
      } catch {
        return false;
      }
    }

    // Unknown sender - reject
    return false;
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Handle incoming runtime messages
   * Returns true to indicate async response
   */
  private handleRuntimeMessage(
    message: Message,
    sender: RuntimeMessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean {
    const messageType = message.type as string;

    // CRITICAL: Handle PING immediately without any async operations
    if (messageType === 'PING') {
      sendResponse({
        success: true,
        data: { pong: true, timestamp: Date.now(), ready: this.isReady },
        requestId: message.requestId,
      });
      return true;
    }

    // Handle OPEN_AUTH_TAB - open the auth page in a new tab
    if (messageType === 'OPEN_AUTH_TAB') {
      this.openAuthTab()
        .then((result) => sendResponse(result as MessageResponse))
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to open auth tab',
          });
        });
      return true;
    }

    // Handle AUTH_SUCCESS - notification from auth page
    if (messageType === 'AUTH_SUCCESS') {
      this.handleAuthSuccess();
      sendResponse({ success: true });
      return true;
    }

    // Validate sender origin for other messages
    if (!this.validateSenderOrigin(sender)) {
      this.logger.warn('Rejected message from unauthorized sender', {
        type: messageType,
        senderId: sender.id,
        tabUrl: sender.tab?.url,
      });
      sendResponse({
        success: false,
        error: 'Unauthorized sender',
        requestId: message.requestId,
      });
      return true;
    }

    // Log incoming message
    this.logger.debug('Received message', { type: messageType, requestId: message.requestId });

    // Handle messages asynchronously
    this.handleMessage(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId: message.requestId,
        });
      });

    return true; // Keep channel open for async response
  }

  /**
   * Handle incoming messages (after validation)
   */
  private async handleMessage(message: Message): Promise<MessageResponse> {
    const messageType = message.type as string;

    try {
      let data: unknown;

      switch (messageType) {
        case 'GET_SESSION':
        case MessageType.GET_SESSION:
          data = await this.getSession();
          break;

        case 'DISCONNECT':
        case MessageType.DISCONNECT:
          await this.disconnect();
          data = { success: true };
          break;

        default:
          throw new Error(`Unknown message type: ${messageType}`);
      }

      return {
        success: true,
        data,
        requestId: message.requestId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId,
      };
    }
  }

  // ==========================================================================
  // Extension Lifecycle Events
  // ==========================================================================

  /**
   * Handle extension startup
   */
  async handleStartup(): Promise<void> {
    this.logger.info('Extension startup');
    const hasSession = await this.hasActiveSession();
    if (!hasSession) {
      await this.clearAllStorage();
      this.logger.debug('Cleared stale session data');
    }
  }

  /**
   * Handle extension installation
   */
  async handleInstalled(details: { reason: string; previousVersion?: string }): Promise<void> {
    if (details.reason === 'install') {
      this.logger.info('Extension installed');
    } else if (details.reason === 'update') {
      this.logger.info('Extension updated', { previousVersion: details.previousVersion });
    }
  }
}

export default BackgroundController;
