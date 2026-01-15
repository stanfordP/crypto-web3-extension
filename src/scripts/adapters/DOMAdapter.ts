/**
 * DOM Adapter
 * 
 * Production implementation of IDOMAdapter wrapping document/window APIs.
 * 
 * @module adapters/DOMAdapter
 */

import type { IDOMAdapter } from './types';

/**
 * DOM Adapter - wraps document and window APIs
 */
export class DOMAdapter implements IDOMAdapter {
  getElementById<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  querySelector<T extends Element = Element>(selector: string): T | null {
    return document.querySelector<T>(selector);
  }

  querySelectorAll<T extends Element = Element>(selector: string): NodeListOf<T> {
    return document.querySelectorAll<T>(selector);
  }

  addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (ev: WindowEventMap[K]) => void
  ): void {
    window.addEventListener(type, listener);
  }

  removeWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (ev: WindowEventMap[K]) => void
  ): void {
    window.removeEventListener(type, listener);
  }

  addEventListener(type: string, listener: (ev: Event) => void): void {
    // Handle both window and document events
    if (type === 'visibilitychange') {
      document.addEventListener(type, listener);
    } else {
      window.addEventListener(type, listener as EventListener);
    }
  }

  removeEventListener(type: string, listener: (ev: Event) => void): void {
    if (type === 'visibilitychange') {
      document.removeEventListener(type, listener);
    } else {
      window.removeEventListener(type, listener as EventListener);
    }
  }

  postMessage(message: unknown, targetOrigin: string): void {
    window.postMessage(message, targetOrigin);
  }

  get locationOrigin(): string {
    return window.location.origin;
  }

  get locationHref(): string {
    return window.location.href;
  }

  get isOnline(): boolean {
    return navigator.onLine;
  }

  closeWindow(): void {
    window.close();
  }

  getOrigin(): string {
    return this.locationOrigin;
  }

  getVisibilityState(): DocumentVisibilityState {
    return document.visibilityState;
  }

  createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
    return document.createElement(tagName);
  }

  getExtensionUrl(path: string): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }
    return path;
  }
}
