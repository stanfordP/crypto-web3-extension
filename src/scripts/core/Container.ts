/**
 * Dependency Injection Container
 * 
 * Provides a centralized way to manage dependencies across the extension.
 * Enables easy testing by allowing mock implementations to be injected.
 * 
 * @module core/Container
 */

import type {
  IStorageAdapter,
  IRuntimeAdapter,
  ITabsAdapter,
  IDOMAdapter,
  IAlarmsAdapter,
  IAdapterContainer,
  MessageListener,
  RuntimeMessageSender,
  StorageAreaName,
} from '../adapters/types';

// ============================================================================
// Container Interface
// ============================================================================

/**
 * Full dependency container with all adapters
 */
export interface IDependencyContainer extends IAdapterContainer {
  storage: IStorageAdapter;
  runtime: IRuntimeAdapter;
  tabs: ITabsAdapter;
  dom: IDOMAdapter;
  alarms: IAlarmsAdapter;
}

/**
 * Partial container for contexts that don't need all adapters
 */
export interface IPartialContainer {
  storage?: IStorageAdapter;
  runtime?: IRuntimeAdapter;
  tabs?: ITabsAdapter;
  dom?: IDOMAdapter;
  alarms?: IAlarmsAdapter;
}

// ============================================================================
// Container Singleton
// ============================================================================

let containerInstance: IDependencyContainer | null = null;

/**
 * Initialize the container with adapter implementations
 * Should be called once at application startup
 */
export function initializeContainer(adapters: IDependencyContainer): void {
  if (containerInstance !== null) {
    console.warn('[Container] Container already initialized, replacing...');
  }
  containerInstance = adapters;
}

/**
 * Get the current container instance
 * Throws if container not initialized
 */
export function getContainer(): IDependencyContainer {
  if (containerInstance === null) {
    throw new Error(
      '[Container] Container not initialized. Call initializeContainer() first.'
    );
  }
  return containerInstance;
}

/**
 * Check if container is initialized
 */
export function isContainerInitialized(): boolean {
  return containerInstance !== null;
}

/**
 * Reset the container (primarily for testing)
 */
export function resetContainer(): void {
  containerInstance = null;
}

// ============================================================================
// Production Container Factory
// ============================================================================

/**
 * Create production container with real Chrome adapters
 * Lazy imports to avoid loading Chrome APIs during tests
 */
export async function createProductionContainer(): Promise<IDependencyContainer> {
  // Dynamic imports to avoid module-level Chrome API access
  const { ChromeStorageAdapter } = await import('../adapters/ChromeStorageAdapter');
  const { ChromeRuntimeAdapter } = await import('../adapters/ChromeRuntimeAdapter');
  const { ChromeTabsAdapter } = await import('../adapters/ChromeTabsAdapter');
  const { ChromeAlarmsAdapter } = await import('../adapters/ChromeAlarmsAdapter');
  const { DOMAdapter } = await import('../adapters/DOMAdapter');

  return {
    storage: new ChromeStorageAdapter(),
    runtime: new ChromeRuntimeAdapter(),
    tabs: new ChromeTabsAdapter(),
    alarms: new ChromeAlarmsAdapter(),
    dom: new DOMAdapter(),
  };
}

/**
 * Create and initialize production container
 * Convenience function for entry points
 */
export async function initializeProductionContainer(): Promise<IDependencyContainer> {
  const container = await createProductionContainer();
  initializeContainer(container);
  return container;
}

// ============================================================================
// Test Container Factory
// ============================================================================

/**
 * Mock storage adapter for testing
 */
