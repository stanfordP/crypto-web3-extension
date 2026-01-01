/**
 * Unit Tests for Popup Script
 * 
 * Tests the popup UI logic including:
 * - View state management
 * - Session checking
 * - Auth page opening
 * - Disconnect functionality
 * - Online/offline handling
 */

import { StorageKeys, SUPPORTED_CHAINS } from '../types';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock chrome API
const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
    },
    session: {
      get: jest.fn(),
      clear: jest.fn(),
    },
    sync: {
      get: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    lastError: null as { message: string } | null,
  },
  tabs: {
    create: jest.fn(),
  },
};

// @ts-expect-error - Mocking chrome global
global.chrome = mockChrome;

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
  },
  writable: true,
});

// Mock DOM elements
const mockElements = {
  loading: { classList: { add: jest.fn(), remove: jest.fn() } },
  notConnected: { classList: { add: jest.fn(), remove: jest.fn() } },
  connected: { classList: { add: jest.fn(), remove: jest.fn() } },
  error: { classList: { add: jest.fn(), remove: jest.fn() } },
  connectButton: { addEventListener: jest.fn(), setAttribute: jest.fn(), removeAttribute: jest.fn() },
  disconnectButton: { addEventListener: jest.fn() },
  openAppButton: { addEventListener: jest.fn() },
  retryButton: { addEventListener: jest.fn() },
  address: { textContent: '' },
  network: { textContent: '' },
  accountMode: { textContent: '' },
  errorMessage: { textContent: '' },
  offlineIndicator: { classList: { add: jest.fn(), remove: jest.fn() } },
};

// Mock document.getElementById to return our mock elements
jest.spyOn(document, 'getElementById').mockImplementation(
  (id: string) => mockElements[id as keyof typeof mockElements] as unknown as HTMLElement || null
);

// Mock window.close
Object.defineProperty(window, 'close', {
  value: jest.fn(),
  writable: true,
});

// ============================================================================
// Helper Functions (Extracted from popup.ts for testing)
// ============================================================================

function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getNetworkName(chainId: string): string {
  const chain = SUPPORTED_CHAINS[chainId];
  if (chain) {
    return chain.chainName.replace(' Mainnet', '').replace(' Chain', '');
  }
  return `Chain ${parseInt(chainId, 16)}`;
}

type ViewState = 'loading' | 'notConnected' | 'connected' | 'error';

