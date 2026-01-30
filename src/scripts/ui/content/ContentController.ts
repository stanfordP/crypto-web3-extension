/**
 * ContentController - Handles CJ_* message protocol and session management
 *
 * Extracted from content.ts to enable testing and separation of concerns.
 * Manages all communication between the main app and the extension.
 */

import type { IStorageAdapter, IRuntimeAdapter, IDOMAdapter } from '../../adapters/types';
import { StorageKeys, PageMessageType, ErrorCode } from '../../types';
import type { PageSession, MessageResponse } from '../../types';
import { contentLogger as logger } from '../../logger';
import { isAllowedOrigin, API_BASE_URL, API_ENDPOINTS } from '../../config';
import { InjectionService } from '../../services/InjectionService';

// ============================================================================
// Types
// ============================================================================

/** Rate limiter configuration */
interface RateLimiter {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

/** In-flight request tracking */
interface InFlightRequest {
  startTime: number;
  promise: Promise<void>;
}

/** Dependencies for ContentController */
export interface ContentControllerDeps {
  storageAdapter: IStorageAdapter;
  runtimeAdapter: IRuntimeAdapter;
  domAdapter: IDOMAdapter;
  injectionService: InjectionService;
  logger?: typeof logger;
  fetchFn?: typeof fetch;
}

// ============================================================================
// ContentController Class
// ============================================================================

export class ContentController {
  private storageAdapter: IStorageAdapter;
  private runtimeAdapter: IRuntimeAdapter;
  private domAdapter: IDOMAdapter;
  private injectionService: InjectionService;
  private logger: typeof logger;
  private fetchFn: typeof fetch;

  /** Rate limiter for message handling */
  private rateLimiter: RateLimiter = {
    tokens: 200,
    lastRefill: Date.now(),
    maxTokens: 200,
    refillRate: 100,
  };

  /** Track in-flight requests */
  private inFlightRequests = new Map<string, InFlightRequest>();
  private readonly REQUEST_TIMEOUT = 60000;

  /** Service worker health state */
  private isServiceWorkerHealthy = true;
  private lastHealthCheck = 0;
  private readonly HEALTH_CHECK_INTERVAL = 60000;
  private readonly HEALTH_CHECK_COOLDOWN = 5000;

  /** Initialization state */
  private isInitialized = false;
  private pageMessageListener: ((event: Event) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private runtimeMessageListener: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private storageChangeListener: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private visibilityChangeListener: any = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(deps: ContentControllerDeps) {
    this.storageAdapter = deps.storageAdapter;
    this.runtimeAdapter = deps.runtimeAdapter;
    this.domAdapter = deps.domAdapter;
    this.injectionService = deps.injectionService;
    this.logger = deps.logger || logger;
    this.fetchFn = deps.fetchFn || fetch;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Initialize the content script
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug('ContentController already initialized');
      return;
    }

    this.logger.info('ContentController initializing');

    // Initialize injection service
    this.injectionService.initialize();

    // Set up message handlers
    this.setupPageMessageHandler();
    this.setupPopupMessageHandler();
    this.setupStorageListener();
    this.setupPeriodicHealthCheck();

    // Initial health check (non-blocking)
    this.ensureServiceWorkerHealthy().then((healthy) => {
      if (healthy) {
        this.logger.info('ContentController initialized, service worker healthy');
      } else {
        this.logger.warn('ContentController initialized, but service worker not responding');
      }
    });

    this.isInitialized = true;
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    // Remove page message listener
    if (this.pageMessageListener) {
      this.domAdapter.removeEventListener('message', this.pageMessageListener);
      this.pageMessageListener = null;
    }

    // Remove runtime message listener
    if (this.runtimeMessageListener) {
      this.runtimeAdapter.removeMessageListener(this.runtimeMessageListener);
      this.runtimeMessageListener = null;
    }

    // Remove storage listener
    if (this.storageChangeListener) {
      this.storageAdapter.removeChangeListener(this.storageChangeListener);
      this.storageChangeListener = null;
    }

    // Remove visibility change listener
    if (this.visibilityChangeListener) {
      this.domAdapter.removeEventListener('visibilitychange', this.visibilityChangeListener);
      this.visibilityChangeListener = null;
    }

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Cleanup injection service
    this.injectionService.cleanup();

    // Clear in-flight requests
    this.inFlightRequests.clear();

    this.isInitialized = false;
    this.logger.debug('ContentController cleaned up');
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Check if request should be rate limited
   */
  isRateLimited(): boolean {
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000;

    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + elapsed * this.rateLimiter.refillRate
    );
    this.rateLimiter.lastRefill = now;

    if (this.rateLimiter.tokens >= 1) {
      this.rateLimiter.tokens -= 1;
      return false;
    }

    return true;
  }

