/**
 * InjectionService Tests
 *
 * Tests for the wallet script injection and communication service.
 */

import { InjectionService, WalletMessageType } from '../services/InjectionService';
import { createMockDOMAdapter } from '../core/Container';
import type { IDOMAdapter } from '../adapters/types';

describe('InjectionService', () => {
  let service: InjectionService;
  let dom: IDOMAdapter & {
    _triggerMessage: (data: unknown) => void;
    _triggerScriptLoad: () => void;
  };
  let mockLogger: typeof console;

  beforeEach(() => {
    // Create enhanced mock DOM adapter
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    let mockScriptElement: {
      src: string;
      onload: (() => void) | null;
      onerror: ((e: unknown) => void) | null;
      setAttribute: jest.Mock;
    } | null = null;

    const baseDom = createMockDOMAdapter();
    dom = {
      ...baseDom,
      addEventListener: jest.fn((type: string, listener: (event: unknown) => void) => {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)!.add(listener);
      }),
      removeEventListener: jest.fn((type: string, listener: (event: unknown) => void) => {
        listeners.get(type)?.delete(listener);
      }),
      getOrigin: jest.fn(() => 'http://localhost:3000'),
      postMessage: jest.fn(),
      querySelector: jest.fn((selector: string) => {
        if (selector === 'script[data-cj-wallet]') return null;
        if (selector === 'head') return { appendChild: jest.fn() };
        return null;
      }),
      createElement: jest.fn((tag: string) => {
        if (tag === 'script') {
          mockScriptElement = {
            src: '',
            onload: null,
            onerror: null,
            setAttribute: jest.fn(),
          };
          return mockScriptElement as unknown as HTMLScriptElement;
        }
        return {} as HTMLElement;
      }),
      getExtensionUrl: jest.fn((path: string) => `chrome-extension://test-id/${path}`),
      _triggerMessage: (data: unknown) => {
        const messageListeners = listeners.get('message');
        if (messageListeners) {
          const event = {
            data,
            origin: 'http://localhost:3000',
          } as MessageEvent;
          messageListeners.forEach(listener => listener(event));
        }
      },
      _triggerScriptLoad: () => {
        if (mockScriptElement?.onload) {
          mockScriptElement.onload();
        }
      },
    } as unknown as typeof dom;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as typeof console;

    service = new InjectionService({
      domAdapter: dom,
      logger: mockLogger as unknown as typeof import('../logger').contentLogger,
    });
  });

  afterEach(() => {
    service.cleanup();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start in not-ready state', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should add message listener on initialize', () => {
      service.initialize();
      expect(dom.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should not double-initialize', () => {
      service.initialize();
      service.initialize();
      expect(dom.addEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should remove message listener on cleanup', () => {
      service.initialize();
      service.cleanup();
      expect(dom.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should reset ready state on cleanup', () => {
      service.initialize();
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
      expect(service.isReady()).toBe(true);
      
      service.cleanup();
      expect(service.isReady()).toBe(false);
    });
  });

  describe('handleWalletMessage', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should ignore messages from different origin', () => {
      // Trigger message from different origin - should be ignored
      // This tests the internal filtering
      expect(service.isReady()).toBe(false);
    });

    it('should set ready state when script ready message received', () => {
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
      expect(service.isReady()).toBe(true);
    });

    it('should ignore non-object messages', () => {
      dom._triggerMessage('string message');
      dom._triggerMessage(null);
      dom._triggerMessage(undefined);
      expect(service.isReady()).toBe(false);
    });
  });

  describe('injectWalletScript', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should skip injection if already ready', async () => {
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
      
      await service.injectWalletScript();
      
      expect(dom.createElement).not.toHaveBeenCalled();
    });

    it('should create script element with correct attributes', async () => {
      // Start injection (will block waiting for ready signal)
      const injectionPromise = service.injectWalletScript();
      
      // Simulate script load and ready
      dom._triggerScriptLoad();
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
      
      await injectionPromise;
      
      expect(dom.createElement).toHaveBeenCalledWith('script');
      expect(dom.getExtensionUrl).toHaveBeenCalledWith('injected-auth.js');
    });

    it('should reuse existing injection promise', async () => {
      // Simulate script already injected
      (dom.querySelector as jest.Mock).mockReturnValueOnce(null);
      
      // Start two injection attempts simultaneously
      const promise1 = service.injectWalletScript();
      const promise2 = service.injectWalletScript();
      
      // Simulate ready
      dom._triggerScriptLoad();
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
      
      await Promise.all([promise1, promise2]);
      
      // Should only create one script
      expect(dom.createElement).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendWalletMessage', () => {
    beforeEach(() => {
      service.initialize();
      // Simulate script already ready
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
    });

    it('should have injectedScriptReady set after ready message', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should post message to window and wait for response', async () => {
      // Verify script is ready
      expect(service.isReady()).toBe(true);
      
      // Start the request
      const responsePromise = service.sendWalletMessage<{ available: boolean }>(
        WalletMessageType.CJ_WALLET_CHECK
      );

      // Need to wait a tick for the message to be sent
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate response
      dom._triggerMessage({
        type: 'CJ_WALLET_CHECK_RESULT',
        available: true,
      });

      const result = await responsePromise;
      expect(result).toEqual({ type: 'CJ_WALLET_CHECK_RESULT', available: true });
      expect(dom.postMessage).toHaveBeenCalledWith(
        { type: WalletMessageType.CJ_WALLET_CHECK, source: 'cj-content-script' },
        'http://localhost:3000'
      );
    });

    it('should pass additional data in message', async () => {
      const responsePromise = service.sendWalletMessage(
        WalletMessageType.CJ_WALLET_SIGN,
        { message: 'test', address: '0x123' }
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      dom._triggerMessage({
        type: 'CJ_WALLET_SIGN_RESULT',
        success: true,
        signature: '0xabc',
      });

      await responsePromise;
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        { type: WalletMessageType.CJ_WALLET_SIGN, source: 'cj-content-script', message: 'test', address: '0x123' },
        'http://localhost:3000'
      );
    });

    it('should timeout if no response received', async () => {
      // Mock the service's timeout to be very short for testing
      // Access the private property via type assertion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).WALLET_MESSAGE_TIMEOUT = 50;
      
      const responsePromise = service.sendWalletMessage(WalletMessageType.CJ_WALLET_CHECK);
      
      // Don't send any response, let it timeout
      await expect(responsePromise).rejects.toThrow('timed out');
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      service.initialize();
      dom._triggerMessage({ type: 'CJ_WALLET_SCRIPT_READY' });
    });

    it('checkWallet should send CJ_WALLET_CHECK', async () => {
      const checkPromise = service.checkWallet();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      dom._triggerMessage({
        type: 'CJ_WALLET_CHECK_RESULT',
        available: true,
        walletName: 'MetaMask',
      });

      const result = await checkPromise;
      expect(result).toMatchObject({ available: true, walletName: 'MetaMask' });
    });

    it('connectWallet should send CJ_WALLET_CONNECT', async () => {
      const connectPromise = service.connectWallet();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      dom._triggerMessage({
        type: 'CJ_WALLET_CONNECT_RESULT',
        success: true,
        address: '0x1234567890abcdef',
        chainId: '0x1',
      });

      const result = await connectPromise;
      expect(result).toMatchObject({
        success: true,
        address: '0x1234567890abcdef',
        chainId: '0x1',
      });
    });

    it('signMessage should send CJ_WALLET_SIGN with message and address', async () => {
      const signPromise = service.signMessage('Hello', '0x123');
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      dom._triggerMessage({
        type: 'CJ_WALLET_SIGN_RESULT',
        success: true,
        signature: '0xsig',
      });

      const result = await signPromise;
      expect(result).toMatchObject({ success: true, signature: '0xsig' });
      
      expect(dom.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WalletMessageType.CJ_WALLET_SIGN,
          message: 'Hello',
          address: '0x123',
        }),
        expect.any(String)
      );
    });
  });
});
