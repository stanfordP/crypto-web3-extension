/**
 * Chrome Storage Adapter
 * 
 * Production implementation of IStorageAdapter using Chrome's storage API.
 * 
 * @module adapters/ChromeStorageAdapter
 */

import type {
  IStorageAdapter,
  StorageChangeCallback,
  StorageChange,
  StorageAreaName,
} from './types';

/**
 * Chrome Storage Adapter - wraps chrome.storage API
 */
export class ChromeStorageAdapter implements IStorageAdapter {
  private changeListeners = new Set<StorageChangeCallback>();
  private chromeListener: ((
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => void) | null = null;

  constructor() {
    // Set up the chrome listener once
    this.chromeListener = (changes, areaName) => {
      const convertedChanges: Record<string, StorageChange> = {};
      for (const [key, value] of Object.entries(changes)) {
        convertedChanges[key] = {
          oldValue: value.oldValue,
          newValue: value.newValue,
        };
      }
      
      for (const listener of this.changeListeners) {
        try {
          listener(convertedChanges, areaName as StorageAreaName);
        } catch (error) {
          console.error('[ChromeStorageAdapter] Listener error:', error);
        }
      }
    };
    
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(this.chromeListener);
    }
  }

  // ============================================================================
  // Local Storage
  // ============================================================================

  async localGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
    return chrome.storage.local.get(keys) as Promise<T>;
  }

  async localSet(items: Record<string, unknown>): Promise<void> {
    return chrome.storage.local.set(items);
  }

  async localRemove(keys: string | string[]): Promise<void> {
    return chrome.storage.local.remove(keys);
  }

  async localClear(): Promise<void> {
    return chrome.storage.local.clear();
  }

  // ============================================================================
  // Session Storage
  // ============================================================================

  async sessionGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
    return chrome.storage.session.get(keys) as Promise<T>;
  }

  async sessionSet(items: Record<string, unknown>): Promise<void> {
    return chrome.storage.session.set(items);
  }

  async sessionRemove(keys: string | string[]): Promise<void> {
    return chrome.storage.session.remove(keys);
  }

  async sessionClear(): Promise<void> {
    return chrome.storage.session.clear();
  }

  // ============================================================================
  // Sync Storage
  // ============================================================================

  async syncGet<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
    return chrome.storage.sync.get(keys) as Promise<T>;
  }

  // ============================================================================
  // Change Listeners
  // ============================================================================

  onChanged(callback: StorageChangeCallback): void {
    this.changeListeners.add(callback);
  }

  offChanged(callback: StorageChangeCallback): void {
    this.changeListeners.delete(callback);
  }

  // ============================================================================
  // Aliases
  // ============================================================================

  getLocal<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
    return this.localGet(keys);
  }

  setLocal(items: Record<string, unknown>): Promise<void> {
    return this.localSet(items);
  }

  removeLocal(keys: string | string[]): Promise<void> {
    return this.localRemove(keys);
  }

  getSession<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
    return this.sessionGet(keys);
  }

  setSession(items: Record<string, unknown>): Promise<void> {
    return this.sessionSet(items);
  }

  removeSession(keys: string | string[]): Promise<void> {
    return this.sessionRemove(keys);
  }

  addChangeListener(callback: StorageChangeCallback): void {
    this.onChanged(callback);
  }

  removeChangeListener(callback: StorageChangeCallback): void {
    this.offChanged(callback);
  }

  async clear(area: 'local' | 'session' | 'sync'): Promise<void> {
    switch (area) {
      case 'local':
        return this.localClear();
      case 'session':
        return this.sessionClear();
      case 'sync':
        return chrome.storage.sync.clear();
    }
  }

  async setSessionAccessLevel(accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS'): Promise<void> {
    return chrome.storage.session.setAccessLevel({ accessLevel });
  }

  /**
   * Cleanup - remove chrome listener
   */
  destroy(): void {
    if (this.chromeListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this.chromeListener);
    }
    this.changeListeners.clear();
  }
}
