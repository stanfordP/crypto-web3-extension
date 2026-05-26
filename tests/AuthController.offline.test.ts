/**
 * AuthController Offline Mode Tests
 *
 * Covers the production AuthController path for backend-offline/degraded SIWE
 * behavior. The auth page must not open wallet prompts or persist sessions when
 * CTJ backend connectivity is unavailable.
 */

import type { IDOMAdapter, IRuntimeAdapter, IStorageAdapter, ITabsAdapter } from '../src/scripts/adapters/types';
import type { AuthView } from '../src/scripts/ui/auth/AuthView';
import { AuthApiClient, AuthController } from '../src/scripts/ui/auth/AuthController';
import type { EthereumProvider, RequestArguments } from '../src/scripts/types';
import { NetworkError } from '../src/scripts/errors';

interface MockDOMAdapter extends jest.Mocked<IDOMAdapter> {
  setOnline(status: boolean): void;
  emitNetworkEvent(type: 'online' | 'offline'): void;
}

const OFFLINE_MESSAGE_FRAGMENT = 'CTJ sign-in needs the backend';

function createMockStorage(): jest.Mocked<IStorageAdapter> {
  return {
    localGet: jest.fn().mockResolvedValue({}),
    localSet: jest.fn().mockResolvedValue(undefined),
    localRemove: jest.fn().mockResolvedValue(undefined),
    localClear: jest.fn().mockResolvedValue(undefined),
    sessionGet: jest.fn().mockResolvedValue({}),
    sessionSet: jest.fn().mockResolvedValue(undefined),
    sessionRemove: jest.fn().mockResolvedValue(undefined),
    sessionClear: jest.fn().mockResolvedValue(undefined),
    syncGet: jest.fn().mockResolvedValue({}),
    onChanged: jest.fn(),
    offChanged: jest.fn(),
    getLocal: jest.fn().mockResolvedValue({}),
    setLocal: jest.fn().mockResolvedValue(undefined),
    removeLocal: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockResolvedValue({}),
    setSession: jest.fn().mockResolvedValue(undefined),
    removeSession: jest.fn().mockResolvedValue(undefined),
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn(),
    clear: jest.fn().mockResolvedValue(undefined),
    setSessionAccessLevel: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IStorageAdapter>;
}

function createMockRuntime(): jest.Mocked<IRuntimeAdapter> {
  return {
    id: 'test-extension-id',
    lastError: null,
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    onMessage: jest.fn(),
    offMessage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
    addMessageListener: jest.fn(),
    removeMessageListener: jest.fn(),
  } as jest.Mocked<IRuntimeAdapter>;
}

function createMockTabs(): jest.Mocked<ITabsAdapter> {
  return {
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    focusWindow: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    remove: jest.fn().mockResolvedValue(undefined),
    addTabListener: jest.fn(),
    removeTabListener: jest.fn(),
  } as jest.Mocked<ITabsAdapter>;
}

function createMockDOM(initialOnline = true): MockDOMAdapter {
  let online = initialOnline;
  const eventListeners = new Map<string, (event: Event) => void>();

  const dom = {
    getElementById: jest.fn().mockReturnValue(null),
    querySelector: jest.fn().mockReturnValue(null),
    querySelectorAll: jest.fn().mockReturnValue([]),
    addWindowListener: jest.fn(),
    removeWindowListener: jest.fn(),
    addEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
      eventListeners.set(type, listener);
    }),
    removeEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
      if (eventListeners.get(type) === listener) {
        eventListeners.delete(type);
      }
    }),
    postMessage: jest.fn(),
    locationOrigin: 'chrome-extension://test',
    locationHref: 'chrome-extension://test/auth.html',
    get isOnline() {
      return online;
    },
    closeWindow: jest.fn(),
    getOrigin: jest.fn().mockReturnValue('chrome-extension://test'),
    getVisibilityState: jest.fn().mockReturnValue('visible'),
    createElement: jest.fn((tagName: string) => document.createElement(tagName)),
    getExtensionUrl: jest.fn((path: string) => `chrome-extension://test/${path}`),
    setOnline(status: boolean) {
      online = status;
    },
    emitNetworkEvent(type: 'online' | 'offline') {
      eventListeners.get(type)?.(new Event(type));
    },
  };

  return dom as unknown as MockDOMAdapter;
}

function createMockView(): jest.Mocked<AuthView> {
  return {
    initialize: jest.fn(),
    showSection: jest.fn(),
    updateStepProgress: jest.fn(),
    updateConnectingStatus: jest.fn(),
    showSuccess: jest.fn(),
    showError: jest.fn(),
    updateOnlineStatus: jest.fn(),
    getOnlineStatus: jest.fn().mockReturnValue(true),
    formatAddress: jest.fn(),
    getNetworkName: jest.fn(),
    getSelectedAccountMode: jest.fn().mockReturnValue('live'),
    closeWindow: jest.fn(),
  } as unknown as jest.Mocked<AuthView>;
}

function createMockApiClient(overrides: Partial<jest.Mocked<AuthApiClient>> = {}): jest.Mocked<AuthApiClient> {
  return {
    getSIWEChallenge: jest.fn().mockResolvedValue({
      message: 'ctj.test wants you to sign in',
      nonce: 'nonce-123',
    }),
    verifySIWE: jest.fn().mockResolvedValue({
      sessionToken: 'session-token-123',
      userId: 'user-123',
    }),
    ...overrides,
  } as jest.Mocked<AuthApiClient>;
}

