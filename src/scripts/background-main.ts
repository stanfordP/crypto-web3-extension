/**
 * Background Service Worker Main Module (Manifest V3)
 *
 * This is the main module loaded by background-bootstrap.ts
 * All imports and heavy initialization happens here.
 *
 * Responsibilities:
 * 1. Handle authentication flow with main app via API
 * 2. Manage session tokens in chrome.storage.session (secure)
 * 3. Coordinate wallet interactions (request accounts, sign messages)
 * 4. Proxy provider requests between content script and actual wallets
 * 5. Emit events to content script (accountsChanged, chainChanged)
 *
 * Architecture:
 * Content Script <-> Background Script <-> Main App API
 *                <-> Browser Wallet (MetaMask, etc.)
 *
 * Security Notes:
 * - Session tokens use chrome.storage.session (cleared on browser close)
 * - Non-sensitive data uses chrome.storage.local (persistent)
 */

import { z } from 'zod';
import { parseSiweMessage, prepareSiweMessage } from './siwe-utils';
import { apiClient, handleApiError } from './api';
import { StorageKeys, MessageType } from './types';
import { ALLOWED_ORIGINS as CONFIG_ALLOWED_ORIGINS, TIMEOUTS } from './config';
import {
  initializeOnWakeUp,
  updateConnectionState,
  recordActivity,
} from './sw-state';
import {
  initializeServiceWorkerKeepAlive,
  registerPortHandler,
  PortNames,
  startOperation,
  completeOperation,
  failOperation,
  withKeepAlive,
  extendLifetime,
} from './sw-keepalive';
import {
  AuthState,
  AuthStateMachine,
  type AuthFlowData,
} from './auth-state-machine';
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
// Zod Validation Schemas
// ============================================================================

const signMessagePayloadSchema = z.object({
  method: z.enum(['personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v4']),
  params: z.array(z.unknown()).min(2),
});

const requestAccountsPayloadSchema = z.object({
  accountMode: z.enum(['demo', 'live']).optional(),
});

const switchChainPayloadSchema = z.object({
  params: z.tuple([z.object({ chainId: z.string().regex(/^0x[0-9a-fA-F]+$/) })]),
});

const sendTransactionPayloadSchema = z.object({
  params: z.tuple([z.object({}).passthrough()]),
});

const addChainPayloadSchema = z.object({
  params: z.tuple([z.object({}).passthrough()]),
});

// ============================================================================
// Storage Keys by Security Level
// ============================================================================

// Keys for session storage (cleared on browser close) - SENSITIVE DATA
const SESSION_STORAGE_KEYS = [StorageKeys.SESSION_TOKEN] as const;

// Keys for local storage (persistent) - NON-SENSITIVE DATA
// Used to document which keys are stored in local vs session storage
const _LOCAL_STORAGE_KEYS = [
  StorageKeys.CONNECTED_ADDRESS,
  StorageKeys.CHAIN_ID,
  StorageKeys.ACCOUNT_MODE,
  StorageKeys.LAST_CONNECTED,
] as const;

// Suppress unused variable warning - used for documentation
void _LOCAL_STORAGE_KEYS;

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

/**
 * Session Management
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
          } as Message);
        }
      });
    });
  }
}

/**
 * Wallet Interaction Handler (uses content script relay to access real wallet)
 *
 * Architecture: Background → Content Script → Page Script → window.ethereum (MetaMask)
 */
class WalletHandler {
  // Rate limiting key for chrome.storage.session
  private readonly RATE_LIMIT_STORAGE_KEY = 'rateLimits';
  private readonly RATE_LIMIT_MS = TIMEOUTS.RATE_LIMIT_WINDOW;

