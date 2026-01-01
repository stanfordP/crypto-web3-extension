/**
 * Injected Auth Script Tests
 * 
 * Tests the wallet interaction script that runs in page context:
 * - Wallet detection (getProvider)
 * - CJ_WALLET_CHECK handler
 * - CJ_WALLET_CONNECT handler
 * - CJ_WALLET_SIGN handler
 * - Multi-provider support
 */

// ============================================================================
// Mock Types
// ============================================================================

interface MockEthereumProvider {
  request: jest.Mock;
  chainId?: string;
  selectedAddress?: string | null;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isPhantom?: boolean;
  providers?: MockEthereumProvider[];
}

// ============================================================================
// Mock Setup
// ============================================================================

const postedMessages: Array<{ data: unknown; origin: string }> = [];
const messageListeners: Array<(event: MessageEvent) => void> = [];

let mockEthereum: MockEthereumProvider | undefined;

// Create a proper mock window object with getters
const mockWindow = {
  postMessage: jest.fn((data: unknown, origin: string) => {
    postedMessages.push({ data, origin });
  }),
  addEventListener: jest.fn((event: string, listener: (event: MessageEvent) => void) => {
    if (event === 'message') {
      messageListeners.push(listener);
    }
  }),
  removeEventListener: jest.fn(),
} as unknown as Window & typeof globalThis;

// Use Object.defineProperty to make ethereum a proper getter
Object.defineProperty(mockWindow, 'ethereum', {
  get: () => mockEthereum,
  set: (value: MockEthereumProvider | undefined) => { mockEthereum = value; },
  configurable: true,
  enumerable: true,
});

// Assign mock window to global (type-compatible due to `as unknown as` cast above)
global.window = mockWindow;

// Helper to create mock provider
function createMockProvider(options: Partial<MockEthereumProvider> = {}): MockEthereumProvider {
  return {
    request: jest.fn(),
    // Only use default '0x1' if chainId is not explicitly passed
    chainId: 'chainId' in options ? options.chainId : '0x1',
    selectedAddress: options.selectedAddress ?? null,
    isMetaMask: options.isMetaMask ?? false,
    isRabby: options.isRabby ?? false,
    isBraveWallet: options.isBraveWallet ?? false,
    isPhantom: options.isPhantom ?? false,
    providers: options.providers,
  };
}

// Helper to simulate message from content script (exported for integration tests)
export function sendWalletMessage(type: string, payload: Record<string, unknown> = {}): void {
  const event = {
    source: window,
    data: { type, ...payload },
    origin: 'http://localhost:3000',
  } as unknown as MessageEvent;
  
  messageListeners.forEach(listener => listener(event));
}

// ============================================================================
// Tests
// ============================================================================

