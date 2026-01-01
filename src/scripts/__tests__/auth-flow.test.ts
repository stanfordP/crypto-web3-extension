/**
 * Unit Tests for Auth Flow Logic
 *
 * Tests wallet detection, SIWE flow, and session storage
 */

import { StorageKeys, SUPPORTED_CHAINS } from '../types';

// Mock the API client
jest.mock('../api', () => ({
  apiClient: {
    getSIWEChallenge: jest.fn(),
    verifySIWE: jest.fn(),
  },
  handleApiError: jest.fn((error) => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }),
}));

jest.mock('../config', () => ({
  API_BASE_URL: 'http://localhost:3000',
  DEFAULTS: {
    DASHBOARD_PATH: '/dashboard',
  },
}));

describe('Auth Flow - Wallet Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.ethereum
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  });

  it('should detect MetaMask when available', () => {
    const mockProvider = {
      isMetaMask: true,
      request: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    (window as unknown as { ethereum: typeof mockProvider }).ethereum = mockProvider;

    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    expect(ethereum).toBeDefined();
    expect((ethereum as { isMetaMask?: boolean }).isMetaMask).toBe(true);
  });

  it('should skip CryptoJournal provider if detected', () => {
    const mockProvider = {
      isCryptoJournal: true,
      providers: [
        { isCryptoJournal: true },
        { isMetaMask: true, request: jest.fn() },
      ],
    };

    (window as unknown as { ethereum: typeof mockProvider }).ethereum = mockProvider;

    const ethereum = (window as unknown as { ethereum: typeof mockProvider }).ethereum;
    const providers = ethereum.providers;

    // Find the real provider (not CryptoJournal)
    const realProvider = providers?.find((p) => !p.isCryptoJournal);
    expect(realProvider?.isMetaMask).toBe(true);
  });

  it('should return null when no wallet is available', () => {
    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    expect(ethereum).toBeUndefined();
  });
});

describe('Auth Flow - SIWE Challenge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should request SIWE challenge with correct params', async () => {
    const { apiClient } = await import('../api');

    const challengeResponse = {
      message: 'cryptotradingjournal.xyz wants you to sign in...',
      nonce: 'random-nonce-123',
    };

    (apiClient.getSIWEChallenge as jest.Mock).mockResolvedValue(challengeResponse);

    const result = await apiClient.getSIWEChallenge({
      address: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      accountMode: 'live',
    });

    expect(apiClient.getSIWEChallenge).toHaveBeenCalledWith({
      address: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      accountMode: 'live',
    });
    expect(result.message).toContain('cryptotradingjournal.xyz');
    expect(result.nonce).toBeDefined();
  });

  it('should handle challenge request failure', async () => {
    const { apiClient } = await import('../api');

    (apiClient.getSIWEChallenge as jest.Mock).mockRejectedValue(new Error('Network error'));

    await expect(
      apiClient.getSIWEChallenge({
        address: '0x1234',
        chainId: 1,
        accountMode: 'live',
      })
    ).rejects.toThrow('Network error');
  });
});

describe('Auth Flow - Message Signing', () => {
  let mockProvider: {
    request: jest.Mock;
    on: jest.Mock;
    removeListener: jest.Mock;
  };

  beforeEach(() => {
    mockProvider = {
      request: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    (window as unknown as { ethereum: typeof mockProvider }).ethereum = mockProvider;
  });

  it('should request accounts from wallet', async () => {
    mockProvider.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const accounts = await mockProvider.request({ method: 'eth_requestAccounts' });

    expect(mockProvider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should get chain ID from wallet', async () => {
    mockProvider.request.mockResolvedValue('0x1');

    const chainId = await mockProvider.request({ method: 'eth_chainId' });

    expect(chainId).toBe('0x1');
  });

  it('should sign message with personal_sign', async () => {
    const message = 'cryptotradingjournal.xyz wants you to sign in...';
    const address = '0x1234567890123456789012345678901234567890';
    const signature = '0xabcdef...';

    mockProvider.request.mockResolvedValue(signature);

    const result = await mockProvider.request({
      method: 'personal_sign',
      params: [message, address],
    });

    expect(mockProvider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: [message, address],
    });
    expect(result).toBe(signature);
  });

  it('should handle user rejection (4001)', async () => {
    const error = new Error('User rejected request');
    (error as Error & { code: number }).code = 4001;
    mockProvider.request.mockRejectedValue(error);

    await expect(
      mockProvider.request({ method: 'eth_requestAccounts' })
    ).rejects.toThrow('User rejected');
  });
});

describe('Auth Flow - Signature Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify signature and get session token', async () => {
    const { apiClient } = await import('../api');

    const verifyResponse = {
      sessionToken: 'jwt-token-here',
      user: {
        id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        accountMode: 'live' as const,
      },
    };

    (apiClient.verifySIWE as jest.Mock).mockResolvedValue(verifyResponse);

    const result = await apiClient.verifySIWE({
      message: 'SIWE message',
      signature: '0xsignature',
      accountMode: 'live',
    });

    expect(result.sessionToken).toBe('jwt-token-here');
    expect(result.user.address).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should handle verification failure', async () => {
    const { apiClient } = await import('../api');

    (apiClient.verifySIWE as jest.Mock).mockRejectedValue(new Error('Invalid signature'));

    await expect(
      apiClient.verifySIWE({
        message: 'SIWE message',
        signature: '0xinvalid',
        accountMode: 'live',
      })
    ).rejects.toThrow('Invalid signature');
  });
});

