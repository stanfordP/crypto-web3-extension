/**
 * Mock Factories for V2.2 Architecture
 * 
 * Provides mock implementations of all adapter interfaces for testing.
 * These mocks are configurable and track all calls for assertion.
 * 
 * @module tests/utils/mock-factories
 */

import type {
  IStorageAdapter,
  IRuntimeAdapter,
  ITabsAdapter,
  IDOMAdapter,
  IAlarmsAdapter,
  IAdapterContainer,
  StorageChangeCallback,
  StorageAreaName,
  AlarmCallback,
  MessageListener,
  RuntimeMessageSender,
} from '../../src/scripts/adapters/types';

/**
 * Call tracking for mock verification
 */
export interface MockCallRecord {
  method: string;
  args: unknown[];
  timestamp: number;
}

/**
 * Mock storage implementation
 */
export interface MockStorageAdapter extends IStorageAdapter {
  _calls: MockCallRecord[];
  _localStorage: Map<string, unknown>;
  _sessionStorage: Map<string, unknown>;
  _syncStorage: Map<string, unknown>;
  _changeListeners: StorageChangeCallback[];
  _reset(): void;
  _simulateChange(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string): void;
}

/**
 * Create a mock storage adapter
 */
export function createMockStorageAdapter(): MockStorageAdapter {
  const _calls: MockCallRecord[] = [];
  const _localStorage = new Map<string, unknown>();
  const _sessionStorage = new Map<string, unknown>();
  const _syncStorage = new Map<string, unknown>();
  const _changeListeners: StorageChangeCallback[] = [];

  const recordCall = (method: string, args: unknown[]) => {
    _calls.push({ method, args, timestamp: Date.now() });
  };

  const adapter: MockStorageAdapter = {
    _calls,
    _localStorage,
    _sessionStorage,
    _syncStorage,
    _changeListeners,

    _reset() {
      _calls.length = 0;
      _localStorage.clear();
      _sessionStorage.clear();
      _syncStorage.clear();
      _changeListeners.length = 0;
    },

    _simulateChange(changes, areaName) {
      _changeListeners.forEach((cb) => cb(changes, areaName as StorageAreaName));
    },

    async localGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
      recordCall('localGet', [keys]);
      const result: Record<string, unknown> = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => {
        if (_localStorage.has(key)) {
          result[key] = _localStorage.get(key);
        }
      });
      return result as T;
    },

    async localSet(items) {
      recordCall('localSet', [items]);
      Object.entries(items).forEach(([key, value]) => {
        _localStorage.set(key, value);
      });
    },

    async localRemove(keys) {
      recordCall('localRemove', [keys]);
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => _localStorage.delete(key));
    },

    async sessionGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
      recordCall('sessionGet', [keys]);
      const result: Record<string, unknown> = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => {
        if (_sessionStorage.has(key)) {
          result[key] = _sessionStorage.get(key);
        }
      });
      return result as T;
    },

    async sessionSet(items) {
      recordCall('sessionSet', [items]);
      Object.entries(items).forEach(([key, value]) => {
        _sessionStorage.set(key, value);
      });
    },

    async sessionRemove(keys) {
      recordCall('sessionRemove', [keys]);
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => _sessionStorage.delete(key));
    },

    async syncGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
      recordCall('syncGet', [keys]);
      const result: Record<string, unknown> = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => {
        if (_syncStorage.has(key)) {
          result[key] = _syncStorage.get(key);
        }
      });
      return result as T;
    },

    async localClear(): Promise<void> {
      recordCall('localClear', []);
      _localStorage.clear();
    },

    async sessionClear(): Promise<void> {
      recordCall('sessionClear', []);
      _sessionStorage.clear();
    },

    onChanged(callback: StorageChangeCallback): void {
      recordCall('onChanged', [callback]);
      _changeListeners.push(callback);
    },

    offChanged(callback: StorageChangeCallback): void {
      recordCall('offChanged', [callback]);
      const index = _changeListeners.indexOf(callback);
      if (index > -1) _changeListeners.splice(index, 1);
    },
  };

  return adapter;
}

/**
 * Mock runtime implementation
 */
export interface MockRuntimeAdapter extends IRuntimeAdapter {
  _calls: MockCallRecord[];
  _messageListeners: MessageListener[];
  _pendingMessages: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
  _reset(): void;
  _simulateMessage(message: unknown, sender: RuntimeMessageSender): Promise<unknown>;
}

/**
 * Create a mock runtime adapter
 */
