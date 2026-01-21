/**
 * AuthView Unit Tests
 * 
 * Tests for the AuthView DOM layer that handles UI rendering
 * for the full-page authentication experience.
 */

import { AuthView, AUTH_STEPS, AuthViewSection, AuthViewEventHandlers, AuthSuccessData } from '../src/scripts/ui/auth/AuthView';
import type { IDOMAdapter } from '../src/scripts/adapters/types';

// ============================================================================
// Mock DOM Adapter Factory
// ============================================================================

interface MockElement {
  id: string;
  classList: {
    add: jest.Mock;
    remove: jest.Mock;
    contains: jest.Mock;
  };
  textContent: string | null;
  addEventListener: jest.Mock;
  value?: string;
  checked?: boolean;
}

function createMockElement(id: string, overrides: Partial<MockElement> = {}): MockElement {
  return {
    id,
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn().mockReturnValue(false),
    },
    textContent: null,
    addEventListener: jest.fn(),
    ...overrides,
  };
}

function createMockDOMAdapter(elements: Record<string, MockElement | null> = {}): IDOMAdapter {
  const mockAdapter: IDOMAdapter = {
    getElementById: jest.fn((id: string) => elements[id] ?? createMockElement(id)) as unknown as IDOMAdapter['getElementById'],
    querySelector: jest.fn() as unknown as IDOMAdapter['querySelector'],
    querySelectorAll: jest.fn().mockReturnValue([]) as unknown as IDOMAdapter['querySelectorAll'],
    addWindowListener: jest.fn(),
    removeWindowListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    postMessage: jest.fn(),
    locationOrigin: 'http://localhost',
    locationHref: 'http://localhost/auth.html',
    isOnline: true,
    closeWindow: jest.fn(),
    getOrigin: jest.fn().mockReturnValue('http://localhost'),
    getVisibilityState: jest.fn().mockReturnValue('visible'),
    createElement: jest.fn() as unknown as IDOMAdapter['createElement'],
    getExtensionUrl: jest.fn((path: string) => `chrome-extension://test/${path}`),
  };
  return mockAdapter;
}

function createMockElements(): Record<string, MockElement> {
  const elements: Record<string, MockElement> = {
    // Sections
    loading: createMockElement('loading'),
    noWallet: createMockElement('noWallet'),
    connect: createMockElement('connect'),
    connecting: createMockElement('connecting'),
    success: createMockElement('success'),
    error: createMockElement('error'),
    
    // Buttons
    connectButton: createMockElement('connectButton'),
    cancelButton: createMockElement('cancelButton'),
    retryButton: createMockElement('retryButton'),
    retryDetectionButton: createMockElement('retryDetectionButton'),
    closeErrorButton: createMockElement('closeErrorButton'),
    openDashboardButton: createMockElement('openDashboardButton'),
    
    // Connecting state
    connectingTitle: createMockElement('connectingTitle'),
    connectingStatus: createMockElement('connectingStatus'),
    
    // Success state
    successAddress: createMockElement('successAddress'),
    successNetwork: createMockElement('successNetwork'),
    successMode: createMockElement('successMode'),
    
    // Error state
    errorMessage: createMockElement('errorMessage'),
  };

  // Add step elements
  AUTH_STEPS.forEach(step => {
    elements[step.id] = createMockElement(step.id);
  });

  return elements;
}

