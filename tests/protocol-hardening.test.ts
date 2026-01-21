/**
 * Protocol Hardening Tests
 *
 * Tests for the protocol v2.1 improvements:
 * - Protocol version validation
 * - Timestamp validation for replay protection
 * - Message logging infrastructure
 */

import {
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  MESSAGE_MAX_AGE_MS,
  generateRequestId,
  createMessage,
  isVersionSupported,
  isTimestampValid,
  BaseMessage,
} from '../src/scripts/core/messaging/MessageTypes';

import {
  MessageRouter,
  MessageLogEntry,
  InMemoryMessageLogger,
} from '../src/scripts/core/messaging/MessageRouter';

import { ErrorCode, PageMessageType } from '../src/scripts/types';

describe('Protocol Version Constants', () => {
  it('should export PROTOCOL_VERSION', () => {
    expect(PROTOCOL_VERSION).toBeDefined();
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should export MIN_PROTOCOL_VERSION', () => {
    expect(MIN_PROTOCOL_VERSION).toBeDefined();
    expect(MIN_PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should have PROTOCOL_VERSION >= MIN_PROTOCOL_VERSION', () => {
    expect(isVersionSupported(PROTOCOL_VERSION)).toBe(true);
  });

  it('should export MESSAGE_MAX_AGE_MS', () => {
    expect(MESSAGE_MAX_AGE_MS).toBeDefined();
    expect(MESSAGE_MAX_AGE_MS).toBe(30_000);
  });
});

describe('generateRequestId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  it('should include timestamp component', () => {
    const id = generateRequestId();
    const parts = id.split('-');
    expect(parts.length).toBe(2);
    expect(Number(parts[0])).toBeGreaterThan(0);
  });
});

