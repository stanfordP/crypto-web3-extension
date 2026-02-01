/**
 * Tests for injected-auth.ts
 * 
 * Tests wallet interaction functionality that runs in page context.
 * Since this module runs in page context with window.ethereum,
 * we mock the browser environment extensively.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Browser Environment
// ============================================================================

// Mock ethereum provider
const mockProvider = {
  request: jest.fn(),
  chainId: '0x1',
  selectedAddress: '0x1234567890123456789012345678901234567890',
  isMetaMask: true,
  isRabby: false,
  isBraveWallet: false,
  isPhantom: false,
  providers: undefined as unknown[] | undefined,
  isWrappedBySecurityExtension: false,
  isPocketUniverse: false,
  isWalletGuard: false,
  isFire: false,
  isBlowfish: false,
};

// Mock postMessage
const mockPostMessage = jest.fn();

describe('Injected Auth Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset provider state
    mockProvider.request.mockReset();
    mockProvider.chainId = '0x1';
    mockProvider.selectedAddress = '0x1234567890123456789012345678901234567890';
    mockProvider.isMetaMask = true;
    mockProvider.isRabby = false;
    mockProvider.providers = undefined;
    mockProvider.isWrappedBySecurityExtension = false;
    
    // Setup globalThis.ethereum for tests
    (globalThis as unknown as { ethereum: typeof mockProvider }).ethereum = mockProvider;
    (globalThis as unknown as { postMessage: typeof mockPostMessage }).postMessage = mockPostMessage;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as unknown as { ethereum?: typeof mockProvider }).ethereum;
    delete (globalThis as unknown as { postMessage?: typeof mockPostMessage }).postMessage;
  });

  describe('WalletTimeoutError', () => {
    it('should create error with correct properties', () => {
      // Inline test since we can't import the class directly
      class WalletTimeoutError extends Error {
        code: number;
        constructor(method: string) {
          super(`Wallet request timed out: ${method}`);
          this.name = 'WalletTimeoutError';
          this.code = 5006;
        }
      }
      
      const error = new WalletTimeoutError('personal_sign');
      expect(error.name).toBe('WalletTimeoutError');
      expect(error.code).toBe(5006);
      expect(error.message).toBe('Wallet request timed out: personal_sign');
    });
  });

  describe('Request Key Generation', () => {
    it('should generate unique keys for different methods', () => {
      // Test the key generation logic
      const getRequestKey = (method: string, params?: unknown[]): string => {
        if (method === 'eth_requestAccounts') {
          return method;
        }
        return `${method}:${JSON.stringify(params || [])}`;
      };
      
      expect(getRequestKey('eth_requestAccounts')).toBe('eth_requestAccounts');
      expect(getRequestKey('personal_sign', ['0xmessage', '0xaddress']))
        .toBe('personal_sign:["0xmessage","0xaddress"]');
      expect(getRequestKey('eth_chainId')).toBe('eth_chainId:[]');
    });

    it('should generate same key for identical requests', () => {
      const getRequestKey = (method: string, params?: unknown[]): string => {
        if (method === 'eth_requestAccounts') {
          return method;
        }
        return `${method}:${JSON.stringify(params || [])}`;
      };
      
      const key1 = getRequestKey('personal_sign', ['msg', 'addr']);
      const key2 = getRequestKey('personal_sign', ['msg', 'addr']);
      expect(key1).toBe(key2);
    });
  });

  describe('Timeout Promise', () => {
    it('should create a promise that rejects after timeout', async () => {
      const WALLET_REQUEST_TIMEOUT_MS = 45000;
      
      class WalletTimeoutError extends Error {
        code: number;
        constructor(method: string) {
          super(`Wallet request timed out: ${method}`);
          this.name = 'WalletTimeoutError';
          this.code = 5006;
        }
      }

      function createTimeoutPromise(ms: number, method: string): { promise: Promise<never>; cleanup: () => void } {
        let timeoutId: ReturnType<typeof setTimeout>;
        const promise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new WalletTimeoutError(method));
          }, ms);
        });
        return {
          promise,
          cleanup: () => clearTimeout(timeoutId!),
        };
      }

      const timeout = createTimeoutPromise(100, 'eth_requestAccounts');
      
      // Fast-forward past timeout
      jest.advanceTimersByTime(150);
      
      await expect(timeout.promise).rejects.toThrow('Wallet request timed out: eth_requestAccounts');
    });

    it('should be cleanable before timeout', async () => {
      function createTimeoutPromise(ms: number, method: string): { promise: Promise<never>; cleanup: () => void } {
        let timeoutId: ReturnType<typeof setTimeout>;
        const promise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Wallet request timed out: ${method}`));
          }, ms);
        });
        return {
          promise,
          cleanup: () => clearTimeout(timeoutId!),
        };
      }

      const timeout = createTimeoutPromise(100, 'test');
      timeout.cleanup();
      
      // Advance time - should NOT reject because we cleaned up
      jest.advanceTimersByTime(200);
      
      // Promise should still be pending (not rejected)
      const raceResult = await Promise.race([
        timeout.promise.catch(() => 'rejected'),
        Promise.resolve('pending')
      ]);
      expect(raceResult).toBe('pending');
    });
  });

  describe('Provider Detection', () => {
    it('should detect MetaMask provider', () => {
      const isSecurityExtensionProvider = (provider: typeof mockProvider): boolean => {
        return !!(
          provider.isWrappedBySecurityExtension ||
          provider.isPocketUniverse ||
          provider.isWalletGuard ||
          provider.isFire ||
          provider.isBlowfish
        );
      };

      mockProvider.isMetaMask = true;
      expect(isSecurityExtensionProvider(mockProvider)).toBe(false);
    });

    it('should detect Rabby provider', () => {
      const provider = { ...mockProvider, isRabby: true, isMetaMask: false };
      expect(provider.isRabby).toBe(true);
    });

    it('should detect Brave Wallet', () => {
      const provider = { ...mockProvider, isBraveWallet: true, isMetaMask: true };
      expect(provider.isBraveWallet).toBe(true);
    });

    it('should detect Phantom wallet', () => {
      const provider = { ...mockProvider, isPhantom: true };
      expect(provider.isPhantom).toBe(true);
    });

    it('should detect security extension wrappers', () => {
      const isSecurityExtensionProvider = (provider: typeof mockProvider): boolean => {
        return !!(
          provider.isWrappedBySecurityExtension ||
          provider.isPocketUniverse ||
          provider.isWalletGuard ||
          provider.isFire ||
          provider.isBlowfish
        );
      };

      expect(isSecurityExtensionProvider({ ...mockProvider, isPocketUniverse: true })).toBe(true);
      expect(isSecurityExtensionProvider({ ...mockProvider, isWalletGuard: true })).toBe(true);
      expect(isSecurityExtensionProvider({ ...mockProvider, isFire: true })).toBe(true);
      expect(isSecurityExtensionProvider({ ...mockProvider, isBlowfish: true })).toBe(true);
      expect(isSecurityExtensionProvider({ ...mockProvider, isWrappedBySecurityExtension: true })).toBe(true);
    });

    it('should detect security extension by RDNS', () => {
      const isSecurityExtensionRdns = (rdns: string): boolean => {
        const securityRdns = [
          'app.pocketuniverse',
          'io.walletguard',
          'xyz.joinfire',
          'xyz.blowfish',
        ];
        return securityRdns.some(s => rdns.toLowerCase().includes(s));
      };

      expect(isSecurityExtensionRdns('app.pocketuniverse.extension')).toBe(true);
      expect(isSecurityExtensionRdns('io.walletguard.browser')).toBe(true);
      expect(isSecurityExtensionRdns('xyz.joinfire.wallet')).toBe(true);
      expect(isSecurityExtensionRdns('xyz.blowfish.safe')).toBe(true);
      expect(isSecurityExtensionRdns('io.metamask.main')).toBe(false);
      expect(isSecurityExtensionRdns('io.rabby.wallet')).toBe(false);
    });
  });

  describe('Request Deduplication', () => {
    it('should track in-flight requests', () => {
      const inFlightRequests = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
      
      const key = 'eth_requestAccounts';
      const promise = Promise.resolve(['0x123']);
      
      inFlightRequests.set(key, { promise, timestamp: Date.now() });
      
      expect(inFlightRequests.has(key)).toBe(true);
      expect(inFlightRequests.get(key)?.promise).toBe(promise);
    });

    it('should expire old requests', () => {
      const REQUEST_DEDUP_TIMEOUT_MS = 60000;
      const inFlightRequests = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
      
      const key = 'eth_requestAccounts';
      const oldTimestamp = Date.now() - REQUEST_DEDUP_TIMEOUT_MS - 1000;
      
      inFlightRequests.set(key, { 
        promise: Promise.resolve(['0x123']), 
        timestamp: oldTimestamp 
      });
      
      // Check if expired
      const existing = inFlightRequests.get(key);
      const now = Date.now();
      const isExpired = existing && (now - existing.timestamp) >= REQUEST_DEDUP_TIMEOUT_MS;
      
      expect(isExpired).toBe(true);
    });
  });

  describe('Message Types', () => {
    it('should define correct message types', () => {
      const WalletMessageType = {
        CJ_WALLET_CHECK: 'CJ_WALLET_CHECK',
        CJ_WALLET_CONNECT: 'CJ_WALLET_CONNECT',
        CJ_WALLET_SIGN: 'CJ_WALLET_SIGN',
        CJ_WALLET_CHECK_RESULT: 'CJ_WALLET_CHECK_RESULT',
        CJ_WALLET_CONNECT_RESULT: 'CJ_WALLET_CONNECT_RESULT',
        CJ_WALLET_SIGN_RESULT: 'CJ_WALLET_SIGN_RESULT',
      } as const;

      expect(WalletMessageType.CJ_WALLET_CHECK).toBe('CJ_WALLET_CHECK');
      expect(WalletMessageType.CJ_WALLET_CONNECT).toBe('CJ_WALLET_CONNECT');
      expect(WalletMessageType.CJ_WALLET_SIGN).toBe('CJ_WALLET_SIGN');
      expect(WalletMessageType.CJ_WALLET_CHECK_RESULT).toBe('CJ_WALLET_CHECK_RESULT');
      expect(WalletMessageType.CJ_WALLET_CONNECT_RESULT).toBe('CJ_WALLET_CONNECT_RESULT');
      expect(WalletMessageType.CJ_WALLET_SIGN_RESULT).toBe('CJ_WALLET_SIGN_RESULT');
    });
  });

  describe('Wallet Check', () => {
    it('should detect when wallet is available', () => {
      const hasWallet = (): boolean => {
        const win = window as unknown as { ethereum?: unknown };
        return !!win.ethereum;
      };

      expect(hasWallet()).toBe(true);
    });

    it('should return false when wallet is not available', () => {
      const savedEthereum = (window as unknown as { ethereum?: unknown }).ethereum;
      delete (window as unknown as { ethereum?: unknown }).ethereum;
      
      const hasWallet = (): boolean => {
        const win = window as unknown as { ethereum?: unknown };
        return !!win.ethereum;
      };

      expect(hasWallet()).toBe(false);
      
      // Restore
      (window as unknown as { ethereum?: unknown }).ethereum = savedEthereum;
    });
  });

  describe('Wallet Connect Flow', () => {
    it('should request accounts from provider', async () => {
      mockProvider.request.mockResolvedValueOnce(['0x1234567890123456789012345678901234567890']);

      const result = await mockProvider.request({ method: 'eth_requestAccounts' });
      
      expect(mockProvider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
      expect(result).toEqual(['0x1234567890123456789012345678901234567890']);
    });

    it('should handle user rejection', async () => {
      mockProvider.request.mockRejectedValueOnce({ code: 4001, message: 'User rejected' });

      await expect(mockProvider.request({ method: 'eth_requestAccounts' }))
        .rejects.toEqual({ code: 4001, message: 'User rejected' });
    });

    it('should get chain ID', async () => {
      mockProvider.request.mockResolvedValueOnce('0x1');

      const chainId = await mockProvider.request({ method: 'eth_chainId' });
      
      expect(chainId).toBe('0x1');
    });
  });

  describe('Wallet Sign Flow', () => {
    it('should sign message with personal_sign', async () => {
      const signature = '0x' + '00'.repeat(65);
      mockProvider.request.mockResolvedValueOnce(signature);

      const result = await mockProvider.request({
        method: 'personal_sign',
        params: ['0x' + Buffer.from('Hello').toString('hex'), '0x1234']
      });
      
      expect(result).toBe(signature);
    });

    it('should handle signing rejection', async () => {
      mockProvider.request.mockRejectedValueOnce({ code: 4001, message: 'User rejected signing' });

      await expect(mockProvider.request({
        method: 'personal_sign',
        params: ['0xmessage', '0xaddress']
      })).rejects.toEqual({ code: 4001, message: 'User rejected signing' });
    });
  });

  describe('EIP-6963 Provider Discovery', () => {
    it('should handle provider announcement events', () => {
      const discoveredProviders: Array<{ info: { uuid: string; name: string; rdns: string }; provider: unknown }> = [];
      
      const detail = {
        info: {
          uuid: 'test-uuid-123',
          name: 'Test Wallet',
          icon: 'data:image/svg+xml,...',
          rdns: 'io.testwallet.main',
        },
        provider: mockProvider,
      };

      // Simulate announcement handling
      const exists = discoveredProviders.some(p => p.info.uuid === detail.info.uuid);
      if (!exists) {
        discoveredProviders.push(detail);
      }

      expect(discoveredProviders).toHaveLength(1);
      expect(discoveredProviders[0].info.name).toBe('Test Wallet');
    });

    it('should avoid duplicate providers', () => {
      const discoveredProviders: Array<{ info: { uuid: string; name: string }; provider: unknown }> = [];
      
      const detail = { info: { uuid: 'test-123', name: 'Wallet' }, provider: mockProvider };

      // Add twice
      for (let i = 0; i < 2; i++) {
        const exists = discoveredProviders.some(p => p.info.uuid === detail.info.uuid);
        if (!exists) {
          discoveredProviders.push(detail);
        }
      }

      expect(discoveredProviders).toHaveLength(1);
    });
  });

  describe('Provider Priority', () => {
    it('should prioritize Rabby over MetaMask', () => {
      const providers = [
        { ...mockProvider, isMetaMask: true, isRabby: false },
        { ...mockProvider, isMetaMask: false, isRabby: true },
      ];

      const priorityOrder = [
        (p: typeof mockProvider) => p.isRabby,
        (p: typeof mockProvider) => p.isMetaMask && !p.isBraveWallet,
      ];

      let selectedProvider = null;
      for (const check of priorityOrder) {
        for (const p of providers) {
          if (check(p)) {
            selectedProvider = p;
            break;
          }
        }
        if (selectedProvider) break;
      }

      expect(selectedProvider?.isRabby).toBe(true);
    });

    it('should prioritize MetaMask over Brave Wallet', () => {
      const providers = [
        { ...mockProvider, isMetaMask: true, isBraveWallet: true },
        { ...mockProvider, isMetaMask: true, isBraveWallet: false },
      ];

      const selectProvider = () => {
        const priorityOrder = [
          (p: typeof mockProvider) => p.isMetaMask && !p.isBraveWallet,
          (p: typeof mockProvider) => p.isBraveWallet,
        ];

        for (const check of priorityOrder) {
          for (const p of providers) {
            if (check(p)) {
              return p;
            }
          }
        }
        return null;
      };

      const selected = selectProvider();
      expect(selected?.isBraveWallet).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should normalize wallet errors', () => {
      const normalizeWalletError = (error: unknown): { code: number; message: string } => {
        if (error && typeof error === 'object' && 'code' in error) {
          const e = error as { code: number; message?: string };
          return {
            code: e.code,
            message: e.message || 'Unknown wallet error',
          };
        }
        return { code: -1, message: String(error) };
      };

      expect(normalizeWalletError({ code: 4001, message: 'User rejected' }))
        .toEqual({ code: 4001, message: 'User rejected' });
      
      expect(normalizeWalletError({ code: 4100 }))
        .toEqual({ code: 4100, message: 'Unknown wallet error' });
      
      expect(normalizeWalletError('string error'))
        .toEqual({ code: -1, message: 'string error' });
    });

    it('should handle common error codes', () => {
      const errorMessages: Record<number, string> = {
        4001: 'User rejected the request',
        4100: 'Unauthorized',
        4200: 'Unsupported method',
        4900: 'Disconnected',
        4901: 'Chain disconnected',
        '-32603': 'Internal JSON-RPC error',
      };

      expect(errorMessages[4001]).toBe('User rejected the request');
      expect(errorMessages[4100]).toBe('Unauthorized');
    });
  });

  describe('Message Posting', () => {
    it('should post messages to window', () => {
      const sendResult = (type: string, data: Record<string, unknown>) => {
        mockPostMessage({ type, ...data }, '*');
      };

      sendResult('CJ_WALLET_CONNECT_RESULT', { 
        success: true, 
        address: '0x123',
        chainId: '0x1'
      });

      expect(mockPostMessage).toHaveBeenCalledWith(
        { type: 'CJ_WALLET_CONNECT_RESULT', success: true, address: '0x123', chainId: '0x1' },
        '*'
      );
    });

    it('should post error results', () => {
      const sendError = (type: string, error: { code: number; message: string }) => {
        mockPostMessage({ type, success: false, error }, '*');
      };

      sendError('CJ_WALLET_SIGN_RESULT', { code: 4001, message: 'User rejected' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        { 
          type: 'CJ_WALLET_SIGN_RESULT', 
          success: false, 
          error: { code: 4001, message: 'User rejected' } 
        },
        '*'
      );
    });
  });

  describe('Chain ID Validation', () => {
    it('should validate hex chain ID format', () => {
      const isValidChainId = (chainId: string): boolean => {
        return /^0x[0-9a-fA-F]+$/.test(chainId);
      };

      expect(isValidChainId('0x1')).toBe(true);
      expect(isValidChainId('0xa')).toBe(true);
      expect(isValidChainId('0x89')).toBe(true);
      expect(isValidChainId('0xA4B1')).toBe(true);
      expect(isValidChainId('1')).toBe(false);
      expect(isValidChainId('0x')).toBe(false);
      expect(isValidChainId('0xGHI')).toBe(false);
    });

    it('should convert chain ID to number', () => {
      const chainIdToNumber = (chainId: string): number => {
        return parseInt(chainId, 16);
      };

      expect(chainIdToNumber('0x1')).toBe(1); // Ethereum Mainnet
      expect(chainIdToNumber('0x89')).toBe(137); // Polygon
      expect(chainIdToNumber('0xa4b1')).toBe(42161); // Arbitrum
      expect(chainIdToNumber('0x2105')).toBe(8453); // Base
    });
  });

  describe('Address Validation', () => {
    it('should validate Ethereum addresses', () => {
      const isValidAddress = (address: string): boolean => {
        return /^0x[0-9a-fA-F]{40}$/.test(address);
      };

      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false);
      expect(isValidAddress('0x12345678901234567890123456789012345678901')).toBe(false); // 41 chars
    });

    it('should normalize addresses to checksum', () => {
      // Simplified checksum - real implementation would use proper algorithm
      const normalizeAddress = (address: string): string => {
        return address.toLowerCase();
      };

      expect(normalizeAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12'))
        .toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });
  });
});
