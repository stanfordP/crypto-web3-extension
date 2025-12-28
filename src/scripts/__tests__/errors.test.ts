/**
 * Unit Tests for Error Types
 *
 * Tests the structured error handling system
 */

import {
  ExtensionError,
  ErrorCategory,
  NetworkError,
  NetworkOfflineError,
  NetworkTimeoutError,
  ApiError,
  RateLimitError,
  WalletNotFoundError,
  WalletConnectionError,
  WalletRejectedError,
  WalletTimeoutError,
  AuthenticationError,
  SessionExpiredError,
  InvalidSignatureError,
  SIWEError,
  ValidationError,
  InvalidAddressError,
  ExtensionCommunicationError,
  UnauthorizedSenderError,
  normalizeError,
  isRetryableError,
  getUserErrorMessage,
  createRpcError,
  RPC_ERROR_CODES,
} from '../errors';

describe('Error Types', () => {
  describe('NetworkError', () => {
    it('should create network error with message', () => {
      const error = new NetworkError('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.message).toBe('Connection failed');
      expect(error.retryable).toBe(true);
    });

    it('should provide user-friendly message', () => {
      const error = new NetworkError('Technical details');
      expect(error.getUserMessage()).toBe(
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    it('should include context', () => {
      const error = new NetworkError('Failed', { url: 'https://api.test.com' });
      expect(error.context).toEqual({ url: 'https://api.test.com' });
    });
  });

  describe('NetworkOfflineError', () => {
    it('should create offline error', () => {
      const error = new NetworkOfflineError();
      expect(error.code).toBe('NETWORK_OFFLINE');
      expect(error.retryable).toBe(true);
      expect(error.getUserMessage()).toContain('offline');
    });
  });

  describe('NetworkTimeoutError', () => {
    it('should include endpoint and timeout info', () => {
      const error = new NetworkTimeoutError('/api/auth', 30000);
      expect(error.code).toBe('NETWORK_TIMEOUT');
      expect(error.context).toEqual({ endpoint: '/api/auth', timeoutMs: 30000 });
      expect(error.retryable).toBe(true);
    });
  });

  describe('ApiError', () => {
    it('should handle 500 errors as retryable', () => {
      const error = new ApiError(500, 'Internal server error');
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.getUserMessage()).toContain('Server error');
    });

    it('should handle 401 errors as non-retryable', () => {
      const error = new ApiError(401, 'Unauthorized');
      expect(error.retryable).toBe(false);
      expect(error.getUserMessage()).toContain('session has expired');
    });

    it('should handle 403 errors', () => {
      const error = new ApiError(403, 'Forbidden');
      expect(error.getUserMessage()).toContain('permission');
    });

    it('should handle 404 errors', () => {
      const error = new ApiError(404, 'Not found');
      expect(error.getUserMessage()).toContain('not found');
    });
  });

  describe('RateLimitError', () => {
    it('should include retry after time', () => {
      const error = new RateLimitError('eth_requestAccounts', 5000);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.retryAfterMs).toBe(5000);
      expect(error.getUserMessage()).toContain('5 second');
    });
  });

  describe('Wallet Errors', () => {
    it('should create WalletNotFoundError', () => {
      const error = new WalletNotFoundError();
      expect(error.code).toBe('WALLET_NOT_FOUND');
      expect(error.getUserMessage()).toContain('install MetaMask');
    });

    it('should create WalletConnectionError', () => {
      const error = new WalletConnectionError('MetaMask', 'User rejected');
      expect(error.context).toEqual({ walletName: 'MetaMask', reason: 'User rejected' });
      expect(error.retryable).toBe(true);
    });

    it('should create WalletRejectedError', () => {
      const error = new WalletRejectedError('sign message');
      expect(error.code).toBe('WALLET_REJECTED');
      expect(error.retryable).toBe(false);
      expect(error.getUserMessage()).toContain('rejected');
    });

    it('should create WalletTimeoutError', () => {
      const error = new WalletTimeoutError('personal_sign', 60000);
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ operation: 'personal_sign', timeoutMs: 60000 });
    });
  });

  describe('Authentication Errors', () => {
    it('should create AuthenticationError', () => {
      const error = new AuthenticationError('Token invalid');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.category).toBe(ErrorCategory.AUTH);
    });

    it('should create SessionExpiredError', () => {
      const error = new SessionExpiredError();
      expect(error.code).toBe('SESSION_EXPIRED');
      expect(error.getUserMessage()).toContain('expired');
    });

    it('should create InvalidSignatureError', () => {
      const error = new InvalidSignatureError('Signer mismatch');
      expect(error.code).toBe('INVALID_SIGNATURE');
      expect(error.context).toEqual({ reason: 'Signer mismatch' });
    });

    it('should create SIWEError for different steps', () => {
      const challengeError = new SIWEError('challenge', 'Server error');
      expect(challengeError.context).toEqual({ step: 'challenge', reason: 'Server error' });

      const signError = new SIWEError('sign', 'User cancelled');
      expect(signError.context).toEqual({ step: 'sign', reason: 'User cancelled' });
    });
  });

  describe('Validation Errors', () => {
    it('should create ValidationError with field', () => {
      const error = new ValidationError('Invalid format', 'email');
      expect(error.field).toBe('email');
      expect(error.getUserMessage()).toContain('email');
    });

    it('should create InvalidAddressError', () => {
      const error = new InvalidAddressError('0xinvalid');
      expect(error.code).toBe('INVALID_ADDRESS');
      expect(error.context).toEqual({ address: '0xinvalid' });
    });
  });

  describe('Extension Errors', () => {
    it('should create ExtensionCommunicationError', () => {
      const error = new ExtensionCommunicationError('content-script', 'Connection lost');
      expect(error.code).toBe('EXTENSION_COMMUNICATION_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('should create UnauthorizedSenderError', () => {
      const error = new UnauthorizedSenderError('https://malicious.com');
      expect(error.code).toBe('UNAUTHORIZED_SENDER');
      expect(error.context).toEqual({ origin: 'https://malicious.com' });
    });
  });
});