describe('createMessage', () => {
  it('should add version and timestamp to message', () => {
    const msg = createMessage<BaseMessage>({
      type: 'CJ_TEST',
    });

    expect(msg.type).toBe('CJ_TEST');
    expect(msg.version).toBe(PROTOCOL_VERSION);
    expect(msg.timestamp).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.requestId).toBeDefined();
  });

  it('should preserve existing requestId', () => {
    const msg = createMessage<BaseMessage>({
      type: 'CJ_TEST',
      requestId: 'my-custom-id',
    });

    expect(msg.requestId).toBe('my-custom-id');
  });

  it('should generate requestId if not provided', () => {
    const msg = createMessage<BaseMessage>({
      type: 'CJ_TEST',
    });

    expect(msg.requestId).toBeDefined();
    expect(msg.requestId).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe('isVersionSupported', () => {
  it('should return true for current version', () => {
    expect(isVersionSupported(PROTOCOL_VERSION)).toBe(true);
  });

  it('should return true for minimum version', () => {
    expect(isVersionSupported(MIN_PROTOCOL_VERSION)).toBe(true);
  });

  it('should return true for undefined (legacy messages)', () => {
    expect(isVersionSupported(undefined)).toBe(true);
  });

  it('should return false for version below minimum', () => {
    expect(isVersionSupported('1.0.0')).toBe(false);
    expect(isVersionSupported('1.9.9')).toBe(false);
  });

  it('should return true for version above minimum', () => {
    expect(isVersionSupported('2.1.0')).toBe(true);
    expect(isVersionSupported('3.0.0')).toBe(true);
  });

  it('should handle minor version correctly', () => {
    // MIN is 2.0.0
    expect(isVersionSupported('2.0.0')).toBe(true);
    expect(isVersionSupported('2.0.1')).toBe(true);
    expect(isVersionSupported('2.1.0')).toBe(true);
  });
});

describe('isTimestampValid', () => {
  it('should return true for undefined (legacy messages)', () => {
    expect(isTimestampValid(undefined)).toBe(true);
  });

  it('should return true for recent timestamp', () => {
    const now = Date.now();
    expect(isTimestampValid(now)).toBe(true);
    expect(isTimestampValid(now - 1000)).toBe(true); // 1 second ago
    expect(isTimestampValid(now - 29000)).toBe(true); // 29 seconds ago
  });

  it('should return false for expired timestamp', () => {
    const now = Date.now();
    expect(isTimestampValid(now - 31000)).toBe(false); // 31 seconds ago
    expect(isTimestampValid(now - 60000)).toBe(false); // 1 minute ago
  });

  it('should return false for future timestamp', () => {
    const now = Date.now();
    expect(isTimestampValid(now + 1000)).toBe(false); // 1 second in future
  });

  it('should respect custom maxAgeMs', () => {
    const now = Date.now();
    expect(isTimestampValid(now - 5000, 10000)).toBe(true); // 5s ago, max 10s
    expect(isTimestampValid(now - 15000, 10000)).toBe(false); // 15s ago, max 10s
  });
});

describe('InMemoryMessageLogger', () => {
  let logger: InMemoryMessageLogger;

  beforeEach(() => {
    logger = new InMemoryMessageLogger(10);
  });

  it('should log messages', () => {
    const entry: MessageLogEntry = {
      timestamp: Date.now(),
      type: 'CJ_TEST',
      origin: 'http://localhost',
      direction: 'inbound',
      success: true,
    };

    logger.log(entry);
    const logs = logger.getRecentLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual(entry);
  });

  it('should respect max logs limit', () => {
    for (let i = 0; i < 15; i++) {
      logger.log({
        timestamp: Date.now(),
        type: `CJ_TEST_${i}`,
        origin: 'http://localhost',
        direction: 'inbound',
        success: true,
      });
    }

    const logs = logger.getRecentLogs(20);
    expect(logs).toHaveLength(10); // Max is 10
  });

  it('should return most recent logs when limit exceeded', () => {
    for (let i = 0; i < 15; i++) {
      logger.log({
        timestamp: Date.now(),
        type: `CJ_TEST_${i}`,
        origin: 'http://localhost',
        direction: 'inbound',
        success: true,
      });
    }

    const logs = logger.getRecentLogs(5);
    expect(logs).toHaveLength(5);
    expect(logs[0].type).toBe('CJ_TEST_10');
    expect(logs[4].type).toBe('CJ_TEST_14');
  });

  it('should clear logs', () => {
    logger.log({
      timestamp: Date.now(),
      type: 'CJ_TEST',
      origin: 'http://localhost',
      direction: 'inbound',
      success: true,
    });

    logger.clear();
    expect(logger.getRecentLogs()).toHaveLength(0);
  });
});

describe('MessageRouter with Protocol Hardening', () => {
  let router: MessageRouter;
  let logger: InMemoryMessageLogger;
  let postedMessages: unknown[];

  beforeEach(() => {
    logger = new InMemoryMessageLogger();
    postedMessages = [];

    router = new MessageRouter({
      targetOrigin: '*',
      isAllowedOrigin: (origin) => origin === 'http://localhost',
      validateVersion: true,
      validateTimestamp: true,
      logger,
    });

    // Override postMessage to capture
    router.postMessage = (msg) => {
      postedMessages.push(msg);
    };

    // Register a test handler
    router.register('CJ_TEST', async () => {
      // Success
    });
  });

  describe('Version Validation', () => {
    it('should accept message with valid version', async () => {
      const result = await router.route(
        {
          type: 'CJ_TEST',
          version: PROTOCOL_VERSION,
          timestamp: Date.now(),
        },
        'http://localhost'
      );

      expect(result).toBe(true);
      expect(postedMessages).toHaveLength(0);
    });

    it('should accept legacy message without version', async () => {
      const result = await router.route(
        {
          type: 'CJ_TEST',
          timestamp: Date.now(),
        },
        'http://localhost'
      );

      expect(result).toBe(true);
    });

    it('should reject message with unsupported version', async () => {
      const result = await router.route(
        {
          type: 'CJ_TEST',
          version: '1.0.0',
          timestamp: Date.now(),
        },
        'http://localhost'
      );

      expect(result).toBe(true); // Handled with error
      expect(postedMessages).toHaveLength(1);
      expect((postedMessages[0] as { code: ErrorCode }).code).toBe(ErrorCode.INVALID_REQUEST);
    });
  });

  describe('Timestamp Validation', () => {
    it('should accept message with valid timestamp', async () => {
      const result = await router.route(
        {
          type: 'CJ_TEST',
          timestamp: Date.now(),
        },
        'http://localhost'
      );

      expect(result).toBe(true);
      expect(postedMessages).toHaveLength(0);
    });

    it('should accept legacy message without timestamp', async () => {
      const result = await router.route(
        {
          type: 'CJ_TEST',
        },
        'http://localhost'
      );

      expect(result).toBe(true);
    });

    it('should reject message with expired timestamp', async () => {
      const result = await router.route(
        {
          type: 'CJ_TEST',
          timestamp: Date.now() - 60000, // 1 minute ago
        },
        'http://localhost'
      );

      expect(result).toBe(true); // Handled with error
      expect(postedMessages).toHaveLength(1);
      expect((postedMessages[0] as { code: ErrorCode }).code).toBe(ErrorCode.REQUEST_TIMEOUT);
    });
  });

  describe('Message Logging', () => {
    it('should log successful messages', async () => {
      await router.route(
        {
          type: 'CJ_TEST',
          requestId: 'test-123',
          timestamp: Date.now(),
        },
        'http://localhost'
      );

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe('CJ_TEST');
      expect(logs[0].requestId).toBe('test-123');
      expect(logs[0].success).toBe(true);
      expect(logs[0].direction).toBe('inbound');
      expect(logs[0].processingTimeMs).toBeDefined();
    });

    it('should log failed messages', async () => {
      await router.route(
        {
          type: 'CJ_TEST',
          version: '1.0.0',
        },
        'http://localhost'
      );

      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].errorCode).toBe(ErrorCode.INVALID_REQUEST);
    });

    it('should include version in log', async () => {
      await router.route(
        {
          type: 'CJ_TEST',
          version: PROTOCOL_VERSION,
          timestamp: Date.now(),
        },
        'http://localhost'
      );

      const logs = logger.getRecentLogs();
      expect(logs[0].version).toBe(PROTOCOL_VERSION);
    });
  });

  describe('getLogger', () => {
    it('should return the configured logger', () => {
      expect(router.getLogger()).toBe(logger);
    });

    it('should return undefined if no logger configured', () => {
      const routerNoLogger = new MessageRouter({
        targetOrigin: '*',
        isAllowedOrigin: () => true,
      });
      expect(routerNoLogger.getLogger()).toBeUndefined();
    });
  });

  describe('getProtocolVersion', () => {
    it('should return current protocol version', () => {
      expect(MessageRouter.getProtocolVersion()).toBe(PROTOCOL_VERSION);
    });
  });
});

describe('MessageRouter without validation (backward compatible)', () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter({
      targetOrigin: '*',
      isAllowedOrigin: () => true,
      validateVersion: false,
      validateTimestamp: false,
    });

    router.register('CJ_TEST', async () => {});
  });

  it('should accept any version when validation disabled', async () => {
    const result = await router.route(
      {
        type: 'CJ_TEST',
        version: '1.0.0',
      },
      'http://localhost'
    );

    expect(result).toBe(true);
  });

  it('should accept any timestamp when validation disabled', async () => {
    const result = await router.route(
      {
        type: 'CJ_TEST',
        timestamp: Date.now() - 120000, // 2 minutes ago
      },
      'http://localhost'
    );

    expect(result).toBe(true);
  });
});
