/**
 * Content Script - Bridge for Extension-First architecture
 *
 * Responsibilities:
 * 1. Handle CJ_* messages from main app (extension detection, auth trigger, session)
 * 2. Inject wallet script for page-context wallet interactions
 * 3. Relay session state changes to the page
 * 4. Service worker health checks
 *
 * IMPORTANT: Runs at document_start for early message handling
 */

import { StorageKeys, PageMessageType, ErrorCode } from './types';
import { isAllowedOrigin, API_BASE_URL, API_ENDPOINTS } from './config';
import { contentLogger as logger } from './logger';
import type { PageSession, MessageResponse } from './types';

// ============================================================================
// Rate Limiting (prevents message spam from malicious pages)
// ============================================================================

/** Token bucket rate limiter for postMessage handling */
interface RateLimiter {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

const rateLimiter: RateLimiter = {
  tokens: 20,        // Start with 20 tokens
  lastRefill: Date.now(),
  maxTokens: 20,     // Max 20 tokens
  refillRate: 5,     // Refill 5 tokens per second
};

/**
 * Check if a request should be rate limited
 * Uses token bucket algorithm - allows bursts while limiting sustained rate
 */
function isRateLimited(): boolean {
  const now = Date.now();
  const elapsed = (now - rateLimiter.lastRefill) / 1000; // seconds

  // Refill tokens based on elapsed time
  rateLimiter.tokens = Math.min(
    rateLimiter.maxTokens,
    rateLimiter.tokens + elapsed * rateLimiter.refillRate
  );
  rateLimiter.lastRefill = now;

  // Try to consume a token
  if (rateLimiter.tokens >= 1) {
    rateLimiter.tokens -= 1;
    return false; // Not rate limited
  }

  return true; // Rate limited
}

// ============================================================================
// Request Deduplication (prevents duplicate auth flows)
// ============================================================================

/** Track in-flight requests to prevent duplicates */
const inFlightRequests = new Map<string, { startTime: number; promise: Promise<void> }>();
const REQUEST_TIMEOUT = 60000; // 60 seconds max for any request

/**
 * Clean up stale in-flight requests
 */
function cleanupStaleRequests(): void {
  const now = Date.now();
  for (const [key, value] of inFlightRequests.entries()) {
    if (now - value.startTime > REQUEST_TIMEOUT) {
      inFlightRequests.delete(key);
      logger.debug('Cleaned up stale request', { key });
    }
  }
}

/**
 * Check if a request type is already in flight
 */
function isRequestInFlight(type: string): boolean {
  cleanupStaleRequests();
  return inFlightRequests.has(type);
}

/**
 * Mark a request as in flight
 */
function markRequestInFlight(type: string, promise: Promise<void>): void {
  inFlightRequests.set(type, { startTime: Date.now(), promise });
  promise.finally(() => {
    inFlightRequests.delete(type);
  });
}

/**
 * Send v2.0 error response
 */
function sendError(
  code: ErrorCode,
  message: string,
  originalType?: string,
  requestId?: string
): void {
  window.postMessage({
    type: PageMessageType.CJ_ERROR,
    success: false,
    code,
    message,
    originalType,
    requestId,
  }, window.location.origin);
}

// ============================================================================
// Wallet Message Types (for injected script communication)
// ============================================================================

const WalletMessageType = {
  CJ_WALLET_CHECK: 'CJ_WALLET_CHECK',
  CJ_WALLET_CHECK_RESULT: 'CJ_WALLET_CHECK_RESULT',
  CJ_WALLET_CONNECT: 'CJ_WALLET_CONNECT',
  CJ_WALLET_CONNECT_RESULT: 'CJ_WALLET_CONNECT_RESULT',
  CJ_WALLET_SIGN: 'CJ_WALLET_SIGN',
  CJ_WALLET_SIGN_RESULT: 'CJ_WALLET_SIGN_RESULT',
} as const;

// ============================================================================
// Injected Script Management
// ============================================================================

let isInjectedScriptReady = false;
let injectedScriptPromise: Promise<void> | null = null;
let isInjectionAttempted = false; // Prevent multiple injection attempts

/**
 * Inject the wallet interaction script into the page context
 * This is needed because content scripts cannot access window.ethereum directly
 *
 * Uses exponential backoff for the fallback timeout to handle slow wallet extensions
 */
function injectWalletScript(): Promise<void> {
  if (injectedScriptPromise) return injectedScriptPromise;

  // Prevent re-injection if already attempted
  if (isInjectionAttempted && isInjectedScriptReady) {
    return Promise.resolve();
  }
  isInjectionAttempted = true;

  injectedScriptPromise = new Promise((resolve) => {
    let resolved = false;

    // Listen for ready signal from injected script
    const readyHandler = (event: MessageEvent) => {
      if (event.data?.type === 'CJ_INJECTED_READY' && !resolved) {
        resolved = true;
        isInjectedScriptReady = true;
        window.removeEventListener('message', readyHandler);
        logger.debug('Injected wallet script ready');
        resolve();
      }
    };
    window.addEventListener('message', readyHandler);

    // Inject the script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected-auth.js');
    script.onload = () => {
      script.remove();

      // Exponential backoff fallback: 200ms, 400ms, 800ms, 1600ms (total ~3s)
      // This handles slow wallet extensions like Phantom that may take time to inject
      const backoffDelays = [200, 400, 800, 1600];
      let attempt = 0;

      const checkReady = () => {
        if (resolved || isInjectedScriptReady) {
          return; // Already resolved
        }

        if (attempt >= backoffDelays.length) {
          // All retries exhausted, proceed anyway
          if (!resolved) {
            resolved = true;
            isInjectedScriptReady = true;
            window.removeEventListener('message', readyHandler);
            logger.warn('Injected script ready timeout after exponential backoff, proceeding anyway');
            resolve();
          }
          return;
        }

        logger.debug('Waiting for injected script ready signal', {
          attempt: attempt + 1,
          delay: backoffDelays[attempt]
        });

        setTimeout(() => {
          attempt++;
          checkReady();
        }, backoffDelays[attempt]);
      };

      // Start the backoff check
      checkReady();
    };
    script.onerror = () => {
      if (!resolved) {
        resolved = true;
        logger.error('Failed to inject wallet script');
        resolve(); // Resolve anyway to not block
      }
    };

    (document.head || document.documentElement).appendChild(script);
  });

  return injectedScriptPromise;
}

/**
 * Send a message to the injected script and wait for response
 */
function sendWalletMessage<T>(type: string, payload?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2);
    const resultType = type + '_RESULT';
    
