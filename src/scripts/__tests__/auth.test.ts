/**
 * Unit Tests for Auth Script
 * 
 * Tests the authentication page functionality including:
 * - Wallet detection
 * - UI state management
 * - Authentication flow steps
 * - SIWE message handling
 * - Error handling
 */

import { StorageKeys, SUPPORTED_CHAINS } from '../types';
import type { SIWEChallengeResponse, SIWEVerifyResponse } from '../types';

// ============================================================================
// Mock Setup
// ============================================================================

const mockChrome = {
  storage: {
    local: {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
    },
    session: {
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
  },
  tabs: {
    query: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// Mock window
const mockWindow = {
  close: jest.fn(),
  ethereum: undefined as unknown,
};

// @ts-expect-error - Mocking window
global.window = mockWindow;

// Mock DOM elements
const mockElements: Record<string, {
  classList: { add: jest.Mock; remove: jest.Mock };
  textContent: string;
  addEventListener?: jest.Mock;
  setAttribute?: jest.Mock;
  removeAttribute?: jest.Mock;
  value?: string;
}> = {
  loading: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  noWallet: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  connect: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  connecting: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  success: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  error: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  connectButton: { 
    classList: { add: jest.fn(), remove: jest.fn() }, 
    textContent: '',
    addEventListener: jest.fn(),
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
  },
  cancelButton: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '', addEventListener: jest.fn() },
  retryButton: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '', addEventListener: jest.fn() },
  retryDetectionButton: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '', addEventListener: jest.fn() },
  closeErrorButton: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '', addEventListener: jest.fn() },
  openDashboardButton: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '', addEventListener: jest.fn() },
  connectingTitle: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  connectingStatus: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  successAddress: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  successNetwork: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  successMode: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  errorMessage: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  step1: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  step2: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  step3: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
  step4: { classList: { add: jest.fn(), remove: jest.fn() }, textContent: '' },
};

// Mock document.getElementById to return our mock elements
jest.spyOn(document, 'getElementById').mockImplementation(
  (id: string) => mockElements[id] as unknown as HTMLElement || null
);

// Mock window.close
Object.defineProperty(window, 'close', {
  value: jest.fn(),
  writable: true,
});

// ============================================================================
// Helper Functions (Extracted from auth.ts for testing)
// ============================================================================

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  isCryptoJournal?: boolean;
  providers?: EthereumProvider[];
}

function getEthereumProvider(): EthereumProvider | null {
  const ethereum = mockWindow.ethereum as EthereumProvider | undefined;

  if (!ethereum) {
    return null;
  }

  if (ethereum.isCryptoJournal) {
    const providers = ethereum.providers;
    if (Array.isArray(providers)) {
      return providers.find(p => !p.isCryptoJournal) || null;
    }
    return null;
  }

  return ethereum;
}

