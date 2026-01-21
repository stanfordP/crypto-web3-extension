/**
 * Message Router
 * 
 * Pure message routing logic extracted from content.ts.
 * Routes CJ_* messages to appropriate handlers without side effects.
 * 
 * @module core/messaging/MessageRouter
 * @version 2.1.0
 */

import { PageMessageType, ErrorCode } from '../../types';
import type {
  BaseMessage,
  HandlerRegistration,
  MessageHandler,
  ErrorMessage,
} from './MessageTypes';
import {
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  isVersionSupported,
  isTimestampValid,
  MESSAGE_MAX_AGE_MS,
} from './MessageTypes';

/**
 * Message log entry for debugging
 */
export interface MessageLogEntry {
  timestamp: number;
  type: string;
  requestId?: string;
  origin: string;
  direction: 'inbound' | 'outbound';
  success: boolean;
  errorCode?: ErrorCode;
  processingTimeMs?: number;
  version?: string;
}

/**
 * Message logger interface
 */
export interface MessageLogger {
  log(entry: MessageLogEntry): void;
  getRecentLogs(count?: number): MessageLogEntry[];
  clear(): void;
}

/**
 * In-memory message logger with circular buffer
 */
export class InMemoryMessageLogger implements MessageLogger {
  private logs: MessageLogEntry[] = [];
  private maxLogs: number;

  constructor(maxLogs: number = 100) {
    this.maxLogs = maxLogs;
  }

  log(entry: MessageLogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getRecentLogs(count: number = 50): MessageLogEntry[] {
    return this.logs.slice(-count);
  }

  clear(): void {
    this.logs = [];
  }
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
}

/**
 * Rate limiter state
 */
export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

/**
 * Token bucket rate limiter
 * Pure function that returns new state and whether limited
 */
export function checkRateLimit(
  state: RateLimiterState,
  config: RateLimiterConfig,
  now: number = Date.now()
): { newState: RateLimiterState; isLimited: boolean } {
  const elapsed = (now - state.lastRefill) / 1000; // seconds

  // Refill tokens based on elapsed time
  const newTokens = Math.min(
    config.maxTokens,
    state.tokens + elapsed * config.refillRate
  );

  // Try to consume a token
  if (newTokens >= 1) {
    return {
      newState: {
        tokens: newTokens - 1,
        lastRefill: now,
      },
      isLimited: false,
    };
  }

  return {
    newState: {
      tokens: newTokens,
      lastRefill: now,
    },
    isLimited: true,
  };
}

/**
 * Create initial rate limiter state
 */
export function createRateLimiterState(config: RateLimiterConfig): RateLimiterState {
  return {
    tokens: config.maxTokens,
    lastRefill: Date.now(),
  };
}

/**
 * Request tracker for deduplication
 */
export interface TrackedRequest {
  startTime: number;
  promise: Promise<void>;
}

/**
 * Request deduplication state
 */
export interface DeduplicationState {
  inFlightRequests: Map<string, TrackedRequest>;
  requestTimeout: number;
}

/**
 * Create initial deduplication state
 */
export function createDeduplicationState(requestTimeout: number = 60000): DeduplicationState {
  return {
    inFlightRequests: new Map(),
    requestTimeout,
  };
}

/**
 * Clean up stale requests
 */
export function cleanupStaleRequests(
  state: DeduplicationState,
  now: number = Date.now()
): string[] {
  const staleKeys: string[] = [];
  for (const [key, value] of state.inFlightRequests.entries()) {
    if (now - value.startTime > state.requestTimeout) {
      state.inFlightRequests.delete(key);
      staleKeys.push(key);
    }
  }
  return staleKeys;
}

/**
 * Check if a request type is already in flight
 */
export function isRequestInFlight(
  state: DeduplicationState,
  type: string,
  now: number = Date.now()
): boolean {
  cleanupStaleRequests(state, now);
  return state.inFlightRequests.has(type);
}

/**
 * Get the in-flight promise for a request type (if any)
 */
export function getInFlightPromise(
  state: DeduplicationState,
  type: string,
  now: number = Date.now()
): Promise<void> | null {
  cleanupStaleRequests(state, now);
  const tracked = state.inFlightRequests.get(type);
  return tracked?.promise || null;
}

/**
 * Mark a request as in flight
 */
export function markRequestInFlight(
  state: DeduplicationState,
  type: string,
  promise: Promise<void>
): void {
  state.inFlightRequests.set(type, { startTime: Date.now(), promise });
  promise.catch(() => {}).finally(() => {
    state.inFlightRequests.delete(type);
  });
}

/**
 * Message routing configuration
 */
export interface MessageRouterConfig {
  /** Origin to post messages to */
  targetOrigin: string;
  /** Function to validate origin */
  isAllowedOrigin: (origin: string) => boolean;
  /** Rate limiter configuration */
  rateLimiterConfig?: RateLimiterConfig;
  /** Request timeout for deduplication */
  requestTimeout?: number;
  /** Enable protocol version validation */
  validateVersion?: boolean;
  /** Enable timestamp validation */
  validateTimestamp?: boolean;
  /** Maximum message age in milliseconds */
  maxMessageAge?: number;
  /** Optional message logger for debugging */
  logger?: MessageLogger;
}

const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxTokens: 20,
  refillRate: 5,
};