    const handler = (event: MessageEvent) => {
      if (event.data?.type === resultType && event.data?.requestId === requestId) {
        window.removeEventListener('message', handler);
        resolve(event.data as T);
      }
    };
    
    window.addEventListener('message', handler);
    
    // Timeout after 30 seconds (wallet interactions can take time)
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Wallet request timed out'));
    }, 30000);
    
    window.postMessage({ type, requestId, ...payload }, window.location.origin);
  });
}

// ============================================================================
// Service Worker Health Check
// ============================================================================

/** Track service worker health status */
let isServiceWorkerHealthy = true;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds

/**
 * Check if the service worker is responsive
 */
async function checkServiceWorkerHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Service worker health check timed out');
      resolve(false);
    }, 2000);

    try {
      chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          logger.debug('Service worker health check failed', {
            error: chrome.runtime.lastError.message
          });
          resolve(false);
        } else {
          // Background.ts sends: { success: true, data: { pong: true, ... } }
          // Normalize check to use the canonical structure
          const pong = response?.data?.pong === true;
          resolve(pong);
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      logger.debug('Service worker health check exception', { error: String(error) });
      resolve(false);
    }
  });
}

/**
 * Ensure service worker is healthy before critical operations
 */
async function ensureServiceWorkerHealthy(): Promise<boolean> {
  const now = Date.now();

  // Use cached result if recent
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL && isServiceWorkerHealthy) {
    return true;
  }

  // Perform health check
  isServiceWorkerHealthy = await checkServiceWorkerHealth();
  lastHealthCheck = now;

  if (!isServiceWorkerHealthy) {
    // Try to wake up the service worker
    logger.info('Service worker appears inactive, attempting wake-up');

    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      isServiceWorkerHealthy = await checkServiceWorkerHealth();
      if (isServiceWorkerHealthy) {
        logger.info('Service worker woke up successfully');
        break;
      }
    }
  }

  return isServiceWorkerHealthy;
}

