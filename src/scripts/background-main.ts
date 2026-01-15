/**
 * @deprecated This file is kept for reference only. The active entry point is:
 * ./entry/background-entry.ts → BackgroundController
 * 
 * This file will be removed in v3.0.0
 * 
 * Background Service Worker Main Module (Manifest V3)
 *
 * This is the main module loaded by background-bootstrap.ts
 *
 * Responsibilities:
 * 1. Session management (storage, validation, disconnect)
 * 2. Open auth page for wallet connection (Extension-First flow)
 * 3. Handle CJ_* message protocol from content script
 * 4. Keep-alive system for service worker
 *
 * Architecture (Extension-First):
 * - Wallet connection happens directly in auth.html/auth.ts
 * - Background manages session state only
 * - Content script handles CJ_* messages between page and extension
 *
 * Security Notes:
 * - Session tokens use chrome.storage.session (cleared on browser close)
 * - Non-sensitive data uses chrome.storage.local (persistent)
 */

import { apiClient } from './api';
import { StorageKeys, MessageType } from './types';
import { ALLOWED_ORIGINS as CONFIG_ALLOWED_ORIGINS } from './config';
import {
  initializeOnWakeUp,
  recordActivity,
} from './sw-state';
import {
  initializeServiceWorkerKeepAlive,
} from './sw-keepalive';
import { backgroundLogger as logger } from './logger';
import { errorReporter } from './error-reporting';
import type {
  Message,
  MessageResponse,
  StorageData,
} from './types';

// ============================================================================
// Allowed Origins for Security
// ============================================================================

const ALLOWED_ORIGINS = CONFIG_ALLOWED_ORIGINS;

// ============================================================================
// Storage Keys by Security Level
// ============================================================================

// Keys for session storage (cleared on browser close) - SENSITIVE DATA
const SESSION_STORAGE_KEYS = [StorageKeys.SESSION_TOKEN] as const;

/**
 * Storage helper functions with security-aware storage selection
 */
const storage = {
  /**
   * Get a value - automatically selects storage based on key sensitivity
   */
  async get<K extends StorageKeys>(key: K): Promise<StorageData[K] | undefined> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    const storageArea = isSecure ? chrome.storage.session : chrome.storage.local;
    const result = await storageArea.get(key);
    return result[key];
  },

  /**
   * Set a value - automatically selects storage based on key sensitivity
   */
  async set<K extends StorageKeys>(key: K, value: StorageData[K]): Promise<void> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    const storageArea = isSecure ? chrome.storage.session : chrome.storage.local;
    await storageArea.set({ [key]: value });
  },

  /**
   * Remove a value from appropriate storage
   */
  async remove(key: StorageKeys): Promise<void> {
    const isSecure = SESSION_STORAGE_KEYS.includes(key as typeof SESSION_STORAGE_KEYS[number]);
    const storageArea = isSecure ? chrome.storage.session : chrome.storage.local;
    await storageArea.remove(key);
  },

  /**
   * Clear all storage (both session and local)
   */
  async clear(): Promise<void> {
    await Promise.all([
      chrome.storage.session.clear(),
      chrome.storage.local.clear(),
    ]);
  },
};

// ============================================================================
// Session Management
// ============================================================================

/**
 * Session Manager - handles session validation and disconnect
 */
class SessionManager {
  /**
   * Check if user has active session
   */
  async hasActiveSession(): Promise<boolean> {
    const token = await storage.get(StorageKeys.SESSION_TOKEN);
    if (!token) return false;

    try {
      const validation = await apiClient.validateSession(token);
      return validation.valid;
    } catch (error) {
      logger.error('Session validation failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Get current session info
   */
  async getSession(): Promise<StorageData | null> {
    const [token, address, chainId, accountMode] = await Promise.all([
      storage.get(StorageKeys.SESSION_TOKEN),
      storage.get(StorageKeys.CONNECTED_ADDRESS),
      storage.get(StorageKeys.CHAIN_ID),
      storage.get(StorageKeys.ACCOUNT_MODE),
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
    const token = await storage.get(StorageKeys.SESSION_TOKEN);

    // Notify backend
    if (token) {
      try {
        await apiClient.disconnect(token);
      } catch (error) {
        logger.error('Backend disconnect failed', { error: String(error) });
      }
    }

    // Clear local storage
    await storage.clear();

    // Notify content scripts
    this.notifyDisconnect();
  }

  /**
   * Notify content scripts of disconnect
   */
  private notifyDisconnect(): void {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'DISCONNECT_EVENT',
          } as Message).catch(() => {
            // Tab might not have content script, ignore
          });
        }
      });
    });
  }
}

// ============================================================================
// Auth Tab Management
// ============================================================================

/** Currently open auth tab ID (prevents duplicates) */
let openAuthTabId: number | null = null;

/**
 * Open the auth page in a new tab or focus existing
 */