describe('Error Utilities', () => {
  describe('normalizeError', () => {
    it('should return ExtensionError as-is', () => {
      const original = new NetworkError('Test');
      const normalized = normalizeError(original);
      expect(normalized).toBe(original);
    });

    it('should convert network-related Error to NetworkError', () => {
      const error = new Error('Network request failed');
      const normalized = normalizeError(error);
      expect(normalized).toBeInstanceOf(NetworkError);
    });

    it('should convert timeout-related Error', () => {
      const error = new Error('Request timeout');
      const normalized = normalizeError(error);
      expect(normalized).toBeInstanceOf(NetworkTimeoutError);
    });

    it('should convert rejected Error to WalletRejectedError', () => {
      const error = new Error('User rejected the request');
      const normalized = normalizeError(error);
      expect(normalized).toBeInstanceOf(WalletRejectedError);
    });

    it('should handle string errors', () => {
      const normalized = normalizeError('Something went wrong');
      expect(normalized).toBeInstanceOf(ExtensionCommunicationError);
    });

    it('should handle unknown errors', () => {
      const normalized = normalizeError({ weird: 'object' });
      expect(normalized).toBeInstanceOf(ExtensionCommunicationError);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      expect(isRetryableError(new NetworkError('Test'))).toBe(true);
      expect(isRetryableError(new ApiError(503, 'Service unavailable'))).toBe(true);
      expect(isRetryableError(new RateLimitError('method', 1000))).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new WalletRejectedError('sign'))).toBe(false);
      expect(isRetryableError(new ApiError(401, 'Unauthorized'))).toBe(false);
      expect(isRetryableError(new ValidationError('Invalid'))).toBe(false);
    });

    it('should return false for non-ExtensionError', () => {
      expect(isRetryableError(new Error('Generic'))).toBe(false);
      expect(isRetryableError('string error')).toBe(false);
    });
  });

  describe('getUserErrorMessage', () => {
    it('should return user message from ExtensionError', () => {
      const error = new NetworkOfflineError();
      expect(getUserErrorMessage(error)).toContain('offline');
    });

    it('should return generic message for other errors', () => {
      expect(getUserErrorMessage(new Error('Technical stuff'))).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });

    it('should handle non-Error values', () => {
      expect(getUserErrorMessage('string')).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });

  describe('createRpcError', () => {
    it('should create RPC error object', () => {
      const error = createRpcError(4001, 'User rejected', { extra: 'data' });
      expect(error).toEqual({
        code: 4001,
        message: 'User rejected',
        data: { extra: 'data' },
      });
    });

    it('should omit data if undefined', () => {
      const error = createRpcError(4001, 'User rejected');
      expect(error).toEqual({
        code: 4001,
        message: 'User rejected',
      });
      expect('data' in error).toBe(false);
    });
  });

  describe('RPC_ERROR_CODES', () => {
    it('should have standard EIP-1193 error codes', () => {
      expect(RPC_ERROR_CODES.USER_REJECTED).toBe(4001);
      expect(RPC_ERROR_CODES.UNAUTHORIZED).toBe(4100);
      expect(RPC_ERROR_CODES.DISCONNECTED).toBe(4900);
      expect(RPC_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    });
  });
});

describe('Error Serialization', () => {
  it('should serialize error to JSON', () => {
    const error = new ApiError(500, 'Server error', { endpoint: '/api/test' });
    const json = error.toJSON();

    expect(json).toMatchObject({
      name: 'ApiError',
      code: 'API_ERROR',
      category: 'API',
      message: 'Server error',
      retryable: true,
    });
    expect(json.timestamp).toBeDefined();
    expect(json.context).toEqual({ endpoint: '/api/test', statusCode: 500 });
  });

  it('should include stack trace', () => {
    const error = new NetworkError('Test');
    const json = error.toJSON();
    expect(json.stack).toBeDefined();
    expect(json.stack).toContain('NetworkError');
  });
});