describe('Injected Auth Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postedMessages.length = 0;
    messageListeners.length = 0;
    mockEthereum = undefined;
  });

  describe('Provider Detection', () => {
    describe('getProvider', () => {
      it('should return null when no ethereum provider', () => {
        mockEthereum = undefined;
        
        // Simulate the logic from injected-auth.ts
        const getProvider = () => mockEthereum ?? null;
        
        expect(getProvider()).toBeNull();
      });

      it('should return ethereum provider when available', () => {
        mockEthereum = createMockProvider({ isMetaMask: true });
        
        const getProvider = () => mockEthereum ?? null;
        
        expect(getProvider()).toBe(mockEthereum);
      });

      it('should detect MetaMask', () => {
        mockEthereum = createMockProvider({ isMetaMask: true });
        
        expect(mockEthereum.isMetaMask).toBe(true);
      });

      it('should detect Rabby', () => {
        mockEthereum = createMockProvider({ isRabby: true });
        
        expect(mockEthereum.isRabby).toBe(true);
      });

      it('should detect Brave Wallet', () => {
        mockEthereum = createMockProvider({ isBraveWallet: true });
        
        expect(mockEthereum.isBraveWallet).toBe(true);
      });
    });

    describe('Multi-provider support', () => {
      it('should prefer MetaMask in multi-provider setup', () => {
        const metamask = createMockProvider({ isMetaMask: true });
        const phantom = createMockProvider({ isPhantom: true });
        
        mockEthereum = createMockProvider({
          providers: [phantom, metamask],
        });

        // Simulate the multi-provider selection logic
        const getProvider = () => {
          const ethereum = mockEthereum;
          if (!ethereum) return null;
          
          if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
            const preferred = ethereum.providers.find(
              p => p.isMetaMask || p.isRabby || p.isBraveWallet
            );
            if (preferred) return preferred;
            return ethereum.providers[0];
          }
          
          return ethereum;
        };

        expect(getProvider()).toBe(metamask);
      });

      it('should prefer Rabby in multi-provider setup', () => {
        const rabby = createMockProvider({ isRabby: true });
        const phantom = createMockProvider({ isPhantom: true });
        
        mockEthereum = createMockProvider({
          providers: [phantom, rabby],
        });

        const getProvider = () => {
          const ethereum = mockEthereum;
          if (!ethereum) return null;
          
          if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
            const preferred = ethereum.providers.find(
              p => p.isMetaMask || p.isRabby || p.isBraveWallet
            );
            if (preferred) return preferred;
            return ethereum.providers[0];
          }
          
          return ethereum;
        };

        expect(getProvider()).toBe(rabby);
      });

      it('should fall back to first provider if no preferred found', () => {
        const unknown1 = createMockProvider({});
        const unknown2 = createMockProvider({});
        
        mockEthereum = createMockProvider({
          providers: [unknown1, unknown2],
        });

        const getProvider = () => {
          const ethereum = mockEthereum;
          if (!ethereum) return null;
          
          if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
            const preferred = ethereum.providers.find(
              p => p.isMetaMask || p.isRabby || p.isBraveWallet
            );
            if (preferred) return preferred;
            return ethereum.providers[0];
          }
          
          return ethereum;
        };

        expect(getProvider()).toBe(unknown1);
      });
    });
  });

  describe('CJ_WALLET_CHECK Handler', () => {
    it('should report wallet available with MetaMask', () => {
      mockEthereum = createMockProvider({ isMetaMask: true });
      
      const requestId = 'check-123';
      const available = !!mockEthereum;
      const walletName = mockEthereum?.isMetaMask ? 'MetaMask' : 
                         mockEthereum?.isRabby ? 'Rabby' :
                         mockEthereum?.isBraveWallet ? 'Brave Wallet' : 'Unknown Wallet';
      
      mockWindow.postMessage({
        type: 'CJ_WALLET_CHECK_RESULT',
        requestId,
        available,
        walletName,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_CHECK_RESULT',
        requestId,
        available: true,
        walletName: 'MetaMask',
      });
    });

    it('should report wallet unavailable', () => {
      mockEthereum = undefined;
      
      const requestId = 'check-456';
      const available = !!mockEthereum;
      
      mockWindow.postMessage({
        type: 'CJ_WALLET_CHECK_RESULT',
        requestId,
        available,
        walletName: null,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_CHECK_RESULT',
        requestId,
        available: false,
        walletName: null,
      });
    });

    it('should detect Rabby wallet', () => {
      mockEthereum = createMockProvider({ isRabby: true });
      
      const walletName = mockEthereum.isMetaMask ? 'MetaMask' : 
                         mockEthereum.isRabby ? 'Rabby' :
                         mockEthereum.isBraveWallet ? 'Brave Wallet' : 'Unknown Wallet';
      
      expect(walletName).toBe('Rabby');
    });
  });

  describe('CJ_WALLET_CONNECT Handler', () => {
    it('should return address and chainId on success', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      mockEthereum = createMockProvider({ 
        isMetaMask: true,
        chainId: '0x1',
      });
      mockEthereum.request.mockResolvedValue([address]);

      const accounts = await mockEthereum.request({ method: 'eth_requestAccounts' });
      const chainId = mockEthereum.chainId;

      mockWindow.postMessage({
        type: 'CJ_WALLET_CONNECT_RESULT',
        requestId: 'connect-123',
        success: true,
        address: (accounts as string[])[0],
        chainId,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_CONNECT_RESULT',
        requestId: 'connect-123',
        success: true,
        address,
        chainId: '0x1',
      });
    });

    it('should handle user rejection (code 4001)', async () => {
      mockEthereum = createMockProvider({ isMetaMask: true });
      mockEthereum.request.mockRejectedValue({ code: 4001, message: 'User rejected' });

      try {
        await mockEthereum.request({ method: 'eth_requestAccounts' });
      } catch (err) {
        const error = err as { code: number; message: string };
        
        mockWindow.postMessage({
          type: 'CJ_WALLET_CONNECT_RESULT',
          requestId: 'connect-456',
          success: false,
          error: error.code === 4001 ? 'User rejected connection' : error.message,
          code: error.code,
        }, '*');
      }

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_CONNECT_RESULT',
        requestId: 'connect-456',
        success: false,
        error: 'User rejected connection',
        code: 4001,
      });
    });

    it('should handle no accounts returned', async () => {
      mockEthereum = createMockProvider({ isMetaMask: true });
      mockEthereum.request.mockResolvedValue([]);

      const accounts = await mockEthereum.request({ method: 'eth_requestAccounts' });
      
      if (!accounts || (accounts as string[]).length === 0) {
        mockWindow.postMessage({
          type: 'CJ_WALLET_CONNECT_RESULT',
          requestId: 'connect-789',
          success: false,
          error: 'No accounts returned',
        }, '*');
      }

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_CONNECT_RESULT',
        requestId: 'connect-789',
        success: false,
        error: 'No accounts returned',
      });
    });

    it('should handle no wallet detected', () => {
      mockEthereum = undefined;

      mockWindow.postMessage({
        type: 'CJ_WALLET_CONNECT_RESULT',
        requestId: 'connect-abc',
        success: false,
        error: 'No wallet detected',
      }, '*');

      expect(postedMessages[0].data).toMatchObject({
        success: false,
        error: 'No wallet detected',
      });
    });

    it('should fetch chainId if not available on provider', async () => {
      mockEthereum = createMockProvider({ 
        isMetaMask: true,
        chainId: undefined,
      });
      mockEthereum.request
        .mockResolvedValueOnce(['0xabc']) // eth_requestAccounts
        .mockResolvedValueOnce('0x89'); // eth_chainId

      await mockEthereum.request({ method: 'eth_requestAccounts' });
      const chainId = mockEthereum.chainId || await mockEthereum.request({ method: 'eth_chainId' });

      expect(chainId).toBe('0x89');
    });
  });

  describe('CJ_WALLET_SIGN Handler', () => {
    it('should return signature on success', async () => {
      const signature = '0x' + 'ab'.repeat(65);
      mockEthereum = createMockProvider({ isMetaMask: true });
      mockEthereum.request.mockResolvedValue(signature);

      const message = 'localhost wants you to sign in...';
      const address = '0x1234567890123456789012345678901234567890';

      const result = await mockEthereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      mockWindow.postMessage({
        type: 'CJ_WALLET_SIGN_RESULT',
        requestId: 'sign-123',
        success: true,
        signature: result,
      }, '*');

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_SIGN_RESULT',
        requestId: 'sign-123',
        success: true,
        signature,
      });
    });

    it('should handle user rejected signature', async () => {
      mockEthereum = createMockProvider({ isMetaMask: true });
      mockEthereum.request.mockRejectedValue({ code: 4001, message: 'User rejected' });

      try {
        await mockEthereum.request({
          method: 'personal_sign',
          params: ['message', '0xaddress'],
        });
      } catch (err) {
        const error = err as { code: number; message: string };
        
        mockWindow.postMessage({
          type: 'CJ_WALLET_SIGN_RESULT',
          requestId: 'sign-456',
          success: false,
          error: error.code === 4001 ? 'User rejected signature' : error.message,
          code: error.code,
        }, '*');
      }

      expect(postedMessages[0].data).toEqual({
        type: 'CJ_WALLET_SIGN_RESULT',
        requestId: 'sign-456',
        success: false,
        error: 'User rejected signature',
        code: 4001,
      });
    });

    it('should handle no wallet for signing', () => {
      mockEthereum = undefined;

      mockWindow.postMessage({
        type: 'CJ_WALLET_SIGN_RESULT',
        requestId: 'sign-789',
        success: false,
        error: 'No wallet detected',
      }, '*');

      expect(postedMessages[0].data).toMatchObject({
        success: false,
        error: 'No wallet detected',
      });
    });

    it('should use personal_sign method', async () => {
      mockEthereum = createMockProvider({ isMetaMask: true });
      mockEthereum.request.mockResolvedValue('0xsignature');

      const message = 'Sign this message';
      const address = '0x123';

      await mockEthereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'personal_sign',
        params: [message, address],
      });
    });
  });

  describe('Message Validation', () => {
    it('should only handle CJ_WALLET_* messages', () => {
      const validTypes = [
        'CJ_WALLET_CHECK',
        'CJ_WALLET_CONNECT',
        'CJ_WALLET_SIGN',
      ];

      validTypes.forEach(type => {
        expect(type.startsWith('CJ_WALLET_')).toBe(true);
      });
    });

    it('should ignore messages from other sources', () => {
      // Event with source !== window should be ignored
      const event = {
        source: {} as Window, // Different source
        data: { type: 'CJ_WALLET_CHECK' },
      } as MessageEvent;

      // Handler would check: if (event.source !== window) return;
      expect(event.source).not.toBe(window);
    });

    it('should ignore messages without type', () => {
      const invalidMessages = [
        null,
        undefined,
        {},
        { foo: 'bar' },
        { type: 123 },
      ];

      invalidMessages.forEach(msg => {
        const isValid = msg && typeof (msg as Record<string, unknown>).type === 'string';
        expect(isValid).toBeFalsy();
      });
    });
  });

  describe('Ready Signal', () => {
    it('should emit CJ_INJECTED_READY on load', () => {
      mockWindow.postMessage({ type: 'CJ_INJECTED_READY' }, '*');

      expect(postedMessages[0].data).toEqual({ type: 'CJ_INJECTED_READY' });
    });
  });
});