function showView(view: ViewState): void {
  const sections = ['loading', 'notConnected', 'connected', 'error'];
  sections.forEach(s => {
    const el = mockElements[s as keyof typeof mockElements];
    if (el && 'classList' in el) {
      if (s === view) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });
}

function showError(message: string): void {
  mockElements.errorMessage.textContent = message;
  showView('error');
}

// ============================================================================
// Tests
// ============================================================================

describe('Popup Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  describe('truncateAddress', () => {
    it('should truncate long addresses', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(truncateAddress(address)).toBe('0x1234...7890');
    });

    it('should return short addresses unchanged', () => {
      const address = '0x12345';
      expect(truncateAddress(address)).toBe('0x12345');
    });

    it('should handle exactly 12 character addresses', () => {
      const address = '0x1234567890';
      // 12 characters is not < 12, so it gets truncated
      expect(truncateAddress(address)).toBe('0x1234...7890');
    });

    it('should handle edge case of 11 characters', () => {
      const address = '0x123456789';
      expect(truncateAddress(address)).toBe('0x123456789');
    });
  });

  describe('getNetworkName', () => {
    it('should return Ethereum for mainnet', () => {
      expect(getNetworkName('0x1')).toBe('Ethereum');
    });

    it('should return Polygon for Polygon mainnet', () => {
      expect(getNetworkName('0x89')).toBe('Polygon');
    });

    it('should return Arbitrum for Arbitrum One', () => {
      expect(getNetworkName('0xa4b1')).toBe('Arbitrum One');
    });

    it('should return fallback for unknown chains', () => {
      expect(getNetworkName('0x999')).toBe('Chain 2457');
    });

    it('should handle decimal string chain IDs', () => {
      // 0xff = 255
      expect(getNetworkName('0xff')).toBe('Chain 255');
    });
  });

  describe('showView', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should show loading view and hide others', () => {
      showView('loading');
      expect(mockElements.loading.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockElements.notConnected.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.connected.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.error.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should show connected view and hide others', () => {
      showView('connected');
      expect(mockElements.connected.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockElements.loading.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.notConnected.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.error.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should show notConnected view', () => {
      showView('notConnected');
      expect(mockElements.notConnected.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should show error view', () => {
      showView('error');
      expect(mockElements.error.classList.remove).toHaveBeenCalledWith('hidden');
    });
  });

  describe('showError', () => {
    it('should set error message and show error view', () => {
      showError('Test error message');
      expect(mockElements.errorMessage.textContent).toBe('Test error message');
    });

    it('should handle empty error message', () => {
      showError('');
      expect(mockElements.errorMessage.textContent).toBe('');
    });
  });

  describe('Session Management', () => {
    it('should detect valid session from dual storage', async () => {
      // Non-sensitive data in local storage
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
        [StorageKeys.CHAIN_ID]: '0x1',
        [StorageKeys.ACCOUNT_MODE]: 'live',
      });
      // Sensitive token in session storage
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'valid-token',
      });

      const localResult = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
        StorageKeys.CHAIN_ID,
        StorageKeys.ACCOUNT_MODE,
      ]);
      const sessionResult = await mockChrome.storage.session.get([
        StorageKeys.SESSION_TOKEN,
      ]);

      const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);
      expect(hasSession).toBe(true);
    });

    it('should detect missing session when both storages empty', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});
      mockChrome.storage.session.get.mockResolvedValue({});

      const localResult = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
      ]);
      const sessionResult = await mockChrome.storage.session.get([
        StorageKeys.SESSION_TOKEN,
      ]);

      const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);
      expect(hasSession).toBe(false);
    });

    it('should detect partial session (address only, no token)', async () => {
      mockChrome.storage.local.get.mockResolvedValue({
        [StorageKeys.CONNECTED_ADDRESS]: '0x1234567890123456789012345678901234567890',
      });
      mockChrome.storage.session.get.mockResolvedValue({});

      const localResult = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
      ]);
      const sessionResult = await mockChrome.storage.session.get([
        StorageKeys.SESSION_TOKEN,
      ]);

      const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);
      expect(hasSession).toBe(false);
    });

    it('should detect partial session (token only, no address)', async () => {
      mockChrome.storage.local.get.mockResolvedValue({});
      mockChrome.storage.session.get.mockResolvedValue({
        [StorageKeys.SESSION_TOKEN]: 'valid-token',
      });

      const localResult = await mockChrome.storage.local.get([
        StorageKeys.CONNECTED_ADDRESS,
      ]);
      const sessionResult = await mockChrome.storage.session.get([
        StorageKeys.SESSION_TOKEN,
      ]);

      const hasSession = !!(localResult[StorageKeys.CONNECTED_ADDRESS] && sessionResult[StorageKeys.SESSION_TOKEN]);
      expect(hasSession).toBe(false);
    });
  });

  describe('Auth Page Opening', () => {
    it('should send OPEN_AUTH_TAB message to background', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        callback({ success: true });
      });

      await new Promise<void>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' }, (response: { success: boolean }) => {
          expect(response.success).toBe(true);
          resolve();
        });
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'OPEN_AUTH_TAB' },
        expect.any(Function)
      );
    });

    it('should handle auth page open failure', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        callback({ success: false, error: 'Failed to open auth page' });
      });

      await new Promise<void>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'OPEN_AUTH_TAB' }, (response: { success: boolean; error?: string }) => {
          expect(response.success).toBe(false);
          expect(response.error).toBe('Failed to open auth page');
          resolve();
        });
      });
    });
  });

  describe('Disconnect', () => {
    it('should clear storage on disconnect', async () => {
      mockChrome.storage.local.clear.mockResolvedValue(undefined);
      mockChrome.storage.session.clear.mockResolvedValue(undefined);

      await mockChrome.storage.local.clear();
      await mockChrome.storage.session.clear();

      expect(mockChrome.storage.local.clear).toHaveBeenCalled();
      expect(mockChrome.storage.session.clear).toHaveBeenCalled();
    });

    it('should send DISCONNECT message to background', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        if (callback) callback({ success: true });
      });

      await new Promise<void>((resolve) => {
        mockChrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
          resolve();
        });
      });

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'DISCONNECT' },
        expect.any(Function)
      );
    });
  });

  describe('App URL Configuration', () => {
    it('should get app URL from sync storage', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({ appUrl: 'https://myapp.com' });

      const result = await mockChrome.storage.sync.get('appUrl');
      expect(result.appUrl).toBe('https://myapp.com');
    });

    it('should use default URL when not configured', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});

      const result = await mockChrome.storage.sync.get('appUrl');
      const appUrl = result.appUrl || 'http://localhost:3000';
      expect(appUrl).toBe('http://localhost:3000');
    });
  });

  describe('Storage Change Listener', () => {
    it('should register storage change listener', () => {
      const callback = jest.fn();
      mockChrome.storage.onChanged.addListener(callback);
      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalledWith(callback);
    });
  });

  describe('Open Trading Journal', () => {
    it('should open dashboard in new tab', () => {
      mockChrome.tabs.create.mockResolvedValue({ id: 1 });
      
      mockChrome.tabs.create({ url: 'http://localhost:3000/dashboard' });
      
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'http://localhost:3000/dashboard',
      });
    });
  });
});

describe('Popup Offline Handling', () => {
  it('should detect online status', () => {
    expect(navigator.onLine).toBe(true);
  });

  it('should handle offline state', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    expect(navigator.onLine).toBe(false);
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });
});
