/**
 * Unit Tests for Rate Limiting and Request Deduplication
 * 
 * Tests:
 * - Token bucket rate limiter
 * - Request deduplication
 * - In-flight request tracking
 * - Stale request cleanup
 */

// ============================================================================
// Rate Limiter Implementation (from content.ts)
// ============================================================================

interface RateLimiter {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number;
}

function createRateLimiter(maxTokens: number = 20, refillRate: number = 5): RateLimiter {
  return {
    tokens: maxTokens,
    lastRefill: Date.now(),
    maxTokens,
    refillRate,
  };
}

function isRateLimited(limiter: RateLimiter): boolean {
  const now = Date.now();
  const elapsed = (now - limiter.lastRefill) / 1000;

  // Refill tokens based on elapsed time
  limiter.tokens = Math.min(
    limiter.maxTokens,
    limiter.tokens + elapsed * limiter.refillRate
  );
  limiter.lastRefill = now;

  // Try to consume a token
  if (limiter.tokens >= 1) {
    limiter.tokens -= 1;
    return false; // Not rate limited
  }

  return true; // Rate limited
}

// ============================================================================
// Request Deduplication Implementation (from content.ts)
// ============================================================================

interface TrackedRequest {
  startTime: number;
  promise?: Promise<void>;
}

class RequestTracker {
  private inFlightRequests = new Map<string, TrackedRequest>();
  private requestTimeout: number;

  constructor(requestTimeout: number = 60000) {
    this.requestTimeout = requestTimeout;
  }

  isInFlight(type: string): boolean {
    this.cleanupStale();
    return this.inFlightRequests.has(type);
  }

  getPromise(type: string): Promise<void> | null {
    this.cleanupStale();
    return this.inFlightRequests.get(type)?.promise || null;
  }

  markInFlight(type: string, promise: Promise<void>): void {
    this.inFlightRequests.set(type, { startTime: Date.now(), promise });
    // Use catch to handle rejections, then finally for cleanup
    promise.catch(() => {}).finally(() => {
      this.inFlightRequests.delete(type);
    });
  }

  remove(type: string): void {
    this.inFlightRequests.delete(type);
  }

  cleanupStale(): void {
    const now = Date.now();
    for (const [key, value] of this.inFlightRequests.entries()) {
      if (now - value.startTime > this.requestTimeout) {
        this.inFlightRequests.delete(key);
      }
    }
  }

  size(): number {
    return this.inFlightRequests.size;
  }

  clear(): void {
    this.inFlightRequests.clear();
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Rate Limiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Token Bucket Algorithm', () => {
    it('should allow requests when tokens available', () => {
      const limiter = createRateLimiter(20, 5);
      
      expect(isRateLimited(limiter)).toBe(false);
      expect(limiter.tokens).toBe(19);
    });

    it('should consume tokens for each request', () => {
      const limiter = createRateLimiter(5, 1);
      
      for (let i = 0; i < 5; i++) {
        expect(isRateLimited(limiter)).toBe(false);
      }
      
      expect(limiter.tokens).toBe(0);
    });

    it('should rate limit when no tokens available', () => {
      const limiter = createRateLimiter(2, 1);
      
      // Consume all tokens
      isRateLimited(limiter);
      isRateLimited(limiter);
      
      // Should be rate limited
      expect(isRateLimited(limiter)).toBe(true);
    });

    it('should refill tokens over time', () => {
      const limiter = createRateLimiter(5, 5); // 5 tokens per second
      
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        isRateLimited(limiter);
      }
      expect(limiter.tokens).toBe(0);
      
      // Advance time by 1 second
      jest.advanceTimersByTime(1000);
      
      // Should have refilled 5 tokens
      isRateLimited(limiter); // This triggers refill check
      expect(limiter.tokens).toBeGreaterThan(0);
    });

    it('should not exceed max tokens', () => {
      const limiter = createRateLimiter(10, 100); // Very high refill rate
      
      // Advance time significantly
      jest.advanceTimersByTime(60000);
      
      // Check - should refill but cap at max
      isRateLimited(limiter);
      expect(limiter.tokens).toBeLessThanOrEqual(limiter.maxTokens);
    });