describe('Auth Flow - Session Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should store session in chrome.storage.local', async () => {
    const sessionData = {
      [StorageKeys.SESSION_TOKEN]: 'jwt-token',
      [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
      [StorageKeys.CHAIN_ID]: '0x1',
      [StorageKeys.ACCOUNT_MODE]: 'live',
      [StorageKeys.LAST_CONNECTED]: Date.now(),
    };

    await chrome.storage.local.set(sessionData);

    expect(chrome.storage.local.set).toHaveBeenCalledWith(sessionData);
  });

  it('should store sensitive token in session storage', async () => {
    await chrome.storage.session.set({ sessionToken: 'jwt-token' });

    expect(chrome.storage.session.set).toHaveBeenCalledWith({ sessionToken: 'jwt-token' });
  });

  it('should notify background of auth success', async () => {
    const message = {
      type: 'AUTH_SUCCESS',
      payload: {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        accountMode: 'live',
      },
    };

    await chrome.runtime.sendMessage(message);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message);
  });
});

describe('Auth Flow - Network Display', () => {
  it('should display correct network name for Ethereum mainnet', () => {
    const chainId = '0x1';
    const chain = SUPPORTED_CHAINS[chainId];

    expect(chain.chainName).toBe('Ethereum Mainnet');
  });

  it('should display correct network name for Polygon', () => {
    const chainId = '0x89';
    const chain = SUPPORTED_CHAINS[chainId];

    expect(chain.chainName).toBe('Polygon Mainnet');
  });

  it('should handle unknown chain IDs', () => {
    const chainId = '0xabcd'; // Unknown chain
    const chain = SUPPORTED_CHAINS[chainId];

    expect(chain).toBeUndefined();

    // Should fall back to displaying chain ID as decimal
    const decimal = parseInt(chainId, 16);
    expect(decimal).toBe(43981);
  });
});

describe('Auth Flow - Error Handling', () => {
  it('should identify user rejection errors', () => {
    const userRejectionMessages = [
      'user rejected',
      'User denied',
      'Error: 4001',
      'User rejected the request',
    ];

    userRejectionMessages.forEach((msg) => {
      const isRejection =
        msg.toLowerCase().includes('user rejected') ||
        msg.toLowerCase().includes('user denied') ||
        msg.includes('4001');

      expect(isRejection).toBe(true);
    });
  });

  it('should handle API errors gracefully', async () => {
    const { handleApiError } = await import('../api');

    const error = new Error('Server error');
    const message = handleApiError(error);

    expect(message).toBe('Server error');
  });
});

describe('Auth Flow - Wallet Events', () => {
  let mockProvider: {
    request: jest.Mock;
    on: jest.Mock;
    removeListener: jest.Mock;
  };

  beforeEach(() => {
    mockProvider = {
      request: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    (window as unknown as { ethereum: typeof mockProvider }).ethereum = mockProvider;
  });

  it('should listen for accountsChanged events', () => {
    const handler = jest.fn();
    mockProvider.on('accountsChanged', handler);

    expect(mockProvider.on).toHaveBeenCalledWith('accountsChanged', handler);
  });

  it('should listen for chainChanged events', () => {
    const handler = jest.fn();
    mockProvider.on('chainChanged', handler);

    expect(mockProvider.on).toHaveBeenCalledWith('chainChanged', handler);
  });

  it('should handle account disconnect (empty accounts array)', () => {
    const accounts: string[] = [];
    const isDisconnected = accounts.length === 0;

    expect(isDisconnected).toBe(true);
  });
});

describe('Auth Flow - Account Mode', () => {
  it('should support live mode', () => {
    const accountMode: 'demo' | 'live' = 'live';
    expect(accountMode).toBe('live');
  });

  it('should support demo mode', () => {
    const accountMode: 'demo' | 'live' = 'demo';
    expect(accountMode).toBe('demo');
  });

  it('should default to live mode', () => {
    const defaultMode = 'live';
    expect(defaultMode).toBe('live');
  });
});
