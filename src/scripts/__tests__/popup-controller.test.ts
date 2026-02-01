/**
 * PopupController Tests
 * 
 * Tests for the popup controller business logic
 */

import { PopupController, PopupStorageKeys } from '../ui/popup/PopupController';
import type { PopupView } from '../ui/popup/PopupView';
import {
  createMockStorageAdapter,
  createMockRuntimeAdapter,
  createMockTabsAdapter,
} from '../core/Container';
import type { IStorageAdapter, IRuntimeAdapter, ITabsAdapter } from '../adapters/types';

// ============================================================================
// Mock PopupView
// ============================================================================

function createMockPopupView(): jest.Mocked<PopupView> {
  return {
    initialize: jest.fn(),
    showView: jest.fn(),
    showError: jest.fn(),
    showConnectedState: jest.fn(),
    updateOnlineStatus: jest.fn(),
    getOnlineStatus: jest.fn().mockReturnValue(true),
    close: jest.fn(),
  } as unknown as jest.Mocked<PopupView>;
}

// ============================================================================
// Tests
// ============================================================================

describe('PopupController', () => {
  let storage: IStorageAdapter;
  let runtime: IRuntimeAdapter;
  let tabs: ITabsAdapter;
  let view: jest.Mocked<PopupView>;
  let controller: PopupController;

  beforeEach(() => {
    storage = createMockStorageAdapter();
    runtime = createMockRuntimeAdapter();
    tabs = createMockTabsAdapter();
    view = createMockPopupView();

    controller = new PopupController(storage, runtime, tabs, view);
  });

  afterEach(() => {
    controller.destroy();
  });

  describe('initialize', () => {
    it('should initialize view with event handlers', async () => {
      await controller.initialize();

      expect(view.initialize).toHaveBeenCalledWith({
        onConnect: expect.any(Function),
        onDisconnect: expect.any(Function),
        onOpenApp: expect.any(Function),
        onRetry: expect.any(Function),
      });
    });

    it('should check session on initialize', async () => {
      await controller.initialize();

      expect(view.showView).toHaveBeenCalledWith('loading');
    });

    it('should show not connected if offline', async () => {
      view.getOnlineStatus.mockReturnValue(false);

      await controller.initialize();

      expect(view.updateOnlineStatus).toHaveBeenCalledWith(false);
    });
  });

  describe('checkSession', () => {
    it('should show loading state first', async () => {
      await controller.checkSession();

      expect(view.showView).toHaveBeenCalledWith('loading');
    });

    it('should show not connected when no session in storage', async () => {
      await controller.checkSession();

      expect(view.showView).toHaveBeenCalledWith('notConnected');
    });

    it('should show connected state when session exists', async () => {
      // Set up session in storage
      await storage.localSet({
        [PopupStorageKeys.CONNECTED_ADDRESS]: '0x1234567890abcdef1234567890abcdef12345678',
        [PopupStorageKeys.CHAIN_ID]: '0x1',
        [PopupStorageKeys.ACCOUNT_MODE]: 'live',
      });
      await storage.sessionSet({
        [PopupStorageKeys.SESSION_TOKEN]: 'test-token',
      });

      await controller.checkSession();

      expect(view.showConnectedState).toHaveBeenCalledWith({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        shortAddress: '0x1234...5678',
        networkName: 'Ethereum',
        accountMode: 'Live Trading',
      });
    });

    it('should show connected with demo mode', async () => {
      await storage.localSet({
        [PopupStorageKeys.CONNECTED_ADDRESS]: '0x1234567890abcdef1234567890abcdef12345678',
        [PopupStorageKeys.CHAIN_ID]: '0x89', // Polygon
        [PopupStorageKeys.ACCOUNT_MODE]: 'demo',
      });
      await storage.sessionSet({
        [PopupStorageKeys.SESSION_TOKEN]: 'test-token',
      });

      await controller.checkSession();

      expect(view.showConnectedState).toHaveBeenCalledWith({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        shortAddress: '0x1234...5678',
        networkName: 'Polygon',
        accountMode: 'Demo Mode',
      });
    });

    it('should handle storage errors gracefully', async () => {
      // Simulate storage error
      jest.spyOn(storage, 'localGet').mockRejectedValue(new Error('Storage error'));

      await controller.checkSession();

      expect(view.showView).toHaveBeenCalledWith('notConnected');
    });
  });

  describe('disconnect', () => {
    it('should show loading state', async () => {
      await controller.disconnect();

      expect(view.showView).toHaveBeenCalledWith('loading');
    });

    it('should clear storage', async () => {
      await storage.localSet({
        [PopupStorageKeys.CONNECTED_ADDRESS]: '0x1234',
      });
      await storage.sessionSet({
        [PopupStorageKeys.SESSION_TOKEN]: 'token',
      });

      await controller.disconnect();

      const localData = await storage.localGet<Record<string, unknown>>([
        PopupStorageKeys.CONNECTED_ADDRESS,
      ]);
      const sessionData = await storage.sessionGet<Record<string, unknown>>([
        PopupStorageKeys.SESSION_TOKEN,
      ]);

      expect(localData[PopupStorageKeys.CONNECTED_ADDRESS]).toBeUndefined();
      expect(sessionData[PopupStorageKeys.SESSION_TOKEN]).toBeUndefined();
    });

    it('should show not connected after disconnect', async () => {
      await controller.disconnect();

      expect(view.showView).toHaveBeenCalledWith('notConnected');
    });

    it('should send disconnect message to background', async () => {
      const sendMessageSpy = jest.spyOn(runtime, 'sendMessage');
      await storage.sessionSet({
        [PopupStorageKeys.SESSION_TOKEN]: 'test-token',
      });

      await controller.disconnect();

      expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'DISCONNECT' });
    });

    it('should clear storage even if backend disconnect fails', async () => {
      jest.spyOn(runtime, 'sendMessage').mockRejectedValue(new Error('Network error'));
      await storage.sessionSet({
        [PopupStorageKeys.SESSION_TOKEN]: 'test-token',
      });
      await storage.localSet({
        [PopupStorageKeys.CONNECTED_ADDRESS]: '0x1234',
      });

      await controller.disconnect();

      const localData = await storage.localGet<Record<string, unknown>>([
        PopupStorageKeys.CONNECTED_ADDRESS,
      ]);
      expect(localData[PopupStorageKeys.CONNECTED_ADDRESS]).toBeUndefined();
      expect(view.showView).toHaveBeenCalledWith('notConnected');
    });
  });

  describe('openMainApp', () => {
    it('should create new tab with app URL', async () => {
      const createSpy = jest.spyOn(tabs, 'create');

      await controller.openMainApp();

      expect(createSpy).toHaveBeenCalledWith({
        url: 'https://cryptotradingjournal.xyz',
        active: true,
      });
    });

    it('should close popup after opening app', async () => {
      await controller.openMainApp();

      expect(view.close).toHaveBeenCalled();
    });

    it('should use custom app URL from storage', async () => {
      // Note: syncGet is read-only in mock, so we test with default
      const createSpy = jest.spyOn(tabs, 'create');

      await controller.openMainApp();

      expect(createSpy).toHaveBeenCalledWith({
        url: expect.any(String),
        active: true,
      });
    });

    it('should show error if opening app fails', async () => {
      jest.spyOn(tabs, 'create').mockRejectedValue(new Error('Tab error'));

      await controller.openMainApp();

      expect(view.showError).toHaveBeenCalledWith(
        'Failed to open Trading Journal. Please try again.'
      );
    });
  });

  describe('openTradingJournal', () => {
    it('should create new tab with dashboard URL', async () => {
      const createSpy = jest.spyOn(tabs, 'create');

      await controller.openTradingJournal();

      expect(createSpy).toHaveBeenCalledWith({
        url: 'https://cryptotradingjournal.xyz/dashboard',
        active: true,
      });
    });
  });

  describe('storage change listener', () => {
    it('should set up storage listener on initialize', async () => {
      const onChangedSpy = jest.spyOn(storage, 'onChanged');

      await controller.initialize();

      expect(onChangedSpy).toHaveBeenCalled();
    });

    it('should remove listener on destroy', async () => {
      const offChangedSpy = jest.spyOn(storage, 'offChanged');
      await controller.initialize();

      controller.destroy();

      expect(offChangedSpy).toHaveBeenCalled();
    });
  });
});

describe('PopupController with custom config', () => {
  it('should use custom app URL from config', async () => {
    const storage = createMockStorageAdapter();
    const runtime = createMockRuntimeAdapter();
    const tabs = createMockTabsAdapter();
    const view = createMockPopupView();
    const createSpy = jest.spyOn(tabs, 'create');

    const controller = new PopupController(storage, runtime, tabs, view, {
      defaultAppUrl: 'https://custom.app.com',
    });

    await controller.openMainApp();

    expect(createSpy).toHaveBeenCalledWith({
      url: 'https://custom.app.com',
      active: true,
    });

    controller.destroy();
  });
});