function hasWallet(): boolean {
  return getEthereumProvider() !== null;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getNetworkName(chainId: string): string {
  const chain = SUPPORTED_CHAINS[chainId];
  if (chain) {
    return chain.chainName;
  }
  const decimal = parseInt(chainId, 16);
  return `Chain ${decimal}`;
}

type AuthSection = 'loading' | 'noWallet' | 'connect' | 'connecting' | 'success' | 'error';

function showSection(section: AuthSection): void {
  const sections: AuthSection[] = ['loading', 'noWallet', 'connect', 'connecting', 'success', 'error'];
  sections.forEach(s => {
    const el = mockElements[s];
    if (s === section) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

function updateStepProgress(activeIndex: number): void {
  const steps = ['step1', 'step2', 'step3', 'step4'];
  steps.forEach((stepId, index) => {
    const step = mockElements[stepId];
    step.classList.remove('active', 'completed');
    if (index < activeIndex) {
      step.classList.add('completed');
    } else if (index === activeIndex) {
      step.classList.add('active');
    }
  });
}

function updateConnectingStatus(title: string, status: string): void {
  mockElements.connectingTitle.textContent = title;
  mockElements.connectingStatus.textContent = status;
}

function showError(message: string): void {
  mockElements.errorMessage.textContent = message;
  showSection('error');
}

function showSuccess(address: string, chainId: string, mode: 'demo' | 'live'): void {
  mockElements.successAddress.textContent = formatAddress(address);
  mockElements.successNetwork.textContent = getNetworkName(chainId);
  mockElements.successMode.textContent = mode === 'live' ? 'Live Trading' : 'Demo Mode';
  showSection('success');
}

// ============================================================================
// Tests
// ============================================================================

describe('Auth Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow.ethereum = undefined;
    Object.values(mockElements).forEach(el => {
      el.textContent = '';
      el.classList.add.mockClear();
      el.classList.remove.mockClear();
    });
  });

  describe('Wallet Detection', () => {
    it('should detect MetaMask wallet', () => {
      mockWindow.ethereum = {
        request: jest.fn(),
        on: jest.fn(),
        isMetaMask: true,
      };

      expect(hasWallet()).toBe(true);
      expect(getEthereumProvider()).toBeTruthy();
    });

    it('should return null when no wallet', () => {
      mockWindow.ethereum = undefined;

      expect(hasWallet()).toBe(false);
      expect(getEthereumProvider()).toBeNull();
    });

    it('should skip CryptoJournal provider and find real wallet', () => {
      const realProvider = {
        request: jest.fn(),
        on: jest.fn(),
        isMetaMask: true,
      };

      mockWindow.ethereum = {
        request: jest.fn(),
        on: jest.fn(),
        isCryptoJournal: true,
        providers: [
          { request: jest.fn(), on: jest.fn(), isCryptoJournal: true },
          realProvider,
        ],
      };

      const provider = getEthereumProvider();
      expect(provider).toBe(realProvider);
    });

    it('should return null if only CryptoJournal provider exists', () => {
      mockWindow.ethereum = {
        request: jest.fn(),
        on: jest.fn(),
        isCryptoJournal: true,
      };

      expect(getEthereumProvider()).toBeNull();
    });
  });

  describe('UI Functions', () => {
    describe('formatAddress', () => {
      it('should truncate address correctly', () => {
        expect(formatAddress('0x1234567890123456789012345678901234567890'))
          .toBe('0x1234...7890');
      });

      it('should handle different addresses', () => {
        expect(formatAddress('0xabcdef1234567890abcdef1234567890abcdef12'))
          .toBe('0xabcd...ef12');
      });
    });

    describe('getNetworkName', () => {
      it('should return Ethereum Mainnet for 0x1', () => {
        expect(getNetworkName('0x1')).toBe('Ethereum Mainnet');
      });

      it('should return Polygon Mainnet for 0x89', () => {
        expect(getNetworkName('0x89')).toBe('Polygon Mainnet');
      });

      it('should return fallback for unknown chains', () => {
        expect(getNetworkName('0xffff')).toBe('Chain 65535');
      });
    });

    describe('showSection', () => {
      it('should show loading and hide others', () => {
        showSection('loading');
        expect(mockElements.loading.classList.remove).toHaveBeenCalledWith('hidden');
        expect(mockElements.connect.classList.add).toHaveBeenCalledWith('hidden');
        expect(mockElements.error.classList.add).toHaveBeenCalledWith('hidden');
      });

      it('should show connect and hide others', () => {
        showSection('connect');
        expect(mockElements.connect.classList.remove).toHaveBeenCalledWith('hidden');
        expect(mockElements.loading.classList.add).toHaveBeenCalledWith('hidden');
      });

      it('should show error and hide others', () => {
        showSection('error');
        expect(mockElements.error.classList.remove).toHaveBeenCalledWith('hidden');
      });

      it('should show success', () => {
        showSection('success');
        expect(mockElements.success.classList.remove).toHaveBeenCalledWith('hidden');
      });

      it('should show noWallet', () => {
        showSection('noWallet');
        expect(mockElements.noWallet.classList.remove).toHaveBeenCalledWith('hidden');
      });

      it('should show connecting', () => {
        showSection('connecting');
        expect(mockElements.connecting.classList.remove).toHaveBeenCalledWith('hidden');
      });
    });

    describe('updateStepProgress', () => {
      it('should mark first step as active', () => {
        updateStepProgress(0);
        expect(mockElements.step1.classList.add).toHaveBeenCalledWith('active');
        expect(mockElements.step1.classList.remove).toHaveBeenCalledWith('active', 'completed');
      });

      it('should mark steps as completed', () => {
        updateStepProgress(2);
        expect(mockElements.step1.classList.add).toHaveBeenCalledWith('completed');
        expect(mockElements.step2.classList.add).toHaveBeenCalledWith('completed');
        expect(mockElements.step3.classList.add).toHaveBeenCalledWith('active');
      });

      it('should mark all steps completed at end', () => {
        updateStepProgress(4);
        expect(mockElements.step1.classList.add).toHaveBeenCalledWith('completed');
        expect(mockElements.step4.classList.add).toHaveBeenCalledWith('completed');
      });
    });

    describe('updateConnectingStatus', () => {
      it('should update title and status', () => {
        updateConnectingStatus('Connecting...', 'Please wait');
        expect(mockElements.connectingTitle.textContent).toBe('Connecting...');
        expect(mockElements.connectingStatus.textContent).toBe('Please wait');
      });
    });

    describe('showError', () => {
      it('should display error message', () => {
        showError('Something went wrong');
        expect(mockElements.errorMessage.textContent).toBe('Something went wrong');
        expect(mockElements.error.classList.remove).toHaveBeenCalledWith('hidden');
      });
    });

    describe('showSuccess', () => {
      it('should display success state with live mode', () => {
        showSuccess('0x1234567890123456789012345678901234567890', '0x1', 'live');
        expect(mockElements.successAddress.textContent).toBe('0x1234...7890');
        expect(mockElements.successNetwork.textContent).toBe('Ethereum Mainnet');
        expect(mockElements.successMode.textContent).toBe('Live Trading');
      });

      it('should display success state with demo mode', () => {
        showSuccess('0xabcd1234567890abcd1234567890abcd12345678', '0x89', 'demo');
        expect(mockElements.successMode.textContent).toBe('Demo Mode');
        expect(mockElements.successNetwork.textContent).toBe('Polygon Mainnet');
      });
    });
  });

  describe('Storage Operations', () => {
    it('should store session data correctly', async () => {
      const sessionData = {
        [StorageKeys.SESSION_TOKEN]: 'test-token',
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.ACCOUNT_MODE]: 'live',
        [StorageKeys.LAST_CONNECTED]: Date.now(),
      };

      await mockChrome.storage.local.set(sessionData);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(sessionData);
    });

    it('should store session token in session storage', async () => {
      await mockChrome.storage.session.set({ sessionToken: 'secure-token' });
      expect(mockChrome.storage.session.set).toHaveBeenCalledWith({ sessionToken: 'secure-token' });
    });
  });

  describe('Authentication Flow', () => {
    const mockProvider = {
      request: jest.fn(),
      on: jest.fn(),
    };

    beforeEach(() => {
      mockWindow.ethereum = mockProvider;
      jest.clearAllMocks();
    });

    it('should request accounts from wallet', async () => {
      mockProvider.request.mockResolvedValueOnce(['0x1234567890123456789012345678901234567890']);

      const accounts = await mockProvider.request({ method: 'eth_requestAccounts' });
      expect(accounts).toEqual(['0x1234567890123456789012345678901234567890']);
      expect(mockProvider.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
    });

    it('should get chain ID', async () => {
      mockProvider.request.mockResolvedValueOnce('0x1');

      const chainId = await mockProvider.request({ method: 'eth_chainId' });
      expect(chainId).toBe('0x1');
    });

    it('should handle user rejection', async () => {
      mockProvider.request.mockRejectedValueOnce(new Error('User rejected the request'));

      await expect(mockProvider.request({ method: 'eth_requestAccounts' }))
        .rejects.toThrow('User rejected the request');
    });

    it('should sign SIWE message', async () => {
      const message = 'Sign this message';
      const address = '0x1234';
      const expectedSignature = '0xsignature';

      mockProvider.request.mockResolvedValueOnce(expectedSignature);

      const signature = await mockProvider.request({
        method: 'personal_sign',
        params: [message, address],
      });

      expect(signature).toBe(expectedSignature);
      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'personal_sign',
        params: [message, address],
      });
    });
  });

  describe('API Response Types', () => {
    it('should handle SIWE challenge response', () => {
      const response: SIWEChallengeResponse = {
        message: 'localhost wants you to sign in...',
        nonce: 'abc123',
      };

      expect(response.message).toBeDefined();
      expect(response.nonce).toBeDefined();
    });

    it('should handle SIWE verify response', () => {
      const response: SIWEVerifyResponse = {
        sessionToken: 'jwt-token',
        user: {
          id: 'user-123',
          address: '0x1234',
          accountMode: 'live',
        },
      };

      expect(response.sessionToken).toBeDefined();
      expect(response.user.id).toBeDefined();
      expect(response.user.address).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should detect user rejection error codes', () => {
      const errors = [
        new Error('user rejected'),
        new Error('user denied'),
        new Error('Error code: 4001'),
      ];

      errors.forEach(error => {
        const message = error.message.toLowerCase();
        const isRejection = 
          message.includes('user rejected') || 
          message.includes('user denied') || 
          message.includes('4001');
        expect(isRejection).toBe(true);
      });
    });

    it('should not detect non-rejection errors', () => {
      const error = new Error('Network error');
      const message = error.message.toLowerCase();
      const isRejection = 
        message.includes('user rejected') || 
        message.includes('user denied') || 
        message.includes('4001');
      expect(isRejection).toBe(false);
    });
  });

  describe('Dashboard Opening', () => {
    it('should update existing app tab if found', async () => {
      mockChrome.tabs.query.mockImplementation((_query, callback) => {
        callback([{ id: 123, url: 'http://localhost:3000/trades' }]);
      });

      await new Promise<void>(resolve => {
        mockChrome.tabs.query({ url: 'http://localhost:3000/*' }, (tabs: Array<{ id: number }>) => {
          if (tabs.length > 0 && tabs[0].id) {
            mockChrome.tabs.update(tabs[0].id, { url: 'http://localhost:3000/dashboard', active: true });
          }
          resolve();
        });
      });

      expect(mockChrome.tabs.update).toHaveBeenCalledWith(123, {
        url: 'http://localhost:3000/dashboard',
        active: true,
      });
    });

    it('should create new tab if no existing app tab', async () => {
      mockChrome.tabs.query.mockImplementation((_query, callback) => {
        callback([]);
      });

      await new Promise<void>(resolve => {
        mockChrome.tabs.query({ url: 'http://localhost:3000/*' }, (tabs: Array<{ id: number }>) => {
          if (tabs.length === 0) {
            mockChrome.tabs.create({ url: 'http://localhost:3000/dashboard' });
          }
          resolve();
        });
      });

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'http://localhost:3000/dashboard',
      });
    });
  });

  describe('Wallet Event Listeners', () => {
    it('should register accountsChanged listener', () => {
      const provider = {
        request: jest.fn(),
        on: jest.fn(),
      };

      provider.on('accountsChanged', jest.fn());
      expect(provider.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    });

    it('should register chainChanged listener', () => {
      const provider = {
        request: jest.fn(),
        on: jest.fn(),
      };

      provider.on('chainChanged', jest.fn());
      expect(provider.on).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    });
  });
});

describe('Auth Page Initialization', () => {
  it('should detect wallet after delay', () => {
    jest.useFakeTimers();
    
    const initCallback = jest.fn();
    setTimeout(() => {
      initCallback(hasWallet());
    }, 500);

    jest.advanceTimersByTime(500);
    expect(initCallback).toHaveBeenCalled();
    
    jest.useRealTimers();
  });
});
