/**
 * Tests for MessageRouter
 * 
 * Tests the pure message routing functions and MessageRouter class.
 */

import {
  checkRateLimit,
  createRateLimiterState,
  isRequestInFlight,
  markRequestInFlight,
  createDeduplicationState,
  cleanupStaleRequests,
  MessageRouter,
  type RateLimiterConfig,
  type RateLimiterState,
  type DeduplicationState,
} from '../src/scripts/core/messaging/MessageRouter';

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 20,
  refillRate: 5,
};

describe('MessageRouter - Pure Functions', () => {
  describe('createRateLimiterState', () => {
    it('should create state with config values', () => {
      const state = createRateLimiterState(DEFAULT_CONFIG);
      expect(state.tokens).toBe(20);
      expect(state.lastRefill).toBeGreaterThan(0);
    });

    it('should create state with custom config', () => {
      const config: RateLimiterConfig = { maxTokens: 10, refillRate: 2 };
      const state = createRateLimiterState(config);
      expect(state.tokens).toBe(10);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow request when tokens available', () => {
      const state = createRateLimiterState(DEFAULT_CONFIG);
      const now = Date.now();

      const result = checkRateLimit(state, DEFAULT_CONFIG, now);

      expect(result.isLimited).toBe(false);
      expect(result.newState.tokens).toBe(19);
    });

    it('should deny request when no tokens', () => {
      const state: RateLimiterState = { tokens: 0, lastRefill: Date.now() };
      const now = Date.now();

      const result = checkRateLimit(state, DEFAULT_CONFIG, now);

      expect(result.isLimited).toBe(true);
    });

    it('should refill tokens over time', () => {
      const startTime = 10000;
      const state: RateLimiterState = { tokens: 0, lastRefill: startTime };

      // 1 second later = 5 tokens refilled (at 5 tokens/second)
      const result = checkRateLimit(state, DEFAULT_CONFIG, startTime + 1000);

      expect(result.isLimited).toBe(false);
      expect(result.newState.tokens).toBe(4); // 5 refilled, 1 consumed
    });

    it('should cap tokens at max', () => {
      const startTime = 10000;
      const state: RateLimiterState = { tokens: 15, lastRefill: startTime };

      // 10 seconds later - should refill but cap at 20
      const result = checkRateLimit(state, DEFAULT_CONFIG, startTime + 10000);

      expect(result.isLimited).toBe(false);
      expect(result.newState.tokens).toBe(19); // 20 max, 1 consumed
    });

    it('should not allow negative tokens', () => {
      const state: RateLimiterState = { tokens: 1, lastRefill: Date.now() };
      const now = Date.now();

      // First request
      const result1 = checkRateLimit(state, DEFAULT_CONFIG, now);
      expect(result1.isLimited).toBe(false);
      expect(result1.newState.tokens).toBe(0);

      // Second request immediately - no tokens
      const result2 = checkRateLimit(result1.newState, DEFAULT_CONFIG, now);
      expect(result2.isLimited).toBe(true);
    });
  });

  describe('createDeduplicationState', () => {
    it('should create empty state', () => {
      const state = createDeduplicationState();
      expect(state.inFlightRequests.size).toBe(0);
      expect(state.requestTimeout).toBe(60000);
    });

    it('should accept custom timeout', () => {
      const state = createDeduplicationState(30000);
      expect(state.requestTimeout).toBe(30000);
    });
  });

  describe('isRequestInFlight', () => {
    it('should return false for new request', () => {
      const state = createDeduplicationState();
      expect(isRequestInFlight(state, 'key1', Date.now())).toBe(false);
    });

    it('should return true for in-flight request', () => {
      const state = createDeduplicationState();
      const now = Date.now();
      state.inFlightRequests.set('key1', { startTime: now, promise: Promise.resolve() });

      expect(isRequestInFlight(state, 'key1', now)).toBe(true);
    });

    it('should return false for timed out request', () => {
      const state = createDeduplicationState(1000); // 1 second timeout
      const now = Date.now();
      // Add request that started 2 seconds ago
      state.inFlightRequests.set('key1', { startTime: now - 2000, promise: Promise.resolve() });

      expect(isRequestInFlight(state, 'key1', now)).toBe(false);
    });
  });

  describe('markRequestInFlight', () => {
    it('should add request to in-flight map', async () => {
      const state = createDeduplicationState();
      const promise = Promise.resolve();

      markRequestInFlight(state, 'key1', promise);

      expect(state.inFlightRequests.has('key1')).toBe(true);
    });

    it('should remove request when promise resolves', async () => {
      const state = createDeduplicationState();
      let resolve: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });

      markRequestInFlight(state, 'key1', promise);
      expect(state.inFlightRequests.has('key1')).toBe(true);

      resolve!();
      await promise;
      // Give time for finally to run
      await new Promise((r) => setTimeout(r, 10));

      expect(state.inFlightRequests.has('key1')).toBe(false);
    });
  });

  describe('cleanupStaleRequests', () => {
    it('should remove timed out requests', () => {
      const state = createDeduplicationState(1000);
      const now = Date.now();
      state.inFlightRequests.set('stale', { startTime: now - 2000, promise: Promise.resolve() });
      state.inFlightRequests.set('fresh', { startTime: now, promise: Promise.resolve() });

      const staleKeys = cleanupStaleRequests(state, now);

      expect(staleKeys).toContain('stale');
      expect(state.inFlightRequests.has('stale')).toBe(false);
      expect(state.inFlightRequests.has('fresh')).toBe(true);
    });
  });
});

