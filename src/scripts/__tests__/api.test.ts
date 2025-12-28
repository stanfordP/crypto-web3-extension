/**
 * Unit Tests for API Client
 *
 * Tests retry logic, error handling, and API communication
 */

import { apiClient, handleApiError, checkApiHealth } from '../api';
import {
  ApiError,
  NetworkError,
  NetworkOfflineError,
  NetworkTimeoutError,
} from '../errors';

// Reset fetch mock before each test
beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
  // Ensure navigator.onLine is true by default
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
});

describe('ApiClient', () => {
  describe('getSIWEChallenge', () => {
    it('should fetch SIWE challenge successfully', async () => {
      const mockResponse = {
        message: 'Sign in message',
        nonce: 'abc123',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await apiClient.getSIWEChallenge({
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        accountMode: 'live',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/siwe/challenge'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw ApiError on non-OK response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid address' }),
        url: 'http://localhost:3000/api/auth/siwe/challenge',
      });

      await expect(
        apiClient.getSIWEChallenge({
          address: 'invalid',
          chainId: 1,
          accountMode: 'live',
        })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('verifySIWE', () => {
    it('should verify SIWE signature successfully', async () => {
      const mockResponse = {
        sessionToken: 'token123',
        user: {
          id: 'user-1',
          address: '0x1234567890123456789012345678901234567890',
          accountMode: 'live' as const,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await apiClient.verifySIWE({
        message: 'Sign in message',
        signature: '0xsig',
        accountMode: 'live',
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('validateSession', () => {
    it('should validate session with bearer token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });

      const result = await apiClient.validateSession('token123');

      expect(result).toEqual({ valid: true });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should return invalid on 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid token' }),
        url: 'test',
      });

      await expect(apiClient.validateSession('expired-token')).rejects.toThrow(ApiError);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await apiClient.disconnect('token123');

      expect(result).toEqual({ success: true });
    });
  });

  describe('retry logic', () => {
    it('should retry on 500 errors', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({ error: 'Server error' }),
          url: 'test',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ valid: true }),
        });

      const result = await apiClient.validateSession('token123');

      expect(result).toEqual({ valid: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid input' }),
        url: 'test',
      });

      await expect(apiClient.validateSession('token')).rejects.toThrow(ApiError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: () => Promise.resolve({ error: 'Service down' }),
        url: 'test',
      });

      await expect(apiClient.validateSession('token')).rejects.toThrow(ApiError);
      // Default is 3 retries + 1 initial = 4 attempts
      expect(global.fetch).toHaveBeenCalledTimes(4);
    }, 30000); // Increase timeout due to retry delays

    it('should retry on network errors', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ valid: true }),
        });

      const result = await apiClient.validateSession('token');

      expect(result).toEqual({ valid: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('offline detection', () => {
    it('should throw NetworkOfflineError when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      await expect(apiClient.validateSession('token')).rejects.toThrow(NetworkOfflineError);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should throw NetworkTimeoutError on abort', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

      await expect(apiClient.validateSession('token')).rejects.toThrow(NetworkTimeoutError);
    }, 15000); // Increase timeout for retry attempts
  });
});

describe('handleApiError', () => {
  it('should return user message from ApiError', () => {
    const error = new ApiError(401, 'Unauthorized');
    expect(handleApiError(error)).toContain('session has expired');
  });

  it('should return user message from NetworkError', () => {
    const error = new NetworkError('Connection failed');
    expect(handleApiError(error)).toContain('internet connection');
  });

  it('should handle generic errors', () => {
    expect(handleApiError(new Error('Unknown'))).toBe(
      'Extension error. Please refresh the page and try again.'
    );
  });

  it('should handle string errors', () => {
    expect(handleApiError('Something went wrong')).toBe(
      'Extension error. Please refresh the page and try again.'
    );
  });
});

describe('checkApiHealth', () => {
  it('should return true when API is healthy', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
    });

    const result = await checkApiHealth();
    expect(result).toBe(true);
  });

  it('should return false when API returns error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const result = await checkApiHealth();
    expect(result).toBe(false);
  });

  it('should return false when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const result = await checkApiHealth();
    expect(result).toBe(false);
  });
});