// ============================================================================
// CJ_* Message Handlers (Main App <-> Extension)
// ============================================================================

/**
 * Handle CJ_* messages from the main app
 * These messages allow the main app to:
 * - Detect extension presence
 * - Trigger auth flow
 * - Query session state
 * - Disconnect
 */
function setupPageMessageHandler(): void {
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;

    // Validate origin
    const origin = window.location.origin;
    if (!isAllowedOrigin(origin)) {
      return; // Silently ignore messages from non-allowed origins
    }

    const data = event.data;
    if (!data || typeof data.type !== 'string') return;

    // Only handle CJ_* prefixed messages
    if (!data.type.startsWith('CJ_')) return;

    // Rate limiting check - prevent message spam from malicious pages
    // EXEMPT lightweight detection messages from rate limiting (app polls these frequently)
    const isExemptFromRateLimit =
      data.type === PageMessageType.CJ_CHECK_EXTENSION ||
      data.type === PageMessageType.CJ_GET_SESSION;

    if (!isExemptFromRateLimit && isRateLimited()) {
      logger.warn('Rate limited - too many messages', { type: data.type });
      sendError(
        ErrorCode.REQUEST_TIMEOUT,
        'Too many requests. Please wait and try again.',
        data.type,
        data.requestId
      );
      return;
    }

    logger.debug('Received page message', { type: data.type });

    switch (data.type) {
      // ============================================================================
      // v1.1 Legacy Handlers
      // ============================================================================
      case PageMessageType.CJ_CHECK_EXTENSION:
        handleCheckExtension();
        break;

      case PageMessageType.CJ_OPEN_AUTH: {
        // Add deduplication - prevent multiple auth flows
        if (isRequestInFlight(PageMessageType.CJ_OPEN_AUTH)) {
          logger.warn('Auth flow already in progress, ignoring duplicate request');
          window.postMessage({
            type: PageMessageType.CJ_AUTH_OPENED,
            success: false,
            error: 'Authentication already in progress',
          }, window.location.origin);
          return;
        }
        const authPromise = handleOpenAuth();
        markRequestInFlight(PageMessageType.CJ_OPEN_AUTH, authPromise);
        await authPromise;
        break;
      }

      case PageMessageType.CJ_GET_SESSION:
        await handleGetSession();
        break;

      case PageMessageType.CJ_DISCONNECT:
        await handleDisconnect();
        break;

      // ============================================================================
      // v2.0 Handlers (App-Driven SIWE)
      // ============================================================================
      case PageMessageType.CJ_WALLET_CONNECT: {
        // Deduplication for wallet connect
        if (isRequestInFlight(PageMessageType.CJ_WALLET_CONNECT)) {
          logger.warn('Wallet connect already in progress');
          sendError(
            ErrorCode.ALREADY_IN_PROGRESS,
            'Wallet connection already in progress',
            PageMessageType.CJ_WALLET_CONNECT,
            data.requestId
          );
          return;
        }
        const connectPromise = handleWalletConnectV2(data.requestId);
        markRequestInFlight(PageMessageType.CJ_WALLET_CONNECT, connectPromise);
        await connectPromise;
        break;
      }

      case PageMessageType.CJ_WALLET_SIGN: {
        // Deduplication for wallet sign
        if (isRequestInFlight(PageMessageType.CJ_WALLET_SIGN)) {
          logger.warn('Wallet sign already in progress');
          sendError(
            ErrorCode.ALREADY_IN_PROGRESS,
            'Signing already in progress',
            PageMessageType.CJ_WALLET_SIGN,
            data.requestId
          );
          return;
        }
        if (!data.message || !data.address) {
          sendError(
            ErrorCode.INVALID_REQUEST,
            'Missing required fields: message and address',
            PageMessageType.CJ_WALLET_SIGN,
            data.requestId
          );
          return;
        }
        const signPromise = handleWalletSignV2(data.message, data.address, data.requestId);
        markRequestInFlight(PageMessageType.CJ_WALLET_SIGN, signPromise);
        await signPromise;
        break;
      }

      case PageMessageType.CJ_STORE_SESSION:
        if (!data.session?.sessionToken || !data.session?.address || !data.session?.chainId) {
          sendError(
            ErrorCode.INVALID_REQUEST,
            'Missing required session fields: sessionToken, address, chainId',
            PageMessageType.CJ_STORE_SESSION,
            data.requestId
          );
          return;
        }
        await handleStoreSession(data.session, data.requestId);
        break;

      case PageMessageType.CJ_CLEAR_SESSION:
        await handleClearSession(data.requestId);
        break;
    }
  });

  logger.debug('Page message handler initialized');
}