    it('should handle partial token refills', () => {
      const limiter = createRateLimiter(20, 5); // 5 tokens per second
      
      // Consume 10 tokens
      for (let i = 0; i < 10; i++) {
        isRateLimited(limiter);
      }
      expect(limiter.tokens).toBe(10);
      
      // Advance time by 500ms (should refill 2.5 tokens)
      jest.advanceTimersByTime(500);
      
      isRateLimited(limiter);
      expect(limiter.tokens).toBeCloseTo(11.5, 1);
    });
  });

  describe('Burst Handling', () => {
    it('should allow burst of requests up to max tokens', () => {
      const limiter = createRateLimiter(20, 5);
      let passedCount = 0;
      
      // Burst of 25 requests
      for (let i = 0; i < 25; i++) {
        if (!isRateLimited(limiter)) {
          passedCount++;
        }
      }
      
      // Should have allowed ~20 requests
      expect(passedCount).toBe(20);
    });

    it('should recover from burst over time', () => {
      const limiter = createRateLimiter(10, 10); // 10 tokens per second
      
      // Exhaust all tokens
      for (let i = 0; i < 15; i++) {
        isRateLimited(limiter);
      }
      
      // Should be limited now
      expect(isRateLimited(limiter)).toBe(true);
      
      // Wait for refill
      jest.advanceTimersByTime(2000); // 2 seconds = 20 tokens refilled (capped at 10)
      
      // Should not be limited anymore
      expect(isRateLimited(limiter)).toBe(false);
    });
  });
});

describe('Request Deduplication', () => {
  describe('RequestTracker', () => {
    it('should track in-flight requests', () => {
      const tracker = new RequestTracker();
      
      const promise = new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
      
      tracker.markInFlight('CJ_WALLET_CONNECT', promise);
      
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(true);
      expect(tracker.size()).toBe(1);
    });

    it('should remove completed requests', async () => {
      const tracker = new RequestTracker();
      
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      
      tracker.markInFlight('CJ_WALLET_CONNECT', promise);
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(true);
      
      // Complete the request
      resolvePromise!();
      await promise;
      
      // Give it a tick to process finally()
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(false);
    });

    it('should remove rejected requests', async () => {
      const tracker = new RequestTracker();
      
      // Use setTimeout to create a promise that will reject
      const controlledPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject('timeout rejection'), 0);
      });
      
      // Pre-attach catch handler to prevent unhandled rejection
      const handledPromise = controlledPromise.catch(() => {});
      
      tracker.markInFlight('CJ_WALLET_SIGN', controlledPromise);
      expect(tracker.isInFlight('CJ_WALLET_SIGN')).toBe(true);
      
      // Wait for the rejection and catch to complete
      await handledPromise;
      
      // Give microtask queue time to process
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(tracker.isInFlight('CJ_WALLET_SIGN')).toBe(false);
    });

    it('should return existing promise for duplicate requests', () => {
      const tracker = new RequestTracker();
      
      const promise = new Promise<void>(() => {}); // Never resolves
      tracker.markInFlight('CJ_WALLET_CONNECT', promise);
      
      const existingPromise = tracker.getPromise('CJ_WALLET_CONNECT');
      expect(existingPromise).toBe(promise);
    });

    it('should return null for non-existent requests', () => {
      const tracker = new RequestTracker();
      
      expect(tracker.getPromise('CJ_WALLET_CONNECT')).toBe(null);
    });

    it('should cleanup stale requests', () => {
      jest.useFakeTimers();
      
      const tracker = new RequestTracker(5000); // 5 second timeout
      
      const promise = new Promise<void>(() => {}); // Never resolves
      tracker.markInFlight('CJ_WALLET_CONNECT', promise);
      
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(true);
      
      // Advance past timeout
      jest.advanceTimersByTime(10000);
      
      // Should be cleaned up on next check
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(false);
      
      jest.useRealTimers();
    });

    it('should not cleanup fresh requests', () => {
      jest.useFakeTimers();
      
      const tracker = new RequestTracker(60000);
      
      const promise = new Promise<void>(() => {});
      tracker.markInFlight('CJ_WALLET_CONNECT', promise);
      
      // Advance time but not past timeout
      jest.advanceTimersByTime(30000);
      
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(true);
      
      jest.useRealTimers();
    });

    it('should track multiple different requests', () => {
      const tracker = new RequestTracker();
      
      tracker.markInFlight('CJ_WALLET_CONNECT', new Promise(() => {}));
      tracker.markInFlight('CJ_WALLET_SIGN', new Promise(() => {}));
      tracker.markInFlight('CJ_STORE_SESSION', new Promise(() => {}));
      
      expect(tracker.size()).toBe(3);
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(true);
      expect(tracker.isInFlight('CJ_WALLET_SIGN')).toBe(true);
      expect(tracker.isInFlight('CJ_STORE_SESSION')).toBe(true);
    });

    it('should allow manual removal', () => {
      const tracker = new RequestTracker();
      
      tracker.markInFlight('CJ_WALLET_CONNECT', new Promise(() => {}));
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(true);
      
      tracker.remove('CJ_WALLET_CONNECT');
      expect(tracker.isInFlight('CJ_WALLET_CONNECT')).toBe(false);
    });

    it('should clear all requests', () => {
      const tracker = new RequestTracker();
      
      tracker.markInFlight('A', new Promise(() => {}));
      tracker.markInFlight('B', new Promise(() => {}));
      tracker.markInFlight('C', new Promise(() => {}));
      
      expect(tracker.size()).toBe(3);
      
      tracker.clear();
      
      expect(tracker.size()).toBe(0);
    });
  });
});