export function createMockStorageAdapter(): IStorageAdapter {
  const localStore = new Map<string, unknown>();
  const sessionStore = new Map<string, unknown>();
  const syncStore = new Map<string, unknown>();
  const changeListeners = new Set<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: StorageAreaName) => void>();

  const adapter: IStorageAdapter = {
    async localGet<T>(keys: string | string[]): Promise<T> {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (localStore.has(key)) {
          result[key] = localStore.get(key);
        }
      }
      return result as T;
    },
    async localSet(items: Record<string, unknown>): Promise<void> {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: localStore.get(key), newValue: value };
        localStore.set(key, value);
      }
      changeListeners.forEach(cb => cb(changes, 'local'));
    },
    async localRemove(keys: string | string[]): Promise<void> {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const key of keyArray) {
        if (localStore.has(key)) {
          changes[key] = { oldValue: localStore.get(key), newValue: undefined };
          localStore.delete(key);
        }
      }
      if (Object.keys(changes).length > 0) {
        changeListeners.forEach(cb => cb(changes, 'local'));
      }
    },
    async localClear(): Promise<void> {
      localStore.clear();
    },
    async sessionGet<T>(keys: string | string[]): Promise<T> {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (sessionStore.has(key)) {
          result[key] = sessionStore.get(key);
        }
      }
      return result as T;
    },
    async sessionSet(items: Record<string, unknown>): Promise<void> {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: sessionStore.get(key), newValue: value };
        sessionStore.set(key, value);
      }
      changeListeners.forEach(cb => cb(changes, 'session'));
    },
    async sessionRemove(keys: string | string[]): Promise<void> {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const key of keyArray) {
        if (sessionStore.has(key)) {
          changes[key] = { oldValue: sessionStore.get(key), newValue: undefined };
          sessionStore.delete(key);
        }
      }
      if (Object.keys(changes).length > 0) {
        changeListeners.forEach(cb => cb(changes, 'session'));
      }
    },
    async sessionClear(): Promise<void> {
      sessionStore.clear();
    },
    async syncGet<T>(keys: string | string[]): Promise<T> {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyArray) {
        if (syncStore.has(key)) {
          result[key] = syncStore.get(key);
        }
      }
      return result as T;
    },
    onChanged(callback): void {
      changeListeners.add(callback);
    },
    offChanged(callback): void {
      changeListeners.delete(callback);
    },
    // Aliases
    getLocal<T>(keys: string | string[]): Promise<T> {
      return adapter.localGet(keys);
    },
    setLocal(items: Record<string, unknown>): Promise<void> {
      return adapter.localSet(items);
    },
    removeLocal(keys: string | string[]): Promise<void> {
      return adapter.localRemove(keys);
    },
    getSession<T>(keys: string | string[]): Promise<T> {
      return adapter.sessionGet(keys);
    },
    setSession(items: Record<string, unknown>): Promise<void> {
      return adapter.sessionSet(items);
    },
    removeSession(keys: string | string[]): Promise<void> {
      return adapter.sessionRemove(keys);
    },
    addChangeListener(callback): void {
      adapter.onChanged(callback);
    },
    removeChangeListener(callback): void {
      adapter.offChanged(callback);
    },
    async clear(area: 'local' | 'session' | 'sync'): Promise<void> {
      switch (area) {
        case 'local':
          localStore.clear();
          break;
        case 'session':
          sessionStore.clear();
          break;
        case 'sync':
          syncStore.clear();
          break;
      }
    },
    async setSessionAccessLevel(_accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS'): Promise<void> {
      // No-op for mock
    },
  };
  return adapter;
}

/**
 * Mock runtime adapter for testing
 */
export function createMockRuntimeAdapter(): IRuntimeAdapter {
  type ListenerType = (message: unknown, sender: RuntimeMessageSender, sendResponse: (response: unknown) => void) => boolean | void;
  const messageListeners = new Set<ListenerType>();
  const extensionId = 'mock-extension-id';

  const adapter: IRuntimeAdapter = {
    get id(): string {
      return extensionId;
    },
    get lastError(): { message: string } | null | undefined {
      return null;
    },
    async sendMessage<T, R>(_message: T): Promise<R> {
      // In tests, messages can be intercepted
      return Promise.resolve(undefined as unknown as R);
    },
    onMessage<T, R>(listener: MessageListener<T, R>): void {
      messageListeners.add(listener as unknown as ListenerType);
    },
    offMessage<T, R>(listener: MessageListener<T, R>): void {
      messageListeners.delete(listener as unknown as ListenerType);
    },
    getURL(path: string): string {
      return `chrome-extension://${extensionId}/${path}`;
    },
    addMessageListener<T, R>(listener: MessageListener<T, R>): void {
      adapter.onMessage(listener);
    },
    removeMessageListener<T, R>(listener: MessageListener<T, R>): void {
      adapter.offMessage(listener);
    },
  };
  return adapter;
}

/**
 * Mock tabs adapter for testing
 */
