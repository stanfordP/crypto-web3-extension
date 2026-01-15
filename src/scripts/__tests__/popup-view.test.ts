/**
 * PopupView Tests
 * 
 * Tests for the popup view DOM manipulation
 */

import { PopupView, truncateAddress, getNetworkName, formatAccountMode } from '../ui/popup/PopupView';
import { createMockDOMAdapter } from '../core/Container';
import type { IDOMAdapter } from '../adapters/types';

// ============================================================================
// Mock DOM Elements
// ============================================================================

function createMockElement(id: string): HTMLElement {
  const element = document.createElement('div');
  element.id = id;
  element.classList.add('hidden');
  return element;
}

function createMockElements() {
  return {
    loading: createMockElement('loading'),
    notConnected: createMockElement('notConnected'),
    connected: createMockElement('connected'),
    error: createMockElement('error'),
    connectButton: createMockElement('connectButton'),
    disconnectButton: createMockElement('disconnectButton'),
    openAppButton: createMockElement('openAppButton'),
    retryButton: createMockElement('retryButton'),
    address: createMockElement('address'),
    network: createMockElement('network'),
    accountMode: createMockElement('accountMode'),
    errorMessage: createMockElement('errorMessage'),
    offlineIndicator: createMockElement('offlineIndicator'),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PopupView', () => {
  let dom: IDOMAdapter;
  let elements: ReturnType<typeof createMockElements>;
  let view: PopupView;

  beforeEach(() => {
    dom = createMockDOMAdapter();
    elements = createMockElements();
    
    view = new PopupView(dom, elements);
  });

  describe('showView', () => {
    it('should show loading state', () => {
      view.showView('loading');

      expect(elements.loading.classList.contains('hidden')).toBe(false);
      expect(elements.notConnected.classList.contains('hidden')).toBe(true);
      expect(elements.connected.classList.contains('hidden')).toBe(true);
      expect(elements.error.classList.contains('hidden')).toBe(true);
    });

    it('should show not connected state', () => {
      view.showView('notConnected');

      expect(elements.loading.classList.contains('hidden')).toBe(true);
      expect(elements.notConnected.classList.contains('hidden')).toBe(false);
      expect(elements.connected.classList.contains('hidden')).toBe(true);
      expect(elements.error.classList.contains('hidden')).toBe(true);
    });

    it('should show connected state', () => {
      view.showView('connected');

      expect(elements.loading.classList.contains('hidden')).toBe(true);
      expect(elements.notConnected.classList.contains('hidden')).toBe(true);
      expect(elements.connected.classList.contains('hidden')).toBe(false);
      expect(elements.error.classList.contains('hidden')).toBe(true);
    });

    it('should show error state', () => {
      view.showView('error');

      expect(elements.loading.classList.contains('hidden')).toBe(true);
      expect(elements.notConnected.classList.contains('hidden')).toBe(true);
      expect(elements.connected.classList.contains('hidden')).toBe(true);
      expect(elements.error.classList.contains('hidden')).toBe(false);
    });
  });

  describe('showError', () => {
    it('should display error message and show error view', () => {
      view.showError('Test error message');

      expect(elements.errorMessage.textContent).toBe('Test error message');
      expect(elements.error.classList.contains('hidden')).toBe(false);
    });
  });

  describe('showConnectedState', () => {
    it('should display session data', () => {
      view.showConnectedState({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        shortAddress: '0x1234...5678',
        networkName: 'Ethereum',
        accountMode: 'Live Trading',
      });

      expect(elements.address.textContent).toBe('0x1234...5678');
      expect(elements.network.textContent).toBe('Ethereum');
      expect(elements.accountMode.textContent).toBe('Live Trading');
      expect(elements.connected.classList.contains('hidden')).toBe(false);
    });
  });

  describe('updateOnlineStatus', () => {
    it('should show offline indicator when offline', () => {
      view.updateOnlineStatus(false);

      expect(elements.offlineIndicator?.classList.contains('hidden')).toBe(false);
      expect(elements.connectButton.getAttribute('disabled')).toBe('true');
    });

    it('should hide offline indicator when online', () => {
      view.updateOnlineStatus(false);
      view.updateOnlineStatus(true);

      expect(elements.offlineIndicator?.classList.contains('hidden')).toBe(true);
      expect(elements.connectButton.getAttribute('disabled')).toBeNull();
    });
  });

  describe('getOnlineStatus', () => {
    it('should return true by default', () => {
      expect(view.getOnlineStatus()).toBe(true);
    });

    it('should return false after offline update', () => {
      view.updateOnlineStatus(false);
      expect(view.getOnlineStatus()).toBe(false);
    });

    it('should return true after coming back online', () => {
      view.updateOnlineStatus(false);
      view.updateOnlineStatus(true);
      expect(view.getOnlineStatus()).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should call event handlers on button clicks', () => {
      const handlers = {
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
        onOpenApp: jest.fn(),
        onRetry: jest.fn(),
      };

      view.initialize(handlers);

      elements.disconnectButton.click();
      expect(handlers.onDisconnect).toHaveBeenCalled();

      elements.openAppButton.click();
      expect(handlers.onOpenApp).toHaveBeenCalled();
    });

    it('should show error when connect clicked while offline', () => {
      const handlers = {
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
        onOpenApp: jest.fn(),
        onRetry: jest.fn(),
      };

      view.initialize(handlers);
      view.updateOnlineStatus(false);
      elements.connectButton.click();

      expect(handlers.onConnect).not.toHaveBeenCalled();
      expect(elements.error.classList.contains('hidden')).toBe(false);
    });

    it('should show error when retry clicked while offline', () => {
      const handlers = {
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
        onOpenApp: jest.fn(),
        onRetry: jest.fn(),
      };

      view.initialize(handlers);
      view.updateOnlineStatus(false);
      elements.retryButton.click();

      expect(handlers.onRetry).not.toHaveBeenCalled();
      expect(elements.error.classList.contains('hidden')).toBe(false);
    });

    it('should call onConnect when online and connect clicked', () => {
      const handlers = {
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
        onOpenApp: jest.fn(),
        onRetry: jest.fn(),
      };

      view.initialize(handlers);
      elements.connectButton.click();

      expect(handlers.onConnect).toHaveBeenCalled();
    });

    it('should call onRetry when online and retry clicked', () => {
      const handlers = {
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
        onOpenApp: jest.fn(),
        onRetry: jest.fn(),
      };

      view.initialize(handlers);
      elements.retryButton.click();

      expect(handlers.onRetry).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should call dom closeWindow', () => {
      const closeSpy = jest.spyOn(dom, 'closeWindow');
      view.close();
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});

describe('Utility Functions', () => {
  describe('truncateAddress', () => {
    it('should truncate long addresses', () => {
      expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678'))
        .toBe('0x1234...5678');
    });

    it('should not truncate short addresses', () => {
      expect(truncateAddress('0x1234')).toBe('0x1234');
    });

    it('should handle edge cases', () => {
      expect(truncateAddress('')).toBe('');
      expect(truncateAddress('0x12345678')).toBe('0x12345678');
      expect(truncateAddress('0x123456789012')).toBe('0x1234...9012');
    });
  });

  describe('getNetworkName', () => {
    it('should return network name for known chain IDs', () => {
      expect(getNetworkName('0x1')).toBe('Ethereum');
      expect(getNetworkName('0x89')).toBe('Polygon');
      expect(getNetworkName('0xa4b1')).toBe('Arbitrum');
      expect(getNetworkName('0xa')).toBe('Optimism');
      expect(getNetworkName('0x2105')).toBe('Base');
      expect(getNetworkName('0x38')).toBe('BNB Chain');
      expect(getNetworkName('0xa86a')).toBe('Avalanche');
    });

    it('should return chain number for unknown chain IDs', () => {
      expect(getNetworkName('0x5')).toBe('Chain 5');
      expect(getNetworkName('0x539')).toBe('Chain 1337');
    });
  });

  describe('formatAccountMode', () => {
    it('should return Demo Mode for demo', () => {
      expect(formatAccountMode('demo')).toBe('Demo Mode');
    });

    it('should return Live Trading for live', () => {
      expect(formatAccountMode('live')).toBe('Live Trading');
    });

    it('should return Live Trading for undefined', () => {
      expect(formatAccountMode(undefined)).toBe('Live Trading');
    });
  });
});
