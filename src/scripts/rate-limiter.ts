/**
 * Rate Limiter Module for CTJ Web3 Extension
 *
 * Provides multiple rate limiting strategies:
 * - Token Bucket: For burst-tolerant rate limiting (UI actions)
 * - Sliding Window: For strict rate limiting (API calls)
 * - Per-Operation: Different limits for different operation types
 *
 * Used to prevent:
 * - Message spam from malicious pages
 * - API abuse and excessive requests
 * - Double-click/duplicate action issues
 */

import { contentLogger as logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Maximum tokens/requests allowed */
  maxTokens: number;
  /** Tokens refilled per second */
  refillRate: number;
  /** Minimum time between same operations (ms) */
  minInterval?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs?: number;
  reason?: string;
}

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

/**
 * Token bucket rate limiter - allows bursts while limiting sustained rate
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly config: Required<RateLimitConfig>;
  private lastOperationTime: Map<string, number> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = {
      maxTokens: config.maxTokens,
      refillRate: config.refillRate,
      minInterval: config.minInterval ?? 0,
    };
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token for an operation
   */
  tryConsume(operationKey?: string): RateLimitResult {
    this.refillTokens();

    // Check minimum interval for specific operations
    if (operationKey && this.config.minInterval > 0) {
      const lastTime = this.lastOperationTime.get(operationKey);
      if (lastTime) {
        const elapsed = Date.now() - lastTime;
        if (elapsed < this.config.minInterval) {
          const retryAfter = this.config.minInterval - elapsed;
          return {
            allowed: false,
            remainingTokens: this.tokens,
            retryAfterMs: retryAfter,
            reason: `Operation '${operationKey}' rate limited. Retry in ${retryAfter}ms`,
          };
        }
      }
    }

    // Check token availability
    if (this.tokens < 1) {
      const retryAfter = Math.ceil((1 - this.tokens) / this.config.refillRate * 1000);
      return {
        allowed: false,
        remainingTokens: 0,
        retryAfterMs: retryAfter,
        reason: 'Rate limit exceeded. Too many requests.',
      };
    }

    // Consume token
    this.tokens -= 1;

    // Record operation time
    if (operationKey) {
      this.lastOperationTime.set(operationKey, Date.now());
    }

    return {
      allowed: true,
      remainingTokens: Math.floor(this.tokens),
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.config.maxTokens,
      this.tokens + elapsed * this.config.refillRate
    );
    this.lastRefill = now;
  }

  /**
   * Get current state for debugging
   */
  getState(): { tokens: number; maxTokens: number } {
    this.refillTokens();
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.config.maxTokens,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
    this.lastOperationTime.clear();
  }
}

// ============================================================================
// Sliding Window Rate Limiter
// ============================================================================

/**
 * Sliding window rate limiter - strict limit over rolling time window
 */
export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request is allowed and record it
   */
  tryAcquire(): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(t => t > windowStart);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const retryAfter = oldestInWindow + this.windowMs - now;
      return {
        allowed: false,
        remainingTokens: 0,
        retryAfterMs: Math.max(0, retryAfter),
        reason: `Rate limit: ${this.maxRequests} requests per ${this.windowMs}ms exceeded`,
      };
    }

    this.timestamps.push(now);
    return {
      allowed: true,
      remainingTokens: this.maxRequests - this.timestamps.length,
    };
  }

  /**
   * Get current state
   */
  getState(): { requestsInWindow: number; maxRequests: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t > windowStart);
    return {
      requestsInWindow: this.timestamps.length,
      maxRequests: this.maxRequests,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.timestamps = [];
  }
}

// ============================================================================
// Operation-Specific Rate Limiters
// ============================================================================

/**
 * Pre-configured rate limiters for different operation types
 */
export const RATE_LIMIT_CONFIGS = {
  /** Message handling from page - burst tolerant */
  pageMessages: {
    maxTokens: 20,
    refillRate: 5, // 5 per second sustained
    minInterval: 0,
  },
  /** Wallet operations - more restrictive */
  walletOps: {
    maxTokens: 5,
    refillRate: 1, // 1 per second sustained
    minInterval: 1000, // Min 1 second between same operation
  },
  /** Auth flow - very restrictive */
  authFlow: {
    maxTokens: 3,
    refillRate: 0.1, // 1 per 10 seconds sustained
    minInterval: 5000, // Min 5 seconds between auth attempts
  },
  /** API calls - moderate */
  apiCalls: {
    maxTokens: 10,
    refillRate: 2, // 2 per second sustained
    minInterval: 100, // Min 100ms between calls
  },
} as const;

