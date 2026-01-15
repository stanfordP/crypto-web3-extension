/**
 * Messaging Module
 * 
 * @module core/messaging
 */

export { MessageRouter } from './MessageRouter';
export {
  checkRateLimit,
  createRateLimiterState,
  createDeduplicationState,
  cleanupStaleRequests,
  isRequestInFlight,
  getInFlightPromise,
  markRequestInFlight,
} from './MessageRouter';

export type {
  RateLimiterConfig,
  RateLimiterState,
  TrackedRequest,
  DeduplicationState,
  MessageRouterConfig,
} from './MessageRouter';

export * from './MessageTypes';