/**
 * Handle CJ_CHECK_EXTENSION - Respond that extension is present
 */
function handleCheckExtension(): void {
  window.postMessage({ type: PageMessageType.CJ_EXTENSION_PRESENT }, window.location.origin);
  logger.debug('Responded to extension check');
}

/**
 * Handle CJ_OPEN_AUTH - Trigger wallet connection via injected script
 * 
 * Content scripts cannot access window.ethereum directly (isolated world).
 * We use an injected script that runs in the page context to interact with wallets.
 * 
 * Flow:
 * 1. Inject wallet script into page context
 * 2. Send CJ_WALLET_CONNECT to injected script
 * 3. Injected script calls window.ethereum.request({ method: 'eth_requestAccounts' })
 * 4. Get challenge from API
 * 5. Send CJ_WALLET_SIGN to injected script
 * 6. Injected script calls personal_sign
 * 7. Verify signature with API
 * 8. Store session
 */
async function handleOpenAuth(): Promise<void> {
  try {
    logger.info('Starting wallet connection flow');
    
    // Step 1: Ensure injected script is ready
    await injectWalletScript();
    
    // Step 2: Check if wallet is available
    const checkResult = await sendWalletMessage<{
      available: boolean;
      walletName: string | null;
    }>(WalletMessageType.CJ_WALLET_CHECK);
    
    if (!checkResult.available) {
      logger.error('No wallet detected');
      window.postMessage({
        type: PageMessageType.CJ_AUTH_OPENED,
        success: false,
        error: 'No wallet detected. Please install MetaMask, Rabby, or another Web3 wallet.',
      }, window.location.origin);
      return;
    }
    
    logger.debug('Wallet detected', { wallet: checkResult.walletName });
    
    // Step 3: Connect wallet (triggers wallet popup)
    const connectResult = await sendWalletMessage<{
      success: boolean;
      address?: string;
      chainId?: string;
      error?: string;
      code?: number;
    }>(WalletMessageType.CJ_WALLET_CONNECT);
    
    if (!connectResult.success || !connectResult.address) {
      logger.error('Wallet connection failed', { error: connectResult.error });
      window.postMessage({
        type: PageMessageType.CJ_AUTH_OPENED,
        success: false,
        error: connectResult.error || 'Failed to connect wallet',
      }, window.location.origin);
      return;
    }
    
    const address = connectResult.address;
    const chainId = connectResult.chainId || '0x1';
    
    logger.info('Wallet connected', { address: address.slice(0, 10) + '...' });
    
    // Step 4: Get SIWE challenge from API
    const chainIdNumber = parseInt(chainId, 16);
    const challengeResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SIWE_CHALLENGE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        chainId: chainIdNumber,
        accountMode: 'live', // Default to live mode
      }),
    });
    
    if (!challengeResponse.ok) {
      throw new Error('Failed to get authentication challenge');
    }
    
    const { message: siweMessage } = await challengeResponse.json();
    
    logger.debug('Got SIWE challenge');
    
    // Step 5: Sign the message (triggers wallet popup)
    const signResult = await sendWalletMessage<{
      success: boolean;
      signature?: string;
      error?: string;
      code?: number;
    }>(WalletMessageType.CJ_WALLET_SIGN, { message: siweMessage, address });
    
    if (!signResult.success || !signResult.signature) {
      logger.error('Message signing failed', { error: signResult.error });
      window.postMessage({
        type: PageMessageType.CJ_AUTH_OPENED,
        success: false,
        error: signResult.error || 'Failed to sign message',
      }, window.location.origin);
      return;
    }
    
    logger.debug('Message signed');
    
    // Step 6: Verify signature with API
    const verifyResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.SIWE_VERIFY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: siweMessage,
        signature: signResult.signature,
        accountMode: 'live',
      }),
    });
    
    if (!verifyResponse.ok) {
      throw new Error('Signature verification failed');
    }
    
    const { sessionToken } = await verifyResponse.json();
    
    logger.info('SIWE authentication successful');
    
    // Step 7: Store session in extension storage
    await chrome.storage.local.set({
      [StorageKeys.SESSION_TOKEN]: sessionToken,
      [StorageKeys.CONNECTED_ADDRESS]: address,
      [StorageKeys.CHAIN_ID]: chainId,
      [StorageKeys.ACCOUNT_MODE]: 'live',
    });
    
    window.postMessage({
      type: PageMessageType.CJ_AUTH_OPENED,
      success: true,
    }, window.location.origin);
    
    // Session change will be notified via storage listener
    
  } catch (error) {
    logger.error('Failed to connect wallet', { error: String(error) });
    window.postMessage({
      type: PageMessageType.CJ_AUTH_OPENED,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, window.location.origin);
  }
}