describe('Rate Limiting with Exemptions', () => {
  it('should exempt certain message types from rate limiting', () => {
    const exemptTypes = [
      'CJ_CHECK_EXTENSION',
      'CJ_GET_SESSION',
    ];
    
    const isExempt = (type: string) => exemptTypes.includes(type);
    
    expect(isExempt('CJ_CHECK_EXTENSION')).toBe(true);
    expect(isExempt('CJ_GET_SESSION')).toBe(true);
    expect(isExempt('CJ_WALLET_CONNECT')).toBe(false);
    expect(isExempt('CJ_WALLET_SIGN')).toBe(false);
  });

  it('should apply rate limiting only to non-exempt types', () => {
    const limiter = createRateLimiter(2, 1);
    
    const checkRateLimit = (type: string) => {
      const exemptTypes = ['CJ_CHECK_EXTENSION', 'CJ_GET_SESSION'];
      if (exemptTypes.includes(type)) {
        return false; // Never rate limited
      }
      return isRateLimited(limiter);
    };
    
    // Non-exempt requests consume tokens
    expect(checkRateLimit('CJ_WALLET_CONNECT')).toBe(false);
    expect(checkRateLimit('CJ_WALLET_SIGN')).toBe(false);
    expect(checkRateLimit('CJ_STORE_SESSION')).toBe(true); // Rate limited
    
    // Exempt requests don't consume tokens
    expect(checkRateLimit('CJ_CHECK_EXTENSION')).toBe(false);
    expect(checkRateLimit('CJ_GET_SESSION')).toBe(false);
  });
});

describe('Concurrent Request Handling', () => {
  it('should handle concurrent duplicate requests gracefully', async () => {
    const tracker = new RequestTracker();
    
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    
    // First request
    tracker.markInFlight('CJ_WALLET_CONNECT', firstPromise);
    
    // Simulate second request coming in
    const existingPromise = tracker.getPromise('CJ_WALLET_CONNECT');
    expect(existingPromise).toBe(firstPromise);
    
    // Both callers can await the same promise
    const results: string[] = [];
    
    firstPromise.then(() => results.push('first'));
    existingPromise?.then(() => results.push('second'));
    
    // Resolve the original
    resolveFirst!();
    
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Both should have resolved
    expect(results).toHaveLength(2);
  });
});
