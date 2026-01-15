/**
 * ChromeAlarmsAdapter Tests
 *
 * Tests for the Chrome alarms API adapter.
 */

import { ChromeAlarmsAdapter } from '../adapters/ChromeAlarmsAdapter';

// Mock chrome.alarms API
const mockChrome = {
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    clearAll: jest.fn(),
    get: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// Assign mock to global
(global as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

describe('ChromeAlarmsAdapter', () => {
  let adapter: ChromeAlarmsAdapter;

  beforeEach(() => {
    adapter = new ChromeAlarmsAdapter();
    jest.clearAllMocks();
  });

  afterEach(() => {
    adapter.destroy();
  });

  // ==========================================================================
  // create tests
  // ==========================================================================

  describe('create', () => {
    it('should create alarm with delayInMinutes', () => {
      adapter.create('test-alarm', { delayInMinutes: 5 });

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('test-alarm', { delayInMinutes: 5 });
    });

    it('should create alarm with periodInMinutes', () => {
      adapter.create('recurring-alarm', { periodInMinutes: 10 });

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('recurring-alarm', { periodInMinutes: 10 });
    });

    it('should create alarm with both delay and period', () => {
      adapter.create('mixed-alarm', { delayInMinutes: 1, periodInMinutes: 5 });

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('mixed-alarm', {
        delayInMinutes: 1,
        periodInMinutes: 5,
      });
    });

    it('should create alarm with when option', () => {
      const when = Date.now() + 60000;
      adapter.create('scheduled-alarm', { when });

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('scheduled-alarm', { when });
    });
  });

  // ==========================================================================
  // clear tests
  // ==========================================================================

  describe('clear', () => {
    it('should clear alarm by name and return true on success', async () => {
      mockChrome.alarms.clear.mockResolvedValue(true);

      const result = await adapter.clear('test-alarm');

      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('test-alarm');
      expect(result).toBe(true);
    });

    it('should return false when alarm does not exist', async () => {
      mockChrome.alarms.clear.mockResolvedValue(false);

      const result = await adapter.clear('nonexistent-alarm');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // clearAll tests
  // ==========================================================================

  describe('clearAll', () => {
    it('should clear all alarms and return true on success', async () => {
      mockChrome.alarms.clearAll.mockResolvedValue(true);

      const result = await adapter.clearAll();

      expect(mockChrome.alarms.clearAll).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // get tests
  // ==========================================================================

  describe('get', () => {
    it('should get alarm by name', async () => {
      const mockAlarm = {
        name: 'test-alarm',
        scheduledTime: Date.now() + 60000,
        periodInMinutes: 5,
      };
      mockChrome.alarms.get.mockResolvedValue(mockAlarm);

      const result = await adapter.get('test-alarm');

      expect(mockChrome.alarms.get).toHaveBeenCalledWith('test-alarm');
      expect(result).toEqual({
        name: 'test-alarm',
        scheduledTime: mockAlarm.scheduledTime,
        periodInMinutes: 5,
      });
    });

    it('should return undefined when alarm does not exist', async () => {
      mockChrome.alarms.get.mockResolvedValue(undefined);

      const result = await adapter.get('nonexistent-alarm');

      expect(result).toBeUndefined();
    });

    it('should handle alarm without periodInMinutes', async () => {
      const mockAlarm = {
        name: 'one-time-alarm',
        scheduledTime: Date.now() + 60000,
      };
      mockChrome.alarms.get.mockResolvedValue(mockAlarm);

      const result = await adapter.get('one-time-alarm');

      expect(result).toEqual({
        name: 'one-time-alarm',
        scheduledTime: mockAlarm.scheduledTime,
        periodInMinutes: undefined,
      });
    });
  });

  // ==========================================================================
  // onAlarm tests
  // ==========================================================================

  describe('onAlarm', () => {
    it('should add alarm listener and map alarm data', () => {
      const callback = jest.fn();

      adapter.onAlarm(callback);

      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalledWith(expect.any(Function));

      // Get the chrome listener that was registered
      const chromeListener = mockChrome.alarms.onAlarm.addListener.mock.calls[0][0];

      // Simulate alarm firing
      const mockAlarm = {
        name: 'test-alarm',
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeListener(mockAlarm);

      // Verify our callback was called with mapped data
      expect(callback).toHaveBeenCalledWith({
        name: 'test-alarm',
        scheduledTime: mockAlarm.scheduledTime,
        periodInMinutes: 5,
      });
    });

    it('should register multiple listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      adapter.onAlarm(callback1);
      adapter.onAlarm(callback2);

      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // offAlarm tests
  // ==========================================================================

  describe('offAlarm', () => {
    it('should remove alarm listener', () => {
      const callback = jest.fn();

      // First add the listener
      adapter.onAlarm(callback);
      const chromeListener = mockChrome.alarms.onAlarm.addListener.mock.calls[0][0];

      // Then remove it
      adapter.offAlarm(callback);

      expect(mockChrome.alarms.onAlarm.removeListener).toHaveBeenCalledWith(chromeListener);
    });

    it('should do nothing when removing unregistered listener', () => {
      const callback = jest.fn();

      adapter.offAlarm(callback);

      expect(mockChrome.alarms.onAlarm.removeListener).not.toHaveBeenCalled();
    });

    it('should only remove the specified listener', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      adapter.onAlarm(callback1);
      adapter.onAlarm(callback2);

      const chromeListener1 = mockChrome.alarms.onAlarm.addListener.mock.calls[0][0];

      adapter.offAlarm(callback1);

      expect(mockChrome.alarms.onAlarm.removeListener).toHaveBeenCalledTimes(1);
      expect(mockChrome.alarms.onAlarm.removeListener).toHaveBeenCalledWith(chromeListener1);
    });
  });

  // ==========================================================================
  // destroy tests
  // ==========================================================================

  describe('destroy', () => {
    it('should remove all registered listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      adapter.onAlarm(callback1);
      adapter.onAlarm(callback2);

      adapter.destroy();

      expect(mockChrome.alarms.onAlarm.removeListener).toHaveBeenCalledTimes(2);
    });

    it('should handle destroy with no listeners', () => {
      // Should not throw
      expect(() => adapter.destroy()).not.toThrow();
    });

    it('should be safe to call destroy multiple times', () => {
      const callback = jest.fn();
      adapter.onAlarm(callback);

      adapter.destroy();
      adapter.destroy(); // Second call should not throw

      expect(mockChrome.alarms.onAlarm.removeListener).toHaveBeenCalledTimes(1);
    });
  });
});