/**
 * Handle CJ_GET_SESSION - Return current session state
 * 
 * Security: sessionToken is NOT returned to page.
 * App should verify session via /api/auth/session endpoint.
 */
async function handleGetSession(): Promise<void> {
  try {
    // Get non-sensitive data from local storage
    const localResult = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
    ]);

    // Get sensitive data from session storage
    const sessionResult = await chrome.storage.session.get([
      StorageKeys.SESSION_TOKEN,
    ]);

    const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);

    const session: PageSession | null = hasSession
      ? {
          address: localResult[StorageKeys.CONNECTED_ADDRESS] as string,
          chainId: localResult[StorageKeys.CHAIN_ID] as string || '0x1',
          accountMode: (localResult[StorageKeys.ACCOUNT_MODE] as 'demo' | 'live') || 'live',
          isConnected: true,
          // NOTE: sessionToken intentionally NOT included - security measure
        }
      : null;

    window.postMessage({
      type: PageMessageType.CJ_SESSION_RESPONSE,
      session,
      hasValidToken: hasSession, // Indicator that token exists (without exposing it)
    }, window.location.origin);

    logger.debug('Session response sent', { hasSession });
  } catch (error) {
    logger.error('Failed to get session', { error: String(error) });
    window.postMessage({
      type: PageMessageType.CJ_SESSION_RESPONSE,
      session: null,
      hasValidToken: false,
    }, window.location.origin);
  }
}

/**
 * Handle CJ_DISCONNECT - Clear session and disconnect
 */
async function handleDisconnect(): Promise<void> {
  try {
    await ensureServiceWorkerHealthy();

    const response = await new Promise<MessageResponse>((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'DISCONNECT' },
        (resp) => resolve(resp as MessageResponse)
      );
    });

    window.postMessage({
      type: PageMessageType.CJ_DISCONNECT_RESPONSE,
      success: response?.success ?? false,
    }, window.location.origin);

    // Also emit session changed event
    window.postMessage({
      type: PageMessageType.CJ_SESSION_CHANGED,
      session: null,
    }, window.location.origin);

    logger.debug('Disconnect response sent', { success: response?.success });
  } catch (error) {
    logger.error('Failed to disconnect', { error: String(error) });
    window.postMessage({
      type: PageMessageType.CJ_DISCONNECT_RESPONSE,
      success: false,
    }, window.location.origin);
  }
}

/**
 * Notify main app when session changes
 */
function notifySessionChange(session: PageSession | null): void {
  window.postMessage({
    type: PageMessageType.CJ_SESSION_CHANGED,
    session,
  }, window.location.origin);
  logger.debug('Session change notified', { hasSession: !!session });
}

