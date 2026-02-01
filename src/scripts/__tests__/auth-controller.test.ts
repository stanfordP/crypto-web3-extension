/**
 * AuthController Tests
 * 
 * Tests for the auth page controller business logic
 */

import { AuthController, AuthApiClient } from '../ui/auth/AuthController';
import type { AuthView, AuthViewEventHandlers } from '../ui/auth/AuthView';
import {
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockTabsAdapter,
  createMockDOMAdapter,
} from '../core/Container';
import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter, IDOMAdapter } from '../adapters/types';
import type { EthereumProvider } from '../types';
import { StorageKeys } from '../types';

// ============================================================================
// Mock AuthView
// ============================================================================

function createMockAuthView(): jest.Mocked<AuthView> {
  return {
    initialize: jest.fn(),
    showSection: jest.fn(),
    showError: jest.fn(),
    showSuccess: jest.fn(),
    updateStepProgress: jest.fn(),
    updateConnectingStatus: jest.fn(),
    getSelectedAccountMode: jest.fn().mockReturnValue('live'),
    formatAddress: jest.fn((addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`),
    getNetworkName: jest.fn().mockReturnValue('Ethereum'),
    closeWindow: jest.fn(),
  } as unknown as jest.Mocked<AuthView>;
}

// ============================================================================
// Mock API Client
// ============================================================================

function createMockApiClient(): jest.Mocked<AuthApiClient> {
  return {
    getSIWEChallenge: jest.fn().mockResolvedValue({
      message: 'Sign this message to authenticate',
      nonce: 'test-nonce',
    }),
    verifySIWE: jest.fn().mockResolvedValue({
      sessionToken: 'test-session-token',
      address: '0x1234567890abcdef1234567890abcdef12345678',
    }),
  };
}

// ============================================================================
// Mock Ethereum Provider
// ============================================================================

function createMockEthereumProvider(options: {
  accounts?: string[];
  chainId?: string;
  isCryptoJournal?: boolean;
  rejectRequest?: boolean;
} = {}): jest.Mocked<EthereumProvider> {
  const {
    accounts = ['0x1234567890abcdef1234567890abcdef12345678'],
    chainId = '0x1',
    isCryptoJournal = false,
    rejectRequest = false,
  } = options;

  return {
    request: jest.fn().mockImplementation(async ({ method }: { method: string }) => {
      if (rejectRequest) {
        throw new Error('User rejected the request');
      }
      
      switch (method) {
        case 'eth_requestAccounts':
          return accounts;
        case 'eth_chainId':
          return chainId;
        case 'personal_sign':
          return '0xsignature123';
        default:
          return null;
      }
    }),
    isConnected: jest.fn().mockReturnValue(true),
    on: jest.fn(),
    removeListener: jest.fn(),
    chainId,
    selectedAddress: accounts[0] || null,
    isCryptoJournal,
  } as unknown as jest.Mocked<EthereumProvider>;
}

// ============================================================================
// Tests
// ============================================================================

describe('AuthController', () => {
  let storage: IStorageAdapter;
  let runtime: IRuntimeAdapter;
  let tabs: ITabsAdapter;
  let dom: IDOMAdapter;
  let view: jest.Mocked<AuthView>;
  let apiClient: jest.Mocked<AuthApiClient>;
  let controller: AuthController;
  let mockProvider: jest.Mocked<EthereumProvider>;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();
    dom = createMockDOMAdapter();
    view = createMockAuthView();
    apiClient = createMockApiClient();
    mockProvider = createMockEthereumProvider();

    // Spy on adapter methods for assertions
    jest.spyOn(storage, 'localSet');
    jest.spyOn(storage, 'sessionSet');
    jest.spyOn(runtime, 'sendMessage').mockResolvedValue(undefined);
    jest.spyOn(tabs, 'query').mockResolvedValue([]);
    jest.spyOn(tabs, 'create').mockResolvedValue({ id: 1, url: '' } as chrome.tabs.Tab);
    jest.spyOn(tabs, 'update').mockResolvedValue({} as chrome.tabs.Tab);

    // Set up mock window.ethereum - use Object.defineProperty to work with jsdom
    Object.defineProperty(window, 'ethereum', {
      value: mockProvider,
      writable: true,
      configurable: true,
    });

    controller = new AuthController(
      storage,
      runtime,
      tabs,
      dom,
      view,
      apiClient,
      {
        apiBaseUrl: 'http://localhost:3000',
        dashboardPath: '/dashboard',
        walletDetectionAttempts: 2,
        walletDetectionInitialDelay: 10,
        autoRedirectDelay: 10,
      }
    );
  });

  afterEach(() => {
    if (controller) {
      controller.destroy();
    }
    // Clean up window.ethereum
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe('initialize', () => {
    it('should initialize view with event handlers', () => {
      controller.initialize();

      expect(view.initialize).toHaveBeenCalledWith({
        onConnect: expect.any(Function),
        onCancel: expect.any(Function),
        onRetry: expect.any(Function),
        onRetryDetection: expect.any(Function),
        onCloseError: expect.any(Function),
        onOpenDashboard: expect.any(Function),
        onAccountModeChange: expect.any(Function),
      });
    });

    it('should start with loading state', () => {
      controller.initialize();

      const state = controller.getState();
      expect(state.step).toBe('loading');
    });

    it('should setup EIP-6963 detection', () => {
      const addEventSpy = jest.spyOn(dom, 'addEventListener');
      
      controller.initialize();

      expect(addEventSpy).toHaveBeenCalledWith(
        'eip6963:announceProvider',
        expect.any(Function)
      );
    });
  });

  // ==========================================================================
  // Wallet Detection Tests
  // ==========================================================================

  describe('wallet detection', () => {
    it('should detect wallet via window.ethereum', () => {
      const result = controller.getEthereumProvider();

      expect(result).toBe(mockProvider);
    });

    it('should return null when no wallet is available', () => {
      delete (window as unknown as { ethereum?: unknown }).ethereum;

      const result = controller.getEthereumProvider();

      expect(result).toBeNull();
    });

    it('should skip CryptoJournal provider', () => {
      Object.defineProperty(window, 'ethereum', {
        value: createMockEthereumProvider({ isCryptoJournal: true }),
        writable: true,
        configurable: true,
      });

      const result = controller.getEthereumProvider();

      expect(result).toBeNull();
    });

    it('should detect wallet from multi-provider setup', () => {
      const metaMaskProvider = createMockEthereumProvider({ isCryptoJournal: false });
      Object.defineProperty(window, 'ethereum', {
        value: {
          providers: [
            createMockEthereumProvider({ isCryptoJournal: true }),
            metaMaskProvider,
          ],
        },
        writable: true,
        configurable: true,
      });

      const result = controller.getEthereumProvider();

      expect(result).toBe(metaMaskProvider);
    });

    it('should return true for hasWallet when provider exists', () => {
      expect(controller.hasWallet()).toBe(true);
    });

    it('should return false for hasWallet when no provider', () => {
      delete (window as unknown as { ethereum?: unknown }).ethereum;

      expect(controller.hasWallet()).toBe(false);
    });
  });

  // ==========================================================================
  // Authentication Flow Tests
  // ==========================================================================

  describe('authenticate', () => {
    it('should go through all authentication steps', async () => {
      controller.initialize();
      
      await controller.authenticate();

      // Verify step progress was updated
      expect(view.updateStepProgress).toHaveBeenCalledWith(0); // Connect
      expect(view.updateStepProgress).toHaveBeenCalledWith(1); // Challenge
      expect(view.updateStepProgress).toHaveBeenCalledWith(2); // Sign
      expect(view.updateStepProgress).toHaveBeenCalledWith(3); // Verify
    });

    it('should request accounts from wallet', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'eth_requestAccounts',
      });
    });

    it('should request chain ID from wallet', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'eth_chainId',
      });
    });

    it('should get SIWE challenge from API', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(apiClient.getSIWEChallenge).toHaveBeenCalledWith({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1, // 0x1 converted to decimal
        accountMode: 'live',
      });
    });

    it('should sign message with wallet', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'personal_sign',
        params: ['Sign this message to authenticate', '0x1234567890abcdef1234567890abcdef12345678'],
      });
    });

    it('should verify signature with API', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(apiClient.verifySIWE).toHaveBeenCalledWith({
        message: 'Sign this message to authenticate',
        signature: '0xsignature123',
        accountMode: 'live',
      });
    });

    it('should store session after verification', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(storage.localSet).toHaveBeenCalledWith(expect.objectContaining({
        [StorageKeys.SESSION_TOKEN]: 'test-session-token',
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890abcdef1234567890abcdef12345678',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.ACCOUNT_MODE]: 'live',
      }));
    });

    it('should store session token in session storage', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(storage.sessionSet).toHaveBeenCalledWith({
        sessionToken: 'test-session-token',
      });
    });

    it('should notify background of auth success', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTH_SUCCESS',
        payload: {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: '0x1',
          accountMode: 'live',
        },
      });
    });

    it('should show success state after authentication', async () => {
      controller.initialize();
      
      await controller.authenticate();

      expect(view.showSuccess).toHaveBeenCalledWith({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: '0x1',
        accountMode: 'live',
      });
    });

    it('should prevent concurrent authentication attempts', async () => {
      controller.initialize();
      
      // Start two authentications simultaneously
      const auth1 = controller.authenticate();
      const auth2 = controller.authenticate();

      await Promise.all([auth1, auth2]);

      // Should only call API once
      expect(apiClient.getSIWEChallenge).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should show error when no wallet detected', async () => {
      delete (window as unknown as { ethereum?: unknown }).ethereum;
      controller.initialize();
      
      await controller.authenticate();

      expect(view.showError).toHaveBeenCalledWith(expect.stringContaining('No wallet'));
    });

    it('should handle user rejection gracefully', async () => {
      const rejectingProvider = createMockEthereumProvider({ rejectRequest: true });
      Object.defineProperty(window, 'ethereum', {
        value: rejectingProvider,
        writable: true,
        configurable: true,
      });
      
      // Create fresh controller with the rejecting provider
      const freshController = new AuthController(
        storage, runtime, tabs, dom, view, apiClient,
        { apiBaseUrl: 'http://localhost:3000', dashboardPath: '/', walletDetectionAttempts: 1, walletDetectionInitialDelay: 1, autoRedirectDelay: 1 }
      );
      freshController.initialize();
      
      await freshController.authenticate();

      expect(view.showError).toHaveBeenCalledWith(
        expect.stringContaining('rejected')
      );
      
      freshController.destroy();
    });

    it('should handle no accounts returned', async () => {
      const emptyAccountsProvider = createMockEthereumProvider({ accounts: [] });
      Object.defineProperty(window, 'ethereum', {
        value: emptyAccountsProvider,
        writable: true,
        configurable: true,
      });
      
      const freshController = new AuthController(
        storage, runtime, tabs, dom, view, apiClient,
        { apiBaseUrl: 'http://localhost:3000', dashboardPath: '/', walletDetectionAttempts: 1, walletDetectionInitialDelay: 1, autoRedirectDelay: 1 }
      );
      freshController.initialize();
      
      await freshController.authenticate();

      expect(view.showError).toHaveBeenCalled();
      
      freshController.destroy();
    });

    it('should handle API errors', async () => {
      // Ensure we have a valid provider
      Object.defineProperty(window, 'ethereum', {
        value: mockProvider,
        writable: true,
        configurable: true,
      });
      
      const freshApiClient = createMockApiClient();
      freshApiClient.getSIWEChallenge.mockRejectedValue(new Error('API Error'));
      
      const freshController = new AuthController(
        storage, runtime, tabs, dom, view, freshApiClient,
        { apiBaseUrl: 'http://localhost:3000', dashboardPath: '/', walletDetectionAttempts: 1, walletDetectionInitialDelay: 1, autoRedirectDelay: 1 }
      );
      freshController.initialize();
      
      await freshController.authenticate();

      expect(view.showError).toHaveBeenCalledWith('API Error');
      
      freshController.destroy();
    });

    it('should set error state', async () => {
      // Ensure we have a valid provider
      Object.defineProperty(window, 'ethereum', {
        value: mockProvider,
        writable: true,
        configurable: true,
      });
      
      const freshApiClient = createMockApiClient();
      freshApiClient.verifySIWE.mockRejectedValue(new Error('Verify error'));
      
      const freshController = new AuthController(
        storage, runtime, tabs, dom, view, freshApiClient,
        { apiBaseUrl: 'http://localhost:3000', dashboardPath: '/', walletDetectionAttempts: 1, walletDetectionInitialDelay: 1, autoRedirectDelay: 1 }
      );
      freshController.initialize();
      
      await freshController.authenticate();

      const state = freshController.getState();
      expect(state.step).toBe('error');
      expect(state.error).toBe('Verify error');
      
      freshController.destroy();
    });
  });

  // ==========================================================================
  // Account Mode Tests
  // ==========================================================================

  describe('account mode', () => {
    it('should use selected account mode from view', async () => {
      // Ensure we have a valid provider
      Object.defineProperty(window, 'ethereum', {
        value: mockProvider,
        writable: true,
        configurable: true,
      });
      
      const freshView = createMockAuthView();
      const freshApiClient = createMockApiClient();
      freshView.getSelectedAccountMode.mockReturnValue('demo');
      
      const freshController = new AuthController(
        storage, runtime, tabs, dom, freshView, freshApiClient,
        { apiBaseUrl: 'http://localhost:3000', dashboardPath: '/', walletDetectionAttempts: 1, walletDetectionInitialDelay: 1, autoRedirectDelay: 1 }
      );
      freshController.initialize();
      
      await freshController.authenticate();

      expect(freshApiClient.getSIWEChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ accountMode: 'demo' })
      );
      
      freshController.destroy();
    });

    it('should store account mode in session', async () => {
      // Ensure we have a valid provider
      Object.defineProperty(window, 'ethereum', {
        value: mockProvider,
        writable: true,
        configurable: true,
      });
      
      const freshView = createMockAuthView();
      const freshApiClient = createMockApiClient();
      const freshStorage = createMockStorageAdapter();
      freshView.getSelectedAccountMode.mockReturnValue('demo');
      jest.spyOn(freshStorage, 'localSet');
      
      const freshController = new AuthController(
        freshStorage, runtime, tabs, dom, freshView, freshApiClient,
        { apiBaseUrl: 'http://localhost:3000', dashboardPath: '/', walletDetectionAttempts: 1, walletDetectionInitialDelay: 1, autoRedirectDelay: 1 }
      );
      freshController.initialize();
      
      await freshController.authenticate();

      expect(freshStorage.localSet).toHaveBeenCalledWith(
        expect.objectContaining({ [StorageKeys.ACCOUNT_MODE]: 'demo' })
      );
      
      freshController.destroy();
    });
  });

  // ==========================================================================
  // Navigation Tests
  // ==========================================================================

  describe('openDashboard', () => {
    it('should open dashboard in new tab when no existing app tab', async () => {
      jest.spyOn(tabs, 'query').mockResolvedValue([]);
      jest.spyOn(tabs, 'create').mockResolvedValue({} as chrome.tabs.Tab);
      
      controller.openDashboard();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(tabs.create).toHaveBeenCalledWith({
        url: 'http://localhost:3000/dashboard',
      });
    });

    it('should update existing app tab if found', async () => {
      jest.spyOn(tabs, 'query').mockResolvedValue([{ id: 123, url: 'http://localhost:3000/other' } as chrome.tabs.Tab]);
      jest.spyOn(tabs, 'update').mockResolvedValue({} as chrome.tabs.Tab);
      
      controller.openDashboard();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(tabs.update).toHaveBeenCalledWith(123, {
        url: 'http://localhost:3000/dashboard',
        active: true,
      });
    });

    it('should close auth window after navigation', async () => {
      jest.spyOn(tabs, 'query').mockResolvedValue([]);
      jest.spyOn(tabs, 'create').mockResolvedValue({} as chrome.tabs.Tab);
      
      controller.openDashboard();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(view.closeWindow).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Event Handler Tests
  // ==========================================================================

  describe('event handlers', () => {
    it('should handle cancel by showing connect section', () => {
      controller.initialize();
      
      // Get the handlers passed to view.initialize
      const handlers = view.initialize.mock.calls[0][0] as AuthViewEventHandlers;
      handlers.onCancel();

      expect(view.showSection).toHaveBeenCalledWith('connect');
    });

    it('should handle retry by showing connect section', () => {
      controller.initialize();
      
      const handlers = view.initialize.mock.calls[0][0] as AuthViewEventHandlers;
      handlers.onRetry();

      expect(view.showSection).toHaveBeenCalledWith('connect');
    });

    it('should handle close error by closing window', () => {
      controller.initialize();
      
      const handlers = view.initialize.mock.calls[0][0] as AuthViewEventHandlers;
      handlers.onCloseError();

      expect(view.closeWindow).toHaveBeenCalled();
    });

    it('should handle account mode change', () => {
      controller.initialize();
      
      const handlers = view.initialize.mock.calls[0][0] as AuthViewEventHandlers;
      handlers.onAccountModeChange('demo');

      const state = controller.getState();
      expect(state.accountMode).toBe('demo');
    });
  });

  // ==========================================================================
  // Cleanup Tests
  // ==========================================================================

  describe('destroy', () => {
    it('should clean up wallet event handlers on destroy', () => {
      // Initialize and authenticate to set up wallet listeners
      controller.initialize();
      
      // Access the provider to ensure listeners are set up
      const provider = controller.getEthereumProvider();
      expect(provider).not.toBeNull();
      
      // Destroy should not throw
      expect(() => controller.destroy()).not.toThrow();
    });
  });

  // ==========================================================================
  // Getter Tests
  // ==========================================================================

  describe('getters', () => {
    it('should return current state', () => {
      const state = controller.getState();
      expect(state).toEqual({
        step: 'loading',
        accountMode: 'live',
      });
    });

    it('should return detected providers count', () => {
      expect(controller.getDetectedProvidersCount()).toBe(0);
    });

    it('should return current step index', () => {
      expect(controller.getCurrentStepIndex()).toBe(0);
    });

    it('should return is connecting status', () => {
      expect(controller.getIsConnecting()).toBe(false);
    });
  });
});
