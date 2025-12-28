/**
 * Structured Logging Utility for Crypto Journal Extension
 *
 * Provides consistent, context-aware logging across all extension components.
 * Respects feature flags to disable verbose logging in production.
 */

import { FEATURES, IS_PRODUCTION } from './config';
import type { ExtensionError } from './errors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  component: 'background' | 'content' | 'popup' | 'provider' | 'wallet-relay' | 'api';
  requestId?: string;
  method?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
}

// Environment-based log level
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only show warnings and errors unless DEBUG_LOGGING is explicitly enabled
function getMinLogLevel(): LogLevel {
  if (FEATURES.DEBUG_LOGGING) {
    return 'debug';
  }
  return IS_PRODUCTION ? 'warn' : 'debug';
}

class Logger {
  private component: LogContext['component'];

  constructor(component: LogContext['component']) {
    this.component = component;
  }

  private shouldLog(level: LogLevel): boolean {
    const minLevel = getMinLogLevel();
    return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      context,
    };
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.formatEntry(level, message, context);
    const prefix = `[${entry.component}]`;
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';

    switch (level) {
      case 'debug':
        console.debug(prefix, message, contextStr);
        break;
      case 'info':
        console.info(prefix, message, contextStr);
        break;
      case 'warn':
        console.warn(prefix, message, contextStr);
        break;
      case 'error':
        console.error(prefix, message, contextStr);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  /**
   * Log a wallet operation with consistent context
   */
  walletOperation(
    action: 'request' | 'response' | 'error',
    method: string,
    details?: Record<string, unknown>
  ): void {
    const level: LogLevel = action === 'error' ? 'error' : 'debug';
    this.log(level, `Wallet ${action}: ${method}`, details);
  }

  /**
   * Log a message passing event
   */
  message(
    direction: 'received' | 'sent',
    messageType: string,
    details?: Record<string, unknown>
  ): void {
    this.debug(`Message ${direction}: ${messageType}`, details);
  }
}

/**
 * Create a logger instance for a specific component
 */
export function createLogger(component: LogContext['component']): Logger {
  return new Logger(component);
}

// Pre-configured loggers for each component
export const backgroundLogger = createLogger('background');
export const contentLogger = createLogger('content');
export const popupLogger = createLogger('popup');
export const providerLogger = createLogger('provider');
export const walletRelayLogger = createLogger('wallet-relay');
export const apiLogger = createLogger('api');

/**
 * Log an ExtensionError with full context
 */
export function logExtensionError(logger: Logger, error: ExtensionError): void {
  logger.error(error.message, {
    code: error.code,
    category: error.category,
    context: error.context,
    retryable: error.retryable,
  });
}

/**
 * Performance timing helper
 */
export function createTimer(label: string): () => void {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (FEATURES.DEBUG_LOGGING) {
      console.debug(`[Timer] ${label}: ${duration.toFixed(2)}ms`);
    }
  };
}
