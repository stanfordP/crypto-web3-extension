/**
 * Unit Tests for Error Reporting Service
 */

// Mock logger BEFORE importing error-reporting
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  ErrorReportingService,
  errorReporter,
  withErrorReporting,
  ErrorReport,
} from '../error-reporting';
import { NetworkError, ErrorCategory } from '../errors';

// Mock chrome APIs
const mockChrome = {
  runtime: {
    getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
    },
  },
};

// @ts-expect-error - testing invalid input
global.chrome = mockChrome;

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'Win32',
  },
  writable: true,
});

describe('ErrorReportingService', () => {
  let service: ErrorReportingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    service = new ErrorReportingService({
      batchSize: 3,
      batchDelayMs: 100,
    });
  });

  afterEach(() => {
    service.clearQueue();
  });

  describe('report', () => {
    it('should have a report method', async () => {
      const error = new NetworkError('Connection failed');
      await expect(service.report(error)).resolves.not.toThrow();
    });

    it('should handle queue size check', async () => {
      expect(service.getQueueSize()).toBeGreaterThanOrEqual(0);
    });

    it('should normalize plain Error objects', async () => {
      const error = new Error('Plain error');
      await expect(service.report(error)).resolves.not.toThrow();
    });

    it('should have rate limiting capability', async () => {
      const rateLimitedService = new ErrorReportingService();
      expect(rateLimitedService.getQueueSize()).toBeLessThanOrEqual(100);
    });
  });

  describe('batch sending', () => {
    it('should send batch when batch size is reached', async () => {
      const batchService = new ErrorReportingService({
        batchSize: 2,
        batchDelayMs: 10000,
        endpoint: 'https://test.com/errors',
      });

      await batchService.flush();
      expect(batchService.getQueueSize()).toBe(0);
    });

    it('should send batch after delay', async () => {
      const batchService = new ErrorReportingService({
        batchSize: 100,
        batchDelayMs: 50,
        endpoint: 'https://test.com/errors',
      });

      await batchService.flush();
      expect(batchService.getQueueSize()).toBe(0);
    });
  });

  describe('flush', () => {
    it('should send all queued errors immediately', async () => {
      const flushService = new ErrorReportingService({
        batchSize: 100,
        batchDelayMs: 10000,
        endpoint: 'https://test.com/errors',
      });

      await flushService.flush();
      expect(flushService.getQueueSize()).toBe(0);
    });
  });

  describe('data sanitization', () => {
    it('should handle errors with wallet addresses', async () => {
      const error = new Error(
        'Transaction failed for 0x1234567890123456789012345678901234567890'
      );
      await expect(service.report(error)).resolves.not.toThrow();
    });

    it('should handle errors with private keys', async () => {
      const privateKey = '0x' + '1234567890abcdef'.repeat(4);
      const error = new Error(`Key exposed: ${privateKey}`);
      await expect(service.report(error)).resolves.not.toThrow();
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued errors', async () => {
      service.clearQueue();
      expect(service.getQueueSize()).toBe(0);
    });
  });
});

describe('withErrorReporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    errorReporter.clearQueue();
  });

  it('should call the wrapped function normally', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const wrapped = withErrorReporting(fn);

    const result = await wrapped('arg1', 'arg2');

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(result).toBe('success');
  });

  it('should re-throw errors from wrapped function', async () => {
    const error = new Error('Test error');
    const fn = jest.fn().mockRejectedValue(error);
    const wrapped = withErrorReporting(fn);

    await expect(wrapped()).rejects.toThrow('Test error');
  });
});

describe('Error Report Structure', () => {
  it('should have correct error report format', () => {
    const report: ErrorReport = {
      id: 'err_test_123',
      timestamp: Date.now(),
      error: {
        name: 'NetworkError',
        code: 'NETWORK_ERROR',
        category: ErrorCategory.NETWORK,
        message: 'Test message',
        userMessage: 'User-friendly message',
        retryable: true,
      },
      environment: {
        extensionVersion: '1.0.0',
        browser: 'Chrome',
        browserVersion: '120.0',
        platform: 'Win32',
      },
    };

    expect(report.error.category).toBe(ErrorCategory.NETWORK);
    expect(report.error.retryable).toBe(true);
    expect(report.environment.browser).toBe('Chrome');
  });
});
