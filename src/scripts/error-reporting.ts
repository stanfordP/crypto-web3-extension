/**
 * Error Reporting Service for the Web3 Extension
 *
 * Provides centralized error tracking with:
 * - Error batching to reduce API calls
 * - Offline queue for later submission
 * - Context enrichment (browser, extension version, etc.)
 * - Rate limiting to prevent spam
 * - Privacy-safe data sanitization
 */

import { ExtensionError, ErrorCategory, normalizeError } from './errors';
import { backgroundLogger as logger } from './logger';
import { FEATURES, CONFIG } from './config';

// ============================================================================
// Types
// ============================================================================

export interface ErrorReport {
  id: string;
  timestamp: number;
  error: {
    name: string;
    code: string;
    category: ErrorCategory | 'UNKNOWN';
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
  session?: {
    isConnected: boolean;
    chainId?: string;
    hasWallet: boolean;
  };
}

interface ErrorReportingConfig {
  /** Maximum errors to batch before sending */
  batchSize: number;
  /** Milliseconds to wait before sending a batch */
  batchDelayMs: number;
  /** Maximum errors to keep in offline queue */
  maxQueueSize: number;
  /** Endpoint to send error reports */
  endpoint?: string;
  /** Whether to include stack traces */
  includeStackTrace: boolean;
  /** Whether to sanitize URLs (remove query params) */
  sanitizeUrls: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: ErrorReportingConfig = {
  batchSize: 10,
  batchDelayMs: 5000,
  maxQueueSize: 100,
  endpoint: undefined, // Set via FEATURES.ERROR_REPORTING_ENDPOINT
  includeStackTrace: true,
  sanitizeUrls: true,
};

// ============================================================================
// Error Reporting Service
// ============================================================================

class ErrorReportingService {
  private config: ErrorReportingConfig;
  private errorQueue: ErrorReport[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;
  private reportCount = 0;
  private lastResetTime = Date.now();

  // Rate limiting: max 100 errors per minute
  private readonly MAX_ERRORS_PER_MINUTE = 100;
  private readonly RATE_LIMIT_WINDOW_MS = 60000;

  constructor(config: Partial<ErrorReportingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Report an error to the tracking service
   */
  async report(
    error: Error | ExtensionError | unknown,
    context?: Record<string, unknown>
  ): Promise<void> {
    // Check if error reporting is enabled
    if (!FEATURES.ERROR_REPORTING) {
      logger.debug('Error reporting is disabled');
      return;
    }

    // Rate limiting check
    if (!this.checkRateLimit()) {
      logger.warn('Error reporting rate limit exceeded');
      return;
    }

    try {
      const normalized = normalizeError(error);
      const report = await this.createReport(normalized, context);

      // Add to queue
      this.errorQueue.push(report);

      // Trim queue if too large
      if (this.errorQueue.length > this.config.maxQueueSize) {
        this.errorQueue.shift(); // Remove oldest
        logger.warn('Error queue overflow, dropping oldest error');
      }

      // Schedule batch send
      this.scheduleBatch();

      logger.debug('Error queued for reporting', { code: normalized.code });
    } catch (reportingError) {
      // Don't let error reporting errors crash the app
      logger.error('Failed to queue error for reporting', { reportingError });
    }
  }

  /**
   * Create a full error report with context
   */
  private async createReport(
    error: ExtensionError,
    additionalContext?: Record<string, unknown>
  ): Promise<ErrorReport> {
    const environment = await this.getEnvironmentInfo();
    const session = await this.getSessionInfo();

    return {
      id: this.generateReportId(),
      timestamp: Date.now(),
      error: {
        name: error.name,
        code: error.code,
        category: error.category,
        message: this.sanitizeMessage(error.message),
        userMessage: error.getUserMessage(),
        retryable: error.retryable,
        stack: this.config.includeStackTrace ? this.sanitizeStack(error.stack) : undefined,
        context: {
          ...error.context,
          ...additionalContext,
        },
      },
      environment,
      session,
    };
  }

  /**
   * Get browser and extension environment info
   */
  private async getEnvironmentInfo(): Promise<ErrorReport['environment']> {
    let extensionVersion = 'unknown';
    try {
      const manifest = chrome.runtime.getManifest();
      extensionVersion = manifest.version;
    } catch {
      // Ignore if can't get manifest
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const browserInfo = this.parseBrowserInfo(ua);

    return {
      extensionVersion,
      browser: browserInfo.browser,
      browserVersion: browserInfo.version,
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    };
  }

  /**
   * Parse browser info from user agent
   */
  private parseBrowserInfo(ua: string): { browser: string; version: string } {
    if (ua.includes('Chrome')) {
      const match = ua.match(/Chrome\/(\d+\.\d+)/);
      return { browser: 'Chrome', version: match?.[1] ?? 'unknown' };
    }
    if (ua.includes('Firefox')) {
      const match = ua.match(/Firefox\/(\d+\.\d+)/);
      return { browser: 'Firefox', version: match?.[1] ?? 'unknown' };
    }
    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/(\d+\.\d+)/);
      return { browser: 'Safari', version: match?.[1] ?? 'unknown' };
    }
    if (ua.includes('Edg')) {
      const match = ua.match(/Edg\/(\d+\.\d+)/);
      return { browser: 'Edge', version: match?.[1] ?? 'unknown' };
    }
    return { browser: 'unknown', version: 'unknown' };
  }

  /**
   * Get current session state (connected wallet, etc.)
   */
  private async getSessionInfo(): Promise<ErrorReport['session'] | undefined> {
    try {
      // Get from service worker state if available
      const result = await chrome.storage.local.get(['currentAddress', 'chainId']);
      return {
        isConnected: !!result.currentAddress,
        chainId: result.chainId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hasWallet: typeof window !== 'undefined' && !!(window as any).ethereum,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Schedule a batch send
   */
  private scheduleBatch(): void {
    // Already scheduled
    if (this.batchTimer) return;

    // Send immediately if batch is full
    if (this.errorQueue.length >= this.config.batchSize) {
      void this.sendBatch();
      return;
    }

    // Schedule delayed send
    this.batchTimer = setTimeout(() => {
      void this.sendBatch();
    }, this.config.batchDelayMs);
  }

  /**
   * Send queued errors to the reporting endpoint
   */
  private async sendBatch(): Promise<void> {
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Check if already processing or queue is empty
    if (this.isProcessing || this.errorQueue.length === 0) return;

    // No endpoint configured - just log locally
    if (!this.config.endpoint && !CONFIG.API_BASE_URL) {
      logger.debug('No error reporting endpoint configured, logging locally', {
        errorCount: this.errorQueue.length,
      });
      // Still clear the queue to prevent memory buildup
      this.errorQueue = [];
      return;
    }

    this.isProcessing = true;

    try {
      // Take errors from queue
      const batch = this.errorQueue.splice(0, this.config.batchSize);

      const endpoint = this.config.endpoint || `${CONFIG.API_BASE_URL}/api/errors/report`;

      // Check if online
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Put back in queue for later
        this.errorQueue.unshift(...batch);
        logger.debug('Offline, errors queued for later submission');
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errors: batch,
          batchId: this.generateBatchId(),
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        // Put back in queue for retry
        this.errorQueue.unshift(...batch);
        logger.warn('Error reporting failed', { status: response.status });
      } else {
        logger.debug('Error batch sent successfully', { count: batch.length });
      }
    } catch (error) {
      logger.error('Error sending error batch', { error });
    } finally {
      this.isProcessing = false;

      // Schedule next batch if more errors queued
      if (this.errorQueue.length > 0) {
        this.scheduleBatch();
      }
    }
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(): boolean {
    const now = Date.now();

    // Reset counter if window has passed
    if (now - this.lastResetTime > this.RATE_LIMIT_WINDOW_MS) {
      this.reportCount = 0;
      this.lastResetTime = now;
    }

    // Check limit
    if (this.reportCount >= this.MAX_ERRORS_PER_MINUTE) {
      return false;
    }

    this.reportCount++;
    return true;
  }

  /**
   * Sanitize error message (remove sensitive data)
   */
  private sanitizeMessage(message: string): string {
    // Remove potential wallet addresses (keep first/last 4 chars)
    let sanitized = message.replace(
      /0x[a-fA-F0-9]{40}/g,
      (match) => `${match.slice(0, 6)}...${match.slice(-4)}`
    );

    // Remove potential private keys (full redaction)
    sanitized = sanitized.replace(/0x[a-fA-F0-9]{64}/g, '[REDACTED_KEY]');

    // Remove potential JWT tokens
    sanitized = sanitized.replace(
      /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
      '[REDACTED_TOKEN]'
    );

    return sanitized;
  }

  /**
   * Sanitize stack trace
   */
  private sanitizeStack(stack?: string): string | undefined {
    if (!stack) return undefined;

    // Remove file paths that might contain user info
    let sanitized = stack.replace(/\/Users\/[^/]+/g, '/Users/[REDACTED]');
    sanitized = sanitized.replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[REDACTED]');
    sanitized = sanitized.replace(/\/home\/[^/]+/g, '/home/[REDACTED]');

    return sanitized;
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Generate batch ID
   */
  private generateBatchId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `batch_${timestamp}_${random}`;
  }

  /**
   * Flush all queued errors immediately
   */
  async flush(): Promise<void> {
    await this.sendBatch();
  }

  /**
   * Get current queue size (for testing/debugging)
   */
  getQueueSize(): number {
    return this.errorQueue.length;
  }

  /**
   * Clear the error queue (for testing)
   */
  clearQueue(): void {
    this.errorQueue = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const errorReporter = new ErrorReportingService();

// ============================================================================
// Global Error Handlers
// ============================================================================

/**
 * Set up global error handlers for uncaught errors
 */
export function setupGlobalErrorHandlers(): void {
  // Only in browser context
  if (typeof window === 'undefined') return;

  // Uncaught errors
  window.addEventListener('error', (event) => {
    errorReporter.report(event.error ?? new Error(event.message), {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    errorReporter.report(event.reason ?? new Error('Unhandled promise rejection'), {
      source: 'unhandledrejection',
    });
  });

  logger.info('Global error handlers installed');
}

/**
 * Higher-order function to wrap async functions with error reporting
 */
export function withErrorReporting<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: Record<string, unknown>
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      await errorReporter.report(error, context);
      throw error; // Re-throw to maintain original behavior
    }
  }) as T;
}

// ============================================================================
// Exports
// ============================================================================

export { ErrorReportingService };
export type { ErrorReportingConfig };