// ============================================================================
// Global Rate Limiter Instances
// ============================================================================

/** Rate limiters for different operation categories */
const rateLimiters = {
  pageMessages: new TokenBucketRateLimiter(RATE_LIMIT_CONFIGS.pageMessages),
  walletOps: new TokenBucketRateLimiter(RATE_LIMIT_CONFIGS.walletOps),
  authFlow: new TokenBucketRateLimiter(RATE_LIMIT_CONFIGS.authFlow),
  apiCalls: new SlidingWindowRateLimiter(60000, 60), // 60 requests per minute
};

/**
 * Check rate limit for an operation category
 */
export function checkRateLimit(
  category: keyof typeof rateLimiters,
  operationKey?: string
): RateLimitResult {
  const limiter = rateLimiters[category];
  
  let result: RateLimitResult;
  if (limiter instanceof TokenBucketRateLimiter) {
    result = limiter.tryConsume(operationKey);
  } else {
    result = limiter.tryAcquire();
  }

  if (!result.allowed) {
    logger.warn('Rate limit exceeded', {
      category,
      operationKey,
      reason: result.reason,
      retryAfterMs: result.retryAfterMs,
    });
  }

  return result;
}

/**
 * Decorator/wrapper for rate-limited functions
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  category: keyof typeof rateLimiters,
  operationKey?: string
): T {
  return (async (...args: Parameters<T>) => {
    const result = checkRateLimit(category, operationKey);
    
    if (!result.allowed) {
      throw new Error(result.reason || 'Rate limit exceeded');
    }

    return fn(...args);
  }) as T;
}

/**
 * Get all rate limiter states (for debugging/monitoring)
 */
export function getRateLimiterStates(): Record<string, unknown> {
  return {
    pageMessages: rateLimiters.pageMessages.getState(),
    walletOps: rateLimiters.walletOps.getState(),
    authFlow: rateLimiters.authFlow.getState(),
    apiCalls: rateLimiters.apiCalls.getState(),
  };
}

/**
 * Reset all rate limiters (for testing)
 */
export function resetAllRateLimiters(): void {
  Object.values(rateLimiters).forEach(limiter => limiter.reset());
}

// ============================================================================
// Request Deduplication
// ============================================================================

interface InFlightRequest {
  startTime: number;
  promise: Promise<unknown>;
}

const inFlightRequests = new Map<string, InFlightRequest>();
const DEFAULT_REQUEST_TIMEOUT = 60000; // 60 seconds

/**
 * Deduplicate requests - if same request is in flight, return existing promise
 */
export function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT
): Promise<T> {
  // Clean up stale requests
  const now = Date.now();
  for (const [k, v] of inFlightRequests.entries()) {
    if (now - v.startTime > timeoutMs) {
      inFlightRequests.delete(k);
    }
  }

  // Check if request is already in flight
  const existing = inFlightRequests.get(key);
  if (existing) {
    logger.debug('Request deduplicated, returning existing promise', { key });
    return existing.promise as Promise<T>;
  }

  // Create new request
  const promise = requestFn().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, {
    startTime: now,
    promise,
  });

  return promise;
}

/**
 * Check if a request is currently in flight
 */
export function isRequestInFlight(key: string): boolean {
  const request = inFlightRequests.get(key);
  if (!request) return false;
  
  // Check if stale
  if (Date.now() - request.startTime > DEFAULT_REQUEST_TIMEOUT) {
    inFlightRequests.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Cancel an in-flight request (remove from tracking)
 */
export function cancelRequest(key: string): boolean {
  return inFlightRequests.delete(key);
}

export default {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  checkRateLimit,
  withRateLimit,
  deduplicateRequest,
  isRequestInFlight,
  getRateLimiterStates,
  resetAllRateLimiters,
  RATE_LIMIT_CONFIGS,
};