async function openAuthTab(): Promise<{ success: boolean; tabId?: number; error?: string }> {
  try {
    // Check if auth tab is already open
    if (openAuthTabId !== null) {
      try {
        const existingTab = await chrome.tabs.get(openAuthTabId);
        if (existingTab) {
          // Focus the existing tab
          await chrome.tabs.update(openAuthTabId, { active: true });
          await chrome.windows.update(existingTab.windowId, { focused: true });
          logger.debug('Focused existing auth tab', { tabId: openAuthTabId });
          return { success: true, tabId: openAuthTabId };
        }
      } catch {
        // Tab no longer exists, clear the reference
        openAuthTabId = null;
      }
    }

    // Create new auth tab
    const authUrl = chrome.runtime.getURL('auth.html');
    const newTab = await chrome.tabs.create({ url: authUrl, active: true });

    if (newTab.id) {
      openAuthTabId = newTab.id;
      logger.info('Opened new auth tab', { tabId: newTab.id });

      // Listen for tab close to clear the reference
      const onRemoved = (tabId: number) => {
        if (tabId === openAuthTabId) {
          openAuthTabId = null;
          chrome.tabs.onRemoved.removeListener(onRemoved);
          logger.debug('Auth tab closed', { tabId });
        }
      };
      chrome.tabs.onRemoved.addListener(onRemoved);

      return { success: true, tabId: newTab.id };
    }

    return { success: false, error: 'Failed to create auth tab' };
  } catch (error) {
    logger.error('Failed to open auth tab', { error: String(error) });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// Service Worker Initialization
// ============================================================================

const sessionManager = new SessionManager();

/**
 * Validate message sender origin
 * Returns true if valid, false if invalid
 */
function validateSenderOrigin(sender: chrome.runtime.MessageSender): boolean {
  // Messages from our extension (popup, auth page, etc.)
  if (!sender.tab && sender.id === chrome.runtime.id) {
    return true; // Trusted extension origin
  }

  // Messages from extension pages (auth.html)
  if (sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}`)) {
    return true;
  }

  // Messages from content scripts (has tab URL)
  if (sender.tab?.url) {
    try {
      const senderOrigin = new URL(sender.tab.url).origin;
      return ALLOWED_ORIGINS.some((allowed) =>
        senderOrigin.startsWith(allowed.replace('/*', '').replace('*', ''))
      );
    } catch {
      return false;
    }
  }

  // Unknown sender - reject
  return false;
}

/**
 * Track service worker initialization state
 */
let isServiceWorkerReady = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Listen for messages from content scripts, popup, and auth page
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const messageType = message.type as string;

  // CRITICAL: Handle PING immediately without any async operations
  if (messageType === 'PING') {
    sendResponse({
      success: true,
      data: { pong: true, timestamp: Date.now(), ready: isServiceWorkerReady },
      requestId: message.requestId
    });
    return true;
  }

  // Handle OPEN_AUTH_TAB - open the auth page in a new tab
  if (messageType === 'OPEN_AUTH_TAB') {
    openAuthTab()
      .then((result) => sendResponse(result))
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
    logger.info('Auth success notification received', { payload: message.payload });
    openAuthTabId = null;
    sendResponse({ success: true });
    return true;
  }

  // Validate sender origin for other messages
  if (!validateSenderOrigin(sender)) {
    logger.warn('Rejected message from unauthorized sender', {
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
  logger.debug('Received message', { type: messageType, requestId: message.requestId });

  // Handle messages asynchronously
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      void errorReporter.report(error, {
        messageType,
        requestId: message.requestId,
      });

      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId,
      });
    });

  return true; // Keep channel open for async response
});

/**
 * Handle incoming messages
 */
async function handleMessage(message: Message): Promise<MessageResponse> {
  const messageType = message.type as string;

  try {
    let data: unknown;

    switch (messageType) {
      case 'GET_SESSION':
      case MessageType.GET_SESSION:
        data = await sessionManager.getSession();
        break;

      case 'DISCONNECT':
      case MessageType.DISCONNECT:
        await sessionManager.disconnect();
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

/**
 * Check session on extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Extension startup');
  await initializeOnWakeUp();

  const hasSession = await sessionManager.hasActiveSession();
  if (!hasSession) {
    await storage.clear();
    logger.debug('Cleared stale session data');
  }
});

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    logger.info('Extension installed');
    await initializeOnWakeUp();
  } else if (details.reason === 'update') {
    logger.info('Extension updated', { previousVersion: details.previousVersion });
  }
});

// ============================================================================
// Service Worker Initialization
// ============================================================================

/**
 * Full initialization sequence
 */
async function initializeBackgroundScript(): Promise<void> {
  try {
    // Initialize state management (handles wake-up recovery)
    await initializeOnWakeUp();

    // Initialize keep-alive system (alarms)
    await initializeServiceWorkerKeepAlive();

    // Mark service worker as ready
    isServiceWorkerReady = true;
    logger.info('Background service worker fully initialized');
  } catch (error) {
    logger.error('Failed to initialize service worker', { error: String(error) });
    void errorReporter.report(error, { source: 'service-worker-init' });
    isServiceWorkerReady = true; // Still mark ready so messages can be processed
  }
}

// Run initialization and track the promise
initializationPromise = initializeBackgroundScript();

// Suppress unused variable warning
void initializationPromise;

// Record activity on each message to track service worker state
chrome.runtime.onMessage.addListener(() => {
  recordActivity();
  return false; // Don't interfere with other listeners
});

export {};