export function createMockTabsAdapter(): ITabsAdapter {
  const tabs: Array<{ id: number; url: string; title: string; active: boolean; windowId: number }> = [];
  let nextTabId = 1;
  const tabListeners: {
    onRemoved: Set<(tabId: number, ...args: unknown[]) => void>;
    onUpdated: Set<(tabId: number, ...args: unknown[]) => void>;
  } = {
    onRemoved: new Set(),
    onUpdated: new Set(),
  };

  return {
    async query(options): Promise<Array<{ id?: number; url?: string; title?: string; active?: boolean; windowId?: number }>> {
      return tabs.filter(tab => {
        if (options.active !== undefined && tab.active !== options.active) return false;
        if (options.url) {
          const urls = Array.isArray(options.url) ? options.url : [options.url];
          if (!urls.some(u => tab.url.includes(u.replace('*', '')))) return false;
        }
        return true;
      });
    },
    async get(tabId: number): Promise<{ id?: number; url?: string; title?: string; active?: boolean; windowId?: number }> {
      const tab = tabs.find(t => t.id === tabId);
      if (!tab) throw new Error(`Tab ${tabId} not found`);
      return tab;
    },
    async create(options): Promise<{ id?: number; url?: string; title?: string; active?: boolean; windowId?: number }> {
      const tab = {
        id: nextTabId++,
        url: options.url || '',
        title: '',
        active: options.active ?? true,
        windowId: options.windowId ?? 1,
      };
      tabs.push(tab);
      return tab;
    },
    async update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<{ id?: number; url?: string; title?: string; active?: boolean; windowId?: number }> {
      const tab = tabs.find(t => t.id === tabId);
      if (!tab) throw new Error(`Tab ${tabId} not found`);
      if (updateProperties.active !== undefined) tab.active = updateProperties.active;
      if (updateProperties.url !== undefined) tab.url = updateProperties.url;
      tabListeners.onUpdated.forEach(listener => listener(tabId, updateProperties, tab));
      return tab;
    },
    async focusWindow(_windowId: number): Promise<void> {
      // No-op for mock
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async sendMessage<T, R>(_tabId: number, _message: T): Promise<R> {
      return Promise.resolve(undefined as unknown as R);
    },
    async remove(tabId: number): Promise<void> {
      const index = tabs.findIndex(t => t.id === tabId);
      if (index !== -1) {
        tabs.splice(index, 1);
        tabListeners.onRemoved.forEach(listener => listener(tabId));
      }
    },
    addTabListener(event: 'onRemoved' | 'onUpdated', listener: (tabId: number, ...args: unknown[]) => void): void {
      tabListeners[event].add(listener);
    },
    removeTabListener(event: 'onRemoved' | 'onUpdated', listener: (tabId: number, ...args: unknown[]) => void): void {
      tabListeners[event].delete(listener);
    },
  };
}

/**
 * Mock DOM adapter for testing
 */
export function createMockDOMAdapter(): IDOMAdapter {
  const elements = new Map<string, HTMLElement>();
  const windowListeners = new Map<string, Set<EventListener>>();
  const mockState = {
    online: true,
    visibilityState: 'visible' as DocumentVisibilityState,
  };

  const adapter: IDOMAdapter = {
    getElementById<T extends HTMLElement>(id: string): T | null {
      return (elements.get(id) as T) || null;
    },
    querySelector<T extends Element>(_selector: string): T | null {
      return null;
    },
    querySelectorAll<T extends Element>(_selector: string): NodeListOf<T> {
      return [] as unknown as NodeListOf<T>;
    },
    addWindowListener<K extends keyof WindowEventMap>(type: K, listener: (ev: WindowEventMap[K]) => void): void {
      if (!windowListeners.has(type)) {
        windowListeners.set(type, new Set());
      }
      windowListeners.get(type)!.add(listener as EventListener);
    },
    removeWindowListener<K extends keyof WindowEventMap>(type: K, listener: (ev: WindowEventMap[K]) => void): void {
      windowListeners.get(type)?.delete(listener as EventListener);
    },
    addEventListener(type: string, listener: (ev: Event) => void): void {
      if (!windowListeners.has(type)) {
        windowListeners.set(type, new Set());
      }
      windowListeners.get(type)!.add(listener as EventListener);
    },
    removeEventListener(type: string, listener: (ev: Event) => void): void {
      windowListeners.get(type)?.delete(listener as EventListener);
    },
    postMessage(_message: unknown, _targetOrigin: string): void {
      // Mock - does nothing in tests
    },
    get locationOrigin(): string {
      return 'http://localhost:3000';
    },
    get locationHref(): string {
      return 'http://localhost:3000/';
    },
    get isOnline(): boolean {
      return mockState.online;
    },
    closeWindow(): void {
      // Mock - does nothing in tests
    },
    getOrigin(): string {
      return adapter.locationOrigin;
    },
    getVisibilityState(): DocumentVisibilityState {
      return mockState.visibilityState;
    },
    createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
      // Return a mock element
      const mockElement = {
        tagName: tagName.toUpperCase(),
        src: '',
        setAttribute: jest.fn(),
        onload: null as (() => void) | null,
        onerror: null as ((error: unknown) => void) | null,
      };
      return mockElement as unknown as HTMLElementTagNameMap[K];
    },
    getExtensionUrl(path: string): string {
      return `chrome-extension://mock-id/${path}`;
    },
  };

  return adapter;
}

