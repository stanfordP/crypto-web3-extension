/**
 * Rate Limiter Unit Tests
 *
 * Tests for the rate limiting module including:
 * - TokenBucketRateLimiter
 * - SlidingWindowRateLimiter
 * - Global rate limit functions
 * - Request deduplication
 */

import {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  checkRateLimit,
  withRateLimit,
  deduplicateRequest,
  isRequestInFlight,
  cancelRequest,
  getRateLimiterStates,
  resetAllRateLimiters,
  RATE_LIMIT_CONFIGS,
} from '../src/scripts/rate-limiter';

// Mock the logger
jest.mock('../src/scripts/logger', () => ({
  contentLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 5, // 5 tokens per second
      minInterval: 100,
    });
  });

  describe('tryConsume', () => {
    it('should allow requests when tokens available', () => {
      const result = limiter.tryConsume();
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(9);
    });

    it('should deny requests when tokens exhausted', () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryConsume();
      }

      const result = limiter.tryConsume();
      expect(result.allowed).toBe(false);
      expect(result.remainingTokens).toBe(0);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should refill tokens over time', async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryConsume();
      }

      // Wait for tokens to refill
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000); // 1 second = 5 tokens at refillRate of 5

      const result = limiter.tryConsume();
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });

    it('should enforce minInterval for same operation', () => {
      const result1 = limiter.tryConsume('test-op');
      expect(result1.allowed).toBe(true);

      // Immediate second call with same key should be blocked
      const result2 = limiter.tryConsume('test-op');
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toContain("Operation 'test-op' rate limited");
      expect(result2.retryAfterMs).toBeDefined();
    });

    it('should allow different operations without waiting', () => {
      const result1 = limiter.tryConsume('op-1');
      expect(result1.allowed).toBe(true);

      const result2 = limiter.tryConsume('op-2');
      expect(result2.allowed).toBe(true);
    });

    it('should allow same operation after minInterval passes', async () => {
      jest.useFakeTimers();

      const result1 = limiter.tryConsume('test-op');
      expect(result1.allowed).toBe(true);

      jest.advanceTimersByTime(150); // minInterval is 100ms

      const result2 = limiter.tryConsume('test-op');
      expect(result2.allowed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('getState', () => {
    it('should return current token state', () => {
      limiter.tryConsume();
      limiter.tryConsume();

      const state = limiter.getState();
      expect(state.tokens).toBe(8);
      expect(state.maxTokens).toBe(10);
    });
  });

  describe('reset', () => {
    it('should reset tokens to max', () => {
      // Consume some tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryConsume();
      }

      limiter.reset();

      const state = limiter.getState();
      expect(state.tokens).toBe(10);
    });

    it('should clear operation history', () => {
      limiter.tryConsume('test-op');
      
      limiter.reset();

      // Should be allowed immediately after reset
      const result = limiter.tryConsume('test-op');
      expect(result.allowed).toBe(true);
    });
  });
});

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter(1000, 5); // 5 requests per 1 second
  });

  describe('tryAcquire', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = limiter.tryAcquire();
        expect(result.allowed).toBe(true);
        expect(result.remainingTokens).toBe(4 - i);
      }
    });

    it('should deny requests exceeding limit', () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }

      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(false);
      expect(result.remainingTokens).toBe(0);
      expect(result.reason).toContain('Rate limit');
    });

    it('should allow requests after window slides', async () => {
      jest.useFakeTimers();

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }

      // Advance past the window
      jest.advanceTimersByTime(1100);

      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });

    it('should return correct retry time', () => {
      jest.useFakeTimers();

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }

      const result = limiter.tryAcquire();
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000);

      jest.useRealTimers();
    });
  });

  describe('getState', () => {
    it('should return current window state', () => {
      limiter.tryAcquire();
      limiter.tryAcquire();

      const state = limiter.getState();
      expect(state.requestsInWindow).toBe(2);
      expect(state.maxRequests).toBe(5);
    });

    it('should not count expired timestamps', async () => {
      jest.useFakeTimers();

      limiter.tryAcquire();
      limiter.tryAcquire();

      jest.advanceTimersByTime(1100); // Past window

      const state = limiter.getState();
      expect(state.requestsInWindow).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should clear all timestamps', () => {
      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();

      limiter.reset();

      const state = limiter.getState();
      expect(state.requestsInWindow).toBe(0);
    });
  });
});