/**
 * Read from both storage areas and notify session change
 * Used after manual storage operations (since chrome.storage.onChanged
 * doesn't trigger for same-context writes in some cases)
 */
async function notifySessionChangeFromStorage(): Promise<void> {
  try {
    // Read from both storage areas
    const localResult = await chrome.storage.local.get([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
    ]);
    
    const sessionResult = await chrome.storage.session.get([
      StorageKeys.SESSION_TOKEN,
    ]);

    const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);

    const session: PageSession | null = hasSession
      ? {
          address: localResult[StorageKeys.CONNECTED_ADDRESS] as string,
          chainId: localResult[StorageKeys.CHAIN_ID] as string || '0x1',
          accountMode: (localResult[StorageKeys.ACCOUNT_MODE] as 'demo' | 'live') || 'live',
          isConnected: true,
          // NOTE: sessionToken intentionally NOT included - security measure
        }
      : null;

    notifySessionChange(session);
  } catch (error) {
    logger.error('Failed to read session from storage', { error: String(error) });
  }
}

// ============================================================================
// v2.0 Handlers (App-Driven SIWE)
// ============================================================================

/**
 * v2.0: Handle CJ_WALLET_CONNECT - Direct wallet connection
 *
 * Unlike CJ_OPEN_AUTH (v1.1), this only connects the wallet and returns
 * the address/chainId. The app is responsible for SIWE challenge/verify.
 */
async function handleWalletConnectV2(requestId?: string): Promise<void> {
  try {
    logger.info('v2.0: Starting direct wallet connection');

    // Ensure injected script is ready
    await injectWalletScript();

    // Check if wallet is available
    const checkResult = await sendWalletMessage<{
      available: boolean;
      walletName: string | null;
    }>(WalletMessageType.CJ_WALLET_CHECK);

    if (!checkResult.available) {
      logger.error('v2.0: No wallet detected');
      sendError(
        ErrorCode.NO_WALLET,
        'No wallet detected. Please install MetaMask, Rabby, or another Web3 wallet.',
        PageMessageType.CJ_WALLET_CONNECT,
        requestId
      );
      return;
    }

    logger.debug('v2.0: Wallet detected', { wallet: checkResult.walletName });

    // Connect wallet (triggers wallet popup)
    const connectResult = await sendWalletMessage<{
      success: boolean;
      address?: string;
      chainId?: string;
      error?: string;
      code?: number;
    }>(WalletMessageType.CJ_WALLET_CONNECT);

    if (!connectResult.success || !connectResult.address) {
      logger.error('v2.0: Wallet connection failed', { error: connectResult.error });

      // Map wallet error codes to our error codes
      const errorCode = connectResult.code === 4001
        ? ErrorCode.USER_REJECTED
        : ErrorCode.WALLET_CONNECTION_FAILED;

      sendError(
        errorCode,
        connectResult.error || 'Failed to connect wallet',
        PageMessageType.CJ_WALLET_CONNECT,
        requestId
      );
      return;
    }

    const address = connectResult.address;
    const chainId = connectResult.chainId || '0x1';

    logger.info('v2.0: Wallet connected', { address: address.slice(0, 10) + '...' });

    // Send success response
    window.postMessage({
      type: PageMessageType.CJ_WALLET_RESULT,
      success: true,
      address,
      chainId,
      walletName: checkResult.walletName || undefined,
      requestId,
    }, window.location.origin);

  } catch (error) {
    logger.error('v2.0: Wallet connect failed', { error: String(error) });

    const isTimeout = error instanceof Error && error.message.includes('timed out');
    sendError(
      isTimeout ? ErrorCode.REQUEST_TIMEOUT : ErrorCode.WALLET_CONNECTION_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PageMessageType.CJ_WALLET_CONNECT,
      requestId
    );
  }
}

/**
 * v2.0: Handle CJ_WALLET_SIGN - Direct message signing
 *
 * App provides the SIWE message to sign. Extension just signs it
 * and returns the signature. App handles verification.
 */