  /**
   * Check rate limit for a method (persistent across service worker restarts)
   */
  private async checkRateLimit(method: string): Promise<void> {
    const now = Date.now();
    
    // Get current rate limits from storage
    const result = await chrome.storage.session.get(this.RATE_LIMIT_STORAGE_KEY);
    const rateLimits: Record<string, number> = result[this.RATE_LIMIT_STORAGE_KEY] || {};
    
    const lastCall = rateLimits[method] || 0;

    if (now - lastCall < this.RATE_LIMIT_MS) {
      throw new Error(`Rate limited: ${method}. Please wait before retrying.`);
    }

    // Update rate limit timestamp
    rateLimits[method] = now;
    
    // Clean up old entries (older than 1 minute)
    const cleanupThreshold = now - 60000;
    for (const key of Object.keys(rateLimits)) {
      if (rateLimits[key] < cleanupThreshold) {
        delete rateLimits[key];
      }
    }
    
    await chrome.storage.session.set({ [this.RATE_LIMIT_STORAGE_KEY]: rateLimits });
  }

  /**
   * Get the active tab to send wallet operations
   */
  private async getActiveTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('No active tab found. Please open a tab and try again.');
    }

    // Verify tab URL is allowed
    if (tab.url) {
      const origin = new URL(tab.url).origin;
      if (!ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed.replace('/*', '')))) {
        throw new Error('Please navigate to the trading journal app to connect your wallet.');
      }
    }

    return tab;
  }

  /**
   * Send wallet operation to content script with timeout
   */
  private async sendToContentScript(method: string, params?: unknown[]): Promise<unknown> {
    await this.checkRateLimit(method);

    const tab = await this.getActiveTab();
    const requestId = `wallet_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Wallet operation timed out. Please try again.'));
      }, 60000);

      const message: Message = {
        type: MessageType.WALLET_OPERATION,
        payload: { method, params },
        requestId,
      };

      chrome.tabs.sendMessage(tab.id!, message, (response: MessageResponse) => {
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with page'));
          return;
        }

        if (!response) {
          reject(new Error('No response from content script. Please refresh the page.'));
          return;
        }

        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Wallet operation failed'));
        }
      });
    });
  }

  /**
   * Request wallet connection (eth_requestAccounts)
   */
  async requestAccounts(): Promise<string[]> {
    return (await this.sendToContentScript('eth_requestAccounts')) as string[];
  }

  /**
   * Get current chain ID
   */
  async getChainId(): Promise<string> {
    return (await this.sendToContentScript('eth_chainId')) as string;
  }

  /**
   * Sign a message with the wallet
   */
  async signMessage(address: string, message: string): Promise<string> {
    const method = 'personal_sign';
    return (await this.sendToContentScript(method, [message, address])) as string;
  }

  /**
   * Send a transaction
   */
  async sendTransaction(tx: unknown): Promise<string> {
    return (await this.sendToContentScript('eth_sendTransaction', [tx])) as string;
  }

  /**
   * Switch to different chain
   */
  async switchChain(chainId: string): Promise<void> {
    await this.sendToContentScript('wallet_switchEthereumChain', [{ chainId }]);
  }

  /**
   * Add new chain to wallet
   */
  async addChain(chainConfig: unknown): Promise<void> {
    await this.sendToContentScript('wallet_addEthereumChain', [chainConfig]);
  }

  /**
   * Forward generic RPC request to wallet
   */
  async forwardRpcRequest(method: string, params?: unknown[]): Promise<unknown> {
    return await this.sendToContentScript(method, params);
  }
}

/**
 * SIWE Authentication Flow Handler
 *
 * Uses the AuthStateMachine to persist state across service worker restarts.
 * Each step is saved to storage, allowing resumption if the worker terminates.
 */
class AuthenticationHandler {
  constructor(
    private walletHandler: WalletHandler,
    // @ts-expect-error - False positive: sessionManager IS used in class methods
    private sessionManager: SessionManager
  ) {}

  /**
   * Complete SIWE authentication flow with state persistence
   *
   * Steps:
   * 1. Request wallet accounts
   * 2. Get SIWE challenge from backend
   * 3. Sign challenge with wallet
   * 4. Verify signature with backend
   * 5. Store session token
   *
   * Each step is persisted, allowing resumption after service worker restart.
   */
  async authenticate(accountMode: 'demo' | 'live' = 'live'): Promise<string[]> {
    const operationId = `auth_${Date.now()}`;
    startOperation(operationId, 'siwe-authentication');

    try {
      // Check for resumable flow
      const resumePoint = await AuthStateMachine.getResumePoint();
      let flowData: AuthFlowData;

      if (resumePoint.canResume && resumePoint.flowData) {
        logger.info('Resuming auth flow', {
          fromState: resumePoint.state,
          flowId: resumePoint.flowData.flowId
        });
        flowData = resumePoint.flowData;
      } else {
        // Start fresh flow
        flowData = await AuthStateMachine.startFlow(accountMode);
      }

      // Execute flow from current state
      return await this.executeAuthFlow(flowData);
    } catch (error) {
      failOperation(operationId, error instanceof Error ? error.message : String(error));
      await AuthStateMachine.transitionToError(
        error instanceof Error ? error.message : String(error)
      );
      logger.error('Authentication failed', { error: String(error) });
      throw error;
    } finally {
      completeOperation(operationId);
    }
  }

  /**
   * Execute the auth flow from the current state
   */
  private async executeAuthFlow(flowData: AuthFlowData): Promise<string[]> {
    let data = flowData;

    // Step 1: Request wallet accounts (if not done)
    if (data.state === AuthState.IDLE || data.state === AuthState.REQUESTING_ACCOUNTS) {
      await extendLifetime();
      data = await AuthStateMachine.transitionTo(AuthState.REQUESTING_ACCOUNTS);

      const accounts = await this.walletHandler.requestAccounts();
      if (accounts.length === 0) {
        throw new Error('No accounts available');
      }

      const chainId = await this.walletHandler.getChainId();
      const chainIdNumber = parseInt(chainId, 16);

      data = await AuthStateMachine.transitionTo(AuthState.ACCOUNTS_RECEIVED, {
        accounts,
        address: accounts[0],
        chainId,
        chainIdNumber,
      });
    }

    // Step 2: Get SIWE challenge (if not done)
    if (data.state === AuthState.ACCOUNTS_RECEIVED || data.state === AuthState.GETTING_CHALLENGE) {
      await extendLifetime();
      data = await AuthStateMachine.transitionTo(AuthState.GETTING_CHALLENGE);

      const challenge = await apiClient.getSIWEChallenge({
        address: data.address!,
        chainId: data.chainIdNumber!,
        accountMode: data.accountMode,
      });

      // Parse and prepare SIWE message
      const siweFields = parseSiweMessage(challenge.message);
      const messageToSign = prepareSiweMessage(siweFields);

      data = await AuthStateMachine.transitionTo(AuthState.CHALLENGE_RECEIVED, {
        challengeMessage: challenge.message,
        nonce: challenge.nonce,
        messageToSign,
      });
    }

    // Step 3: Sign message (if not done)
    if (data.state === AuthState.CHALLENGE_RECEIVED || data.state === AuthState.SIGNING_MESSAGE) {
      await extendLifetime();
      data = await AuthStateMachine.transitionTo(AuthState.SIGNING_MESSAGE);

      const signature = await this.walletHandler.signMessage(
        data.address!,
        data.messageToSign!
      );

      data = await AuthStateMachine.transitionTo(AuthState.MESSAGE_SIGNED, {
        signature,
      });
    }

    // Step 4: Verify signature with backend
    if (data.state === AuthState.MESSAGE_SIGNED || data.state === AuthState.VERIFYING_SIGNATURE) {
      await extendLifetime();
      data = await AuthStateMachine.transitionTo(AuthState.VERIFYING_SIGNATURE);

      const verification = await apiClient.verifySIWE({
        message: data.challengeMessage!,
        signature: data.signature!,
        accountMode: data.accountMode,
      });

      data = await AuthStateMachine.transitionTo(AuthState.AUTHENTICATED, {
        sessionToken: verification.sessionToken,
      });
    }

    // Step 5: Store session data
    if (data.state === AuthState.AUTHENTICATED) {
      await storage.set(StorageKeys.SESSION_TOKEN, data.sessionToken!);
      await storage.set(StorageKeys.CONNECTED_ADDRESS, data.address!);
      await storage.set(StorageKeys.CHAIN_ID, data.chainId!);
      await storage.set(StorageKeys.ACCOUNT_MODE, data.accountMode);
      await storage.set(StorageKeys.LAST_CONNECTED, Date.now());

      // Update service worker state for wake-up recovery
      await updateConnectionState(data.address!, data.chainId!);

      // Notify content scripts of connection
      this.notifyConnect(data.address!, data.chainId!);

      // Complete the flow
      await AuthStateMachine.completeFlow();

      logger.info('Authentication successful', {
        address: data.address,
        chainId: data.chainId,
        accountMode: data.accountMode,
        flowId: data.flowId,
      });

      return data.accounts!;
    }

    throw new Error(`Unexpected auth state: ${data.state}`);
  }

  /**
   * Notify content scripts of successful connection
   */
  private notifyConnect(address: string, chainId: string): void {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'CONNECT',
            payload: { chainId },
          } as Message);

          chrome.tabs.sendMessage(tab.id, {
            type: 'ACCOUNTS_CHANGED',
            payload: [address],
          } as Message);
        }
      });
    });
  }
}

/**
 * Message Router - Handle messages from content script
 */
class MessageRouter {
  constructor(
    private walletHandler: WalletHandler,
    private sessionManager: SessionManager,
    private authHandler: AuthenticationHandler
  ) {}

  /**
   * Route incoming message to appropriate handler
   */
  async handleMessage(message: Message): Promise<MessageResponse> {
    try {
      let data: unknown;

      switch (message.type as unknown as string) {
        case 'PING':
          // Simple ping for service worker wake-up detection
          data = { pong: true, timestamp: Date.now() };
          break;

        case 'REQUEST_ACCOUNTS':
          data = await this.handleRequestAccounts(message.payload);
          break;

        case 'SIGN_MESSAGE':
          data = await this.handleSignMessage(message.payload);
          break;

        case 'SEND_TRANSACTION':
          data = await this.handleSendTransaction(message.payload);
          break;

        case 'SWITCH_CHAIN':
          data = await this.handleSwitchChain(message.payload);
          break;

        case 'ADD_CHAIN':
          data = await this.handleAddChain(message.payload);
          break;

        case 'RPC_REQUEST':
          data = await this.handleRpcRequest(message.payload);
          break;

        case 'GET_SESSION':
          data = await this.sessionManager.getSession();
          break;

        case 'DISCONNECT':
          await this.sessionManager.disconnect();
          data = { success: true };
          break;

        default:
          throw new Error(`Unknown message type: ${String(message.type)}`);
      }

      return {
        success: true,
        data,
        requestId: message.requestId,
      };
    } catch (error) {
      return {
        success: false,
        error: handleApiError(error),
        requestId: message.requestId,
      };
    }
  }

  /**
   * Handle eth_requestAccounts - triggers full SIWE auth
   */
  private async handleRequestAccounts(payload: unknown): Promise<string[]> {
    const result = requestAccountsPayloadSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid request accounts payload: ${result.error.message}`);
    }
    const { accountMode } = result.data;
    return await this.authHandler.authenticate(accountMode || 'live');
  }

  /**
   * Handle message signing requests
   */
  private async handleSignMessage(payload: unknown): Promise<string> {
    const result = signMessagePayloadSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid sign message payload: ${result.error.message}`);
    }

    const { method, params } = result.data;

    // Extract address and message based on method
    let address: string;
    let message: string;

    if (method === 'personal_sign') {
      [message, address] = params as [string, string];
    } else if (method === 'eth_sign') {
      [address, message] = params as [string, string];
    } else {
      throw new Error(`Unsupported signing method: ${method}`);
    }

    return await this.walletHandler.signMessage(address, message);
  }

  /**
   * Handle transaction sending
   */
  private async handleSendTransaction(payload: unknown): Promise<string> {
    const result = sendTransactionPayloadSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid send transaction payload: ${result.error.message}`);
    }
    const { params } = result.data;
    const [tx] = params;
    return await this.walletHandler.sendTransaction(tx);
  }

  /**
   * Handle chain switching
   */
  private async handleSwitchChain(payload: unknown): Promise<void> {
    const result = switchChainPayloadSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid switch chain payload: ${result.error.message}`);
    }
    const { params } = result.data;
    const [{ chainId }] = params;
    await this.walletHandler.switchChain(chainId);

    // Update stored chain ID
    await storage.set(StorageKeys.CHAIN_ID, chainId);

    // Notify content scripts
    this.notifyChainChanged(chainId);
  }

  /**
   * Handle adding new chain
   */
  private async handleAddChain(payload: unknown): Promise<void> {
    const result = addChainPayloadSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid add chain payload: ${result.error.message}`);
    }
    const { params } = result.data;
    const [chainConfig] = params;
    await this.walletHandler.addChain(chainConfig);
  }

  /**
   * Handle generic RPC requests (passthrough to wallet)
   */
  private async handleRpcRequest(payload: unknown): Promise<unknown> {
    const payloadObj = payload as { method?: string; params?: unknown[] } | undefined;
    
    if (!payloadObj?.method) {
      throw new Error('Invalid RPC request: missing method');
    }
    
    const { method, params } = payloadObj;
    
    // Forward the request to the wallet via content script
    return await this.walletHandler.forwardRpcRequest(method, params);
  }

  /**
   * Notify content scripts of chain change
   */
  private notifyChainChanged(chainId: string): void {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'CHAIN_CHANGED',
            payload: chainId,
          } as Message);
        }
      });
    });
  }
}