describe('RATE_LIMIT_CONFIGS', () => {
  it('should have correct pageMessages config', () => {
    expect(RATE_LIMIT_CONFIGS.pageMessages).toEqual({
      maxTokens: 20,
      refillRate: 5,
      minInterval: 0,
    });
  });

  it('should have correct walletOps config', () => {
    expect(RATE_LIMIT_CONFIGS.walletOps).toEqual({
      maxTokens: 5,
      refillRate: 1,
      minInterval: 1000,
    });
  });

  it('should have correct authFlow config', () => {
    expect(RATE_LIMIT_CONFIGS.authFlow).toEqual({
      maxTokens: 3,
      refillRate: 0.1,
      minInterval: 5000,
    });
  });

  it('should have correct apiCalls config', () => {
    expect(RATE_LIMIT_CONFIGS.apiCalls).toEqual({
      maxTokens: 10,
      refillRate: 2,
      minInterval: 100,
    });
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetAllRateLimiters();
  });

  it('should check pageMessages rate limit', () => {
    const result = checkRateLimit('pageMessages');
    expect(result.allowed).toBe(true);
  });

  it('should check walletOps rate limit', () => {
    const result = checkRateLimit('walletOps');
    expect(result.allowed).toBe(true);
  });

  it('should check authFlow rate limit', () => {
    const result = checkRateLimit('authFlow');
    expect(result.allowed).toBe(true);
  });

  it('should check apiCalls rate limit (sliding window)', () => {
    const result = checkRateLimit('apiCalls');
    expect(result.allowed).toBe(true);
  });

  it('should pass operation key to token bucket limiter', () => {
    checkRateLimit('walletOps', 'connect');
    const result = checkRateLimit('walletOps', 'connect');
    // Second call with same key should be rate limited due to minInterval
    expect(result.allowed).toBe(false);
  });
});

describe('withRateLimit', () => {
  beforeEach(() => {
    resetAllRateLimiters();
  });

  it('should execute function when not rate limited', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const rateLimitedFn = withRateLimit(mockFn, 'pageMessages');

    const result = await rateLimitedFn();
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalled();
  });

  it('should throw when rate limited', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    // Use different operation keys to avoid minInterval blocking
    // Then exhaust tokens on a final key
    const rateLimitedFn1 = withRateLimit(mockFn, 'authFlow', 'auth1');
    const rateLimitedFn2 = withRateLimit(mockFn, 'authFlow', 'auth2');
    const rateLimitedFn3 = withRateLimit(mockFn, 'authFlow', 'auth3');
    const rateLimitedFn4 = withRateLimit(mockFn, 'authFlow', 'auth4');

    // Exhaust the auth flow limiter (3 tokens) with different keys
    await rateLimitedFn1();
    await rateLimitedFn2();
    await rateLimitedFn3();

    // Fourth call should throw (no tokens left)
    await expect(rateLimitedFn4()).rejects.toThrow();
  });
});

describe('getRateLimiterStates', () => {
  beforeEach(() => {
    resetAllRateLimiters();
  });

  it('should return states for all rate limiters', () => {
    const states = getRateLimiterStates();

    expect(states).toHaveProperty('pageMessages');
    expect(states).toHaveProperty('walletOps');
    expect(states).toHaveProperty('authFlow');
    expect(states).toHaveProperty('apiCalls');
  });

  it('should reflect token consumption', () => {
    checkRateLimit('pageMessages');
    checkRateLimit('pageMessages');

    const states = getRateLimiterStates();
    expect((states.pageMessages as { tokens: number }).tokens).toBe(18);
  });
});

describe('resetAllRateLimiters', () => {
  it('should reset all limiters to initial state', () => {
    // Consume some tokens
    for (let i = 0; i < 10; i++) {
      checkRateLimit('pageMessages');
    }

    resetAllRateLimiters();

    const states = getRateLimiterStates();
    expect((states.pageMessages as { tokens: number }).tokens).toBe(20);
  });
});