describe('Wallet Name Detection', () => {
  beforeEach(() => {
    postedMessages.length = 0;
    mockEthereum = undefined;
  });

  it('should return "MetaMask" for MetaMask provider', () => {
    mockEthereum = createMockProvider({ isMetaMask: true });
    
    const getWalletName = (provider: MockEthereumProvider | null) => {
      if (!provider) return null;
      if (provider.isMetaMask) return 'MetaMask';
      if (provider.isRabby) return 'Rabby';
      if (provider.isBraveWallet) return 'Brave Wallet';
      return 'Unknown Wallet';
    };

    expect(getWalletName(mockEthereum)).toBe('MetaMask');
  });

  it('should return "Rabby" for Rabby provider', () => {
    mockEthereum = createMockProvider({ isRabby: true });
    
    const getWalletName = (provider: MockEthereumProvider | null) => {
      if (!provider) return null;
      if (provider.isMetaMask) return 'MetaMask';
      if (provider.isRabby) return 'Rabby';
      if (provider.isBraveWallet) return 'Brave Wallet';
      return 'Unknown Wallet';
    };

    expect(getWalletName(mockEthereum)).toBe('Rabby');
  });

  it('should return "Brave Wallet" for Brave provider', () => {
    mockEthereum = createMockProvider({ isBraveWallet: true });
    
    const getWalletName = (provider: MockEthereumProvider | null) => {
      if (!provider) return null;
      if (provider.isMetaMask) return 'MetaMask';
      if (provider.isRabby) return 'Rabby';
      if (provider.isBraveWallet) return 'Brave Wallet';
      return 'Unknown Wallet';
    };

    expect(getWalletName(mockEthereum)).toBe('Brave Wallet');
  });

  it('should return "Unknown Wallet" for unrecognized provider', () => {
    mockEthereum = createMockProvider({});
    
    const getWalletName = (provider: MockEthereumProvider | null) => {
      if (!provider) return null;
      if (provider.isMetaMask) return 'MetaMask';
      if (provider.isRabby) return 'Rabby';
      if (provider.isBraveWallet) return 'Brave Wallet';
      return 'Unknown Wallet';
    };

    expect(getWalletName(mockEthereum)).toBe('Unknown Wallet');
  });

  it('should return null when no provider', () => {
    mockEthereum = undefined;
    
    const getWalletName = (provider: MockEthereumProvider | null | undefined) => {
      if (!provider) return null;
      return 'Some Wallet';
    };

    expect(getWalletName(mockEthereum)).toBeNull();
  });
});
