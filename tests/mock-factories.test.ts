/**
 * Tests for Mock Factories
 * 
 * Tests the mock adapter factories to ensure they work correctly.
 */

import {
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockTabsAdapter,
  createMockDOMAdapter,
  createMockAlarmsAdapter,
  createMockAdapterContainer,
} from './utils/mock-factories';

describe('Mock Factories', () => {
  describe('createMockStorageAdapter', () => {
    it('should create adapter with empty storage', () => {
      const adapter = createMockStorageAdapter();
      expect(adapter._localStorage.size).toBe(0);
      expect(adapter._sessionStorage.size).toBe(0);
      expect(adapter._syncStorage.size).toBe(0);
    });

    it('should track calls', async () => {
      const adapter = createMockStorageAdapter();
      await adapter.localGet(['key']);
      await adapter.sessionSet({ key: 'value' });

      expect(adapter._calls).toHaveLength(2);
      expect(adapter._calls[0].method).toBe('localGet');
      expect(adapter._calls[1].method).toBe('sessionSet');
    });

    describe('localGet/localSet', () => {
      it('should store and retrieve values', async () => {
        const adapter = createMockStorageAdapter();
        await adapter.localSet({ key1: 'value1', key2: 'value2' });
        const result = await adapter.localGet(['key1', 'key2']);

        expect(result).toEqual({ key1: 'value1', key2: 'value2' });
      });

      it('should handle missing keys', async () => {
        const adapter = createMockStorageAdapter();
        const result = await adapter.localGet(['missing']);

        expect(result).toEqual({});
      });
    });

    describe('sessionGet/sessionSet', () => {
      it('should store and retrieve values', async () => {
        const adapter = createMockStorageAdapter();
        await adapter.sessionSet({ session: { token: 'abc' } });
        const result = await adapter.sessionGet(['session']);

        expect(result).toEqual({ session: { token: 'abc' } });
      });
    });

    describe('localRemove/sessionRemove', () => {
      it('should remove values', async () => {
        const adapter = createMockStorageAdapter();
        await adapter.localSet({ key: 'value' });
        await adapter.localRemove(['key']);
        const result = await adapter.localGet(['key']);

        expect(result).toEqual({});
      });
    });

    describe('onChanged', () => {
      it('should notify listeners on simulated change', () => {
        const adapter = createMockStorageAdapter();
        const callback = jest.fn();
        adapter.onChanged(callback);

        adapter._simulateChange({ key: { newValue: 'new' } }, 'local');

        expect(callback).toHaveBeenCalledWith(
          { key: { newValue: 'new' } },
          'local'
        );
      });

      it('should remove listener with offChanged', () => {
        const adapter = createMockStorageAdapter();
        const callback = jest.fn();
        adapter.onChanged(callback);

        adapter.offChanged(callback);
        adapter._simulateChange({ key: { newValue: 'new' } }, 'local');

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe('_reset', () => {
      it('should clear all storage and calls', async () => {
        const adapter = createMockStorageAdapter();
        await adapter.localSet({ key: 'value' });
        await adapter.sessionSet({ key: 'value' });

        adapter._reset();

        expect(adapter._localStorage.size).toBe(0);
        expect(adapter._sessionStorage.size).toBe(0);
        expect(adapter._calls).toHaveLength(0);
      });
    });
  });

  describe('createMockRuntimeAdapter', () => {
    it('should create adapter', () => {
      const adapter = createMockRuntimeAdapter();
      expect(adapter.id).toBe('mock-extension-id');
    });

    it('should track calls', async () => {
      const adapter = createMockRuntimeAdapter();
      await adapter.sendMessage({ type: 'TEST' });
      adapter.getURL('popup.html');

      expect(adapter._calls).toHaveLength(2);
      expect(adapter._calls[0].method).toBe('sendMessage');
      expect(adapter._calls[1].method).toBe('getURL');
    });

    it('should return correct URL', () => {
      const adapter = createMockRuntimeAdapter();
      const url = adapter.getURL('popup.html');

      expect(url).toBe('chrome-extension://mock-extension-id/popup.html');
    });

    it('should have lastError undefined initially', () => {
      const adapter = createMockRuntimeAdapter();
      expect(adapter.lastError).toBeUndefined();
    });

    describe('_simulateMessage', () => {
      it('should route messages to listeners', async () => {
        const adapter = createMockRuntimeAdapter();
        const handler = jest.fn().mockResolvedValue({ success: true });
        adapter.onMessage(handler);

        const result = await adapter._simulateMessage(
          { type: 'TEST' },
          { id: 'sender-id' } as chrome.runtime.MessageSender
        );

        expect(handler).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
      });
    });
  });

  describe('createMockTabsAdapter', () => {
    it('should create adapter with no tabs', () => {
      const adapter = createMockTabsAdapter();
      expect(adapter._tabs.size).toBe(0);
    });

    it('should query tabs', async () => {
      const adapter = createMockTabsAdapter();
      adapter._addTab({
        id: 1,
        windowId: 1,
        active: true,
        url: 'https://example.com',
        index: 0,
        pinned: false,
        highlighted: false,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      });

      const results = await adapter.query({ active: true });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(1);
    });

    it('should create new tabs', async () => {
      const adapter = createMockTabsAdapter();
      const tab = await adapter.create({ url: 'https://new.com' });

      expect(tab.url).toBe('https://new.com');
      expect(adapter._tabs.has(tab.id!)).toBe(true);
    });
  });

  describe('createMockDOMAdapter', () => {
    it('should create adapter', () => {
      const adapter = createMockDOMAdapter();
      expect(adapter.locationOrigin).toBe('https://test.example.com');
    });

    it('should get element by id', () => {
      const adapter = createMockDOMAdapter();
      const mockElement = { id: 'test', tagName: 'DIV' } as Element;
      adapter._setElement('test', mockElement);

      const result = adapter.getElementById('test');

      expect(result).toBe(mockElement);
    });

    it('should simulate events', () => {
      const adapter = createMockDOMAdapter();
      const callback = jest.fn();
      adapter.addWindowListener('click', callback);

      adapter._simulateEvent('window', 'click');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('createMockAlarmsAdapter', () => {
    it('should create and get alarms', async () => {
      const adapter = createMockAlarmsAdapter();

      await adapter.create('test-alarm', { delayInMinutes: 1 });
      const alarm = await adapter.get('test-alarm');

      expect(alarm).toBeDefined();
      expect(alarm?.name).toBe('test-alarm');
    });

    it('should clear alarms', async () => {
      const adapter = createMockAlarmsAdapter();

      await adapter.create('test-alarm', { delayInMinutes: 1 });
      const cleared = await adapter.clear('test-alarm');

      expect(cleared).toBe(true);
      expect(await adapter.get('test-alarm')).toBeUndefined();
    });

    it('should trigger alarm callbacks', async () => {
      const adapter = createMockAlarmsAdapter();
      const callback = jest.fn();
      adapter.onAlarm(callback);

      await adapter.create('test-alarm', { delayInMinutes: 1 });
      adapter._triggerAlarm('test-alarm');

      expect(callback).toHaveBeenCalled();
    });

    it('should remove alarm callback with offAlarm', async () => {
      const adapter = createMockAlarmsAdapter();
      const callback = jest.fn();
      adapter.onAlarm(callback);
      adapter.offAlarm(callback);

      await adapter.create('test-alarm', { delayInMinutes: 1 });
      adapter._triggerAlarm('test-alarm');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should clear all alarms', async () => {
      const adapter = createMockAlarmsAdapter();

      await adapter.create('alarm1', { delayInMinutes: 1 });
      await adapter.create('alarm2', { delayInMinutes: 2 });
      const result = await adapter.clearAll();

      expect(result).toBe(true);
      expect(await adapter.get('alarm1')).toBeUndefined();
      expect(await adapter.get('alarm2')).toBeUndefined();
    });
  });

  describe('createMockAdapterContainer', () => {
    it('should create container with all adapters', () => {
      const container = createMockAdapterContainer();

      expect(container.storage).toBeDefined();
      expect(container.runtime).toBeDefined();
      expect(container.tabs).toBeDefined();
      expect(container.dom).toBeDefined();
      expect(container.alarms).toBeDefined();
    });

    it('should reset all adapters', async () => {
      const container = createMockAdapterContainer();

      // Add some data
      await container.storage.localSet({ key: 'value' });
      await container.tabs.create({ url: 'https://test.com' });

      container._resetAll();

      expect(container.storage._localStorage.size).toBe(0);
      expect(container.tabs._tabs.size).toBe(0);
    });
  });
});