describe('Request Deduplication', () => {
  beforeEach(() => {
    // Clear any in-flight requests by waiting
    jest.useFakeTimers();
    jest.advanceTimersByTime(70000);
    jest.useRealTimers();
  });

  describe('deduplicateRequest', () => {
    it('should execute function for new request', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      const result = await deduplicateRequest('unique-key', mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should return same promise for duplicate in-flight request', async () => {
      let resolveFirst: (value: string) => void;
      const firstPromise = new Promise<string>(resolve => {
        resolveFirst = resolve;
      });
      const mockFn = jest.fn().mockReturnValue(firstPromise);

      const promise1 = deduplicateRequest('dup-key', mockFn);
      const promise2 = deduplicateRequest('dup-key', mockFn);

      // Should be the same promise
      expect(promise1).toBe(promise2);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Resolve the promise
      resolveFirst!('done');
      await promise1;
    });

    it('should allow new request after previous completes', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      await deduplicateRequest('key-1', mockFn);
      await deduplicateRequest('key-1', mockFn);

      // Should have been called twice since first completed
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should clean up stale requests', async () => {
      jest.useFakeTimers();

      const neverResolves = new Promise(() => {});
      const mockFn = jest.fn().mockReturnValue(neverResolves);

      deduplicateRequest('stale-key', mockFn);

      // Advance past timeout
      jest.advanceTimersByTime(70000);

      // New request should be allowed
      const newMockFn = jest.fn().mockResolvedValue('new');
      deduplicateRequest('stale-key', newMockFn);

      expect(newMockFn).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('isRequestInFlight', () => {
    it('should return false for unknown key', () => {
      expect(isRequestInFlight('unknown')).toBe(false);
    });

    it('should return true for in-flight request', async () => {
      let resolve: () => void;
      const promise = new Promise<void>(r => { resolve = r; });
      const mockFn = jest.fn().mockReturnValue(promise);

      deduplicateRequest('inflight-key', mockFn);

      expect(isRequestInFlight('inflight-key')).toBe(true);

      resolve!();
      await promise;
    });

    it('should return false after request completes', async () => {
      const mockFn = jest.fn().mockResolvedValue('done');

      await deduplicateRequest('completed-key', mockFn);

      expect(isRequestInFlight('completed-key')).toBe(false);
    });

    it('should return false for stale requests', async () => {
      jest.useFakeTimers();

      const neverResolves = new Promise(() => {});
      deduplicateRequest('stale-check', () => neverResolves);

      // Advance past timeout
      jest.advanceTimersByTime(70000);

      expect(isRequestInFlight('stale-check')).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('cancelRequest', () => {
    it('should return false for unknown key', () => {
      expect(cancelRequest('unknown')).toBe(false);
    });

    it('should return true and remove in-flight request', async () => {
      const neverResolves = new Promise(() => {});
      deduplicateRequest('cancel-key', () => neverResolves);

      expect(isRequestInFlight('cancel-key')).toBe(true);

      const cancelled = cancelRequest('cancel-key');

      expect(cancelled).toBe(true);
      expect(isRequestInFlight('cancel-key')).toBe(false);
    });
  });
});

describe('Default export', () => {
  it('should export all functions', async () => {
    const rateLimiter = await import('../src/scripts/rate-limiter');

    expect(rateLimiter.default).toBeDefined();
    expect(rateLimiter.default.TokenBucketRateLimiter).toBe(TokenBucketRateLimiter);
    expect(rateLimiter.default.SlidingWindowRateLimiter).toBe(SlidingWindowRateLimiter);
    expect(rateLimiter.default.checkRateLimit).toBe(checkRateLimit);
    expect(rateLimiter.default.withRateLimit).toBe(withRateLimit);
    expect(rateLimiter.default.deduplicateRequest).toBe(deduplicateRequest);
    expect(rateLimiter.default.isRequestInFlight).toBe(isRequestInFlight);
    expect(rateLimiter.default.getRateLimiterStates).toBe(getRateLimiterStates);
    expect(rateLimiter.default.resetAllRateLimiters).toBe(resetAllRateLimiters);
    expect(rateLimiter.default.RATE_LIMIT_CONFIGS).toBe(RATE_LIMIT_CONFIGS);
  });
});
