/**
 * API Client for communicating with the main Crypto Trading Journal app
 * Handles SIWE authentication flow and session management
 *
 * Features:
 * - Retry logic with exponential backoff
 * - Structured error handling
 * - Request timeout
 * - Offline detection
 */

import type {
  SIWEChallengeRequest,
  SIWEChallengeResponse,
  SIWEVerifyRequest,
  SIWEVerifyResponse,
  SessionValidationResponse,
} from './types';
import { API_BASE_URL, API_ENDPOINTS, TIMEOUTS } from './config';
import {
  ApiError,
  NetworkError,
  NetworkOfflineError,
  NetworkTimeoutError,
  isRetryableError,
  normalizeError,
} from './errors';
import { apiLogger } from './logger';

// ============================================================================
// Retry Configuration
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if browser is online
 */
function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ============================================================================
// HTTP Client
// ============================================================================

/**
 * HTTP client with error handling and retry logic
 */
class ApiClient {
  private baseUrl: string;
  private retryConfig: RetryConfig;

  constructor(baseUrl: string, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.baseUrl = baseUrl;
    this.retryConfig = retryConfig;
  }

  /**
   * Generic fetch wrapper with error handling and retry logic
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...retryConfig };
    const url = `${this.baseUrl}${endpoint}`;

    // Check network status before attempting
    if (!isOnline()) {
      throw new NetworkOfflineError();
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await this.fetchWithTimeout<T>(url, options);
        
        // Log successful retry
        if (attempt > 0) {
          apiLogger.info(`Request succeeded after ${attempt} retries`, { endpoint });
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const normalizedError = normalizeError(error);

        // Don't retry non-retryable errors
        if (!isRetryableError(normalizedError)) {
          apiLogger.error('Request failed (non-retryable)', {
            endpoint,
            error: lastError.message,
          });
          throw normalizedError;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= config.maxRetries) {
          apiLogger.error('Request failed after max retries', {
            endpoint,
            attempts: attempt + 1,
            error: lastError.message,
          });
          throw normalizedError;
        }

        // Calculate delay and wait
        const delay = calculateBackoffDelay(attempt, config);
        apiLogger.warn(`Request failed, retrying in ${delay}ms`, {
          endpoint,
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          error: lastError.message,
        });

        await sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new NetworkError('Request failed');
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout<T>(url: string, options: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUTS.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Handle non-OK responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          response.status,
          errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          { url, statusText: response.statusText }
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkTimeoutError(url, TIMEOUTS.REQUEST_TIMEOUT);
      }

      // Handle fetch errors (network issues)
      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`, { url });
      }

      throw error;
    }
  }

  /**
   * Request a SIWE challenge message from the backend
   *
   * Flow:
   * 1. User clicks "Sign In with Ethereum" in popup
   * 2. Extension calls this endpoint with wallet address
   * 3. Backend generates SIWE message with nonce
   * 4. Extension presents message to user for signing
   */
  async getSIWEChallenge(
    request: SIWEChallengeRequest
  ): Promise<SIWEChallengeResponse> {
    return this.fetch<SIWEChallengeResponse>(API_ENDPOINTS.SIWE_CHALLENGE, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Verify SIWE signature and create session
   *
   * Flow:
   * 1. User signs SIWE message with wallet
   * 2. Extension calls this endpoint with message + signature
   * 3. Backend verifies signature matches message
   * 4. Backend creates session and returns token
   * 5. Extension stores token in chrome.storage
   */
  async verifySIWE(
    request: SIWEVerifyRequest
  ): Promise<SIWEVerifyResponse> {
    return this.fetch<SIWEVerifyResponse>(API_ENDPOINTS.SIWE_VERIFY, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Validate existing session token
   *
   * Called on extension startup to check if user is still authenticated
   */
  async validateSession(sessionToken: string): Promise<SessionValidationResponse> {
    return this.fetch<SessionValidationResponse>(API_ENDPOINTS.SESSION_VALIDATE, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });
  }

  /**
   * End session and clear authentication
   *
   * Called when user clicks "Disconnect" in popup
   */
  async disconnect(sessionToken: string): Promise<{ success: boolean }> {
    return this.fetch<{ success: boolean }>(API_ENDPOINTS.DISCONNECT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);

/**
 * Helper function to handle API errors gracefully
 * Returns user-friendly message from any error
 */
export function handleApiError(error: unknown): string {
  const normalized = normalizeError(error);
  return normalized.getUserMessage();
}

/**
 * Check if API is reachable
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
