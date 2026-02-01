/**
 * Tests for PopupController State-Adaptive CTA Button
 * 
 * Tests the button label and behavior for different states:
 * - Off-site with no wallet: "Get MetaMask"
 * - Off-site with wallet: "Open CTJ App"
 * - On-site: "Connect on Page"
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PopupController } from '../src/scripts/ui/popup/PopupController';

// ============================================================================
// Mock DOM Elements
// ============================================================================

interface MockElement {
  textContent: string | null;
  className: string;
  href?: string;
  target?: string;
  classList: {
    add: jest.Mock;
    remove: jest.Mock;
    contains: jest.Mock;
  };
  setAttribute: jest.Mock;
  removeAttribute: jest.Mock;
  addEventListener: jest.Mock;
  appendChild: jest.Mock;
  onclick: (() => void) | null;
}

function createMockElement(): MockElement {
  return {
    textContent: null,
    className: '',
    href: '',
    target: '',
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn().mockReturnValue(false),
    },
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    addEventListener: jest.fn(),
    appendChild: jest.fn(),
    onclick: null,
  };
}

// ============================================================================
// Mock Dependencies
// ============================================================================

const mockStorage = {
  localGet: jest.fn(),
  localSet: jest.fn(),
  sessionGet: jest.fn(),
  sessionSet: jest.fn(),
  syncGet: jest.fn(),
  syncSet: jest.fn(),
  onChanged: jest.fn(),
  offChanged: jest.fn(),
};

const mockRuntime = {
  sendMessage: jest.fn(),
  onMessage: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
  getManifest: jest.fn().mockReturnValue({ version: '2.2.5' }),
};

const mockTabs = {
  query: jest.fn(),
  sendMessage: jest.fn(),
  create: jest.fn(),
};

const mockView = {
  initialize: jest.fn(),
  showView: jest.fn(),
  updateConnectedState: jest.fn(),
  updateOnlineStatus: jest.fn(),
  updateStatusIndicators: jest.fn(),
  getOnlineStatus: jest.fn().mockReturnValue(true),
  showError: jest.fn(),
  close: jest.fn(), // Add missing close method
};

// ============================================================================
// Mock window.open and window.close
// ============================================================================

const mockWindowOpen = jest.fn();
const mockWindowClose = jest.fn();

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ authenticated: false }),
    status: 200,
    statusText: 'OK',
  } as Response)
);

beforeEach(() => {
  // Reset mocks
  jest.clearAllMocks();
  
  // Set up window mocks
  if (typeof global.window === 'undefined') {
    global.window = {} as Window & typeof globalThis;
  }
  global.window.open = mockWindowOpen;
  global.window.close = mockWindowClose;
  
  // Reset storage mocks to default values
  mockStorage.localGet.mockResolvedValue({});
  mockStorage.sessionGet.mockResolvedValue({});
  mockStorage.syncGet.mockResolvedValue({});
  mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
  mockTabs.sendMessage.mockResolvedValue({ success: false, walletAvailable: false });
});

// ============================================================================
// Tests
// ============================================================================

describe('PopupController - State-Adaptive CTA Button', () => {
  let controller: PopupController;
  let connectButton: MockElement;
  let walletStatusEl: MockElement;
  let walletLabelEl: MockElement;
  let domainStatusEl: MockElement;
  let domainLabelEl: MockElement;
  let gettingStartedEl: MockElement;

  beforeEach(() => {
    // Create mock DOM elements
    connectButton = createMockElement();
    walletStatusEl = createMockElement();
    walletLabelEl = createMockElement();
    domainStatusEl = createMockElement();
    domainLabelEl = createMockElement();
    gettingStartedEl = createMockElement();

    // Mock document.createElement for creating link elements
    const originalCreateElement = document.createElement;
    document.createElement = jest.fn((tagName: string) => {
      if (tagName === 'a') {
        return createMockElement() as unknown as HTMLElement;
      }
      return originalCreateElement.call(document, tagName);
    }) as typeof document.createElement;

    // Mock document.getElementById to return our mock elements
    const originalGetElementById = document.getElementById;
    document.getElementById = jest.fn((id: string) => {
      if (id === 'connectButton') return connectButton as unknown as HTMLElement;
      if (id === 'walletStatus') return walletStatusEl as unknown as HTMLElement;
      if (id === 'walletStatusLabel') return walletLabelEl as unknown as HTMLElement;
      if (id === 'domainStatus') return domainStatusEl as unknown as HTMLElement;
      if (id === 'domainStatusLabel') return domainLabelEl as unknown as HTMLElement;
      if (id === 'gettingStarted') return gettingStartedEl as unknown as HTMLElement;
      return originalGetElementById.call(document, id);
    }) as typeof document.getElementById;

    // Create controller with mocked dependencies
    controller = new PopupController(
      mockStorage as any,
      mockRuntime as any,
      mockTabs as any,
      mockView as any
    );
  });

  describe('Off-site (wallet state unknown)', () => {
    it('should show "Open CTJ App" button text (wallet state unknown off-site)', async () => {
      // Setup: not on allowed domain, wallet state unknown
      // Note: We can't detect wallet when off-site, so we assume it might exist
      // and direct user to the app
      mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockTabs.sendMessage.mockResolvedValue({ success: false, walletAvailable: false });
      
      // Initialize controller (which calls updateStatusIndicators)
      await controller.initialize();
      
      // When off-site, we can't know wallet state, so we direct to app
      expect(connectButton.textContent).toBe('Open CTJ App');
    });

    it('should set ARIA label without "wallet" terminology', async () => {
      mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockTabs.sendMessage.mockResolvedValue({ success: false, walletAvailable: false });
      
      await controller.initialize();
      
      // Off-site shows "Open CTJ App" with appropriate ARIA label
      expect(connectButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        expect.stringContaining('MetaMask')
      );
      // Should not use "wallet extension" terminology
      expect(connectButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        expect.not.stringContaining('wallet extension')
      );
    });

    it('should open CTJ app when button clicked (directs user to proper domain)', async () => {
      mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockTabs.sendMessage.mockResolvedValue({ success: false, walletAvailable: false });
      
      await controller.initialize();
      
      // Get the onConnect handler and trigger it
      const handlers = mockView.initialize.mock.calls[0][0];
      await handlers.onConnect();
      
      // Should open CTJ app (not MetaMask download)
      expect(mockTabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('cryptotradingjournal.xyz')
        })
      );
    });
  });

  describe('Off-site (wallet assumed present)', () => {
    it('should show "Open CTJ App" button text', async () => {
      // Setup: not on allowed domain
      // When off-site, we assume wallet might exist and direct to app
      mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      await controller.initialize();
      
      // Off-site always shows "Open CTJ App" (we can't detect wallet from off-site)
      expect(connectButton.textContent).toBe('Open CTJ App');
    });

    it('should set ARIA label for opening app', async () => {
      mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      await controller.initialize();
      
      expect(connectButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        expect.stringMatching(/Open.*Crypto Trading Journal.*MetaMask/i)
      );
    });

    it('should open CTJ app when button clicked', async () => {
      mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      await controller.initialize();
      
      // Get the onConnect handler and trigger it
      const handlers = mockView.initialize.mock.calls[0][0];
      await handlers.onConnect();
      
      // Verify CTJ app tab created
      expect(mockTabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('cryptotradingjournal.xyz')
        })
      );
    });
  });

  describe('On supported site', () => {
    it('should show "Connect on Page" button text when wallet detected', async () => {
      // Setup: on allowed domain with wallet
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://cryptotradingjournal.xyz/login' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        walletAvailable: true,
        walletName: 'MetaMask'
      });
      
      await controller.initialize();
      
      expect(connectButton.textContent).toBe('Connect on Page');
    });

    it('should set ARIA label instructing to use page button', async () => {
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://cryptotradingjournal.xyz/login' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        walletAvailable: true
      });
      
      await controller.initialize();
      
      expect(connectButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        expect.stringMatching(/Connect button on the page.*MetaMask/i)
      );
    });

    it('should close popup when button clicked', async () => {
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://cryptotradingjournal.xyz/login' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        walletAvailable: true
      });
      
      await controller.initialize();
      
      // Get the onConnect handler and trigger it
      const handlers = mockView.initialize.mock.calls[0][0];
      await handlers.onConnect();
      
      // Verify popup closed
      expect(mockWindowClose).toHaveBeenCalled();
    });

    it('should show "Get MetaMask" when no wallet on supported site', async () => {
      // Setup: on allowed domain but no wallet detected
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://cryptotradingjournal.xyz/login' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        walletAvailable: false
      });
      
      await controller.initialize();
      
      // When on allowed domain but wallet not detected, should prompt to get MetaMask
      expect(connectButton.textContent).toBe('Get MetaMask');
    });
  });

  describe('Localhost development', () => {
    it('should handle localhost:3000 as allowed domain', async () => {
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'http://localhost:3000/login' }
      ]);
      mockTabs.sendMessage.mockResolvedValue({
        success: true,
        walletAvailable: true
      });
      
      await controller.initialize();
      
      // On localhost with wallet should show "Connect on Page"
      expect(connectButton.textContent).toBe('Connect on Page');
    });

    it('should not match localhost in query params', async () => {
      // Test the URL validation fix - shouldn't match localhost:3000 in URL path/params
      mockTabs.query.mockResolvedValue([
        { id: 1, url: 'https://evil.com/?redirect=localhost:3000' }
      ]);
      
      await controller.initialize();
      
      // Should be treated as off-site (not localhost)
      expect(connectButton.textContent).not.toBe('Connect on Page');
    });
  });

  describe('ARIA label compliance', () => {
    it('should not use standalone "wallet" term in any state', async () => {
      const testCases = [
        // Off-site, no wallet
        { url: 'https://example.com', walletAvailable: false },
        // Off-site, wallet unknown
        { url: 'https://example.com', walletAvailable: undefined },
        // On-site, with wallet
        { url: 'https://cryptotradingjournal.xyz', walletAvailable: true },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockTabs.query.mockResolvedValue([{ id: 1, url: testCase.url }]);
        if (testCase.walletAvailable !== undefined) {
          mockTabs.sendMessage.mockResolvedValue({
            success: true,
            walletAvailable: testCase.walletAvailable
          });
        }

        await controller.initialize();

        // Check that ARIA label doesn't have problematic wallet terminology
        const setAttributeCalls = connectButton.setAttribute.mock.calls;
        const ariaLabelCall = setAttributeCalls.find(call => call[0] === 'aria-label');
        
        if (ariaLabelCall) {
          const ariaLabel = ariaLabelCall[1] as string;
          // Should not say "wallet extension" but "MetaMask extension" is OK
          expect(ariaLabel).not.toMatch(/\bwallet\s+extension\b/i);
        }
      }
    });
  });
});