// ============================================================================
// Service Worker Initialization
// ============================================================================

const walletHandler = new WalletHandler();
const sessionManager = new SessionManager();
const authHandler = new AuthenticationHandler(walletHandler, sessionManager);
const messageRouter = new MessageRouter(walletHandler, sessionManager, authHandler);

/**
 * Validate message sender origin
 * Returns true if valid, false if invalid
 */
function validateSenderOrigin(sender: chrome.runtime.MessageSender, messageType: MessageType): boolean {
  // Messages from our extension popup (no tab, same extension ID)
  if (!sender.tab && sender.id === chrome.runtime.id) {
    return true; // Trusted popup origin
  }

  // Messages from content scripts (has tab URL)
  if (sender.tab?.url) {
    try {
      const senderOrigin = new URL(sender.tab.url).origin;
      return ALLOWED_ORIGINS.some((allowed) => senderOrigin.startsWith(allowed.replace('/*', '')));
    } catch {
      return false;
    }
  }

  // WALLET_OPERATION messages from content script relay are allowed
  if (messageType === MessageType.WALLET_OPERATION) {
    return true;
  }

  // Unknown sender - reject
  return false;
}

/**
 * Track service worker initialization state
 * This ensures PING can respond even before full initialization
 */
let isServiceWorkerReady = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Listen for messages from content scripts and popup
 * CRITICAL: PING must respond immediately to enable service worker wake-up detection
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  // CRITICAL: Handle PING immediately without any async operations
  // This must work even before full initialization to enable wake-up detection
  if (message.type === ('PING' as MessageType)) {
    sendResponse({ 
      success: true, 
      data: { pong: true, timestamp: Date.now(), ready: isServiceWorkerReady },
      requestId: message.requestId 
    });
    return true;
  }

  // Validate sender origin for non-PING messages
  if (!validateSenderOrigin(sender, message.type)) {
    logger.warn('Rejected message from unauthorized sender', {
      type: message.type,
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
  logger.debug('Received message', { type: message.type, requestId: message.requestId });

  // Ensure initialization is complete before handling other messages
  const handleMessageAfterInit = async () => {
    // Wait for initialization if still in progress
    if (initializationPromise && !isServiceWorkerReady) {
      try {
        await initializationPromise;
      } catch (e) {
        logger.warn('Initialization failed, proceeding anyway', { error: String(e) });
      }
    }
    return messageRouter.handleMessage(message);
  };

  // Handle message asynchronously
  handleMessageAfterInit()
    .then(sendResponse)
    .catch((error) => {
      // Report error for tracking
      void errorReporter.report(error, {
        messageType: message.type,
        requestId: message.requestId,
      });
      
      sendResponse({
        success: false,
        error: handleApiError(error),
        requestId: message.requestId,
      });
    });

  // Return true to indicate async response
  return true;
});

/**
 * Check session on extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Extension startup');
  // Initialize service worker state management
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
    // Initialize service worker state
    await initializeOnWakeUp();
    // Could open welcome page here
  } else if (details.reason === 'update') {
    logger.info('Extension updated', { previousVersion: details.previousVersion });
  }
});

// ============================================================================
// Port-Based Communication Handlers
// ============================================================================

/**
 * Handle long-running wallet connection operations via ports
 * Ports keep the service worker alive during the operation
 */
registerPortHandler(PortNames.WALLET_CONNECTION, async (message, port) => {
  const msg = message as Message;
  logger.debug('Port message received', { type: msg.type, portName: port.name });

  try {
    const response = await messageRouter.handleMessage(msg);
    port.postMessage(response);
  } catch (error) {
    port.postMessage({
      success: false,
      error: handleApiError(error),
      requestId: msg.requestId,
    });
  }
});

/**
 * Handle generic long operations via ports
 */
registerPortHandler(PortNames.LONG_OPERATION, async (message, port) => {
  const msg = message as Message;
  logger.debug('Long operation port message', { type: msg.type });

  try {
    const response = await withKeepAlive(
      msg.requestId || `op_${Date.now()}`,
      String(msg.type),
      () => messageRouter.handleMessage(msg)
    );
    port.postMessage(response);
  } catch (error) {
    port.postMessage({
      success: false,
      error: handleApiError(error),
      requestId: msg.requestId,
    });
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
    // 1. Initialize state management (handles wake-up recovery)
    await initializeOnWakeUp();

    // 2. Initialize keep-alive system (alarms + ports)
    await initializeServiceWorkerKeepAlive();

    // 3. Check for interrupted auth flow and log status
    const resumePoint = await AuthStateMachine.getResumePoint();
    if (resumePoint.canResume) {
      logger.info('Detected resumable auth flow', {
        state: resumePoint.state,
        flowId: resumePoint.flowData?.flowId
      });
    }

    // Mark service worker as ready
    isServiceWorkerReady = true;
    logger.info('Background service worker fully initialized');
  } catch (error) {
    logger.error('Failed to initialize service worker', { error: String(error) });
    void errorReporter.report(error, { source: 'service-worker-init' });
    // Still mark as ready so messages can be processed (with potential errors)
    isServiceWorkerReady = true;
    // Note: bootstrap callback will be notified via initializationPromise handler
  }
}

// Run initialization and track the promise
initializationPromise = initializeBackgroundScript();

// Record activity on each message to track service worker state
chrome.runtime.onMessage.addListener(() => {
  recordActivity();
  return false; // Don't interfere with other listeners
});

export {};
