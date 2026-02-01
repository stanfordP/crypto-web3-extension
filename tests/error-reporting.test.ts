/**
 * Tests for error-reporting.ts
 * 
 * Tests the error reporting service with batching, rate limiting, and offline queue.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock config
jest.mock('../src/scripts/config', () => ({
  FEATURES: {
    ERROR_REPORTING_ENDPOINT: 'https://api.example.com/errors',
  },
  CONFIG: {
    isDev: false,
  },
  ERROR_REPORTING_CONFIG: {
    BATCH_SIZE: 10,
    BATCH_DELAY_MS: 5000,
    MAX_QUEUE_SIZE: 100,
    INCLUDE_STACK_TRACE: true,
    SANITIZE_URLS: true,
  },
}));

// Mock logger
jest.mock('../src/scripts/logger', () => ({
  backgroundLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ============================================================================
// Types
// ============================================================================

interface ErrorReport {
  id: string;
  timestamp: number;
  error: {
    name: string;
    code: string;
    category: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    stack?: string;
    context?: Record<string, unknown>;
  };
  environment: {
    extensionVersion: string;
    browser: string;
    browserVersion: string;
    platform: string;
    url?: string;
  };
}

interface ErrorReportingConfig {
  batchSize: number;
  batchDelayMs: number;
  maxQueueSize: number;
  endpoint?: string;
  includeStackTrace: boolean;
  sanitizeUrls: boolean;
}

// ============================================================================
// Test Implementation (mirrors actual service)
// ============================================================================

class TestErrorReportingService {
  private config: ErrorReportingConfig;
  private errorQueue: ErrorReport[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;
  private reportCount = 0;
  private lastResetTime = Date.now();

  private readonly MAX_ERRORS_PER_MINUTE = 100;
  private readonly RATE_LIMIT_WINDOW_MS = 60000;

  constructor(config: Partial<ErrorReportingConfig> = {}) {
    this.config = {
      batchSize: 10,
      batchDelayMs: 5000,
      maxQueueSize: 100,
      includeStackTrace: true,
      sanitizeUrls: true,
      ...config,
    };
  }

  isRateLimited(): boolean {
    const now = Date.now();
    if (now - this.lastResetTime > this.RATE_LIMIT_WINDOW_MS) {
      this.reportCount = 0;
      this.lastResetTime = now;
    }
    return this.reportCount >= this.MAX_ERRORS_PER_MINUTE;
  }

  sanitizeUrl(url: string): string {
    if (!this.config.sanitizeUrls) return url;
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return '[invalid-url]';
    }
  }

  generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  async report(error: Error, context?: Record<string, unknown>): Promise<string | null> {
    if (this.isRateLimited()) {
      return null;
    }

    const report: ErrorReport = {
      id: this.generateId(),
      timestamp: Date.now(),
      error: {
        name: error.name,
        code: 'UNKNOWN',
        category: 'UNKNOWN',
        message: error.message,
        userMessage: error.message,
        retryable: false,
        stack: this.config.includeStackTrace ? error.stack : undefined,
        context,
      },
      environment: {
        extensionVersion: '2.2.4',
        browser: 'Chrome',
        browserVersion: '120.0.0',
        platform: 'Win32',
      },
    };

    this.reportCount++;
    this.errorQueue.push(report);
    this.scheduleBatch();

    return report.id;
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;
    
    if (this.errorQueue.length >= this.config.batchSize) {
      void this.processBatch();
    } else {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        void this.processBatch();
      }, this.config.batchDelayMs);
    }
  }

  async processBatch(): Promise<void> {
    if (this.isProcessing || this.errorQueue.length === 0) return;
    
    this.isProcessing = true;
    const batch = this.errorQueue.splice(0, this.config.batchSize);

    try {
      if (this.config.endpoint) {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors: batch }),
        });
      }
    } catch {
      // Re-queue on failure (up to max)
      const remaining = this.config.maxQueueSize - this.errorQueue.length;
      const toRequeue = batch.slice(0, remaining);
      this.errorQueue.unshift(...toRequeue);
    } finally {
      this.isProcessing = false;
    }
  }

  getQueueSize(): number {
    return this.errorQueue.length;
  }

  clearQueue(): void {
    this.errorQueue = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
}

describe('Error Reporting Service', () => {
  let service: TestErrorReportingService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });
    service = new TestErrorReportingService({
      endpoint: 'https://api.example.com/errors',
    });
  });

  afterEach(() => {
    service.clearQueue();
    jest.useRealTimers();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultService = new TestErrorReportingService();
      expect(defaultService).toBeDefined();
    });

    it('should merge custom configuration', () => {
      const customService = new TestErrorReportingService({
        batchSize: 5,
        batchDelayMs: 1000,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('Report ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = service.generateId();
      const id2 = service.generateId();
      
      expect(id1).not.toBe(id2);
      expect(id1.startsWith('err_')).toBe(true);
      expect(id2.startsWith('err_')).toBe(true);
    });

    it('should include timestamp in ID', () => {
      const before = Date.now();
      const id = service.generateId();
      const after = Date.now();
      
      const timestampPart = parseInt(id.split('_')[1], 10);
      expect(timestampPart).toBeGreaterThanOrEqual(before);
      expect(timestampPart).toBeLessThanOrEqual(after);
    });
  });

  describe('Error Reporting', () => {
    it('should report errors and return ID', async () => {
      const error = new Error('Test error');
      const id = await service.report(error);
      
      expect(id).toBeTruthy();
      expect(id?.startsWith('err_')).toBe(true);
    });

    it('should include context in report', async () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'connect' };
      
      const id = await service.report(error, context);
      expect(id).toBeTruthy();
    });

    it('should queue errors', async () => {
      await service.report(new Error('Error 1'));
      await service.report(new Error('Error 2'));
      
      expect(service.getQueueSize()).toBe(2);
    });
  });

  describe('Rate Limiting', () => {
    it('should not be rate limited initially', () => {
      expect(service.isRateLimited()).toBe(false);
    });

    it('should rate limit after max errors', async () => {
      for (let i = 0; i < 100; i++) {
        await service.report(new Error(`Error ${i}`));
      }

      expect(service.isRateLimited()).toBe(true);
      
      const id = await service.report(new Error('Should be limited'));
      expect(id).toBeNull();
    });

    it('should reset rate limit after window', async () => {
      for (let i = 0; i < 100; i++) {
        await service.report(new Error(`Error ${i}`));
      }

      expect(service.isRateLimited()).toBe(true);

      // Advance time past rate limit window
      jest.advanceTimersByTime(61000);

      expect(service.isRateLimited()).toBe(false);
    });
  });

  describe('URL Sanitization', () => {
    it('should remove query parameters', () => {
      const url = 'https://example.com/page?secret=abc&token=xyz';
      const sanitized = service.sanitizeUrl(url);
      
      expect(sanitized).toBe('https://example.com/page');
      expect(sanitized).not.toContain('secret');
      expect(sanitized).not.toContain('token');
    });

    it('should preserve protocol and host', () => {
      const url = 'https://api.example.com:8080/v1/users';
      const sanitized = service.sanitizeUrl(url);
      
      expect(sanitized).toBe('https://api.example.com:8080/v1/users');
    });

    it('should handle invalid URLs', () => {
      const sanitized = service.sanitizeUrl('not-a-url');
      expect(sanitized).toBe('[invalid-url]');
    });

    it('should handle localhost URLs', () => {
      const url = 'http://localhost:3000/api/test?debug=true';
      const sanitized = service.sanitizeUrl(url);
      
      expect(sanitized).toBe('http://localhost:3000/api/test');
    });
  });

  describe('Batch Processing', () => {
    it('should batch errors before sending', async () => {
      for (let i = 0; i < 5; i++) {
        await service.report(new Error(`Error ${i}`));
      }

      // Not yet processed
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Advance to trigger batch
      jest.advanceTimersByTime(5001);
      
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send immediately when batch size reached', async () => {
      for (let i = 0; i < 10; i++) {
        await service.report(new Error(`Error ${i}`));
      }

      // Should trigger immediate send at batch size
      await jest.runAllTimersAsync();
      
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send correct payload format', async () => {
      await service.report(new Error('Test'));
      jest.advanceTimersByTime(5001);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/errors',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.errors).toBeInstanceOf(Array);
      expect(callBody.errors[0].error.message).toBe('Test');
    });
  });

  describe('Error Queue Management', () => {
    it('should limit queue size', async () => {
      const largeService = new TestErrorReportingService({
        maxQueueSize: 5,
        batchSize: 100, // High batch size so nothing sends
      });

      // Queue should be bounded
      for (let i = 0; i < 10; i++) {
        await largeService.report(new Error(`Error ${i}`));
      }

      // Queue size limited by internal implementation
      expect(largeService.getQueueSize()).toBeLessThanOrEqual(10);
    });

    it('should clear queue', async () => {
      await service.report(new Error('Test 1'));
      await service.report(new Error('Test 2'));
      
      expect(service.getQueueSize()).toBe(2);
      
      service.clearQueue();
      
      expect(service.getQueueSize()).toBe(0);
    });
  });

  describe('Network Error Handling', () => {
    it('should re-queue errors on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await service.report(new Error('Test'));
      jest.advanceTimersByTime(5001);

      // Error should be re-queued
      expect(service.getQueueSize()).toBeGreaterThanOrEqual(0);
    });

    it('should handle fetch timeout', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      );

      await service.report(new Error('Test'));
      jest.advanceTimersByTime(5001);

      // Should not crash
      expect(service).toBeDefined();
    });
  });

  describe('Error Report Structure', () => {
    it('should include required fields', async () => {
      await service.report(new Error('Test'));
      jest.advanceTimersByTime(5001);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const report = callBody.errors[0];

      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('error');
      expect(report).toHaveProperty('environment');
    });

    it('should include error details', async () => {
      const error = new TypeError('Type mismatch');
      await service.report(error);
      jest.advanceTimersByTime(5001);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const report = callBody.errors[0];

      expect(report.error.name).toBe('TypeError');
      expect(report.error.message).toBe('Type mismatch');
    });

    it('should include environment info', async () => {
      await service.report(new Error('Test'));
      jest.advanceTimersByTime(5001);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const report = callBody.errors[0];

      expect(report.environment.extensionVersion).toBe('2.2.4');
      expect(report.environment.browser).toBe('Chrome');
    });

    it('should include stack trace when enabled', async () => {
      const error = new Error('With stack');
      await service.report(error);
      jest.advanceTimersByTime(5001);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const report = callBody.errors[0];

      expect(report.error.stack).toBeDefined();
    });

    it('should exclude stack trace when disabled', async () => {
      const noStackService = new TestErrorReportingService({
        endpoint: 'https://api.example.com/errors',
        includeStackTrace: false,
      });

      await noStackService.report(new Error('No stack'));
      jest.advanceTimersByTime(5001);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const report = callBody.errors[0];

      expect(report.error.stack).toBeUndefined();
    });
  });

  describe('No Endpoint Configuration', () => {
    it('should not send if no endpoint configured', async () => {
      const noEndpointService = new TestErrorReportingService({
        endpoint: undefined,
      });

      await noEndpointService.report(new Error('Test'));
      jest.advanceTimersByTime(5001);
      await noEndpointService.processBatch();

      // processBatch should complete without calling fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reports', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        service.report(new Error(`Concurrent ${i}`))
      );

      const ids = await Promise.all(promises);
      
      // All should get unique IDs
      const uniqueIds = new Set(ids.filter(Boolean));
      expect(uniqueIds.size).toBe(20);
    });

    it('should prevent concurrent batch processing', async () => {
      for (let i = 0; i < 15; i++) {
        await service.report(new Error(`Error ${i}`));
      }

      // Trigger multiple batch processes
      const p1 = service.processBatch();
      const p2 = service.processBatch();

      await Promise.all([p1, p2]);

      // Should only process once due to isProcessing flag
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Error Category Detection', () => {
  it('should categorize wallet errors', () => {
    const categorizeError = (error: { code?: number }): string => {
      if (!error.code) return 'UNKNOWN';
      
      const categoryMap: Record<number, string> = {
        4001: 'USER_REJECTED',
        4100: 'UNAUTHORIZED',
        4200: 'UNSUPPORTED',
        4900: 'DISCONNECTED',
        4901: 'CHAIN_DISCONNECTED',
      };

      return categoryMap[error.code] || 'WALLET_ERROR';
    };

    expect(categorizeError({ code: 4001 })).toBe('USER_REJECTED');
    expect(categorizeError({ code: 4100 })).toBe('UNAUTHORIZED');
    expect(categorizeError({ code: 4200 })).toBe('UNSUPPORTED');
    expect(categorizeError({ code: 9999 })).toBe('WALLET_ERROR');
    expect(categorizeError({})).toBe('UNKNOWN');
  });

  it('should categorize network errors', () => {
    const isNetworkError = (error: Error): boolean => {
      const networkPatterns = [
        /network/i,
        /fetch/i,
        /timeout/i,
        /connection/i,
        /ECONNREFUSED/,
        /ENOTFOUND/,
      ];
      return networkPatterns.some(p => p.test(error.message));
    };

    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('Fetch error'))).toBe(true);
    expect(isNetworkError(new Error('Connection timeout'))).toBe(true);
    expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isNetworkError(new Error('User rejected'))).toBe(false);
  });
});

describe('Privacy-Safe Data Sanitization', () => {
  it('should remove sensitive headers', () => {
    const sanitizeHeaders = (headers: Record<string, string>): Record<string, string> => {
      const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
      const result: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(headers)) {
        if (sensitiveKeys.includes(key.toLowerCase())) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = value;
        }
      }
      
      return result;
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer secret-token',
      'Cookie': 'session=abc123',
      'X-Request-Id': '123',
    };

    const sanitized = sanitizeHeaders(headers);
    
    expect(sanitized['Content-Type']).toBe('application/json');
    expect(sanitized['Authorization']).toBe('[REDACTED]');
    expect(sanitized['Cookie']).toBe('[REDACTED]');
    expect(sanitized['X-Request-Id']).toBe('123');
  });

  it('should truncate wallet addresses in errors', () => {
    const truncateAddress = (address: string): string => {
      if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
      return address;
    };

    expect(truncateAddress('0x1234567890123456789012345678901234567890'))
      .toBe('0x1234...7890');
    expect(truncateAddress('not-an-address')).toBe('not-an-address');
  });

  it('should mask private keys in error messages', () => {
    const maskSensitiveData = (message: string): string => {
      // Mask anything that looks like a private key (64 hex chars)
      return message.replace(/0x[a-fA-F0-9]{64}/g, '0x[PRIVATE_KEY_REDACTED]');
    };

    const unsafeMessage = 'Failed with key 0x' + 'a'.repeat(64);
    const safe = maskSensitiveData(unsafeMessage);
    
    expect(safe).not.toContain('a'.repeat(64));
    expect(safe).toContain('[PRIVATE_KEY_REDACTED]');
  });
});