function createMockHandlers(): AuthViewEventHandlers {
  return {
    onConnect: jest.fn(),
    onCancel: jest.fn(),
    onRetry: jest.fn(),
    onRetryDetection: jest.fn(),
    onCloseError: jest.fn(),
    onOpenDashboard: jest.fn(),
    onAccountModeChange: jest.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AuthView', () => {
  let mockDom: IDOMAdapter;
  let mockElements: Record<string, MockElement>;
  let authView: AuthView;

  beforeEach(() => {
    mockElements = createMockElements();
    mockDom = createMockDOMAdapter(mockElements);
    
    // Override querySelectorAll for account mode radios
    const mockRadios = [
      { ...createMockElement('radio-live'), value: 'live', checked: true },
      { ...createMockElement('radio-demo'), value: 'demo', checked: false },
    ];
    (mockDom.querySelectorAll as jest.Mock).mockReturnValue(mockRadios);
  });

  describe('Constructor', () => {
    it('should create AuthView with DOM adapter', () => {
      authView = new AuthView(mockDom);
      expect(mockDom.getElementById).toHaveBeenCalled();
    });

    it('should throw error when required element is missing', () => {
      const badDom = createMockDOMAdapter({
        loading: null, // Missing element
      });
      (badDom.getElementById as jest.Mock).mockImplementation((id: string) => {
        if (id === 'loading') return null;
        return createMockElement(id);
      });

      expect(() => new AuthView(badDom)).toThrow('[AuthView] Element not found: #loading');
    });

    it('should accept custom elements override', () => {
      const customLoading = createMockElement('custom-loading');
      authView = new AuthView(mockDom, {
        loading: customLoading as unknown as HTMLElement,
      });
      // Should not throw
      expect(authView).toBeDefined();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should set up event handlers', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      // Verify connect button listener was added
      expect(mockElements.connectButton.addEventListener).toHaveBeenCalledWith(
        'click',
        expect.any(Function)
      );
    });

    it('should set up all button click handlers', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      const buttons = [
        'connectButton',
        'cancelButton',
        'retryButton',
        'retryDetectionButton',
        'closeErrorButton',
        'openDashboardButton',
      ];

      buttons.forEach(buttonId => {
        expect(mockElements[buttonId].addEventListener).toHaveBeenCalledWith(
          'click',
          expect.any(Function)
        );
      });
    });

    it('should call onConnect when connect button is clicked', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      // Get the click handler that was registered
      const clickHandler = mockElements.connectButton.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(handlers.onConnect).toHaveBeenCalled();
    });

    it('should call onCancel when cancel button is clicked', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      const clickHandler = mockElements.cancelButton.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(handlers.onCancel).toHaveBeenCalled();
    });

    it('should call onRetry when retry button is clicked', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      const clickHandler = mockElements.retryButton.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(handlers.onRetry).toHaveBeenCalled();
    });

    it('should call onRetryDetection when retry detection button is clicked', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      const clickHandler = mockElements.retryDetectionButton.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(handlers.onRetryDetection).toHaveBeenCalled();
    });

    it('should call onCloseError when close error button is clicked', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      const clickHandler = mockElements.closeErrorButton.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(handlers.onCloseError).toHaveBeenCalled();
    });

    it('should call onOpenDashboard when open dashboard button is clicked', () => {
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      const clickHandler = mockElements.openDashboardButton.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(handlers.onOpenDashboard).toHaveBeenCalled();
    });

    it('should call onAccountModeChange when account mode radio is changed', () => {
      // Create mock radios with forEach capability
      const mockRadios = [
        { ...createMockElement('radio-live'), value: 'live', checked: true },
        { ...createMockElement('radio-demo'), value: 'demo', checked: false },
      ];
      (mockDom.querySelectorAll as jest.Mock).mockReturnValue(mockRadios);
      
      authView = new AuthView(mockDom);
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      // Get the change handler that was registered on the first radio
      const changeHandler = mockRadios[0].addEventListener.mock.calls[0][1];
      
      // Simulate change event with 'demo' value
      changeHandler({ target: { value: 'demo' } });

      expect(handlers.onAccountModeChange).toHaveBeenCalledWith('demo');
    });

    it('should call onAccountModeChange with live when live radio is selected', () => {
      const mockRadios = [
        { ...createMockElement('radio-live'), value: 'live', checked: true },
        { ...createMockElement('radio-demo'), value: 'demo', checked: false },
      ];
      (mockDom.querySelectorAll as jest.Mock).mockReturnValue(mockRadios);
      
      authView = new AuthView(mockDom);
      const handlers = createMockHandlers();
      authView.initialize(handlers);

      // Get the change handler from the second radio (demo)
      const changeHandler = mockRadios[1].addEventListener.mock.calls[0][1];
      
      // Simulate change event with 'live' value
      changeHandler({ target: { value: 'live' } });

      expect(handlers.onAccountModeChange).toHaveBeenCalledWith('live');
    });

    it('should not set up listeners if handlers is null', () => {
      authView = new AuthView(mockDom);
      // Don't call initialize - handlers remain null
      
      // Verify no event listeners were added to buttons
      // (They would only be added in setupEventListeners which requires handlers)
      const connectButtonCalls = mockElements.connectButton.addEventListener.mock.calls.filter(
        (call: unknown[]) => call[0] === 'click'
      );
      expect(connectButtonCalls).toHaveLength(0);
    });
  });

  describe('showSection', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should show the specified section and hide others', () => {
      authView.showSection('connecting');

      // Connecting should be visible
      expect(mockElements.connecting.classList.remove).toHaveBeenCalledWith('hidden');
      
      // Others should be hidden
      expect(mockElements.loading.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.noWallet.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.connect.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.success.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockElements.error.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should handle all section types', () => {
      const sections: AuthViewSection[] = ['loading', 'noWallet', 'connect', 'connecting', 'success', 'error'];

      sections.forEach(section => {
        // Reset mocks
        Object.values(mockElements).forEach(el => {
          el.classList.add.mockClear();
          el.classList.remove.mockClear();
        });

        authView.showSection(section);
        expect(mockElements[section].classList.remove).toHaveBeenCalledWith('hidden');
      });
    });
  });

  describe('updateStepProgress', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should mark steps before activeIndex as completed', () => {
      authView.updateStepProgress(2); // Step 3 is active (index 2)

      // Steps 1 and 2 should be completed
      expect(mockElements.step1.classList.add).toHaveBeenCalledWith('completed');
      expect(mockElements.step2.classList.add).toHaveBeenCalledWith('completed');
    });

    it('should mark current step as active', () => {
      authView.updateStepProgress(1); // Step 2 is active

      expect(mockElements.step2.classList.add).toHaveBeenCalledWith('active');
    });

    it('should remove previous classes before updating', () => {
      authView.updateStepProgress(1);

      AUTH_STEPS.forEach(step => {
        expect(mockElements[step.id].classList.remove).toHaveBeenCalledWith('active', 'completed');
      });
    });
  });

  describe('updateConnectingStatus', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should update title and status text', () => {
      authView.updateConnectingStatus('Waiting for Wallet', 'Please confirm in MetaMask');

      expect(mockElements.connectingTitle.textContent).toBe('Waiting for Wallet');
      expect(mockElements.connectingStatus.textContent).toBe('Please confirm in MetaMask');
    });
  });

  describe('showSuccess', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should display success data correctly', () => {
      const successData: AuthSuccessData = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        accountMode: 'live',
      };

      authView.showSuccess(successData);

      expect(mockElements.successAddress.textContent).toBe('0x1234...7890');
      expect(mockElements.successNetwork.textContent).toBe('Ethereum Mainnet');
      expect(mockElements.successMode.textContent).toBe('Live Trading');
    });

    it('should display demo mode correctly', () => {
      const successData: AuthSuccessData = {
        address: '0xabcdef1234567890123456789012345678901234',
        chainId: '0x1',
        accountMode: 'demo',
      };

      authView.showSuccess(successData);

      expect(mockElements.successMode.textContent).toBe('Demo Mode');
    });

    it('should switch to success section', () => {
      const successData: AuthSuccessData = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: '0x1',
        accountMode: 'live',
      };

      authView.showSuccess(successData);

      expect(mockElements.success.classList.remove).toHaveBeenCalledWith('hidden');
    });
  });

  describe('showError', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should display error message', () => {
      authView.showError('User rejected the request');

      expect(mockElements.errorMessage.textContent).toBe('User rejected the request');
    });

    it('should switch to error section', () => {
      authView.showError('Connection failed');

      expect(mockElements.error.classList.remove).toHaveBeenCalledWith('hidden');
    });
  });

  describe('formatAddress', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should truncate address correctly', () => {
      const formatted = authView.formatAddress('0x1234567890123456789012345678901234567890');
      expect(formatted).toBe('0x1234...7890');
    });

    it('should handle short addresses gracefully', () => {
      const formatted = authView.formatAddress('0x1234');
      expect(formatted).toBe('0x1234...1234');
    });
  });

  describe('getNetworkName', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should return Ethereum for chainId 0x1', () => {
      expect(authView.getNetworkName('0x1')).toBe('Ethereum Mainnet');
    });

    it('should return human readable name for known chains', () => {
      // Based on SUPPORTED_CHAINS
      expect(authView.getNetworkName('0x1')).toBe('Ethereum Mainnet');
    });

    it('should return Chain X for unknown chain IDs', () => {
      const result = authView.getNetworkName('0x539'); // 1337 in decimal
      expect(result).toBe('Chain 1337');
    });
  });

  describe('getSelectedAccountMode', () => {
    it('should return selected account mode', () => {
      const mockRadio = { value: 'demo', checked: true };
      (mockDom.querySelector as jest.Mock).mockReturnValue(mockRadio);
      
      authView = new AuthView(mockDom);
      const mode = authView.getSelectedAccountMode();
      
      expect(mockDom.querySelector).toHaveBeenCalledWith('input[name="accountMode"]:checked');
    });

    it('should default to live if no selection', () => {
      (mockDom.querySelector as jest.Mock).mockReturnValue(null);
      
      authView = new AuthView(mockDom);
      const mode = authView.getSelectedAccountMode();
      
      expect(mode).toBe('live');
    });
  });

  describe('closeWindow', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should call DOM adapter closeWindow', () => {
      authView.closeWindow();
      expect(mockDom.closeWindow).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Edge Cases and Integration Scenarios
  // ============================================================================

  describe('Edge Cases', () => {
    describe('Element initialization with partial custom elements', () => {
      it('should merge custom elements with DOM-queried elements', () => {
        const customConnect = createMockElement('custom-connect');
        const customElements = {
          connect: customConnect as unknown as HTMLElement,
        };

        authView = new AuthView(mockDom, customElements);
        authView.showSection('connect');

        expect(customConnect.classList.remove).toHaveBeenCalledWith('hidden');
      });

      it('should handle all custom elements being provided', () => {
        const allCustomElements = {
          loading: createMockElement('loading') as unknown as HTMLElement,
          noWallet: createMockElement('noWallet') as unknown as HTMLElement,
          connect: createMockElement('connect') as unknown as HTMLElement,
          connecting: createMockElement('connecting') as unknown as HTMLElement,
          success: createMockElement('success') as unknown as HTMLElement,
          error: createMockElement('error') as unknown as HTMLElement,
          connectButton: createMockElement('connectButton') as unknown as HTMLButtonElement,
          cancelButton: createMockElement('cancelButton') as unknown as HTMLButtonElement,
          retryButton: createMockElement('retryButton') as unknown as HTMLButtonElement,
          retryDetectionButton: createMockElement('retryDetectionButton') as unknown as HTMLButtonElement,
          closeErrorButton: createMockElement('closeErrorButton') as unknown as HTMLButtonElement,
          openDashboardButton: createMockElement('openDashboardButton') as unknown as HTMLButtonElement,
          connectingTitle: createMockElement('connectingTitle') as unknown as HTMLElement,
          connectingStatus: createMockElement('connectingStatus') as unknown as HTMLElement,
          successAddress: createMockElement('successAddress') as unknown as HTMLElement,
          successNetwork: createMockElement('successNetwork') as unknown as HTMLElement,
          successMode: createMockElement('successMode') as unknown as HTMLElement,
          errorMessage: createMockElement('errorMessage') as unknown as HTMLElement,
          accountModeRadios: [] as unknown as NodeListOf<HTMLInputElement>,
          steps: [
            createMockElement('step1') as unknown as HTMLElement,
            createMockElement('step2') as unknown as HTMLElement,
            createMockElement('step3') as unknown as HTMLElement,
            createMockElement('step4') as unknown as HTMLElement,
          ],
        };

        expect(() => new AuthView(mockDom, allCustomElements)).not.toThrow();
      });
    });

    describe('Multiple element missing scenarios', () => {
      it('should throw on first missing element encountered', () => {
        const badDom = createMockDOMAdapter();
        let callCount = 0;
        (badDom.getElementById as jest.Mock).mockImplementation((id: string) => {
          callCount++;
          if (callCount <= 2) return createMockElement(id);
          return null; // Third element not found
        });

        expect(() => new AuthView(badDom)).toThrow(/Element not found/);
      });
    });

    describe('formatAddress edge cases', () => {
      beforeEach(() => {
        authView = new AuthView(mockDom);
      });

      it('should handle empty string', () => {
        const formatted = authView.formatAddress('');
        expect(formatted).toBe('...');
      });

      it('should handle very long addresses', () => {
        const longAddress = '0x' + 'a'.repeat(100);
        const formatted = authView.formatAddress(longAddress);
        expect(formatted).toBe('0xaaaa...aaaa');
      });

      it('should handle addresses with mixed case', () => {
        const formatted = authView.formatAddress('0xAbCdEf1234567890123456789012345678901234');
        expect(formatted).toBe('0xAbCd...1234');
      });
    });

    describe('getNetworkName edge cases', () => {
      beforeEach(() => {
        authView = new AuthView(mockDom);
      });

      it('should handle zero chain ID', () => {
        const result = authView.getNetworkName('0x0');
        expect(result).toBe('Chain 0');
      });

      it('should handle large chain IDs', () => {
        const result = authView.getNetworkName('0xFFFFFFFF'); // 4294967295
        expect(result).toBe('Chain 4294967295');
      });

      it('should handle invalid hex gracefully', () => {
        const result = authView.getNetworkName('invalid');
        expect(result).toBe('Chain NaN');
      });
    });

    describe('Step progress boundary conditions', () => {
      beforeEach(() => {
        authView = new AuthView(mockDom);
      });

      it('should handle activeIndex of 0', () => {
        authView.updateStepProgress(0);
        expect(mockElements.step1.classList.add).toHaveBeenCalledWith('active');
        expect(mockElements.step1.classList.add).not.toHaveBeenCalledWith('completed');
      });

      it('should handle activeIndex beyond steps length', () => {
        // All steps should be completed when index > length
        authView.updateStepProgress(10);
        
        AUTH_STEPS.forEach(step => {
          expect(mockElements[step.id].classList.add).toHaveBeenCalledWith('completed');
        });
      });

      it('should handle negative activeIndex', () => {
        // No steps should be active or completed
        authView.updateStepProgress(-1);
        
        AUTH_STEPS.forEach(step => {
          expect(mockElements[step.id].classList.add).not.toHaveBeenCalledWith('active');
        });
      });

      it('should handle last step as active', () => {
        authView.updateStepProgress(3); // Last step (index 3)
        
        // First 3 should be completed
        expect(mockElements.step1.classList.add).toHaveBeenCalledWith('completed');
        expect(mockElements.step2.classList.add).toHaveBeenCalledWith('completed');
        expect(mockElements.step3.classList.add).toHaveBeenCalledWith('completed');
        // Last should be active
        expect(mockElements.step4.classList.add).toHaveBeenCalledWith('active');
      });
    });

    describe('showSuccess with various chain IDs', () => {
      beforeEach(() => {
        authView = new AuthView(mockDom);
      });

      it('should handle Polygon chain', () => {
        const successData: AuthSuccessData = {
          address: '0x1234567890123456789012345678901234567890',
          chainId: '0x89', // Polygon
          accountMode: 'live',
        };

        authView.showSuccess(successData);

        // Should show the network name if supported, or fallback to Chain X
        expect(mockElements.successNetwork.textContent).toBeDefined();
      });

      it('should handle Arbitrum chain', () => {
        const successData: AuthSuccessData = {
          address: '0x1234567890123456789012345678901234567890',
          chainId: '0xa4b1', // Arbitrum One
          accountMode: 'demo',
        };

        authView.showSuccess(successData);

        expect(mockElements.successMode.textContent).toBe('Demo Mode');
      });
    });

    describe('Connecting status updates', () => {
      beforeEach(() => {
        authView = new AuthView(mockDom);
      });

      it('should handle empty title and status', () => {
        authView.updateConnectingStatus('', '');

        expect(mockElements.connectingTitle.textContent).toBe('');
        expect(mockElements.connectingStatus.textContent).toBe('');
      });

      it('should handle special characters in status', () => {
        authView.updateConnectingStatus('Step <1>', 'Status: "pending" & waiting...');

        expect(mockElements.connectingTitle.textContent).toBe('Step <1>');
        expect(mockElements.connectingStatus.textContent).toBe('Status: "pending" & waiting...');
      });

      it('should handle very long status messages', () => {
        const longMessage = 'A'.repeat(1000);
        authView.updateConnectingStatus('Title', longMessage);

        expect(mockElements.connectingStatus.textContent).toBe(longMessage);
      });
    });

    describe('Error message handling', () => {
      beforeEach(() => {
        authView = new AuthView(mockDom);
      });

      it('should handle empty error message', () => {
        authView.showError('');

        expect(mockElements.errorMessage.textContent).toBe('');
        expect(mockElements.error.classList.remove).toHaveBeenCalledWith('hidden');
      });

      it('should handle error message with HTML-like content', () => {
        authView.showError('<script>alert("xss")</script>');

        // textContent should be set directly (not innerHTML), so it's safe
        expect(mockElements.errorMessage.textContent).toBe('<script>alert("xss")</script>');
      });

      it('should handle multiline error messages', () => {
        const multilineError = 'Error occurred\nPlease try again\nContact support';
        authView.showError(multilineError);

        expect(mockElements.errorMessage.textContent).toBe(multilineError);
      });
    });
  });

  // ============================================================================
  // Rapid State Transitions
  // ============================================================================

  describe('Rapid State Transitions', () => {
    beforeEach(() => {
      authView = new AuthView(mockDom);
    });

    it('should handle rapid section switches', () => {
      const sections: AuthViewSection[] = ['loading', 'connect', 'connecting', 'error', 'success'];
      
      sections.forEach(section => {
        authView.showSection(section);
      });

      // Final section should be visible
      expect(mockElements.success.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should handle switching to same section multiple times', () => {
      authView.showSection('connecting');
      authView.showSection('connecting');
      authView.showSection('connecting');

      // Should still work correctly
      expect(mockElements.connecting.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should handle alternating between two sections', () => {
      for (let i = 0; i < 5; i++) {
        authView.showSection('loading');
        authView.showSection('connect');
      }

      // Last shown should be connect
      const lastRemoveCall = mockElements.connect.classList.remove.mock.calls.slice(-1)[0];
      expect(lastRemoveCall).toEqual(['hidden']);
    });
  });

  // ============================================================================
  // DOM Interaction Verification
  // ============================================================================

  describe('DOM Interaction Verification', () => {
    it('should query for account mode radios on construction', () => {
      authView = new AuthView(mockDom);
      
      expect(mockDom.querySelectorAll).toHaveBeenCalledWith('input[name="accountMode"]');
    });

    it('should query for checked radio on getSelectedAccountMode', () => {
      authView = new AuthView(mockDom);
      authView.getSelectedAccountMode();
      
      expect(mockDom.querySelector).toHaveBeenCalledWith('input[name="accountMode"]:checked');
    });

    it('should get all step elements by ID', () => {
      authView = new AuthView(mockDom);
      
      AUTH_STEPS.forEach(step => {
        expect(mockDom.getElementById).toHaveBeenCalledWith(step.id);
      });
    });

    it('should get all section elements by ID', () => {
      authView = new AuthView(mockDom);
      
      const sectionIds = ['loading', 'noWallet', 'connect', 'connecting', 'success', 'error'];
      sectionIds.forEach(id => {
        expect(mockDom.getElementById).toHaveBeenCalledWith(id);
      });
    });

    it('should get all button elements by ID', () => {
      authView = new AuthView(mockDom);
      
      const buttonIds = [
        'connectButton', 'cancelButton', 'retryButton',
        'retryDetectionButton', 'closeErrorButton', 'openDashboardButton'
      ];
      buttonIds.forEach(id => {
        expect(mockDom.getElementById).toHaveBeenCalledWith(id);
      });
    });
  });
});

describe('AUTH_STEPS', () => {
  it('should have 4 steps', () => {
    expect(AUTH_STEPS).toHaveLength(4);
  });

  it('should have correct step names', () => {
    expect(AUTH_STEPS.map(s => s.name)).toEqual(['Connect', 'Challenge', 'Sign', 'Verify']);
  });

  it('should have correct step IDs', () => {
    expect(AUTH_STEPS.map(s => s.id)).toEqual(['step1', 'step2', 'step3', 'step4']);
  });
});