async function handleWalletSignV2(
  message: string,
  address: string,
  requestId?: string
): Promise<void> {
  try {
    logger.info('v2.0: Starting message signing');

    // Ensure injected script is ready
    await injectWalletScript();

    // Sign the message (triggers wallet popup)
    const signResult = await sendWalletMessage<{
      success: boolean;
      signature?: string;
      error?: string;
      code?: number;
    }>(WalletMessageType.CJ_WALLET_SIGN, { message, address });

    if (!signResult.success || !signResult.signature) {
      logger.error('v2.0: Message signing failed', { error: signResult.error });

      // Map wallet error codes to our error codes
      const errorCode = signResult.code === 4001
        ? ErrorCode.USER_REJECTED
        : ErrorCode.SIGNING_FAILED;

      sendError(
        errorCode,
        signResult.error || 'Failed to sign message',
        PageMessageType.CJ_WALLET_SIGN,
        requestId
      );
      return;
    }

    logger.info('v2.0: Message signed successfully');

    // Send success response
    window.postMessage({
      type: PageMessageType.CJ_SIGN_RESULT,
      success: true,
      signature: signResult.signature,
      requestId,
    }, window.location.origin);

  } catch (error) {
    logger.error('v2.0: Signing failed', { error: String(error) });

    const isTimeout = error instanceof Error && error.message.includes('timed out');
    sendError(
      isTimeout ? ErrorCode.REQUEST_TIMEOUT : ErrorCode.SIGNING_FAILED,
      error instanceof Error ? error.message : 'Unknown error',
      PageMessageType.CJ_WALLET_SIGN,
      requestId
    );
  }
}

/**
 * v2.0: Handle CJ_STORE_SESSION - Store session after app verifies signature
 *
 * App handles SIWE verification with the API, then sends the session
 * to the extension for storage.
 * 
 * SECURITY: Session token stored in chrome.storage.session (cleared on browser close)
 * Non-sensitive data stored in chrome.storage.local (persistent)
 */
async function handleStoreSession(
  session: { sessionToken: string; address: string; chainId: string },
  requestId?: string
): Promise<void> {
  try {
    logger.info('v2.0: Storing session');

    // Store non-sensitive data in local storage (persistent)
    await chrome.storage.local.set({
      [StorageKeys.CONNECTED_ADDRESS]: session.address,
      [StorageKeys.CHAIN_ID]: session.chainId,
      [StorageKeys.LAST_CONNECTED]: Date.now(),
    });

    // Store sensitive data in session storage (cleared on browser close)
    await chrome.storage.session.set({
      [StorageKeys.SESSION_TOKEN]: session.sessionToken,
    });

    logger.info('v2.0: Session stored successfully (token in session storage)');

    // Send success response (explicit origin for security)
    window.postMessage({
      type: PageMessageType.CJ_SESSION_STORED,
      success: true,
      requestId,
    }, window.location.origin);

    // Manually trigger session change notification since we use two storage areas
    await notifySessionChangeFromStorage();

  } catch (error) {
    logger.error('v2.0: Failed to store session', { error: String(error) });
    sendError(
      ErrorCode.SESSION_STORAGE_FAILED,
      error instanceof Error ? error.message : 'Failed to store session',
      PageMessageType.CJ_STORE_SESSION,
      requestId
    );
  }
}

/**
 * v2.0: Handle CJ_CLEAR_SESSION - Clear session
 *
 * Alternative to CJ_DISCONNECT that doesn't call the backend.
 * App handles any cleanup with the API.
 */
async function handleClearSession(requestId?: string): Promise<void> {
  try {
    logger.info('v2.0: Clearing session');

    // Clear session from both storage areas
    await chrome.storage.local.remove([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
      StorageKeys.LAST_CONNECTED,
    ]);
    
    // Clear sensitive data from session storage
    await chrome.storage.session.remove([StorageKeys.SESSION_TOKEN]);

    logger.info('v2.0: Session cleared successfully');

    // Send success response (explicit origin)
    window.postMessage({
      type: PageMessageType.CJ_SESSION_STORED,
      success: true,
      requestId,
    }, window.location.origin);

    // Also emit session changed event (explicit origin)
    window.postMessage({
      type: PageMessageType.CJ_SESSION_CHANGED,
      session: null,
    }, window.location.origin);

  } catch (error) {
    logger.error('v2.0: Failed to clear session', { error: String(error) });
    sendError(
      ErrorCode.SESSION_STORAGE_FAILED,
      error instanceof Error ? error.message : 'Failed to clear session',
      PageMessageType.CJ_CLEAR_SESSION,
      requestId
    );
  }
}