/**
 * Mock alarms adapter for testing
 */
export function createMockAlarmsAdapter(): IAlarmsAdapter {
  const alarms = new Map<string, { name: string; scheduledTime: number; periodInMinutes?: number }>();
  const alarmListeners = new Set<(alarm: { name: string; scheduledTime: number; periodInMinutes?: number }) => void>();

  return {
    create(name: string, options): void {
      const alarm = {
        name,
        scheduledTime: options.when ?? Date.now() + (options.delayInMinutes ?? 0) * 60 * 1000,
        periodInMinutes: options.periodInMinutes,
      };
      alarms.set(name, alarm);
    },
    async clear(name: string): Promise<boolean> {
      return alarms.delete(name);
    },
    async clearAll(): Promise<boolean> {
      alarms.clear();
      return true;
    },
    async get(name: string): Promise<{ name: string; scheduledTime: number; periodInMinutes?: number } | undefined> {
      return alarms.get(name);
    },
    onAlarm(callback): void {
      alarmListeners.add(callback);
    },
    offAlarm(callback): void {
      alarmListeners.delete(callback);
    },
  };
}

/**
 * Create a full mock container for testing
 */
export function createMockContainer(): IDependencyContainer {
  return {
    storage: createMockStorageAdapter(),
    runtime: createMockRuntimeAdapter(),
    tabs: createMockTabsAdapter(),
    dom: createMockDOMAdapter(),
    alarms: createMockAlarmsAdapter(),
  };
}

/**
 * Create and initialize mock container for testing
 */
export function initializeMockContainer(): IDependencyContainer {
  const container = createMockContainer();
  initializeContainer(container);
  return container;
}

// ============================================================================
// Scoped Container for Specific Contexts
// ============================================================================

/**
 * Container for popup context (needs DOM, storage, runtime, tabs)
 */
export interface IPopupContainer {
  storage: IStorageAdapter;
  runtime: IRuntimeAdapter;
  tabs: ITabsAdapter;
  dom: IDOMAdapter;
}

/**
 * Container for content script context (needs DOM, storage, runtime)
 */
export interface IContentContainer {
  storage: IStorageAdapter;
  runtime: IRuntimeAdapter;
  dom: IDOMAdapter;
}

/**
 * Container for background context (needs storage, runtime, tabs, alarms)
 */
export interface IBackgroundContainer {
  storage: IStorageAdapter;
  runtime: IRuntimeAdapter;
  tabs: ITabsAdapter;
  alarms: IAlarmsAdapter;
}

/**
 * Extract popup container from full container
 */
export function getPopupContainer(): IPopupContainer {
  const container = getContainer();
  return {
    storage: container.storage,
    runtime: container.runtime,
    tabs: container.tabs,
    dom: container.dom,
  };
}

/**
 * Extract content container from full container
 */
export function getContentContainer(): IContentContainer {
  const container = getContainer();
  return {
    storage: container.storage,
    runtime: container.runtime,
    dom: container.dom,
  };
}

/**
 * Extract background container from full container
 */
export function getBackgroundContainer(): IBackgroundContainer {
  const container = getContainer();
  return {
    storage: container.storage,
    runtime: container.runtime,
    tabs: container.tabs,
    alarms: container.alarms,
  };
}