/**
 * MessageRouter - Routes CJ_* messages to handlers
 * 
 * This is a pure routing layer that:
 * 1. Validates message structure and protocol version
 * 2. Validates message timestamps for replay protection
 * 3. Checks rate limits
 * 4. Handles request deduplication
 * 5. Routes to appropriate handler
 * 6. Logs messages for debugging
 */
export class MessageRouter {
  private handlers = new Map<string, HandlerRegistration>();
  private rateLimiterState: RateLimiterState;
  private deduplicationState: DeduplicationState;
  private config: MessageRouterConfig;
  private logger?: MessageLogger;

  constructor(config: MessageRouterConfig) {
    this.config = config;
    this.rateLimiterState = createRateLimiterState(
      config.rateLimiterConfig || DEFAULT_RATE_LIMITER_CONFIG
    );
    this.deduplicationState = createDeduplicationState(config.requestTimeout);
    this.logger = config.logger;
  }

  /**
   * Register a message handler
   */
  register<T extends BaseMessage>(
    type: string,
    handler: MessageHandler<T>,
    options: Omit<HandlerRegistration<T>, 'handler'> = {}
  ): void {
    this.handlers.set(type, {
      handler: handler as MessageHandler,
      exemptFromRateLimit: options.exemptFromRateLimit,
      requiredFields: options.requiredFields,
    });
  }

  /**
   * Unregister a message handler
   */
  unregister(type: string): boolean {
    return this.handlers.delete(type);
  }

  /**
   * Route a message to its handler
   * Returns true if message was handled, false otherwise
   */
  async route(message: unknown, origin: string): Promise<boolean> {
    const startTime = Date.now();
    
    // Validate message structure
    if (!this.isValidMessage(message)) {
      return false;
    }

    const msg = message as BaseMessage;

    // Only handle CJ_* prefixed messages
    if (!msg.type.startsWith('CJ_')) {
      return false;
    }

    // Validate origin
    if (!this.config.isAllowedOrigin(origin)) {
      this.logMessage(msg, origin, false, undefined, startTime);
      return false;
    }

    // Validate protocol version (if enabled)
    if (this.config.validateVersion && !isVersionSupported(msg.version)) {
      this.sendError(
        ErrorCode.INVALID_REQUEST,
        `Unsupported protocol version: ${msg.version}. Minimum required: ${MIN_PROTOCOL_VERSION}`,
        msg.type,
        msg.requestId
      );
      this.logMessage(msg, origin, false, ErrorCode.INVALID_REQUEST, startTime);
      return true;
    }

    // Validate timestamp (if enabled)
    if (this.config.validateTimestamp && !isTimestampValid(msg.timestamp, this.config.maxMessageAge || MESSAGE_MAX_AGE_MS)) {
      this.sendError(
        ErrorCode.REQUEST_TIMEOUT,
        'Message timestamp expired or invalid',
        msg.type,
        msg.requestId
      );
      this.logMessage(msg, origin, false, ErrorCode.REQUEST_TIMEOUT, startTime);
      return true;
    }

    // Find handler
    const registration = this.handlers.get(msg.type);
    if (!registration) {
      this.logMessage(msg, origin, false, undefined, startTime);
      return false;
    }

    // Rate limiting check
    if (!registration.exemptFromRateLimit) {
      const rateLimitResult = checkRateLimit(
        this.rateLimiterState,
        this.config.rateLimiterConfig || DEFAULT_RATE_LIMITER_CONFIG
      );
      this.rateLimiterState = rateLimitResult.newState;

      if (rateLimitResult.isLimited) {
        this.sendError(
          ErrorCode.REQUEST_TIMEOUT,
          'Too many requests. Please wait and try again.',
          msg.type,
          msg.requestId
        );
        this.logMessage(msg, origin, false, ErrorCode.REQUEST_TIMEOUT, startTime);
        return true; // Message was handled (with error)
      }
    }

    // Validate required fields
    if (registration.requiredFields) {
      const missingFields = this.getMissingFields(msg, registration.requiredFields);
      if (missingFields.length > 0) {
        this.sendError(
          ErrorCode.INVALID_REQUEST,
          `Missing required fields: ${missingFields.join(', ')}`,
          msg.type,
          msg.requestId
        );
        this.logMessage(msg, origin, false, ErrorCode.INVALID_REQUEST, startTime);
        return true; // Message was handled (with error)
      }
    }

    // Execute handler
    try {
      await registration.handler(msg);
      this.logMessage(msg, origin, true, undefined, startTime);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.sendError(
        ErrorCode.WALLET_CONNECTION_FAILED,
        errorMessage,
        msg.type,
        msg.requestId
      );
      this.logMessage(msg, origin, false, ErrorCode.WALLET_CONNECTION_FAILED, startTime);
      return true; // Message was handled (with error)
    }
  }

