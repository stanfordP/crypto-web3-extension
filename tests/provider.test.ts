/**
 * Extended coverage tests for CryptoJournalProvider
 *
 * Targets uncovered lines/branches in src/scripts/provider.ts:
 * - Lines 158-159: timeout in sendMessageToBackground
 * - Line 207: methodToMessageType for eth_sign / eth_signTypedData variants
 * - Line 211: methodToMessageType for wallet_addEthereumChain (ADD_CHAIN)
 * - Lines 224-293: handleBackgroundMessage and all event handlers
 */

import { CryptoJournalProvider, createProvider } from '../src/scripts/provider';

// Capture the onMessage listener registered during construction
function createProviderAndCaptureListener(): {
  provider: CryptoJournalProvider;
  backgroundListener: (message: unknown, sender: unknown, sendResponse: jest.Mock) => boolean;
} {
  const addListenerMock = chrome.runtime.onMessage.addListener as jest.Mock;
  addListenerMock.mockClear();

  const provider = createProvider();

  // The constructor calls setupMessageListener which registers a listener
  const backgroundListener = addListenerMock.mock.calls[0][0];
  return { provider, backgroundListener };
}

describe('CryptoJournalProvider - extended coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  // =========================================================================
  // 1. sendMessageToBackground timeout path (lines 158-159)
  // =========================================================================
  describe('sendMessageToBackground timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should reject with -32603 error after 60 seconds', async () => {
      // Mock sendMessage to never invoke the callback (simulating no response)
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (_message: unknown, _callback: unknown) => {
          // Intentionally do nothing - no callback invocation
        }
      );

      const provider = createProvider();
      const requestPromise = provider.request({ method: 'eth_requestAccounts' });

      // Advance past the 60s timeout
      jest.advanceTimersByTime(60000);

      await expect(requestPromise).rejects.toThrow('Request timeout');
    });

    it('should produce an error with code -32603 on timeout', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (_message: unknown, _callback: unknown) => {
          // No callback - simulate background never responding
        }
      );

      const provider = createProvider();
      const requestPromise = provider.request({ method: 'eth_requestAccounts' });

      jest.advanceTimersByTime(60000);

      try {
        await requestPromise;
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: unknown) {
        const rpcError = error as { code: number; message: string };
        expect(rpcError.code).toBe(-32603);
        expect(rpcError.message).toBe('Request timeout');
      }
    });

    it('should not reject if response arrives before timeout', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (_message: unknown, callback: (response: { success: boolean; data: string[] }) => void) => {
          // Respond after 100ms (before the 60s timeout)
          setTimeout(() => {
            callback({ success: true, data: ['0xabc'] });
          }, 100);
        }
      );

      const provider = createProvider();
      const requestPromise = provider.request({ method: 'eth_requestAccounts' });

      // Advance past the callback delay but not past the timeout
      jest.advanceTimersByTime(200);

      const result = await requestPromise;
      expect(result).toEqual(['0xabc']);
    });
  });

  // =========================================================================
  // 2. methodToMessageType - eth_sign, signTypedData, ADD_CHAIN, SEND_TX
  // =========================================================================
  describe('methodToMessageType - uncovered methods', () => {
    beforeEach(() => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (message: { type: string }, callback: (response: { success: boolean; data: string }) => void) => {
          if (callback) callback({ success: true, data: '0xresult' });
        }
      );
    });

    it('should map eth_sign to SIGN_MESSAGE', async () => {
      const provider = createProvider();
      await provider.request({
        method: 'eth_sign',
        params: ['0xaddress', '0xdata'],
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SIGN_MESSAGE' }),
        expect.any(Function)
      );
    });

    it('should map eth_signTypedData to SIGN_MESSAGE', async () => {
      const provider = createProvider();
      await provider.request({
        method: 'eth_signTypedData',
        params: ['0xaddress', { types: {} }],
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SIGN_MESSAGE' }),
        expect.any(Function)
      );
    });

    it('should map eth_signTypedData_v4 to SIGN_MESSAGE', async () => {
      const provider = createProvider();
      await provider.request({
        method: 'eth_signTypedData_v4',
        params: ['0xaddress', '{}'],
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SIGN_MESSAGE' }),
        expect.any(Function)
      );
    });

    it('should map eth_sendTransaction to SEND_TRANSACTION', async () => {
      const provider = createProvider();
      await provider.request({
        method: 'eth_sendTransaction',
        params: [{ to: '0xrecipient', value: '0x0' }],
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SEND_TRANSACTION' }),
        expect.any(Function)
      );
    });

    it('should map wallet_addEthereumChain to ADD_CHAIN', async () => {
      const provider = createProvider();
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: '0x89', chainName: 'Polygon' }],
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ADD_CHAIN' }),
        expect.any(Function)
      );
    });

    it('should map an unrecognized method to RPC_REQUEST', async () => {
      const provider = createProvider();
      await provider.request({
        method: 'eth_blockNumber',
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RPC_REQUEST' }),
        expect.any(Function)
      );
    });
  });

  // =========================================================================
  // 3. handleBackgroundMessage - all event types (lines 224-293)
  // =========================================================================
  describe('handleBackgroundMessage - ACCOUNTS_CHANGED', () => {
    it('should update selectedAddress and emit accountsChanged when address changes', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      const listener = jest.fn();
      provider.on('accountsChanged', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'ACCOUNTS_CHANGED', payload: ['0xNewAddress'] },
        {},
        sendResponse
      );

      expect(provider.selectedAddress).toBe('0xNewAddress');
      expect(listener).toHaveBeenCalledWith(['0xNewAddress']);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should NOT emit accountsChanged when address is the same', async () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      await provider.initialize({ address: '0xSameAddr', chainId: '0x1' });

      const listener = jest.fn();
      provider.on('accountsChanged', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'ACCOUNTS_CHANGED', payload: ['0xSameAddr'] },
        {},
        sendResponse
      );

      expect(listener).not.toHaveBeenCalled();
      expect(provider.selectedAddress).toBe('0xSameAddr');
    });

    it('should set selectedAddress to null when accounts array is empty', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      provider.selectedAddress = '0xOldAddress';

      const listener = jest.fn();
      provider.on('accountsChanged', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'ACCOUNTS_CHANGED', payload: [] },
        {},
        sendResponse
      );

      expect(provider.selectedAddress).toBeNull();
      expect(listener).toHaveBeenCalledWith([]);
    });
  });

  describe('handleBackgroundMessage - CHAIN_CHANGED', () => {
    it('should update chainId and emit chainChanged when chain changes', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      const listener = jest.fn();
      provider.on('chainChanged', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'CHAIN_CHANGED', payload: '0x89' },
        {},
        sendResponse
      );

      expect(provider.chainId).toBe('0x89');
      expect(listener).toHaveBeenCalledWith('0x89');
    });

    it('should NOT emit chainChanged when chainId is the same', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      // Default chainId is '0x1'

      const listener = jest.fn();
      provider.on('chainChanged', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'CHAIN_CHANGED', payload: '0x1' },
        {},
        sendResponse
      );

      expect(listener).not.toHaveBeenCalled();
      expect(provider.chainId).toBe('0x1');
    });
  });

  describe('handleBackgroundMessage - CONNECT', () => {
    it('should update chainId and emit connect event', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      const listener = jest.fn();
      provider.on('connect', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'CONNECT', payload: { chainId: '0xa86a' } },
        {},
        sendResponse
      );

      expect(provider.chainId).toBe('0xa86a');
      expect(listener).toHaveBeenCalledWith({ chainId: '0xa86a' });
    });
  });

  describe('handleBackgroundMessage - DISCONNECT_EVENT', () => {
    it('should null selectedAddress and emit disconnect with error 4900', async () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      await provider.initialize({ address: '0xConnected', chainId: '0x1' });

      const listener = jest.fn();
      provider.on('disconnect', listener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'DISCONNECT_EVENT' },
        {},
        sendResponse
      );

      expect(provider.selectedAddress).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);

      const emittedError = listener.mock.calls[0][0] as { code: number; message: string };
      expect(emittedError.code).toBe(4900);
      expect(emittedError.message).toBe('Disconnected');
    });
  });

  describe('handleBackgroundMessage - unknown type', () => {
    it('should silently ignore unknown message types', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      const originalAddress = provider.selectedAddress;
      const originalChainId = provider.chainId;

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'SOME_UNKNOWN_TYPE', payload: 'whatever' },
        {},
        sendResponse
      );

      // State should not change
      expect(provider.selectedAddress).toBe(originalAddress);
      expect(provider.chainId).toBe(originalChainId);
      // sendResponse should still be called (setupMessageListener always calls it)
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  // =========================================================================
  // 4. emit error handling when a listener throws
  // =========================================================================
  describe('emit error handling via background messages', () => {
    it('should catch listener errors and continue emitting to other listeners', () => {
      const { provider, backgroundListener } = createProviderAndCaptureListener();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const throwingListener = jest.fn(() => {
        throw new Error('Listener blew up');
      });
      const normalListener = jest.fn();

      provider.on('chainChanged', throwingListener);
      provider.on('chainChanged', normalListener);

      const sendResponse = jest.fn();
      backgroundListener(
        { type: 'CHAIN_CHANGED', payload: '0x38' },
        {},
        sendResponse
      );

      expect(throwingListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalledWith('0x38');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('chainChanged'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // 5. chrome.runtime.lastError path in sendMessageToBackground
  // =========================================================================
  describe('sendMessageToBackground - chrome.runtime.lastError', () => {
    it('should reject with extension error message from lastError', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (_message: unknown, callback: (response: undefined) => void) => {
          // Simulate Chrome setting lastError before invoking callback
          (chrome.runtime as { lastError: { message: string } | null }).lastError = {
            message: 'Could not establish connection',
          };
          callback(undefined as unknown as undefined);
        }
      );

      const provider = createProvider();

      try {
        await provider.request({ method: 'eth_requestAccounts' });
        expect(true).toBe(false); // should not reach
      } catch (error: unknown) {
        const rpcError = error as { code: number; message: string };
        expect(rpcError.code).toBe(-32603);
        expect(rpcError.message).toContain('Could not establish connection');
        expect(rpcError.message).toContain('Extension error');
      }
    });
  });

  // =========================================================================
  // 6. Response with success: false in sendMessageToBackground
  // =========================================================================
  describe('sendMessageToBackground - failed response', () => {
    it('should reject with the error message from the response', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (_message: unknown, callback: (response: { success: boolean; error: string }) => void) => {
          callback({ success: false, error: 'Wallet not connected' });
        }
      );

      const provider = createProvider();

      try {
        await provider.request({ method: 'eth_sendTransaction', params: [{}] });
        expect(true).toBe(false);
      } catch (error: unknown) {
        const rpcError = error as { code: number; message: string };
        expect(rpcError.code).toBe(-32603);
        expect(rpcError.message).toBe('Wallet not connected');
      }
    });

    it('should use "Unknown error" when response has no error message', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
        (_message: unknown, callback: (response: { success: boolean }) => void) => {
          callback({ success: false });
        }
      );

      const provider = createProvider();

      try {
        await provider.request({ method: 'eth_sendTransaction', params: [{}] });
        expect(true).toBe(false);
      } catch (error: unknown) {
        const rpcError = error as { code: number; message: string };
        expect(rpcError.code).toBe(-32603);
        expect(rpcError.message).toBe('Unknown error');
      }
    });
  });

  // =========================================================================
  // 7. setupMessageListener returns true to keep channel open
  // =========================================================================
  describe('setupMessageListener', () => {
    it('should return true from the onMessage listener to keep the channel open', () => {
      const { backgroundListener } = createProviderAndCaptureListener();
      const sendResponse = jest.fn();

      const returnValue = backgroundListener(
        { type: 'CONNECT', payload: { chainId: '0x1' } },
        {},
        sendResponse
      );

      expect(returnValue).toBe(true);
    });
  });
});
