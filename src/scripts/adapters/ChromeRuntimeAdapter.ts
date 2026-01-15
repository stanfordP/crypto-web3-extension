/**
 * Chrome Runtime Adapter
 * 
 * Production implementation of IRuntimeAdapter using Chrome's runtime API.
 * 
 * @module adapters/ChromeRuntimeAdapter
 */

import type {
  IRuntimeAdapter,
  MessageListener,
  RuntimeMessageSender,
} from './types';

/**
 * Chrome Runtime Adapter - wraps chrome.runtime API
 */
export class ChromeRuntimeAdapter implements IRuntimeAdapter {
  private messageListeners = new Map<
    MessageListener<unknown, unknown>,
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean | void
  >();

  get id(): string {
    return chrome.runtime?.id ?? '';
  }

  get lastError(): { message: string } | null | undefined {
    const error = chrome.runtime?.lastError;
    if (error && error.message) {
      return { message: error.message };
    }
    return error ? { message: 'Unknown error' } : null;
  }

  async sendMessage<T = unknown, R = unknown>(message: T): Promise<R> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: R) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  onMessage<T = unknown, R = unknown>(listener: MessageListener<T, R>): void {
    const chromeListener = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean | void => {
      const convertedSender: RuntimeMessageSender = {
        id: sender.id,
        url: sender.url,
        tab: sender.tab ? {
          id: sender.tab.id,
          url: sender.tab.url,
          title: sender.tab.title,
        } : undefined,
        frameId: sender.frameId,
      };

      const result = listener(
        message as T,
        convertedSender,
        sendResponse as (response: R) => void
      );

      // If listener returns a Promise, we need to return true to keep the message channel open
      if (result instanceof Promise) {
        result.then(sendResponse).catch((error) => {
          sendResponse({ error: error.message } as unknown as R);
        });
        return true;
      }

      return result;
    };

    this.messageListeners.set(
      listener as MessageListener<unknown, unknown>,
      chromeListener
    );
    chrome.runtime.onMessage.addListener(chromeListener);
  }

  offMessage<T = unknown, R = unknown>(listener: MessageListener<T, R>): void {
    const chromeListener = this.messageListeners.get(
      listener as MessageListener<unknown, unknown>
    );
    if (chromeListener) {
      chrome.runtime.onMessage.removeListener(chromeListener);
      this.messageListeners.delete(listener as MessageListener<unknown, unknown>);
    }
  }

  getURL(path: string): string {
    return chrome.runtime.getURL(path);
  }

  // Aliases
  addMessageListener<T = unknown, R = unknown>(listener: MessageListener<T, R>): void {
    this.onMessage(listener);
  }

  removeMessageListener<T = unknown, R = unknown>(listener: MessageListener<T, R>): void {
    this.offMessage(listener);
  }

  /**
   * Cleanup - remove all listeners
   */
  destroy(): void {
    for (const chromeListener of this.messageListeners.values()) {
      chrome.runtime.onMessage.removeListener(chromeListener);
    }
    this.messageListeners.clear();
  }
}