export function createMockRuntimeAdapter(): MockRuntimeAdapter {
  const _calls: MockCallRecord[] = [];
  const _messageListeners: MessageListener[] = [];
  const _pendingMessages = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  const recordCall = (method: string, args: unknown[]) => {
    _calls.push({ method, args, timestamp: Date.now() });
  };

  const adapter: MockRuntimeAdapter = {
    _calls,
    _messageListeners,
    _pendingMessages,

    _reset() {
      _calls.length = 0;
      _messageListeners.length = 0;
      _pendingMessages.clear();
    },

    async _simulateMessage(message, sender) {
      for (const listener of _messageListeners) {
        const result = listener(message, sender, () => {});
        if (result !== undefined) {
          if (result instanceof Promise) {
            return await result;
          }
          return result;
        }
      }
      return undefined;
    },

    async sendMessage<T = unknown, R = unknown>(message: T): Promise<R> {
      recordCall('sendMessage', [message]);
      // In tests, return immediately with undefined or mock response
      return undefined as R;
    },

    onMessage<T = unknown, R = unknown>(listener: MessageListener<T, R>): void {
      recordCall('onMessage', [listener]);
      _messageListeners.push(listener as MessageListener);
    },

    offMessage<T = unknown, R = unknown>(listener: MessageListener<T, R>): void {
      recordCall('offMessage', [listener]);
      const index = _messageListeners.indexOf(listener as MessageListener);
      if (index > -1) _messageListeners.splice(index, 1);
    },

    getURL(path: string): string {
      recordCall('getURL', [path]);
      return `chrome-extension://mock-extension-id/${path}`;
    },

    get id(): string {
      return 'mock-extension-id';
    },

    get lastError(): { message: string } | null | undefined {
      return undefined;
    },
  };

  return adapter;
}

/**
 * Mock tabs implementation
 */
export interface MockTabsAdapter extends ITabsAdapter {
  _calls: MockCallRecord[];
  _tabs: Map<number, chrome.tabs.Tab>;
  _reset(): void;
  _addTab(tab: chrome.tabs.Tab): void;
}

/**
 * Create a mock tabs adapter
 */
export function createMockTabsAdapter(): MockTabsAdapter {
  const _calls: MockCallRecord[] = [];
  const _tabs = new Map<number, chrome.tabs.Tab>();

  const recordCall = (method: string, args: unknown[]) => {
    _calls.push({ method, args, timestamp: Date.now() });
  };

  const adapter: MockTabsAdapter = {
    _calls,
    _tabs,

    _reset() {
      _calls.length = 0;
      _tabs.clear();
    },

    _addTab(tab) {
      _tabs.set(tab.id!, tab);
    },

    async query(queryInfo) {
      recordCall('query', [queryInfo]);
      const results: chrome.tabs.Tab[] = [];
      _tabs.forEach((tab) => {
        let matches = true;
        if (queryInfo.active !== undefined && tab.active !== queryInfo.active) matches = false;
        if (queryInfo.currentWindow !== undefined && tab.windowId !== 1) matches = false;
        if (queryInfo.url && !tab.url?.includes(queryInfo.url as string)) matches = false;
        if (matches) results.push(tab);
      });
      return results;
    },

    async sendMessage(tabId, message) {
      recordCall('sendMessage', [tabId, message]);
      return undefined;
    },

    async create(createProperties) {
      recordCall('create', [createProperties]);
      const newTab: chrome.tabs.Tab = {
        id: _tabs.size + 1,
        index: _tabs.size,
        windowId: 1,
        active: createProperties.active ?? true,
        pinned: false,
        highlighted: false,
        incognito: false,
        selected: true,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
        url: createProperties.url,
      };
      _tabs.set(newTab.id!, newTab);
      return newTab;
    },

    async remove(tabId: number): Promise<void> {
      recordCall('remove', [tabId]);
      _tabs.delete(tabId);
    },
  };

  return adapter;
}

/**
 * Mock DOM implementation
 */
export interface MockDOMAdapter extends IDOMAdapter {
  _calls: MockCallRecord[];
  _elements: Map<string, Element>;
  _eventListeners: Map<string, Array<{ element: string; callback: EventListenerOrEventListenerObject }>>;
  _reset(): void;
  _setElement(id: string, element: Element): void;
  _simulateEvent(elementId: string, eventType: string, event?: Event): void;
}

/**
 * Create a mock DOM adapter
 */
