/**
 * Adapter Interfaces for Dependency Injection
 * 
 * These interfaces abstract browser APIs to enable:
 * 1. Unit testing with mock implementations
 * 2. Decoupling business logic from browser-specific code
 * 3. Potential future support for other browsers (Firefox, Safari)
 * 
 * @module adapters/types
 */

// ============================================================================
// Storage Adapter
// ============================================================================

/**
 * Storage change event data
 */
export interface StorageChange<T = unknown> {
  oldValue?: T;
  newValue?: T;
}

/**
 * Storage area types matching Chrome's storage API
 */
export type StorageAreaName = 'local' | 'session' | 'sync';

/**
 * Callback for storage change events
 */
export type StorageChangeCallback = (
  changes: Record<string, StorageChange>,
  areaName: StorageAreaName
) => void;

/**
 * Abstract storage adapter interface
 * Matches chrome.storage API structure
 */
export interface IStorageAdapter {
  /**
   * Get values from local storage
   */
  localGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T>;
  
  /**
   * Set values in local storage
   */
  localSet(items: Record<string, unknown>): Promise<void>;
  
  /**
   * Remove keys from local storage
   */
  localRemove(keys: string | string[]): Promise<void>;
  
  /**
   * Clear all local storage
   */
  localClear(): Promise<void>;
  
  /**
   * Get values from session storage
   */
  sessionGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T>;
  
  /**
   * Set values in session storage
   */
  sessionSet(items: Record<string, unknown>): Promise<void>;
  
  /**
   * Remove keys from session storage
   */
  sessionRemove(keys: string | string[]): Promise<void>;
  
  /**
   * Clear all session storage
   */
  sessionClear(): Promise<void>;
  
  /**
   * Get values from sync storage
   */
  syncGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T>;
  
  /**
   * Add listener for storage changes
   */
  onChanged(callback: StorageChangeCallback): void;
  
  /**
   * Remove listener for storage changes
   */
  offChanged(callback: StorageChangeCallback): void;

  // Convenient aliases
  
  /**
   * Alias for localGet
   */
  getLocal<T = Record<string, unknown>>(keys: string | string[]): Promise<T>;
  
  /**
   * Alias for localSet
   */
  setLocal(items: Record<string, unknown>): Promise<void>;
  
  /**
   * Alias for localRemove
   */
  removeLocal(keys: string | string[]): Promise<void>;
  
  /**
   * Alias for sessionGet
   */
  getSession<T = Record<string, unknown>>(keys: string | string[]): Promise<T>;
  
  /**
   * Alias for sessionSet
   */
  setSession(items: Record<string, unknown>): Promise<void>;
  
  /**
   * Alias for sessionRemove
   */
  removeSession(keys: string | string[]): Promise<void>;
  
  /**
   * Alias for onChanged
   */
  addChangeListener(callback: StorageChangeCallback): void;
  
  /**
   * Alias for offChanged
   */
  removeChangeListener(callback: StorageChangeCallback): void;
  
  /**
   * Clear storage by area
   */
  clear(area: 'local' | 'session' | 'sync'): Promise<void>;
  
  /**
   * Set session storage access level (for content script access)
   */
  setSessionAccessLevel(accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS'): Promise<void>;
}

// ============================================================================
// Runtime Adapter
// ============================================================================

/**
 * Message response callback
 */
export type MessageResponseCallback<T = unknown> = (response: T) => void;

/**
 * Message listener callback
 */
export type MessageListener<T = unknown, R = unknown> = (
  message: T,
  sender: RuntimeMessageSender,
  sendResponse: MessageResponseCallback<R>
) => boolean | void | Promise<R>;

/**
 * Sender information for runtime messages
 */
export interface RuntimeMessageSender {
  id?: string;
  url?: string;
  tab?: {
    id?: number;
    url?: string;
    title?: string;
  };
  frameId?: number;
}

/**
 * Abstract runtime adapter interface
 * Matches chrome.runtime API structure
 */
export interface IRuntimeAdapter {
  /**
   * Get extension ID
   */
  readonly id: string;
  
  /**
   * Get last error (if any)
   */
  readonly lastError: { message: string } | null | undefined;
  
  /**
   * Send message to background script
   */
  sendMessage<T = unknown, R = unknown>(message: T): Promise<R>;
  
  /**
   * Add message listener
   */
  onMessage<T = unknown, R = unknown>(listener: MessageListener<T, R>): void;
  
  /**
   * Remove message listener
   */
  offMessage<T = unknown, R = unknown>(listener: MessageListener<T, R>): void;
  
  /**
   * Get extension URL
   */
  getURL(path: string): string;

  /**
   * Alias for onMessage
   */
  addMessageListener<T = unknown, R = unknown>(listener: MessageListener<T, R>): void;
  