  // ============================================================================
  // Request Deduplication
  // ============================================================================

  /**
   * Clean up stale in-flight requests
   */
  private cleanupStaleRequests(): void {
    const now = Date.now();
    for (const [key, value] of this.inFlightRequests.entries()) {
      if (now - value.startTime > this.REQUEST_TIMEOUT) {
        this.inFlightRequests.delete(key);
        this.logger.debug('Cleaned up stale request', { key });
      }
    }
  }

  /**
   * Check if a request is in flight
   */
  isRequestInFlight(type: string): boolean {
    this.cleanupStaleRequests();
    return this.inFlightRequests.has(type);
  }

  /**
   * Mark a request as in flight
   */
  markRequestInFlight(type: string, promise: Promise<void>): void {
    this.inFlightRequests.set(type, { startTime: Date.now(), promise });
    promise.finally(() => {
      this.inFlightRequests.delete(type);
    });
  }

  /**
   * Get in-flight promise for a request type
   */
  getInFlightPromise(type: string): Promise<void> | null {
    this.cleanupStaleRequests();
    return this.inFlightRequests.get(type)?.promise || null;
  }

  // ============================================================================
  // Service Worker Health
  // ============================================================================

  /**
   * Check service worker health
   */
  async checkServiceWorkerHealth(): Promise<boolean> {
    try {
      const response = await this.runtimeAdapter.sendMessage<unknown, { success?: boolean }>({ type: 'PING' });
      return (response as { success?: boolean })?.success === true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure service worker is healthy, with retry logic
   */
  async ensureServiceWorkerHealthy(): Promise<boolean> {
    const now = Date.now();

    // Skip if checked recently
    if (now - this.lastHealthCheck < this.HEALTH_CHECK_COOLDOWN) {
      return this.isServiceWorkerHealthy;
    }

    this.lastHealthCheck = now;
    this.isServiceWorkerHealthy = await this.checkServiceWorkerHealth();

    if (!this.isServiceWorkerHealthy) {
      // Try to wake up service worker
      this.logger.debug('Service worker not responding, attempting wake-up');

      // Send a message to wake it up
      try {
        await this.runtimeAdapter.sendMessage({ type: 'PING' });
        // Retry health check after wake-up
        this.isServiceWorkerHealthy = await this.checkServiceWorkerHealth();
      } catch {
        this.isServiceWorkerHealthy = false;
      }
    }

    return this.isServiceWorkerHealthy;
  }

  // ============================================================================
  // Message Handlers Setup
  // ============================================================================

  /**
   * Message types that ContentController handles (from main app).
   * These are the only messages that should be rate limited.
   * Result messages from injected script should NOT be in this list.
   */
  private readonly HANDLED_MESSAGE_TYPES = new Set([
    'CJ_CHECK_EXTENSION',
    'CJ_OPEN_AUTH',
    'CJ_GET_SESSION',
    'CJ_DISCONNECT',
    'CJ_WALLET_CONNECT',
    'CJ_WALLET_SIGN',
    'CJ_STORE_SESSION',
    'CJ_CLEAR_SESSION',
    'CJ_SET_ACCOUNT_MODE',
  ]);

  /**
   * Message types that are rate limited.
   * We intentionally do NOT rate limit basic detection/session messages because
   * React StrictMode and multiple hook instances can legitimately generate bursts.
   */
  private readonly RATE_LIMITED_MESSAGE_TYPES = new Set([
    'CJ_OPEN_AUTH',
    'CJ_WALLET_CONNECT',
    'CJ_WALLET_SIGN',
    'CJ_STORE_SESSION',
    'CJ_CLEAR_SESSION',
  ]);

  /**
   * Set up page message handler for CJ_* messages
   */
  private setupPageMessageHandler(): void {
    const messageHandler = async (event: Event) => {
      // Cast to MessageEvent since we're listening to 'message' events
      const messageEvent = event as MessageEvent;
      
      // Security: Only accept same-origin messages
      if (messageEvent.origin !== this.domAdapter.getOrigin()) return;

      // Security: Check allowed origin
      if (!isAllowedOrigin(messageEvent.origin)) return;

      const data = messageEvent.data;
      if (!data || typeof data !== 'object') return;

      const messageType = data.type as string;
      
      // CRITICAL: Ignore messages sent by InjectionService to the injected script
      // These have source: 'cj-content-script' and should NOT be processed again
      if (data.source === 'cj-content-script') {
        return;
      }

      // Only process messages we actually handle from main app
      // Skip result messages from injected script (CJ_*_RESULT, CJ_WALLET_SCRIPT_READY, etc.)
      if (!messageType || !this.HANDLED_MESSAGE_TYPES.has(messageType)) {
        return;
      }

      // Check rate limiting only for sensitive messages
      if (this.RATE_LIMITED_MESSAGE_TYPES.has(messageType) && this.isRateLimited()) {
        this.logger.warn('Rate limited message', { type: messageType });
        this.sendError(ErrorCode.RATE_LIMITED, 'Too many requests', messageType);
        return;
      }

      // Route message to appropriate handler
      await this.handlePageMessage(data);
    };

    this.pageMessageListener = messageHandler;
    this.domAdapter.addEventListener('message', this.pageMessageListener);
    this.logger.debug('Page message handler initialized');
  }

  /**
   * Route page messages to handlers
   */
  private async handlePageMessage(data: Record<string, unknown>): Promise<void> {
    const type = data.type as string;
    const requestId = data.requestId as string | undefined;

    switch (type) {
      case PageMessageType.CJ_CHECK_EXTENSION:
        this.handleCheckExtension();
        break;

      case PageMessageType.CJ_OPEN_AUTH:
        await this.handleOpenAuth();
        break;

      case PageMessageType.CJ_GET_SESSION:
        await this.handleGetSession();
        break;

      case PageMessageType.CJ_DISCONNECT:
        await this.handleDisconnect();
        break;

      // v2.0 handlers
      case PageMessageType.CJ_WALLET_CONNECT: {
        // Check for in-flight request to prevent duplicate wallet popups
        const existingConnectPromise = this.getInFlightPromise('CJ_WALLET_CONNECT');
        if (existingConnectPromise) {
          this.logger.debug('Wallet connect already in progress, waiting for existing request');
          await existingConnectPromise;
          return;
        }
        const connectPromise = this.handleWalletConnectV2(requestId);
        this.markRequestInFlight('CJ_WALLET_CONNECT', connectPromise);
        await connectPromise;
        break;
      }

      case PageMessageType.CJ_WALLET_SIGN: {
        // Check for in-flight request to prevent duplicate signing popups
        const existingSignPromise = this.getInFlightPromise('CJ_WALLET_SIGN');
        if (existingSignPromise) {
          this.logger.debug('Wallet sign already in progress, waiting for existing request');
          await existingSignPromise;
          return;
        }
        const signPromise = this.handleWalletSignV2(
          data.message as string,
          data.address as string,
          requestId
        );
        this.markRequestInFlight('CJ_WALLET_SIGN', signPromise);
        await signPromise;
        break;
      }

      case PageMessageType.CJ_STORE_SESSION:
        await this.handleStoreSession(
          data.session as { sessionToken: string; address: string; chainId: string },
          requestId
        );
        break;

      case PageMessageType.CJ_CLEAR_SESSION:
        await this.handleClearSession(requestId);
        break;

      case PageMessageType.CJ_SET_ACCOUNT_MODE:
        await this.handleSetAccountMode(
          data.accountMode as 'demo' | 'live',
          requestId
        );
        break;
    }
  }

  /**
   * Set up popup message handler
   */
  private setupPopupMessageHandler(): void {
    this.runtimeMessageListener = (
      message: unknown, 
      _sender: unknown, 
      sendResponse: (response?: unknown) => void
    ): boolean => {
      const msgType = (message as Record<string, unknown>)?.type;
      
      if (msgType === 'POPUP_GET_SESSION') {
        this.handlePopupGetSession()
          .then(sendResponse)
          .catch((error) => {
            this.logger.error('Failed to handle POPUP_GET_SESSION', { error: String(error) });
            sendResponse({ success: false, error: String(error) });
          });
        return true; // Keep channel open for async response
      }
      
      // Handle wallet availability check from popup
      if (msgType === 'POPUP_CHECK_WALLET') {
        this.handlePopupCheckWallet()
          .then(sendResponse)
          .catch((error) => {
            this.logger.error('Failed to handle POPUP_CHECK_WALLET', { error: String(error) });
            sendResponse({ success: false, walletAvailable: false, error: String(error) });
          });
        return true; // Keep channel open for async response
      }
      
      return false;
    };

    this.runtimeAdapter.addMessageListener(this.runtimeMessageListener);
    this.logger.debug('Popup message handler initialized');
  }

  /**
   * Set up storage change listener
   */
  private setupStorageListener(): void {
    this.storageChangeListener = async (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, 
      areaName: string
    ) => {
      const localSessionChanged = areaName === 'local' && (
        changes[StorageKeys.CONNECTED_ADDRESS] ||
        changes[StorageKeys.CHAIN_ID] ||
        changes[StorageKeys.ACCOUNT_MODE] ||
        changes[StorageKeys.SESSION_TOKEN]
      );

      const tokenChanged = areaName === 'session' &&
        changes[StorageKeys.SESSION_TOKEN];

      if (localSessionChanged || tokenChanged) {
        await this.notifySessionChangeFromStorage();
      }
    };

    this.storageAdapter.addChangeListener(this.storageChangeListener);
    this.logger.debug('Storage listener initialized');
  }

  /**
   * Set up periodic health check
   */
  private setupPeriodicHealthCheck(): void {
    let consecutiveFailures = 0;
    const MAX_FAILURES_TO_LOG = 3;

    const performCheck = async () => {
      if (this.domAdapter.getVisibilityState() !== 'visible') return;

      const wasHealthy = this.isServiceWorkerHealthy;
      await this.ensureServiceWorkerHealthy();

      if (wasHealthy && !this.isServiceWorkerHealthy) {
        consecutiveFailures++;
        if (consecutiveFailures <= MAX_FAILURES_TO_LOG) {
          this.logger.warn('Service worker became unresponsive', {
            failureCount: consecutiveFailures,
          });
        }
      } else if (!wasHealthy && this.isServiceWorkerHealthy) {
        if (consecutiveFailures > 0) {
          this.logger.info('Service worker recovered');
        }
        consecutiveFailures = 0;
      }
    };

    this.healthCheckInterval = setInterval(performCheck, this.HEALTH_CHECK_INTERVAL);

    this.visibilityChangeListener = () => {
      if (this.domAdapter.getVisibilityState() === 'visible') {
        performCheck();
      }
    };

    this.domAdapter.addEventListener('visibilitychange', this.visibilityChangeListener);
    this.logger.debug('Periodic health check initialized');
  }

  // ============================================================================
  // CJ_* Message Handlers
  // ============================================================================

  /**
   * Handle CJ_CHECK_EXTENSION
   */
  handleCheckExtension(): void {
    this.domAdapter.postMessage(
      { type: PageMessageType.CJ_EXTENSION_PRESENT },
      this.domAdapter.getOrigin()
    );
    this.logger.debug('Responded to extension check');
  }

  /**
   * Handle CJ_OPEN_AUTH - Legacy v1.1 full auth flow
   */
  async handleOpenAuth(): Promise<void> {
    // Check for in-flight request
    if (this.isRequestInFlight('CJ_OPEN_AUTH')) {
      const existing = this.getInFlightPromise('CJ_OPEN_AUTH');
      if (existing) {
        await existing;
        return;
      }
    }

    const authPromise = this.performOpenAuth();
    this.markRequestInFlight('CJ_OPEN_AUTH', authPromise);
    await authPromise;
  }

  private async performOpenAuth(): Promise<void> {
    try {
      this.logger.info('Starting wallet connection flow');

      // Check if wallet is available
      const checkResult = await this.injectionService.checkWallet();

      if (!checkResult.available) {
        this.logger.error('No wallet detected');
        this.sendAuthResult(false, 'No wallet detected. Please install MetaMask, Rabby, or another Web3 wallet.');
        return;
      }

      this.logger.debug('Wallet detected', { wallet: checkResult.walletName });

      // Connect wallet
      const connectResult = await this.injectionService.connectWallet();

      if (!connectResult.success || !connectResult.address) {
        this.logger.error('Wallet connection failed', { error: connectResult.error });
        this.sendAuthResult(false, connectResult.error || 'Failed to connect wallet');
        return;
      }

      const address = connectResult.address;
      const chainId = connectResult.chainId || '0x1';

      this.logger.info('Wallet connected', { address: address.slice(0, 10) + '...' });

      // Get SIWE challenge
      const challengeResponse = await this.fetchFn(`${API_BASE_URL}${API_ENDPOINTS.SIWE_CHALLENGE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          chainId: parseInt(chainId, 16),
          accountMode: 'live',
        }),
      });

      if (!challengeResponse.ok) {
        throw new Error('Failed to get authentication challenge');
      }

      const { message: siweMessage } = await challengeResponse.json();
      this.logger.debug('Got SIWE challenge');

      // Sign message
      const signResult = await this.injectionService.signMessage(siweMessage, address);

      if (!signResult.success || !signResult.signature) {
        this.logger.error('Message signing failed', { error: signResult.error });
        this.sendAuthResult(false, signResult.error || 'Failed to sign message');
        return;
      }

      this.logger.debug('Message signed');

      // Verify signature
      const verifyResponse = await this.fetchFn(`${API_BASE_URL}${API_ENDPOINTS.SIWE_VERIFY}`, {
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
      this.logger.info('SIWE authentication successful');

      // Store session
      await this.storageAdapter.setLocal({
        [StorageKeys.SESSION_TOKEN]: sessionToken,
        [StorageKeys.CONNECTED_ADDRESS]: address,
        [StorageKeys.CHAIN_ID]: chainId,
        [StorageKeys.ACCOUNT_MODE]: 'live',
      });

      this.sendAuthResult(true);
    } catch (error) {
      this.logger.error('Failed to connect wallet', { error: String(error) });
      this.sendAuthResult(false, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle CJ_GET_SESSION
   */
  async handleGetSession(): Promise<void> {
    try {
      const session = await this.buildSessionFromStorage();

      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_SESSION_RESPONSE,
          session,
          hasValidToken: !!session,
        },
        this.domAdapter.getOrigin()
      );

      this.logger.debug('Session response sent', { hasSession: !!session });
    } catch (error) {
      this.logger.error('Failed to get session', { error: String(error) });
      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_SESSION_RESPONSE,
          session: null,
          hasValidToken: false,
        },
        this.domAdapter.getOrigin()
      );
    }
  }

  /**
   * Handle CJ_DISCONNECT
   */
  async handleDisconnect(): Promise<void> {
    try {
      await this.ensureServiceWorkerHealthy();

      const response = await this.runtimeAdapter.sendMessage({ type: 'DISCONNECT' });

      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_DISCONNECT_RESPONSE,
          success: (response as MessageResponse)?.success ?? false,
        },
        this.domAdapter.getOrigin()
      );

      // Also emit session changed
      this.notifySessionChange(null);
      this.logger.debug('Disconnect response sent', { success: (response as MessageResponse)?.success });
    } catch (error) {
      this.logger.error('Failed to disconnect', { error: String(error) });
      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_DISCONNECT_RESPONSE,
          success: false,
        },
        this.domAdapter.getOrigin()
      );
    }
  }

  // ============================================================================
  // v2.0 Handlers
  // ============================================================================

  /**
   * v2.0: Handle CJ_WALLET_CONNECT - Direct wallet connection
   */
  async handleWalletConnectV2(requestId?: string): Promise<void> {
    try {
      this.logger.info('v2.0: Starting direct wallet connection');

      // Check if wallet is available
      const checkResult = await this.injectionService.checkWallet();

      if (!checkResult.available) {
        this.logger.error('v2.0: No wallet detected');
        this.sendError(
          ErrorCode.NO_WALLET,
          'No wallet detected. Please install MetaMask, Rabby, or another Web3 wallet.',
          PageMessageType.CJ_WALLET_CONNECT,
          requestId
        );
        return;
      }

      this.logger.debug('v2.0: Wallet detected', { wallet: checkResult.walletName });

      // Connect wallet
      const connectResult = await this.injectionService.connectWallet();

      if (!connectResult.success || !connectResult.address) {
        this.logger.error('v2.0: Wallet connection failed', { error: connectResult.error });

        const errorCode = connectResult.code === 4001
          ? ErrorCode.USER_REJECTED
          : ErrorCode.WALLET_CONNECTION_FAILED;

        this.sendError(
          errorCode,
          connectResult.error || 'Failed to connect wallet',
          PageMessageType.CJ_WALLET_CONNECT,
          requestId
        );
        return;
      }

      this.logger.info('v2.0: Wallet connected', { address: connectResult.address.slice(0, 10) + '...' });

      // Send success
      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_WALLET_RESULT,
          success: true,
          address: connectResult.address,
          chainId: connectResult.chainId || '0x1',
          walletName: checkResult.walletName || undefined,
          requestId,
        },
        this.domAdapter.getOrigin()
      );
    } catch (error) {
      this.logger.error('v2.0: Wallet connect failed', { error: String(error) });

      const isTimeout = error instanceof Error && error.message.includes('timed out');
      this.sendError(
        isTimeout ? ErrorCode.REQUEST_TIMEOUT : ErrorCode.WALLET_CONNECTION_FAILED,
        error instanceof Error ? error.message : 'Unknown error',
        PageMessageType.CJ_WALLET_CONNECT,
        requestId
      );
    }
  }

  /**
   * v2.0: Handle CJ_WALLET_SIGN - Direct message signing
   */
  async handleWalletSignV2(
    message: string,
    address: string,
    requestId?: string
  ): Promise<void> {
    try {
      this.logger.info('v2.0: Starting message signing');

      // Sign message
      const signResult = await this.injectionService.signMessage(message, address);

      if (!signResult.success || !signResult.signature) {
        this.logger.error('v2.0: Message signing failed', { error: signResult.error });

        const errorCode = signResult.code === 4001
          ? ErrorCode.USER_REJECTED
          : ErrorCode.SIGNING_FAILED;

        this.sendError(
          errorCode,
          signResult.error || 'Failed to sign message',
          PageMessageType.CJ_WALLET_SIGN,
          requestId
        );
        return;
      }

      this.logger.info('v2.0: Message signed successfully');

      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_SIGN_RESULT,
          success: true,
          signature: signResult.signature,
          requestId,
        },
        this.domAdapter.getOrigin()
      );
    } catch (error) {
      this.logger.error('v2.0: Signing failed', { error: String(error) });

      const isTimeout = error instanceof Error && error.message.includes('timed out');
      this.sendError(
        isTimeout ? ErrorCode.REQUEST_TIMEOUT : ErrorCode.SIGNING_FAILED,
        error instanceof Error ? error.message : 'Unknown error',
        PageMessageType.CJ_WALLET_SIGN,
        requestId
      );
    }
  }

  /**
   * v2.0: Handle CJ_STORE_SESSION - Store session from app
   */
  async handleStoreSession(
    session: { sessionToken: string; address: string; chainId: string },
    requestId?: string
  ): Promise<void> {
    try {
      this.logger.info('v2.0: Storing session');

      // Store in local storage (persistent)
      await this.storageAdapter.setLocal({
        [StorageKeys.SESSION_TOKEN]: session.sessionToken,
        [StorageKeys.CONNECTED_ADDRESS]: session.address,
        [StorageKeys.CHAIN_ID]: session.chainId,
        [StorageKeys.LAST_CONNECTED]: Date.now(),
      });

      // Store in session storage (cleared on browser close)
      await this.storageAdapter.setSession({
        [StorageKeys.SESSION_TOKEN]: session.sessionToken,
      });

      this.logger.info('v2.0: Session stored successfully');

      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_SESSION_STORED,
          success: true,
          requestId,
        },
        this.domAdapter.getOrigin()
      );

      // Notify session change
      await this.notifySessionChangeFromStorage();
    } catch (error) {
      this.logger.error('v2.0: Failed to store session', { error: String(error) });
      this.sendError(
        ErrorCode.SESSION_STORAGE_FAILED,
        error instanceof Error ? error.message : 'Failed to store session',
        PageMessageType.CJ_STORE_SESSION,
        requestId
      );
    }
  }

  /**
   * v2.0: Handle CJ_CLEAR_SESSION - Clear session
   */
  async handleClearSession(requestId?: string): Promise<void> {
    try {
      this.logger.info('v2.0: Clearing session');

      // Clear from local storage
      await this.storageAdapter.removeLocal([
        StorageKeys.SESSION_TOKEN,
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
        StorageKeys.LAST_CONNECTED,
      ]);

      // Clear from session storage
      await this.storageAdapter.removeSession([StorageKeys.SESSION_TOKEN]);

      this.logger.info('v2.0: Session cleared successfully');

      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_SESSION_STORED,
          success: true,
          requestId,
        },
        this.domAdapter.getOrigin()
      );

      // Notify session cleared
      this.notifySessionChange(null);
    } catch (error) {
      this.logger.error('v2.0: Failed to clear session', { error: String(error) });
      this.sendError(
        ErrorCode.SESSION_STORAGE_FAILED,
        error instanceof Error ? error.message : 'Failed to clear session',
        PageMessageType.CJ_CLEAR_SESSION,
        requestId
      );
    }
  }

  /**
   * Handle CJ_SET_ACCOUNT_MODE - Update account mode in extension storage
   */
  async handleSetAccountMode(
    accountMode: 'demo' | 'live',
    requestId?: string
  ): Promise<void> {
    try {
      // Validate account mode
      if (accountMode !== 'demo' && accountMode !== 'live') {
        this.sendError(
          ErrorCode.INVALID_REQUEST,
          'Invalid account mode. Must be "demo" or "live".',
          PageMessageType.CJ_SET_ACCOUNT_MODE,
          requestId
        );
        return;
      }

      this.logger.info('Setting account mode', { accountMode });

      // Store in local storage
      await this.storageAdapter.setLocal({
        [StorageKeys.ACCOUNT_MODE]: accountMode,
      });

      this.logger.info('Account mode updated successfully', { accountMode });

      // Send confirmation
      this.domAdapter.postMessage(
        {
          type: PageMessageType.CJ_ACCOUNT_MODE_SET,
          success: true,
          accountMode,
          requestId,
        },
        this.domAdapter.getOrigin()
      );

      // Also notify session change so popup can update
      await this.notifySessionChangeFromStorage();
    } catch (error) {
      this.logger.error('Failed to set account mode', { error: String(error) });
      this.sendError(
        ErrorCode.SESSION_STORAGE_FAILED,
        error instanceof Error ? error.message : 'Failed to set account mode',
        PageMessageType.CJ_SET_ACCOUNT_MODE,
        requestId
      );
    }
  }

  // ============================================================================
  // Popup Handler
  // ============================================================================

  /**
   * Handle POPUP_GET_SESSION from popup
   */
  async handlePopupGetSession(): Promise<{
    success: boolean;
    session?: { address: string; chainId: string; sessionToken?: string };
  }> {
    try {
      // Get from storage
      const localResult = await this.storageAdapter.getLocal([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.SESSION_TOKEN,
      ]);

      const sessionResult = await this.storageAdapter.getSession([
        StorageKeys.SESSION_TOKEN,
      ]);

      const address = localResult[StorageKeys.CONNECTED_ADDRESS] as string | undefined;
      const chainId = localResult[StorageKeys.CHAIN_ID] as string | undefined;
      const sessionToken = (sessionResult[StorageKeys.SESSION_TOKEN] as string | undefined) ||
        (localResult[StorageKeys.SESSION_TOKEN] as string | undefined);

      // Return if valid session in storage
      if (address && sessionToken) {
        return {
          success: true,
          session: {
            address,
            chainId: chainId || '0x1',
            sessionToken,
          },
        };
      }

      // Fallback: Check app API
      try {
        this.logger.debug('No session in storage, checking app API...');
        const apiResponse = await this.fetchFn(`${API_BASE_URL}${API_ENDPOINTS.SESSION_VALIDATE}`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.authenticated && apiData.address) {
            this.logger.info('Session recovered from app API', {
              address: apiData.address.slice(0, 10) + '...',
            });

            // Store recovered session
            await this.storageAdapter.setLocal({
              [StorageKeys.CONNECTED_ADDRESS]: apiData.address,
              [StorageKeys.CHAIN_ID]: apiData.chainId || '0x1',
            });

            return {
              success: true,
              session: {
                address: apiData.address,
                chainId: apiData.chainId || '0x1',
              },
            };
          }
        }
      } catch (apiError) {
        this.logger.debug('App API session check failed', { error: String(apiError) });
      }

      // Legacy fallback: partial session
      if (address) {
        this.logger.debug('Partial session found (no token)', { address });
        return {
          success: true,
          session: {
            address,
            chainId: chainId || '0x1',
            sessionToken,
          },
        };
      }

      return { success: false };
    } catch (error) {
      this.logger.error('handlePopupGetSession failed', { error: String(error) });
      return { success: false };
    }
  }

  /**
   * Handle POPUP_CHECK_WALLET from popup
   * Checks if a Web3 wallet provider (e.g., MetaMask) is available on the page
   */
  async handlePopupCheckWallet(): Promise<{
    success: boolean;
    walletAvailable: boolean;
    walletName?: string;
    error?: string;
  }> {
    try {
      this.logger.debug('Checking wallet availability for popup...');
      
      // Use InjectionService to check wallet through injected script
      const result = await this.injectionService.checkWallet();
      
      if (result) {
        this.logger.debug('Wallet check result', { 
          available: result.available,
          walletName: result.walletName 
        });
        return {
          success: true,
          walletAvailable: result.available,
          walletName: result.walletName ?? undefined,
        };
      }
      
      // Fallback: wallet check failed or timed out
      return {
        success: true,
        walletAvailable: false,
      };
    } catch (error) {
      this.logger.error('handlePopupCheckWallet failed', { error: String(error) });
      return { 
        success: false, 
        walletAvailable: false, 
        error: String(error) 
      };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Build session object from storage
   */
  private async buildSessionFromStorage(): Promise<PageSession | null> {
    const localResult = await this.storageAdapter.getLocal([
      StorageKeys.CONNECTED_ADDRESS,
      StorageKeys.CHAIN_ID,
      StorageKeys.ACCOUNT_MODE,
      StorageKeys.SESSION_TOKEN,
    ]);

    const sessionResult = await this.storageAdapter.getSession([
      StorageKeys.SESSION_TOKEN,
    ]);

    const token = (sessionResult[StorageKeys.SESSION_TOKEN] as string | undefined) ||
      (localResult[StorageKeys.SESSION_TOKEN] as string | undefined);
    const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && token);

    if (!hasSession) return null;

    return {
      address: localResult[StorageKeys.CONNECTED_ADDRESS] as string,
      chainId: (localResult[StorageKeys.CHAIN_ID] as string) || '0x1',
      accountMode: (localResult[StorageKeys.ACCOUNT_MODE] as 'demo' | 'live') || 'live',
      isConnected: true,
    };
  }

  /**
   * Notify session change
   */
  private notifySessionChange(session: PageSession | null): void {
    this.domAdapter.postMessage(
      {
        type: PageMessageType.CJ_SESSION_CHANGED,
        session,
      },
      this.domAdapter.getOrigin()
    );
    this.logger.debug('Session change notified', { hasSession: !!session });
  }

  /**
   * Notify session change from storage
   */
  private async notifySessionChangeFromStorage(): Promise<void> {
    try {
      const session = await this.buildSessionFromStorage();
      this.notifySessionChange(session);
    } catch (error) {
      this.logger.error('Failed to read session from storage', { error: String(error) });
    }
  }

  /**
   * Send auth result
   */
  private sendAuthResult(success: boolean, error?: string): void {
    this.domAdapter.postMessage(
      {
        type: PageMessageType.CJ_AUTH_OPENED,
        success,
        error,
      },
      this.domAdapter.getOrigin()
    );
  }

  /**
   * Send error response
   */
  private sendError(
    code: ErrorCode,
    message: string,
    originalType?: string,
    requestId?: string
  ): void {
    this.domAdapter.postMessage(
      {
        type: PageMessageType.CJ_ERROR,
        success: false,
        code,
        message,
        originalType,
        requestId,
      },
      this.domAdapter.getOrigin()
    );
  }
}
