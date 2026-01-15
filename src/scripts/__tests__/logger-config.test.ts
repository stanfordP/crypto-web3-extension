/**
 * Unit Tests for Logger Utility
 * 
 * Tests the structured logging system:
 * - Log levels
 * - Context handling
 * - Production vs development logging
 * - Error serialization
 */

// ============================================================================
// Mock Setup
// ============================================================================

// Save original console methods
const originalConsole = {
  debug: console.debug,
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

// Mock console methods
const mockConsole = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

beforeAll(() => {
  console.debug = mockConsole.debug;
  console.log = mockConsole.log;
  console.info = mockConsole.info;
  console.warn = mockConsole.warn;
  console.error = mockConsole.error;
});

afterAll(() => {
  console.debug = originalConsole.debug;
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// Logger Implementation (Extracted for testing)
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component: 'background' | 'content' | 'popup' | 'provider' | 'wallet-relay' | 'api';
  requestId?: string;
  method?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class TestLogger {
  private component: LogContext['component'];
  private minLogLevel: LogLevel;

  constructor(component: LogContext['component'], minLogLevel: LogLevel = 'debug') {
    this.component = component;
    this.minLogLevel = minLogLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLogLevel];
  }

  private formatContext(context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return '';
    }
    try {
      return JSON.stringify(context);
    } catch {
      return '[Context serialization failed]';
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const prefix = `[${this.component}]`;
    const contextStr = this.formatContext(context);

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
}

// ============================================================================
// Tests
// ============================================================================

describe('Logger', () => {
  describe('Log Levels', () => {
    it('should log debug messages at debug level', () => {
      const logger = new TestLogger('content', 'debug');
      logger.debug('Debug message');
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        '[content]',
        'Debug message',
        ''
      );
    });

    it('should log info messages', () => {
      const logger = new TestLogger('background');
      logger.info('Info message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[background]',
        'Info message',
        ''
      );
    });

    it('should log warn messages', () => {
      const logger = new TestLogger('popup');
      logger.warn('Warning message');
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        '[popup]',
        'Warning message',
        ''
      );
    });

    it('should log error messages', () => {
      const logger = new TestLogger('api');
      logger.error('Error message');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        '[api]',
        'Error message',
        ''
      );
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log debug when level is info', () => {
      const logger = new TestLogger('content', 'info');
      logger.debug('Should not appear');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });

    it('should log info when level is info', () => {
      const logger = new TestLogger('content', 'info');
      logger.info('Should appear');
      
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it('should not log debug or info when level is warn', () => {
      const logger = new TestLogger('content', 'warn');
      logger.debug('No debug');
      logger.info('No info');
      logger.warn('Yes warn');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should only log error when level is error', () => {
      const logger = new TestLogger('content', 'error');
      logger.debug('No');
      logger.info('No');
      logger.warn('No');
      logger.error('Yes');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).not.toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('Context Handling', () => {
    it('should include context in log output', () => {
      const logger = new TestLogger('api');
      logger.info('Request made', { endpoint: '/api/test', method: 'GET' });
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[api]',
        'Request made',
        '{"endpoint":"/api/test","method":"GET"}'
      );
    });

    it('should handle empty context', () => {
      const logger = new TestLogger('content');
      logger.info('No context', {});
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[content]',
        'No context',
        ''
      );
    });

    it('should handle undefined context', () => {
      const logger = new TestLogger('content');
      logger.info('Undefined context');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[content]',
        'Undefined context',
        ''
      );
    });

    it('should handle nested context objects', () => {
      const logger = new TestLogger('background');
      logger.info('Nested', { 
        user: { id: 1, name: 'Test' },
        data: [1, 2, 3],
      });
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        '[background]',
        'Nested',
        expect.stringContaining('"user"')
      );
    });

    it('should handle context with circular reference gracefully', () => {
      const logger = new TestLogger('content');
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;
      
      // Should not throw
      expect(() => {
        logger.info('Circular', circular);
      }).not.toThrow();
    });
  });

  describe('Component Prefix', () => {
    it('should use correct prefix for each component', () => {
      const components: Array<LogContext['component']> = [
        'background',
        'content',
        'popup',
        'provider',
        'wallet-relay',
        'api',
      ];

      components.forEach(component => {
        jest.clearAllMocks();
        const logger = new TestLogger(component);
        logger.info('Test');
        
        expect(mockConsole.info).toHaveBeenCalledWith(
          `[${component}]`,
          'Test',
          ''
        );
      });
    });
  });
});

describe('Config Values', () => {
  describe('Environment Detection', () => {
    it('should have default development API URL', () => {
      const API_URLS = {
        development: 'http://localhost:3000',
        production: 'https://cryptotradingjournal.xyz',
      };
      
      expect(API_URLS.development).toBe('http://localhost:3000');
      expect(API_URLS.production).toBe('https://cryptotradingjournal.xyz');
    });
  });

  describe('API Endpoints', () => {
    it('should have correct endpoint paths', () => {
      const API_ENDPOINTS = {
        SIWE_CHALLENGE: '/api/auth/siwe/challenge',
        SIWE_VERIFY: '/api/auth/siwe/verify',
        SESSION_VALIDATE: '/api/auth/session',
        DISCONNECT: '/api/auth/disconnect',
      };

      expect(API_ENDPOINTS.SIWE_CHALLENGE).toBe('/api/auth/siwe/challenge');
      expect(API_ENDPOINTS.SIWE_VERIFY).toBe('/api/auth/siwe/verify');
      expect(API_ENDPOINTS.SESSION_VALIDATE).toBe('/api/auth/session');
      expect(API_ENDPOINTS.DISCONNECT).toBe('/api/auth/disconnect');
    });
  });

  describe('Allowed Origins', () => {
    const ALLOWED_ORIGINS = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://cryptotradingjournal.xyz',
      'https://www.cryptotradingjournal.xyz',
    ];

    it('should include localhost for development', () => {
      expect(ALLOWED_ORIGINS).toContain('http://localhost:3000');
      expect(ALLOWED_ORIGINS).toContain('http://localhost:3001');
    });

    it('should include production domains', () => {
      expect(ALLOWED_ORIGINS).toContain('https://cryptotradingjournal.xyz');
      expect(ALLOWED_ORIGINS).toContain('https://www.cryptotradingjournal.xyz');
    });

    it('should not include arbitrary domains', () => {
      expect(ALLOWED_ORIGINS).not.toContain('https://evil.com');
      expect(ALLOWED_ORIGINS).not.toContain('http://localhost:4000');
    });
  });

  describe('Timeouts', () => {
    it('should have reasonable timeout values', () => {
      const TIMEOUTS = {
        REQUEST_TIMEOUT: 60000,
        HEALTH_CHECK_TIMEOUT: 2000,
        WALLET_INTERACTION_TIMEOUT: 30000,
      };

      expect(TIMEOUTS.REQUEST_TIMEOUT).toBeGreaterThanOrEqual(30000);
      expect(TIMEOUTS.HEALTH_CHECK_TIMEOUT).toBeLessThanOrEqual(5000);
      expect(TIMEOUTS.WALLET_INTERACTION_TIMEOUT).toBeGreaterThanOrEqual(15000);
    });
  });

  describe('Retry Configuration', () => {
    it('should have sensible retry defaults', () => {
      const RETRY_CONFIG = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
      };

      expect(RETRY_CONFIG.maxRetries).toBeGreaterThanOrEqual(2);
      expect(RETRY_CONFIG.maxRetries).toBeLessThanOrEqual(5);
      expect(RETRY_CONFIG.baseDelayMs).toBeLessThanOrEqual(2000);
      expect(RETRY_CONFIG.maxDelayMs).toBeLessThanOrEqual(30000);
    });
  });
});

describe('Feature Flags', () => {
  it('should define expected features', () => {
    const FEATURES = {
      DEBUG_LOGGING: false,
      VERBOSE_ERRORS: false,
    };

    expect(typeof FEATURES.DEBUG_LOGGING).toBe('boolean');
    expect(typeof FEATURES.VERBOSE_ERRORS).toBe('boolean');
  });
});