export function createMockDOMAdapter(): MockDOMAdapter {
  const _calls: MockCallRecord[] = [];
  const _elements = new Map<string, Element>();
  const _eventListeners = new Map<string, Array<{ element: string; callback: EventListenerOrEventListenerObject }>>();

  const recordCall = (method: string, args: unknown[]) => {
    _calls.push({ method, args, timestamp: Date.now() });
  };

  const adapter: MockDOMAdapter = {
    _calls,
    _elements,
    _eventListeners,

    _reset() {
      _calls.length = 0;
      _elements.clear();
      _eventListeners.clear();
    },

    _setElement(id, element) {
      _elements.set(id, element);
    },

    _simulateEvent(elementId, eventType, event) {
      const listeners = _eventListeners.get(eventType) || [];
      listeners
        .filter((l) => l.element === elementId)
        .forEach((l) => {
          if (typeof l.callback === 'function') {
            l.callback(event || new Event(eventType));
          } else {
            l.callback.handleEvent(event || new Event(eventType));
          }
        });
    },

    getElementById<T extends HTMLElement = HTMLElement>(id: string): T | null {
      recordCall('getElementById', [id]);
      return (_elements.get(id) as T) || null;
    },

    querySelector<T extends Element = Element>(selector: string): T | null {
      recordCall('querySelector', [selector]);
      // Simple mock - just return first element if selector matches an ID
      if (selector.startsWith('#')) {
        return (_elements.get(selector.slice(1)) as T) || null;
      }
      return null;
    },

    querySelectorAll<T extends Element = Element>(selector: string): NodeListOf<T> {
      recordCall('querySelectorAll', [selector]);
      return [] as unknown as NodeListOf<T>;
    },

    addWindowListener<K extends keyof WindowEventMap>(
      type: K,
      listener: (ev: WindowEventMap[K]) => void
    ): void {
      recordCall('addWindowListener', [type, listener]);
      if (!_eventListeners.has(type)) {
        _eventListeners.set(type, []);
      }
      _eventListeners.get(type)!.push({ element: 'window', callback: listener as EventListener });
    },

    removeWindowListener<K extends keyof WindowEventMap>(
      type: K,
      listener: (ev: WindowEventMap[K]) => void
    ): void {
      recordCall('removeWindowListener', [type, listener]);
      const listeners = _eventListeners.get(type) || [];
      const index = listeners.findIndex((l) => l.callback === listener);
      if (index > -1) listeners.splice(index, 1);
    },

    postMessage(message: unknown, targetOrigin: string): void {
      recordCall('postMessage', [message, targetOrigin]);
    },

    get locationOrigin(): string {
      return 'https://test.example.com';
    },

    get locationHref(): string {
      return 'https://test.example.com/page';
    },

    get isOnline(): boolean {
      return true;
    },

    closeWindow(): void {
      recordCall('closeWindow', []);
    },
  };

  return adapter;
}

/**
 * Mock alarms implementation
 */
export interface MockAlarmsAdapter extends IAlarmsAdapter {
  _calls: MockCallRecord[];
  _alarms: Map<string, chrome.alarms.Alarm>;
  _alarmCallbacks: AlarmCallback[];
  _reset(): void;
  _triggerAlarm(name: string): void;
}

/**
 * Create a mock alarms adapter
 */
export function createMockAlarmsAdapter(): MockAlarmsAdapter {
  const _calls: MockCallRecord[] = [];
  const _alarms = new Map<string, chrome.alarms.Alarm>();
  const _alarmCallbacks: AlarmCallback[] = [];

  const recordCall = (method: string, args: unknown[]) => {
    _calls.push({ method, args, timestamp: Date.now() });
  };

  const adapter: MockAlarmsAdapter = {
    _calls,
    _alarms,
    _alarmCallbacks,

    _reset() {
      _calls.length = 0;
      _alarms.clear();
      _alarmCallbacks.length = 0;
    },

    _triggerAlarm(name) {
      const alarm = _alarms.get(name);
      if (alarm) {
        _alarmCallbacks.forEach((cb) => cb(alarm));
      }
    },

    async create(name, alarmInfo) {
      recordCall('create', [name, alarmInfo]);
      const alarm: chrome.alarms.Alarm = {
        name,
        scheduledTime: Date.now() + (alarmInfo.delayInMinutes || 0) * 60000,
        periodInMinutes: alarmInfo.periodInMinutes,
      };
      _alarms.set(name, alarm);
    },

    async clear(name) {
      recordCall('clear', [name]);
      const existed = _alarms.has(name);
      _alarms.delete(name);
      return existed;
    },

    async clearAll(): Promise<boolean> {
      recordCall('clearAll', []);
      const hadAlarms = _alarms.size > 0;
      _alarms.clear();
      return hadAlarms;
    },

    async get(name) {
      recordCall('get', [name]);
      return _alarms.get(name);
    },

    onAlarm(callback: AlarmCallback): void {
      recordCall('onAlarm', [callback]);
      _alarmCallbacks.push(callback);
    },

    offAlarm(callback: AlarmCallback): void {
      recordCall('offAlarm', [callback]);
      const index = _alarmCallbacks.indexOf(callback);
      if (index > -1) _alarmCallbacks.splice(index, 1);
    },
  };

  return adapter;
}

/**
 * Create a complete mock adapter container
 */
export function createMockAdapterContainer(): IAdapterContainer & {
  storage: MockStorageAdapter;
  runtime: MockRuntimeAdapter;
  tabs: MockTabsAdapter;
  dom: MockDOMAdapter;
  alarms: MockAlarmsAdapter;
  _resetAll(): void;
} {
  const storage = createMockStorageAdapter();
  const runtime = createMockRuntimeAdapter();
  const tabs = createMockTabsAdapter();
  const dom = createMockDOMAdapter();
  const alarms = createMockAlarmsAdapter();

  return {
    storage,
    runtime,
    tabs,
    dom,
    alarms,
    _resetAll() {
      storage._reset();
      runtime._reset();
      tabs._reset();
      dom._reset();
      alarms._reset();
    },
  };
}
