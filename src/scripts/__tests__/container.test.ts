/**
 * Container Tests
 * 
 * Tests for the dependency injection container
 */

import {
  initializeContainer,
  getContainer,
  isContainerInitialized,
  resetContainer,
  createMockContainer,
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockTabsAdapter,
  createMockDOMAdapter,
  createMockAlarmsAdapter,
  initializeMockContainer,
  getPopupContainer,
  getContentContainer,
  getBackgroundContainer,
} from '../core/Container';

describe('Container', () => {
  beforeEach(() => {
    resetContainer();
  });

  describe('initializeContainer', () => {
    it('should initialize container with provided adapters', () => {
      const mockContainer = createMockContainer();
      
      initializeContainer(mockContainer);
      
      expect(isContainerInitialized()).toBe(true);
    });

    it('should warn when reinitializing container', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mockContainer = createMockContainer();
      
      initializeContainer(mockContainer);
      initializeContainer(mockContainer);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Container] Container already initialized, replacing...'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getContainer', () => {
    it('should return initialized container', () => {
      const mockContainer = createMockContainer();
      initializeContainer(mockContainer);
      
      const container = getContainer();
      
      expect(container).toBe(mockContainer);
    });

    it('should throw if container not initialized', () => {
      expect(() => getContainer()).toThrow(
        '[Container] Container not initialized. Call initializeContainer() first.'
      );
    });
  });

  describe('isContainerInitialized', () => {
    it('should return false when not initialized', () => {
      expect(isContainerInitialized()).toBe(false);
    });

    it('should return true when initialized', () => {
      initializeContainer(createMockContainer());
      expect(isContainerInitialized()).toBe(true);
    });
  });

  describe('resetContainer', () => {
    it('should reset container to uninitialized state', () => {
      initializeContainer(createMockContainer());
      expect(isContainerInitialized()).toBe(true);
      
      resetContainer();
      
      expect(isContainerInitialized()).toBe(false);
    });
  });

  describe('initializeMockContainer', () => {
    it('should create and initialize mock container', () => {
      const container = initializeMockContainer();
      
      expect(isContainerInitialized()).toBe(true);
      expect(container).toBe(getContainer());
    });
  });
});

describe('Mock Adapters', () => {
  describe('createMockStorageAdapter', () => {
    it('should store and retrieve from local storage', async () => {
      const storage = createMockStorageAdapter();
      
      await storage.localSet({ key1: 'value1', key2: 42 });
      const result = await storage.localGet<{ key1: string; key2: number }>(['key1', 'key2']);
      
      expect(result.key1).toBe('value1');
      expect(result.key2).toBe(42);
    });

    it('should store and retrieve from session storage', async () => {
      const storage = createMockStorageAdapter();
      
      await storage.sessionSet({ sessionKey: 'sessionValue' });
      const result = await storage.sessionGet<{ sessionKey: string }>(['sessionKey']);
      
      expect(result.sessionKey).toBe('sessionValue');
    });

    it('should remove from local storage', async () => {
      const storage = createMockStorageAdapter();
      
      await storage.localSet({ key1: 'value1' });
      await storage.localRemove('key1');
      const result = await storage.localGet<{ key1?: string }>(['key1']);
      
      expect(result.key1).toBeUndefined();
    });

    it('should remove from session storage', async () => {
      const storage = createMockStorageAdapter();
      
      await storage.sessionSet({ key1: 'value1' });
      await storage.sessionRemove('key1');
      const result = await storage.sessionGet<{ key1?: string }>(['key1']);
      
      expect(result.key1).toBeUndefined();
    });

    it('should clear local storage', async () => {
      const storage = createMockStorageAdapter();
      
      await storage.localSet({ key1: 'value1', key2: 'value2' });
      await storage.localClear();
      const result = await storage.localGet<{ key1?: string; key2?: string }>(['key1', 'key2']);
      
      expect(result.key1).toBeUndefined();
      expect(result.key2).toBeUndefined();
    });

    it('should notify listeners on local storage changes', async () => {
      const storage = createMockStorageAdapter();
      const listener = jest.fn();
      
      storage.onChanged(listener);
      await storage.localSet({ key1: 'value1' });
      
      expect(listener).toHaveBeenCalledWith(
        { key1: { oldValue: undefined, newValue: 'value1' } },
        'local'
      );
    });

    it('should notify listeners on session storage changes', async () => {
      const storage = createMockStorageAdapter();
      const listener = jest.fn();
      
      storage.onChanged(listener);
      await storage.sessionSet({ key1: 'value1' });
      
      expect(listener).toHaveBeenCalledWith(
        { key1: { oldValue: undefined, newValue: 'value1' } },
        'session'
      );
    });

    it('should remove change listener', async () => {
      const storage = createMockStorageAdapter();
      const listener = jest.fn();
      
      storage.onChanged(listener);
      storage.offChanged(listener);
      await storage.localSet({ key1: 'value1' });
      
      expect(listener).not.toHaveBeenCalled();
    });

    it('should get from sync storage', async () => {
      const storage = createMockStorageAdapter();
      // Sync storage is read-only in mock, so just verify it doesn't throw
      const result = await storage.syncGet<{ key1?: string }>(['key1']);
      expect(result.key1).toBeUndefined();
    });
  });

  describe('createMockRuntimeAdapter', () => {
    it('should return mock extension id', () => {
      const runtime = createMockRuntimeAdapter();
      expect(runtime.id).toBe('mock-extension-id');
    });

    it('should return null for lastError', () => {
      const runtime = createMockRuntimeAdapter();
      expect(runtime.lastError).toBeNull();
    });

    it('should generate extension URLs', () => {
      const runtime = createMockRuntimeAdapter();
      const url = runtime.getURL('popup.html');
      expect(url).toBe('chrome-extension://mock-extension-id/popup.html');
    });

    it('should send messages without error', async () => {
      const runtime = createMockRuntimeAdapter();
      const result = await runtime.sendMessage({ type: 'TEST' });
      expect(result).toBeUndefined();
    });

    it('should register and unregister message listeners', () => {
      const runtime = createMockRuntimeAdapter();
      const listener = jest.fn();
      
      runtime.onMessage(listener);
      runtime.offMessage(listener);
      // No assertion needed - just verify no errors
    });
  });

  describe('createMockTabsAdapter', () => {
    it('should create new tabs', async () => {
      const tabs = createMockTabsAdapter();
      
      const tab = await tabs.create({ url: 'http://example.com', active: true });
      
      expect(tab.id).toBeDefined();
      expect(tab.url).toBe('http://example.com');
      expect(tab.active).toBe(true);
    });

    it('should query tabs', async () => {
      const tabs = createMockTabsAdapter();
      
      await tabs.create({ url: 'http://localhost:3000', active: true });
      await tabs.create({ url: 'http://example.com', active: false });
      
      const activeTabs = await tabs.query({ active: true });
      expect(activeTabs.length).toBe(1);
      expect(activeTabs[0].url).toBe('http://localhost:3000');
    });

    it('should remove tabs', async () => {
      const tabs = createMockTabsAdapter();
      
      const tab = await tabs.create({ url: 'http://example.com' });
      await tabs.remove(tab.id!);
      
      const allTabs = await tabs.query({});
      expect(allTabs.length).toBe(0);
    });

    it('should send messages to tabs', async () => {
      const tabs = createMockTabsAdapter();
      const result = await tabs.sendMessage(1, { type: 'TEST' });
      expect(result).toBeUndefined();
    });
  });

  describe('createMockDOMAdapter', () => {
    it('should return null for getElementById on unknown element', () => {
      const dom = createMockDOMAdapter();
      const element = dom.getElementById('unknown');
      expect(element).toBeNull();
    });

    it('should return location properties', () => {
      const dom = createMockDOMAdapter();
      expect(dom.locationOrigin).toBe('http://localhost:3000');
      expect(dom.locationHref).toBe('http://localhost:3000/');
    });

    it('should return online status', () => {
      const dom = createMockDOMAdapter();
      expect(dom.isOnline).toBe(true);
    });

    it('should add and remove window listeners', () => {
      const dom = createMockDOMAdapter();
      const listener = jest.fn();
      
      dom.addWindowListener('message', listener);
      dom.removeWindowListener('message', listener);
      // No assertion needed - just verify no errors
    });

    it('should handle postMessage without error', () => {
      const dom = createMockDOMAdapter();
      expect(() => dom.postMessage({ type: 'TEST' }, '*')).not.toThrow();
    });

    it('should handle closeWindow without error', () => {
      const dom = createMockDOMAdapter();
      expect(() => dom.closeWindow()).not.toThrow();
    });
  });

  describe('createMockAlarmsAdapter', () => {
    it('should create alarms', async () => {
      const alarms = createMockAlarmsAdapter();
      
      alarms.create('test-alarm', { delayInMinutes: 1 });
      const alarm = await alarms.get('test-alarm');
      
      expect(alarm).toBeDefined();
      expect(alarm?.name).toBe('test-alarm');
    });

    it('should clear alarms', async () => {
      const alarms = createMockAlarmsAdapter();
      
      alarms.create('test-alarm', { delayInMinutes: 1 });
      const cleared = await alarms.clear('test-alarm');
      const alarm = await alarms.get('test-alarm');
      
      expect(cleared).toBe(true);
      expect(alarm).toBeUndefined();
    });

    it('should clear all alarms', async () => {
      const alarms = createMockAlarmsAdapter();
      
      alarms.create('alarm1', { delayInMinutes: 1 });
      alarms.create('alarm2', { delayInMinutes: 2 });
      await alarms.clearAll();
      
      const alarm1 = await alarms.get('alarm1');
      const alarm2 = await alarms.get('alarm2');
      
      expect(alarm1).toBeUndefined();
      expect(alarm2).toBeUndefined();
    });

    it('should add and remove alarm listeners', () => {
      const alarms = createMockAlarmsAdapter();
      const listener = jest.fn();
      
      alarms.onAlarm(listener);
      alarms.offAlarm(listener);
      // No assertion needed - just verify no errors
    });
  });
});

describe('Scoped Containers', () => {
  beforeEach(() => {
    resetContainer();
    initializeMockContainer();
  });

  describe('getPopupContainer', () => {
    it('should return popup-specific adapters', () => {
      const container = getPopupContainer();
      
      expect(container.storage).toBeDefined();
      expect(container.runtime).toBeDefined();
      expect(container.tabs).toBeDefined();
      expect(container.dom).toBeDefined();
    });
  });

  describe('getContentContainer', () => {
    it('should return content-specific adapters', () => {
      const container = getContentContainer();
      
      expect(container.storage).toBeDefined();
      expect(container.runtime).toBeDefined();
      expect(container.dom).toBeDefined();
    });
  });

  describe('getBackgroundContainer', () => {
    it('should return background-specific adapters', () => {
      const container = getBackgroundContainer();
      
      expect(container.storage).toBeDefined();
      expect(container.runtime).toBeDefined();
      expect(container.tabs).toBeDefined();
      expect(container.alarms).toBeDefined();
    });
  });
});
