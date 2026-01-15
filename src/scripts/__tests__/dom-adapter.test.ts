/**
 * DOMAdapter Tests
 *
 * Tests for the DOM adapter that wraps document/window APIs.
 * 
 * Note: Jest provides jsdom environment, so we use spies instead of mocking globals.
 */

import { DOMAdapter } from '../adapters/DOMAdapter';

// Mock chrome.runtime.getURL
const mockChrome = {
  runtime: {
    getURL: jest.fn((path: string) => `chrome-extension://test-id/${path}`),
  },
};

// Set chrome global
(global as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

describe('DOMAdapter', () => {
  let adapter: DOMAdapter;

  beforeEach(() => {
    adapter = new DOMAdapter();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // getElementById tests
  // ==========================================================================

  describe('getElementById', () => {
    it('should return element when found', () => {
      // Create a test element
      const testElement = document.createElement('div');
      testElement.id = 'test-element';
      document.body.appendChild(testElement);

      const result = adapter.getElementById('test-element');

      expect(result).toBe(testElement);

      // Cleanup
      document.body.removeChild(testElement);
    });

    it('should return null when element not found', () => {
      const result = adapter.getElementById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // querySelector tests
  // ==========================================================================

  describe('querySelector', () => {
    it('should return element when found', () => {
      const testElement = document.createElement('div');
      testElement.className = 'test-class';
      document.body.appendChild(testElement);

      const result = adapter.querySelector('.test-class');

      expect(result).toBe(testElement);

      document.body.removeChild(testElement);
    });

    it('should return null when element not found', () => {
      const result = adapter.querySelector('.nonexistent');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // querySelectorAll tests
  // ==========================================================================

  describe('querySelectorAll', () => {
    it('should return NodeList of elements', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      element1.className = 'multi-test';
      element2.className = 'multi-test';
      document.body.appendChild(element1);
      document.body.appendChild(element2);

      const result = adapter.querySelectorAll('.multi-test');

      expect(result.length).toBe(2);

      document.body.removeChild(element1);
      document.body.removeChild(element2);
    });

    it('should return empty NodeList when no elements found', () => {
      const result = adapter.querySelectorAll('.nonexistent-multi');
      expect(result.length).toBe(0);
    });
  });

  // ==========================================================================
  // addWindowListener tests
  // ==========================================================================

  describe('addWindowListener', () => {
    it('should add window event listener', () => {
      const addEventSpy = jest.spyOn(window, 'addEventListener');
      const listener = jest.fn();

      adapter.addWindowListener('online', listener);

      expect(addEventSpy).toHaveBeenCalledWith('online', listener);

      addEventSpy.mockRestore();
    });
  });

  // ==========================================================================
  // removeWindowListener tests
  // ==========================================================================

  describe('removeWindowListener', () => {
    it('should remove window event listener', () => {
      const removeEventSpy = jest.spyOn(window, 'removeEventListener');
      const listener = jest.fn();

      adapter.removeWindowListener('online', listener);

      expect(removeEventSpy).toHaveBeenCalledWith('online', listener);

      removeEventSpy.mockRestore();
    });
  });

  // ==========================================================================
  // addEventListener tests
  // ==========================================================================

  describe('addEventListener', () => {
    it('should add visibilitychange listener to document', () => {
      const docAddSpy = jest.spyOn(document, 'addEventListener');
      const listener = jest.fn();

      adapter.addEventListener('visibilitychange', listener);

      expect(docAddSpy).toHaveBeenCalledWith('visibilitychange', listener);

      docAddSpy.mockRestore();
    });

    it('should add message listener to window', () => {
      const winAddSpy = jest.spyOn(window, 'addEventListener');
      const listener = jest.fn();

      adapter.addEventListener('message', listener);

      expect(winAddSpy).toHaveBeenCalledWith('message', listener);

      winAddSpy.mockRestore();
    });
  });

  // ==========================================================================
  // removeEventListener tests
  // ==========================================================================

  describe('removeEventListener', () => {
    it('should remove visibilitychange listener from document', () => {
      const docRemoveSpy = jest.spyOn(document, 'removeEventListener');
      const listener = jest.fn();

      adapter.removeEventListener('visibilitychange', listener);

      expect(docRemoveSpy).toHaveBeenCalledWith('visibilitychange', listener);

      docRemoveSpy.mockRestore();
    });

    it('should remove other listeners from window', () => {
      const winRemoveSpy = jest.spyOn(window, 'removeEventListener');
      const listener = jest.fn();

      adapter.removeEventListener('message', listener);

      expect(winRemoveSpy).toHaveBeenCalledWith('message', listener);

      winRemoveSpy.mockRestore();
    });
  });

  // ==========================================================================
  // postMessage tests
  // ==========================================================================

  describe('postMessage', () => {
    it('should post message to window', () => {
      const postSpy = jest.spyOn(window, 'postMessage');

      adapter.postMessage({ type: 'TEST' }, '*');

      expect(postSpy).toHaveBeenCalledWith({ type: 'TEST' }, '*');

      postSpy.mockRestore();
    });
  });

  // ==========================================================================
  // locationOrigin tests
  // ==========================================================================

  describe('locationOrigin', () => {
    it('should return window.location.origin', () => {
      // jsdom sets origin to 'http://localhost' by default
      expect(adapter.locationOrigin).toBe(window.location.origin);
    });
  });

  // ==========================================================================
  // locationHref tests
  // ==========================================================================

  describe('locationHref', () => {
    it('should return window.location.href', () => {
      expect(adapter.locationHref).toBe(window.location.href);
    });
  });

  // ==========================================================================
  // isOnline tests
  // ==========================================================================

  describe('isOnline', () => {
    it('should return navigator.onLine value', () => {
      // jsdom defaults to online
      expect(adapter.isOnline).toBe(navigator.onLine);
    });
  });

  // ==========================================================================
  // closeWindow tests
  // ==========================================================================

  describe('closeWindow', () => {
    it('should call window.close', () => {
      const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});

      adapter.closeWindow();

      expect(closeSpy).toHaveBeenCalled();

      closeSpy.mockRestore();
    });
  });

  // ==========================================================================
  // getOrigin tests
  // ==========================================================================

  describe('getOrigin', () => {
    it('should return locationOrigin', () => {
      expect(adapter.getOrigin()).toBe(adapter.locationOrigin);
    });
  });

  // ==========================================================================
  // getVisibilityState tests
  // ==========================================================================

  describe('getVisibilityState', () => {
    it('should return document.visibilityState', () => {
      expect(adapter.getVisibilityState()).toBe(document.visibilityState);
    });
  });

  // ==========================================================================
  // createElement tests
  // ==========================================================================

  describe('createElement', () => {
    it('should create element with given tag name', () => {
      const result = adapter.createElement('script');

      expect(result).toBeInstanceOf(HTMLScriptElement);
      expect(result.tagName).toBe('SCRIPT');
    });

    it('should create different element types', () => {
      const divResult = adapter.createElement('div');
      const spanResult = adapter.createElement('span');

      expect(divResult).toBeInstanceOf(HTMLDivElement);
      expect(spanResult).toBeInstanceOf(HTMLSpanElement);
    });
  });

  // ==========================================================================
  // getExtensionUrl tests
  // ==========================================================================

  describe('getExtensionUrl', () => {
    it('should return chrome extension URL when chrome API available', () => {
      const result = adapter.getExtensionUrl('popup.html');

      expect(mockChrome.runtime.getURL).toHaveBeenCalledWith('popup.html');
      expect(result).toBe('chrome-extension://test-id/popup.html');
    });

    it('should handle nested paths', () => {
      const result = adapter.getExtensionUrl('assets/icons/icon-128.png');

      expect(mockChrome.runtime.getURL).toHaveBeenCalledWith('assets/icons/icon-128.png');
      expect(result).toBe('chrome-extension://test-id/assets/icons/icon-128.png');
    });
  });
});