  /**
   * Route with deduplication
   * For operations like wallet connect that should not run in parallel
   */
  async routeWithDeduplication(
    message: unknown,
    origin: string,
    options?: { waitForExisting?: boolean }
  ): Promise<boolean> {
    if (!this.isValidMessage(message)) {
      return false;
    }

    const msg = message as BaseMessage;
    const existingPromise = getInFlightPromise(this.deduplicationState, msg.type);

    if (existingPromise) {
      if (options?.waitForExisting) {
        // Wait for existing request to complete
        await existingPromise;
        return true;
      } else {
        // Return error for duplicate
        this.sendError(
          ErrorCode.ALREADY_IN_PROGRESS,
          'Request already in progress',
          msg.type,
          msg.requestId
        );
        return true;
      }
    }

    // Create a promise for this request
    let resolveRequest: () => void;
    const promise = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });

    markRequestInFlight(this.deduplicationState, msg.type, promise);

    try {
      const result = await this.route(message, origin);
      return result;
    } finally {
      resolveRequest!();
    }
  }

  /**
   * Create an error response message
   */
  createErrorMessage(
    code: ErrorCode,
    message: string,
    originalType?: string,
    requestId?: string
  ): ErrorMessage {
    return {
      type: PageMessageType.CJ_ERROR,
      success: false,
      code,
      message,
      originalType,
      requestId,
    };
  }

  /**
   * Send error response (for use by handlers)
   */
  sendError(
    code: ErrorCode,
    message: string,
    originalType?: string,
    requestId?: string
  ): void {
    const errorMessage = this.createErrorMessage(code, message, originalType, requestId);
    this.postMessage(errorMessage);
  }

  /**
   * Post a message to the target origin
   */
  postMessage(message: unknown): void {
    // This will be overridden or injected in production
    if (typeof window !== 'undefined') {
      window.postMessage(message, this.config.targetOrigin);
    }
  }

  /**
   * Check if value is a valid message
   */
  private isValidMessage(value: unknown): value is BaseMessage {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof (value as BaseMessage).type === 'string'
    );
  }

  /**
   * Get missing required fields from a message
   */
  private getMissingFields(message: BaseMessage, requiredFields: string[]): string[] {
    const missing: string[] = [];
    const msgRecord = message as unknown as Record<string, unknown>;
    for (const field of requiredFields) {
      if (!(field in msgRecord) || msgRecord[field] === undefined) {
        missing.push(field);
      }
    }
    return missing;
  }

  /**
   * Log a message for debugging
   */
  private logMessage(
    message: BaseMessage,
    origin: string,
    success: boolean,
    errorCode?: ErrorCode,
    startTime?: number
  ): void {
    if (!this.logger) return;

    this.logger.log({
      timestamp: Date.now(),
      type: message.type,
      requestId: message.requestId,
      origin,
      direction: 'inbound',
      success,
      errorCode,
      processingTimeMs: startTime ? Date.now() - startTime : undefined,
      version: message.version,
    });
  }

  /**
   * Get current rate limiter state (for testing)
   */
  getRateLimiterState(): RateLimiterState {
    return { ...this.rateLimiterState };
  }

  /**
   * Get current deduplication state (for testing)
   */
  getDeduplicationState(): { inFlightCount: number; types: string[] } {
    return {
      inFlightCount: this.deduplicationState.inFlightRequests.size,
      types: Array.from(this.deduplicationState.inFlightRequests.keys()),
    };
  }

  /**
   * Get the message logger (for testing/debugging)
   */
  getLogger(): MessageLogger | undefined {
    return this.logger;
  }

  /**
   * Get current protocol version
   */
  static getProtocolVersion(): string {
    return PROTOCOL_VERSION;
  }
}