describe('MessageRouter Class', () => {
  const TEST_ORIGIN = 'https://test.example.com';
  const routerConfig = {
    targetOrigin: TEST_ORIGIN,
    isAllowedOrigin: (origin: string) => origin === TEST_ORIGIN,
  };

  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter(routerConfig);
  });

  describe('register', () => {
    it('should register a handler', async () => {
      const handler = jest.fn();
      router.register('CJ_TEST_TYPE', handler);

      await router.route({ type: 'CJ_TEST_TYPE' }, TEST_ORIGIN);

      expect(handler).toHaveBeenCalled();
    });

    it('should replace existing handler', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      router.register('CJ_TEST_TYPE', handler1);
      router.register('CJ_TEST_TYPE', handler2);

      await router.route({ type: 'CJ_TEST_TYPE' }, TEST_ORIGIN);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('unregister', () => {
    it('should unregister a handler', async () => {
      const handler = jest.fn();
      router.register('CJ_TEST_TYPE', handler);
      
      const result = router.unregister('CJ_TEST_TYPE');
      
      expect(result).toBe(true);
      expect(await router.route({ type: 'CJ_TEST_TYPE' }, TEST_ORIGIN)).toBe(false);
    });

    it('should return false for non-existent handler', () => {
      expect(router.unregister('NONEXISTENT')).toBe(false);
    });
  });

  describe('route', () => {
    it('should route to correct handler', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      router.register('CJ_TYPE_1', handler1);
      router.register('CJ_TYPE_2', handler2);

      await router.route({ type: 'CJ_TYPE_1' }, TEST_ORIGIN);
      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();

      await router.route({ type: 'CJ_TYPE_2' }, TEST_ORIGIN);
      expect(handler2).toHaveBeenCalled();
    });

    it('should return false for unregistered type', async () => {
      const result = await router.route({ type: 'CJ_UNKNOWN' }, TEST_ORIGIN);
      expect(result).toBe(false);
    });

    it('should reject non-CJ messages', async () => {
      const handler = jest.fn();
      router.register('NOT_CJ', handler);

      const result = await router.route({ type: 'NOT_CJ' }, TEST_ORIGIN);
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should reject invalid origin', async () => {
      const handler = jest.fn();
      router.register('CJ_TEST', handler);

      const result = await router.route({ type: 'CJ_TEST' }, 'https://evil.com');
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass message to handler', async () => {
      const handler = jest.fn();

      router.register('CJ_TEST', handler);
      await router.route({ type: 'CJ_TEST', data: 'test' }, TEST_ORIGIN);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CJ_TEST', data: 'test' })
      );
    });

    it('should handle handler errors gracefully', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      router.register('CJ_TEST', handler);

      // Should not throw, but return true (handled with error)
      const result = await router.route({ type: 'CJ_TEST' }, TEST_ORIGIN);
      expect(result).toBe(true);
    });
  });

  describe('routeWithDeduplication', () => {
    it('should route unique requests', async () => {
      const handler = jest.fn();
      router.register('CJ_TEST', handler);

      const result = await router.routeWithDeduplication(
        { type: 'CJ_TEST' },
        TEST_ORIGIN
      );

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('should deduplicate concurrent requests of same type', async () => {
      const handler = jest.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      router.register('CJ_TEST', handler);

      // First request starts
      const promise1 = router.routeWithDeduplication(
        { type: 'CJ_TEST' },
        TEST_ORIGIN
      );

      // Second request with same type should be deduplicated
      const promise2 = router.routeWithDeduplication(
        { type: 'CJ_TEST' },
        TEST_ORIGIN
      );

      await Promise.all([promise1, promise2]);

      // Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should allow different types concurrently', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      router.register('CJ_TYPE_1', handler1);
      router.register('CJ_TYPE_2', handler2);

      await Promise.all([
        router.routeWithDeduplication({ type: 'CJ_TYPE_1' }, TEST_ORIGIN),
        router.routeWithDeduplication({ type: 'CJ_TYPE_2' }, TEST_ORIGIN),
      ]);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRateLimiterState', () => {
    it('should return current state', () => {
      const state = router.getRateLimiterState();
      expect(state.tokens).toBe(20);
      expect(state.lastRefill).toBeGreaterThan(0);
    });
  });

  describe('getDeduplicationState', () => {
    it('should return current state', () => {
      const state = router.getDeduplicationState();
      expect(state.inFlightCount).toBe(0);
      expect(state.types).toEqual([]);
    });
  });
});
