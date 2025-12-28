/**
 * Unit Tests for CryptoJournalProvider
 *
 * Tests the EIP-1193 provider implementation
 */

import { CryptoJournalProvider, createProvider } from '../provider';

describe('CryptoJournalProvider', () => {
  let provider: CryptoJournalProvider;

  beforeEach(() => {
    provider = createProvider();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create a provider instance', () => {
      expect(provider).toBeInstanceOf(CryptoJournalProvider);
    });

    it('should have correct identification flags', () => {
      expect(provider.isCryptoJournal).toBe(true);
      expect(provider.isMetaMask).toBe(false);
    });

    it('should default to Ethereum mainnet', () => {
      expect(provider.chainId).toBe('0x1');
    });

    it('should start with no selected address', () => {
      expect(provider.selectedAddress).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return false when no address is selected', () => {
      expect(provider.isConnected()).toBe(false);
    });

    it('should return true when address is selected', async () => {
      await provider.initialize({
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      });
      expect(provider.isConnected()).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should set address and chainId', async () => {
      await provider.initialize({
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        chainId: '0x89',
      });

      expect(provider.selectedAddress).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(provider.chainId).toBe('0x89');
    });

    it('should handle null address', async () => {
      await provider.initialize({
        address: null,
        chainId: '0x1',
      });

      expect(provider.selectedAddress).toBeNull();
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('request - local methods', () => {
    it('should return chainId for eth_chainId', async () => {
      provider.chainId = '0x89';
      const result = await provider.request({ method: 'eth_chainId' });
      expect(result).toBe('0x89');
    });

    it('should return empty array for eth_accounts when not connected', async () => {
      const result = await provider.request({ method: 'eth_accounts' });
      expect(result).toEqual([]);
    });

    it('should return address array for eth_accounts when connected', async () => {
      await provider.initialize({
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
      });
      const result = await provider.request({ method: 'eth_accounts' });
      expect(result).toEqual(['0x1234567890123456789012345678901234567890']);
    });

    it('should return net_version as decimal', async () => {
      provider.chainId = '0x89'; // 137 in decimal (Polygon)
      const result = await provider.request({ method: 'net_version' });
      expect(result).toBe('137');
    });
  });

  describe('event emitter', () => {
    it('should add event listener', () => {
      const listener = jest.fn();
      provider.on('accountsChanged', listener);

      // Trigger event manually via private method
      (provider as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(
        'accountsChanged',
        ['0x1234']
      );

      expect(listener).toHaveBeenCalledWith(['0x1234']);
    });

    it('should remove event listener', () => {
      const listener = jest.fn();
      provider.on('accountsChanged', listener);
      provider.removeListener('accountsChanged', listener);

      (provider as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(
        'accountsChanged',
        ['0x1234']
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      provider.on('chainChanged', listener1);
      provider.on('chainChanged', listener2);

      (provider as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(
        'chainChanged',
        '0x89'
      );

      expect(listener1).toHaveBeenCalledWith('0x89');
      expect(listener2).toHaveBeenCalledWith('0x89');
    });

    it('should not throw if listener throws', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      provider.on('connect', errorListener);
      provider.on('connect', normalListener);

      expect(() => {
        (provider as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit(
          'connect',
          { chainId: '0x1' }
        );
      }).not.toThrow();

      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('request - background communication', () => {
    beforeEach(() => {
      // Setup mock response
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        if (callback) {
          callback({ success: true, data: ['0xtest'] });
        }
      });
    });

    it('should send eth_requestAccounts to background', async () => {
      const result = await provider.request({ method: 'eth_requestAccounts' });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REQUEST_ACCOUNTS',
          payload: expect.objectContaining({ method: 'eth_requestAccounts' }),
        }),
        expect.any(Function)
      );
      expect(result).toEqual(['0xtest']);
    });

    it('should send personal_sign to background', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        if (callback) {
          callback({ success: true, data: '0xsignature' });
        }
      });

      const result = await provider.request({
        method: 'personal_sign',
        params: ['0xmessage', '0xaddress'],
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SIGN_MESSAGE',
          payload: expect.objectContaining({
            method: 'personal_sign',
            params: ['0xmessage', '0xaddress'],
          }),
        }),
        expect.any(Function)
      );
      expect(result).toBe('0xsignature');
    });

    it('should handle background error response', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        if (callback) {
          callback({ success: false, error: 'User rejected' });
        }
      });

      await expect(
        provider.request({ method: 'eth_requestAccounts' })
      ).rejects.toThrow('User rejected');
    });

    it('should handle chrome runtime error', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        chrome.runtime.lastError = { message: 'Extension context invalidated' };
        if (callback) {
          callback(undefined);
        }
      });

      await expect(
        provider.request({ method: 'eth_requestAccounts' })
      ).rejects.toThrow('Extension context invalidated');
    });

    it('should deduplicate concurrent identical requests', async () => {
      let callCount = 0;
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        callCount++;
        setTimeout(() => {
          if (callback) {
            callback({ success: true, data: ['0xtest'] });
          }
        }, 10);
      });

      // Send two identical requests concurrently
      const [result1, result2] = await Promise.all([
        provider.request({ method: 'eth_requestAccounts' }),
        provider.request({ method: 'eth_requestAccounts' }),
      ]);

      expect(result1).toEqual(['0xtest']);
      expect(result2).toEqual(['0xtest']);
      // Should only have called sendMessage once due to deduplication
      expect(callCount).toBe(1);
    });
  });

  describe('methodToMessageType', () => {
    it('should map eth_requestAccounts to REQUEST_ACCOUNTS', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        expect(message.type).toBe('REQUEST_ACCOUNTS');
        if (callback) callback({ success: true, data: [] });
      });

      await provider.request({ method: 'eth_requestAccounts' });
    });

    it('should map personal_sign to SIGN_MESSAGE', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        expect(message.type).toBe('SIGN_MESSAGE');
        if (callback) callback({ success: true, data: '0x' });
      });

      await provider.request({ method: 'personal_sign', params: ['msg', 'addr'] });
    });

    it('should map wallet_switchEthereumChain to SWITCH_CHAIN', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        expect(message.type).toBe('SWITCH_CHAIN');
        if (callback) callback({ success: true, data: null });
      });

      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      });
    });

    it('should map unknown methods to RPC_REQUEST', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((message, callback) => {
        expect(message.type).toBe('RPC_REQUEST');
        if (callback) callback({ success: true, data: null });
      });

      await provider.request({ method: 'eth_getBalance', params: ['0xaddr', 'latest'] });
    });
  });
});

describe('createProvider', () => {
  it('should return a CryptoJournalProvider instance', () => {
    const provider = createProvider();
    expect(provider).toBeInstanceOf(CryptoJournalProvider);
  });

  it('should create independent instances', () => {
    const provider1 = createProvider();
    const provider2 = createProvider();

    provider1.chainId = '0x89';
    expect(provider2.chainId).toBe('0x1');
  });
});