  /**
   * Alias for offMessage
   */
  removeMessageListener<T = unknown, R = unknown>(listener: MessageListener<T, R>): void;
}

// ============================================================================
// Tabs Adapter
// ============================================================================

/**
 * Tab query options
 */
export interface TabQueryOptions {
  active?: boolean;
  currentWindow?: boolean;
  url?: string | string[];
}

/**
 * Tab information
 */
export interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
}

/**
 * Tab creation options
 */
export interface TabCreateOptions {
  url?: string;
  active?: boolean;
  windowId?: number;
}

/**
 * Abstract tabs adapter interface
 * Matches chrome.tabs API structure
 */
export interface ITabsAdapter {
  /**
   * Query tabs matching criteria
   */
  query(options: TabQueryOptions): Promise<TabInfo[]>;
  
  /**
   * Get a specific tab by ID
   */
  get(tabId: number): Promise<TabInfo>;
  
  /**
   * Create a new tab
   */
  create(options: TabCreateOptions): Promise<TabInfo>;
  
  /**
   * Update a tab
   */
  update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<TabInfo>;
  
  /**
   * Focus a window
   */
  focusWindow(windowId: number): Promise<void>;
  
  /**
   * Send message to a specific tab
   */
  sendMessage<T = unknown, R = unknown>(tabId: number, message: T): Promise<R>;
  
  /**
   * Close a tab
   */
  remove(tabId: number): Promise<void>;
  
  /**
   * Add tab event listener
   */
  addTabListener(event: 'onRemoved' | 'onUpdated', listener: (tabId: number, ...args: unknown[]) => void): void;
  
  /**
   * Remove tab event listener
   */
  removeTabListener(event: 'onRemoved' | 'onUpdated', listener: (tabId: number, ...args: unknown[]) => void): void;
}

// ============================================================================
// DOM Adapter
// ============================================================================

/**
 * Abstract DOM adapter interface
 * Abstracts document/window interactions for testability
 */
export interface IDOMAdapter {
  /**
   * Get element by ID
   */
  getElementById<T extends HTMLElement = HTMLElement>(id: string): T | null;
  
  /**
   * Query single element
   */
  querySelector<T extends Element = Element>(selector: string): T | null;
  
  /**
   * Query all matching elements
   */
  querySelectorAll<T extends Element = Element>(selector: string): NodeListOf<T>;
  
  /**
   * Add event listener to window
   */
  addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (ev: WindowEventMap[K]) => void
  ): void;
  
  /**
   * Remove event listener from window
   */
  removeWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (ev: WindowEventMap[K]) => void
  ): void;

  /**
   * Add event listener (supports window and document events)
   */
  addEventListener(type: string, listener: (ev: Event) => void): void;

  /**
   * Remove event listener (supports window and document events)
   */
  removeEventListener(type: string, listener: (ev: Event) => void): void;
  
  /**
   * Post message to window
   */
  postMessage(message: unknown, targetOrigin: string): void;
  
  /**
   * Get current location origin
   */
  readonly locationOrigin: string;
  
  /**
   * Get current location href
   */
  readonly locationHref: string;
  
  /**
   * Check if online
   */
  readonly isOnline: boolean;
  
  /**
   * Close the current window
   */
  closeWindow(): void;

  /**
   * Get current origin (alias for locationOrigin)
   */
  getOrigin(): string;

  /**
   * Get document visibility state
   */
  getVisibilityState(): DocumentVisibilityState;

  /**
   * Create an HTML element
   */
  createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K];

  /**
   * Get extension URL for a resource
   */
  getExtensionUrl(path: string): string;
}

// ============================================================================
// Alarms Adapter
// ============================================================================

/**
 * Alarm create options
 */
export interface AlarmCreateOptions {
  when?: number;
  delayInMinutes?: number;
  periodInMinutes?: number;
}

/**
 * Alarm info
 */
export interface AlarmInfo {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

/**
 * Alarm callback
 */
export type AlarmCallback = (alarm: AlarmInfo) => void;

/**
 * Abstract alarms adapter interface
 * Matches chrome.alarms API structure
 */
export interface IAlarmsAdapter {
  /**
   * Create an alarm
   */
  create(name: string, options: AlarmCreateOptions): void;
  
  /**
   * Clear an alarm
   */
  clear(name: string): Promise<boolean>;
  
  /**
   * Clear all alarms
   */
  clearAll(): Promise<boolean>;
  
  /**
   * Get an alarm by name
   */
  get(name: string): Promise<AlarmInfo | undefined>;
  
  /**
   * Add alarm listener
   */
  onAlarm(callback: AlarmCallback): void;
  
  /**
   * Remove alarm listener
   */
  offAlarm(callback: AlarmCallback): void;
}

// ============================================================================
// Dependency Container
// ============================================================================

/**
 * Container for all adapters - used for dependency injection
 */
export interface IAdapterContainer {
  storage: IStorageAdapter;
  runtime: IRuntimeAdapter;
  tabs: ITabsAdapter;
  dom?: IDOMAdapter;
  alarms?: IAlarmsAdapter;
}