// ============================================================================
// Storage Change Listener
// ============================================================================

/**
 * Listen for storage changes and notify the page
 * 
 * Security: sessionToken is NOT included in the session object.
 */
function setupStorageListener(): void {
  // Listen to both local and session storage
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    // Check if session-related keys changed in either storage
    const localSessionChanged = areaName === 'local' && (
      changes[StorageKeys.CONNECTED_ADDRESS] ||
      changes[StorageKeys.CHAIN_ID] ||
      changes[StorageKeys.ACCOUNT_MODE]
    );
    
    const tokenChanged = areaName === 'session' && 
      changes[StorageKeys.SESSION_TOKEN];

    if (localSessionChanged || tokenChanged) {
      try {
        // Read from both storage areas
        const localResult = await chrome.storage.local.get([
          StorageKeys.CONNECTED_ADDRESS,
          StorageKeys.CHAIN_ID,
          StorageKeys.ACCOUNT_MODE,
        ]);
        
        const sessionResult = await chrome.storage.session.get([
          StorageKeys.SESSION_TOKEN,
        ]);

        const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);

        const session: PageSession | null = hasSession
          ? {
              address: localResult[StorageKeys.CONNECTED_ADDRESS] as string,
              chainId: localResult[StorageKeys.CHAIN_ID] as string || '0x1',
              accountMode: (localResult[StorageKeys.ACCOUNT_MODE] as 'demo' | 'live') || 'live',
              isConnected: true,
              // NOTE: sessionToken intentionally NOT included - security measure
            }
          : null;

        notifySessionChange(session);
      } catch (error) {
        logger.error('Failed to notify session change', { error: String(error) });
      }
    }
  });

  logger.debug('Storage listener initialized');
}

// ============================================================================
// Periodic Health Check
// ============================================================================

/**
 * Set up periodic health check to monitor service worker status
 */
function setupPeriodicHealthCheck(): void {
  const PERIODIC_CHECK_INTERVAL = 30000; // 30 seconds

  const performPeriodicCheck = async () => {
    if (document.visibilityState !== 'visible') return;

    const wasHealthy = isServiceWorkerHealthy;
    await ensureServiceWorkerHealthy();

    if (wasHealthy && !isServiceWorkerHealthy) {
      logger.warn('Service worker became unresponsive');
    } else if (!wasHealthy && isServiceWorkerHealthy) {
      logger.info('Service worker recovered');
    }
  };

  setInterval(performPeriodicCheck, PERIODIC_CHECK_INTERVAL);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      performPeriodicCheck();
    }
  });

  logger.debug('Periodic health check initialized');
}

// ============================================================================
// Initialization
// ============================================================================

// Guard to prevent double initialization
let isInitialized = false;

/**
 * Initialize all content script functionality
 */
async function initialize(): Promise<void> {
  if (isInitialized) {
    logger.debug('Content script already initialized, skipping');
    return;
  }
  isInitialized = true;

  logger.info('Content script initializing (Extension-First mode)');

  // 1. Set up CJ_* message handler for main app communication
  setupPageMessageHandler();

  // 2. Set up storage listener for session changes
  setupStorageListener();

  // 3. Set up periodic health check
  setupPeriodicHealthCheck();

  // 4. Perform initial health check (async, non-blocking)
  ensureServiceWorkerHealthy().then((healthy) => {
    if (healthy) {
      logger.info('Content script initialized, service worker healthy');
    } else {
      logger.warn('Content script initialized, but service worker not responding');
    }
  });
}

// Initialize immediately - we run at document_start so this is early enough
// Using synchronous init to ensure message handler is ready ASAP
initialize().catch((error) => {
  logger.error('Content script initialization failed', { error: String(error) });
});

export {};