function installMockProvider(request: jest.Mock): EthereumProvider {
  const provider = {
    request,
    isConnected: jest.fn().mockReturnValue(true),
    on: jest.fn(),
    removeListener: jest.fn(),
    isMetaMask: true,
    chainId: '0x1',
    selectedAddress: '0x1234567890123456789012345678901234567890',
  } as unknown as EthereumProvider;

  Object.defineProperty(window, 'ethereum', {
    value: provider,
    configurable: true,
    writable: true,
  });

  return provider;
}

function createController(options: {
  dom?: MockDOMAdapter;
  storage?: jest.Mocked<IStorageAdapter>;
  view?: jest.Mocked<AuthView>;
  apiClient?: jest.Mocked<AuthApiClient>;
} = {}): {
  controller: AuthController;
  dom: MockDOMAdapter;
  storage: jest.Mocked<IStorageAdapter>;
  view: jest.Mocked<AuthView>;
  apiClient: jest.Mocked<AuthApiClient>;
} {
  const dom = options.dom ?? createMockDOM();
  const storage = options.storage ?? createMockStorage();
  const view = options.view ?? createMockView();
  const apiClient = options.apiClient ?? createMockApiClient();

  const controller = new AuthController(
    storage,
    createMockRuntime(),
    createMockTabs(),
    dom,
    view,
    apiClient,
    {
      apiBaseUrl: 'https://cryptotradingjournal.xyz',
      dashboardPath: '/dashboard',
      walletDetectionAttempts: 1,
      walletDetectionInitialDelay: 0,
      autoRedirectDelay: 0,
    }
  );

  return { controller, dom, storage, view, apiClient };
}

describe('AuthController offline/backend availability', () => {
  let originalEthereum: unknown;

  beforeEach(() => {
    jest.useFakeTimers();
    originalEthereum = (window as unknown as { ethereum?: unknown }).ethereum;
  });

  afterEach(() => {
    Object.defineProperty(window, 'ethereum', {
      value: originalEthereum,
      configurable: true,
      writable: true,
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('initializes auth-page network status and reacts to online/offline events', () => {
    const { controller, dom, view } = createController({ dom: createMockDOM(true) });

    controller.initialize();

    expect(view.updateOnlineStatus).toHaveBeenCalledWith(true);
    expect(dom.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(dom.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));

    dom.setOnline(false);
    dom.emitNetworkEvent('offline');

    expect(view.updateOnlineStatus).toHaveBeenLastCalledWith(false);

    controller.destroy();

    expect(dom.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(dom.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('fails fast without prompting the wallet when the browser is offline', async () => {
    const walletRequest = jest.fn();
    installMockProvider(walletRequest);

    const { controller, view, apiClient, storage } = createController({ dom: createMockDOM(false) });

    await controller.authenticate();

    expect(walletRequest).not.toHaveBeenCalled();
    expect(apiClient.getSIWEChallenge).not.toHaveBeenCalled();
    expect(storage.localSet).not.toHaveBeenCalled();
    expect(view.updateOnlineStatus).toHaveBeenCalledWith(false);
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining(OFFLINE_MESSAGE_FRAGMENT));
    expect(controller.getState()).toMatchObject({ step: 'error' });
  });

  it('shows a user-safe backend-unreachable error and does not persist a session when challenge fetch fails', async () => {
    const walletRequest = jest.fn(async (args: RequestArguments) => {
      if (args.method === 'eth_requestAccounts') return ['0x1234567890123456789012345678901234567890'];
      if (args.method === 'eth_chainId') return '0x1';
      throw new Error(`Unexpected wallet method: ${args.method}`);
    });
    installMockProvider(walletRequest);

    const apiClient = createMockApiClient({
      getSIWEChallenge: jest.fn().mockRejectedValue(new NetworkError('Network error: failed to fetch')),
    });
    const { controller, view, storage } = createController({ apiClient });

    await controller.authenticate();

    expect(apiClient.getSIWEChallenge).toHaveBeenCalledWith({
      address: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      accountMode: 'live',
    });
    expect(apiClient.verifySIWE).not.toHaveBeenCalled();
    expect(storage.localSet).not.toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalledWith(
      'Unable to connect to the server. Please check your internet connection and try again.'
    );
  });

  it('stops before signature verification if the connection drops after wallet signing', async () => {
    const dom = createMockDOM(true);
    const walletRequest = jest.fn(async (args: RequestArguments) => {
      if (args.method === 'eth_requestAccounts') return ['0x1234567890123456789012345678901234567890'];
      if (args.method === 'eth_chainId') return '0x1';
      if (args.method === 'personal_sign') {
        dom.setOnline(false);
        return '0xsigned';
      }
      throw new Error(`Unexpected wallet method: ${args.method}`);
    });
    installMockProvider(walletRequest);

    const apiClient = createMockApiClient();
    const { controller, view, storage } = createController({ dom, apiClient });

    await controller.authenticate();

    expect(apiClient.getSIWEChallenge).toHaveBeenCalledTimes(1);
    expect(apiClient.verifySIWE).not.toHaveBeenCalled();
    expect(storage.localSet).not.toHaveBeenCalled();
    expect(view.updateOnlineStatus).toHaveBeenLastCalledWith(false);
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining(OFFLINE_MESSAGE_FRAGMENT));
  });
});
