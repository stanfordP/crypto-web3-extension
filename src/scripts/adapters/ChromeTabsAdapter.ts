/**
 * Chrome Tabs Adapter
 * 
 * Production implementation of ITabsAdapter using Chrome's tabs API.
 * 
 * @module adapters/ChromeTabsAdapter
 */

import type {
  ITabsAdapter,
  TabQueryOptions,
  TabInfo,
  TabCreateOptions,
} from './types';

/**
 * Chrome Tabs Adapter - wraps chrome.tabs API
 */
export class ChromeTabsAdapter implements ITabsAdapter {
  async query(options: TabQueryOptions): Promise<TabInfo[]> {
    const chromeTabs = await chrome.tabs.query(options);
    return chromeTabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId,
    }));
  }

  async get(tabId: number): Promise<TabInfo> {
    const tab = await chrome.tabs.get(tabId);
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId,
    };
  }

  async create(options: TabCreateOptions): Promise<TabInfo> {
    const tab = await chrome.tabs.create(options);
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId,
    };
  }

  async update(tabId: number, updateProperties: { active?: boolean; url?: string }): Promise<TabInfo> {
    const tab = await chrome.tabs.update(tabId, updateProperties);
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId,
    };
  }

  async focusWindow(windowId: number): Promise<void> {
    await chrome.windows.update(windowId, { focused: true });
  }

  async sendMessage<T = unknown, R = unknown>(tabId: number, message: T): Promise<R> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response: R) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async remove(tabId: number): Promise<void> {
    return chrome.tabs.remove(tabId);
  }

  addTabListener(event: 'onRemoved' | 'onUpdated', listener: (tabId: number, ...args: unknown[]) => void): void {
    if (event === 'onRemoved') {
      chrome.tabs.onRemoved.addListener(listener);
    } else if (event === 'onUpdated') {
      chrome.tabs.onUpdated.addListener(listener as (tabId: number, changeInfo: unknown, tab: unknown) => void);
    }
  }

  removeTabListener(event: 'onRemoved' | 'onUpdated', listener: (tabId: number, ...args: unknown[]) => void): void {
    if (event === 'onRemoved') {
      chrome.tabs.onRemoved.removeListener(listener);
    } else if (event === 'onUpdated') {
      chrome.tabs.onUpdated.removeListener(listener as (tabId: number, changeInfo: unknown, tab: unknown) => void);
    }
  }
}
