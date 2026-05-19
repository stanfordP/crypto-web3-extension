/**
 * E2E Tests for CTJ Web3 Extension - Full Authentication Flow
 *
 * These tests verify the complete SIWE authentication flow:
 * 1. Extension detection
 * 2. Wallet connection
 * 3. Message signing
 * 4. Session management
 * 5. Disconnect flow
 *
 * Prerequisites:
 * - Extension built: npm run build:dev
 * - Test server running: cd test-ground && npm start
 *
 * Run with: npx playwright test tests/auth-flow.test.ts
 */

import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');
const TEST_GROUND_URL = 'http://localhost:3001';
const MOCK_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_CHAIN_ID = '0x1'; // Mainnet

// Test timeouts
const _WALLET_TIMEOUT = 10000;
const _MESSAGE_TIMEOUT = 5000;

// ============================================================================
// Test Fixtures
// ============================================================================

let context: BrowserContext;
let extensionId: string | undefined;

interface ExtensionBridgeMessage {
  type: string;
  requestId?: string;
  success?: boolean;
  address?: string;
  chainId?: string;
  signature?: string;
  code?: number | string;
  message?: string;
  error?: string;
  session?: Record<string, unknown> | null;
  hasValidToken?: boolean;
}

interface SessionMutationResult {
  ackCount: number;
  sessionChangedCount: number;
  ackMessage: ExtensionBridgeMessage | null;
  lastSession: Record<string, unknown> | null;
  timedOut: boolean;
}

/**
 * Helper to inject a mock wallet provider for testing
 */
async function injectMockWallet(page: Page, options: {
  address?: string;
  chainId?: string;
  shouldRejectConnect?: boolean;
  shouldRejectSign?: boolean;
  signDelay?: number;
} = {}): Promise<void> {
  const {
    address = MOCK_WALLET_ADDRESS,
    chainId = MOCK_CHAIN_ID,
    shouldRejectConnect = false,
    shouldRejectSign = false,
    signDelay = 100,
  } = options;

  await page.addInitScript(`
    window.__mockWalletConfig = {
      address: '${address}',
      chainId: '${chainId}',
      shouldRejectConnect: ${shouldRejectConnect},
      shouldRejectSign: ${shouldRejectSign},
      signDelay: ${signDelay},
    };

    // Create mock wallet before any scripts run
    window.ethereum = {
      isMetaMask: true,
      isMockWallet: true,
      chainId: '${chainId}',
      selectedAddress: null,
      _events: {},

      on(event, callback) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(callback);
      },

      removeListener(event, callback) {
        if (this._events[event]) {
          this._events[event] = this._events[event].filter(cb => cb !== callback);
        }
      },

      emit(event, data) {
        if (this._events[event]) {
          this._events[event].forEach(cb => cb(data));
        }
      },

      async request({ method, params }) {
        console.log('[MockWallet] Request:', method, params);

        switch (method) {
          case 'eth_requestAccounts':
            if (window.__mockWalletConfig.shouldRejectConnect) {
              throw { code: 4001, message: 'User rejected the request' };
            }
            this.selectedAddress = window.__mockWalletConfig.address;
            this.emit('accountsChanged', [this.selectedAddress]);
            return [this.selectedAddress];

          case 'eth_accounts':
            return this.selectedAddress ? [this.selectedAddress] : [];

          case 'eth_chainId':
            return window.__mockWalletConfig.chainId;

          case 'personal_sign':
            if (window.__mockWalletConfig.shouldRejectSign) {
              throw { code: 4001, message: 'User rejected signing' };
            }
            // Simulate wallet delay
            await new Promise(r => setTimeout(r, window.__mockWalletConfig.signDelay));
            // Return a mock signature (65 bytes hex)
            return '0x' + 'ab'.repeat(65);

          case 'wallet_switchEthereumChain':
            this.chainId = params[0].chainId;
            this.emit('chainChanged', this.chainId);
            return null;

          case 'net_version':
            return parseInt(window.__mockWalletConfig.chainId, 16).toString();

          default:
            console.warn('[MockWallet] Unhandled method:', method);
            throw { code: 4200, message: 'Method not supported' };
        }
      }
    };

    console.log('[MockWallet] Injected successfully');
  `);
}

/**
 * Get extension ID from context with retry logic
 */
async function getExtensionId(ctx: BrowserContext, maxAttempts = 10): Promise<string | undefined> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Try service workers first (MV3)
    const workers = ctx.serviceWorkers();
    for (const worker of workers) {
      const url = worker.url();
      if (url.includes('chrome-extension://')) {
        return url.split('/')[2];
      }
    }

    // Fallback to background pages (legacy MV2)
    const bgPages = ctx.backgroundPages();
    for (const page of bgPages) {
      const url = page.url();
      if (url.includes('chrome-extension://')) {
        return url.split('/')[2];
      }
    }

    // Wait and retry
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return undefined;
}

async function postExtensionRequest(
  page: Page,
  type: string,
  payload: Record<string, unknown> = {},
  expectedTypes: string[],
  timeoutMs = 10000
): Promise<ExtensionBridgeMessage> {
  return page.evaluate(
    ({ type: requestType, payload, expectedTypes, timeoutMs }) => {
      return new Promise<ExtensionBridgeMessage>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);

        const cleanup = (timeoutId: number) => {
          window.removeEventListener('message', handler);
          window.clearTimeout(timeoutId);
        };

        const handler = (event: MessageEvent) => {
          const data = event.data;
          if (!data || typeof data.type !== 'string') {
            return;
          }

          if (data.requestId !== requestId) {
            return;
          }

          if (!expectedTypes.includes(data.type)) {
            return;
          }

          cleanup(timeoutId);
          resolve(data as ExtensionBridgeMessage);
        };

        const timeoutId = window.setTimeout(() => {
          cleanup(timeoutId);
          resolve({
            type: '__TIMEOUT__',
            requestId,
            success: false,
            message: 'Timeout',
          });
        }, timeoutMs);

        window.addEventListener('message', handler);
        window.postMessage({ type: requestType, requestId, ...payload }, window.location.origin);
      });
    },
    { type, payload, expectedTypes, timeoutMs }
  );
}

async function requestPageSession(page: Page, timeoutMs = 5000): Promise<ExtensionBridgeMessage> {
  return page.evaluate(({ timeoutMs }) => {
    return new Promise<ExtensionBridgeMessage>((resolve) => {
      const cleanup = (timeoutId: number) => {
        window.removeEventListener('message', handler);
        window.clearTimeout(timeoutId);
      };

      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.type !== 'CJ_SESSION_RESPONSE') {
          return;
        }

        cleanup(timeoutId);
        resolve(data as ExtensionBridgeMessage);
      };

      const timeoutId = window.setTimeout(() => {
        cleanup(timeoutId);
        resolve({
          type: '__TIMEOUT__',
          success: false,
          message: 'Timeout',
        });
      }, timeoutMs);

      window.addEventListener('message', handler);
      window.postMessage({ type: 'CJ_GET_SESSION' }, window.location.origin);
    });
  }, { timeoutMs });
}

async function mutateSessionAndObserve(
  page: Page,
  type: 'CJ_STORE_SESSION' | 'CJ_CLEAR_SESSION',
  payload: Record<string, unknown> = {},
  timeoutMs = 5000
): Promise<SessionMutationResult> {
  return page.evaluate(
    ({ type: requestType, payload, timeoutMs }) => {
      return new Promise<SessionMutationResult>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);
        let ackCount = 0;
        let sessionChangedCount = 0;
        let ackMessage: ExtensionBridgeMessage | null = null;
        let lastSession: Record<string, unknown> | null = null;
        let settleTimer: number | null = null;

        const cleanup = () => {
          window.removeEventListener('message', handler);
          window.clearTimeout(timeoutId);
          if (settleTimer !== null) {
            window.clearTimeout(settleTimer);
          }
        };

        const finish = (timedOut: boolean) => {
          cleanup();
          resolve({
            ackCount,
            sessionChangedCount,
            ackMessage,
            lastSession,
            timedOut,
          });
        };

        const scheduleFinish = () => {
          if (settleTimer !== null) {
            window.clearTimeout(settleTimer);
          }
          settleTimer = window.setTimeout(() => finish(false), 750);
        };

        const handler = (event: MessageEvent) => {
          const data = event.data;
          if (!data || typeof data.type !== 'string') {
            return;
          }

          if (data.type === 'CJ_SESSION_STORED' && data.requestId === requestId) {
            ackCount += 1;
            ackMessage = data as ExtensionBridgeMessage;
            scheduleFinish();
            return;
          }

          if (data.type === 'CJ_SESSION_CHANGED') {
            sessionChangedCount += 1;
            lastSession = (data.session as Record<string, unknown> | null | undefined) ?? null;
            if (ackCount > 0) {
              scheduleFinish();
            }
          }
        };

        const timeoutId = window.setTimeout(() => finish(true), timeoutMs);

        window.addEventListener('message', handler);
        window.postMessage({ type: requestType, requestId, ...payload }, window.location.origin);
      });
    },
    { type, payload, timeoutMs }
  );
}

async function gotoTestGround(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(TEST_GROUND_URL, {
        timeout: 5000,
        waitUntil: 'domcontentloaded',
      });
      return true;
    } catch {
      if (attempt === 1) {
        return false;
      }
      await page.waitForTimeout(500);
    }
  }

  return false;
}

// ============================================================================
// Test Suite: Extension Loading
// ============================================================================

test.describe('Extension Loading & Detection', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
    });

    // Wait for extension to fully load (service worker registration)
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to get extension ID with retry
    extensionId = await getExtensionId(context);
    
    // If still not found, try listening for new service workers
    if (!extensionId) {
      const workerPromise = new Promise<string | undefined>((resolve) => {
        const timeout = setTimeout(() => resolve(undefined), 5000);
        context.on('serviceworker', (worker: { url: () => string }) => {
          const url = worker.url();
          if (url.includes('chrome-extension://')) {
            clearTimeout(timeout);
            resolve(url.split('/')[2]);
          }
        });
      });
      extensionId = await workerPromise;
    }
    
    console.log('[Test] Extension ID detected:', extensionId ?? 'NOT FOUND');
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('extension loads without errors', async () => {
    // Extension ID detection can be flaky in CI/different environments
    // The key test is whether the content script responds (next test)
    if (!extensionId) {
      console.warn('[Test] Extension ID not detected via service worker - will verify via content script');
      // Don't fail here, let the content script test verify
      test.skip();
      return;
    }
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('popup renders correctly', async () => {
    if (!extensionId) {
      test.skip();
      return;
    }

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Check popup elements
    await expect(page.locator('h1.title')).toBeVisible();
    await expect(page.locator('.subtitle')).toContainText('Web3');

    await page.close();
  });

  test('extension responds to CJ_CHECK_EXTENSION', async () => {
    const page = await context.newPage();

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    // Wait for extension injection
    await page.waitForTimeout(1000);

    const isExtensionPresent = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_EXTENSION_PRESENT') {
            window.removeEventListener('message', handler);
            resolve(true);
          }
        };
        window.addEventListener('message', handler);

        // Timeout after 3 seconds
        setTimeout(() => resolve(false), 3000);

        // Send check message
        window.postMessage({ type: 'CJ_CHECK_EXTENSION' }, '*');
      });
    });

    expect(isExtensionPresent).toBe(true);
    await page.close();
  });
});

// ============================================================================
// Test Suite: Wallet Connection Flow
// ============================================================================

test.describe('Wallet Connection Flow', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
    });
    await new Promise(r => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('CJ_WALLET_CONNECT returns address and chainId', async () => {
    const page = await context.newPage();
    await injectMockWallet(page);

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500); // Wait for injection

    const result = await page.evaluate(() => {
      return new Promise<{ success: boolean; address?: string; chainId?: string; error?: string }>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);

        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_WALLET_RESULT' && event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
          if (event.data?.type === 'CJ_ERROR' && event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve({ success: false, error: event.data.message });
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false, error: 'Timeout' }), 10000);

        window.postMessage({
          type: 'CJ_WALLET_CONNECT',
          requestId,
        }, '*');
      });
    });

    expect(result.success).toBe(true);
    expect(result.address).toBe(MOCK_WALLET_ADDRESS);
    expect(result.chainId).toBe(MOCK_CHAIN_ID);

    await page.close();
  });

  test('handles user rejection gracefully', async () => {
    const page = await context.newPage();
    await injectMockWallet(page, { shouldRejectConnect: true });

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const result = await postExtensionRequest(
      page,
      'CJ_WALLET_CONNECT',
      {},
      ['CJ_WALLET_RESULT', 'CJ_ERROR']
    );

    expect(result.type).toBe('CJ_ERROR');
    expect(result.success).toBe(false);
    expect(result.code).toBe(4001); // User rejected

    await page.close();
  });
});

// ============================================================================
// Test Suite: Message Signing (SIWE)
// ============================================================================

test.describe('SIWE Message Signing', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
    });
    await new Promise(r => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('CJ_WALLET_SIGN returns signature', async () => {
    const page = await context.newPage();
    await injectMockWallet(page);

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // First connect
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_WALLET_RESULT') {
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'CJ_WALLET_CONNECT', requestId: 'connect-1' }, '*');
      });
    });

    // Then sign
    const siweMessage = `localhost:3001 wants you to sign in with your Ethereum account:
${MOCK_WALLET_ADDRESS}

Sign in to CTJ

URI: http://localhost:3001
Version: 1
Chain ID: 1
Nonce: test123
Issued At: ${new Date().toISOString()}`;

    const signResult = await postExtensionRequest(
      page,
      'CJ_WALLET_SIGN',
      {
        message: siweMessage,
        address: MOCK_WALLET_ADDRESS,
      },
      ['CJ_SIGN_RESULT', 'CJ_ERROR']
    );

    expect(signResult.type).toBe('CJ_SIGN_RESULT');
    expect(signResult.success).toBe(true);
    expect(signResult.signature).toBeDefined();
    expect(signResult.signature).toMatch(/^0x[a-f0-9]+$/i);

    await page.close();
  });

  test('handles sign rejection', async () => {
    const page = await context.newPage();
    await injectMockWallet(page, { shouldRejectSign: true });

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Connect first
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_WALLET_RESULT') {
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'CJ_WALLET_CONNECT', requestId: 'connect-2' }, '*');
      });
    });

    const signResult = await postExtensionRequest(
      page,
      'CJ_WALLET_SIGN',
      {
        message: 'Test message',
        address: MOCK_WALLET_ADDRESS,
      },
      ['CJ_SIGN_RESULT', 'CJ_ERROR']
    );

    expect(signResult.type).toBe('CJ_ERROR');
    expect(signResult.success).toBe(false);
    expect(signResult.code).toBe(4001);

    await page.close();
  });
});

// ============================================================================
// Test Suite: Session Management
// ============================================================================

test.describe('Session Management', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
    });
    await new Promise(r => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('CJ_STORE_SESSION persists session', async () => {
    const page = await context.newPage();

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const storeResult = await mutateSessionAndObserve(
      page,
      'CJ_STORE_SESSION',
      {
        session: {
          sessionToken: 'test-token-123',
          address: MOCK_WALLET_ADDRESS,
          chainId: '0x1',
        },
      }
    );

    expect(storeResult.timedOut).toBe(false);
    expect(storeResult.ackCount).toBe(1);
    expect(storeResult.sessionChangedCount).toBe(1);
    expect(storeResult.ackMessage?.success).toBe(true);
    expect(storeResult.lastSession).toEqual(
      expect.objectContaining({
        address: MOCK_WALLET_ADDRESS,
        chainId: '0x1',
        accountMode: 'live',
        isConnected: true,
      })
    );

    // Verify session persisted by requesting it
    const sessionResult = await requestPageSession(page);

    expect(sessionResult.session).toBeDefined();
    expect(sessionResult.session).toEqual(
      expect.objectContaining({
        address: MOCK_WALLET_ADDRESS,
        chainId: '0x1',
        accountMode: 'live',
        isConnected: true,
      })
    );
    expect(sessionResult.session).not.toHaveProperty('sessionToken');

    await page.close();
  });

  test('CJ_CLEAR_SESSION removes session', async () => {
    const page = await context.newPage();

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Store a session first
    await mutateSessionAndObserve(page, 'CJ_STORE_SESSION', {
      session: {
        sessionToken: 'token',
        address: MOCK_WALLET_ADDRESS,
        chainId: '0x1',
      },
    });

    // Clear the session
    const clearResult = await mutateSessionAndObserve(page, 'CJ_CLEAR_SESSION');

    expect(clearResult.timedOut).toBe(false);
    expect(clearResult.ackCount).toBe(1);
    expect(clearResult.sessionChangedCount).toBe(1);
    expect(clearResult.ackMessage?.success).toBe(true);
    expect(clearResult.lastSession).toBeNull();

    // Verify session is gone
    const sessionResult = await requestPageSession(page);

    expect(sessionResult.session).toBeFalsy();

    await page.close();
  });
});

// ============================================================================
// Test Suite: Rate Limiting
// ============================================================================

test.describe('Rate Limiting', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
    });
    await new Promise(r => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('rate limits rapid requests', async () => {
    test.fixme(
      true,
      'Rate limiting is deterministically covered in unit tests. MV3 browser timing spreads rapid storage writes across seconds, so this is not a trustworthy browser-level proof surface.'
    );
  });
});

// ============================================================================
// Test Suite: Full Auth Flow Integration
// ============================================================================

test.describe('Full Authentication Flow', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
    });
    await new Promise(r => setTimeout(r, 2000));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('complete SIWE flow: connect → sign → store → verify', async () => {
    const page = await context.newPage();
    await injectMockWallet(page);

    if (!(await gotoTestGround(page))) {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Step 1: Connect wallet
    const connectResult = await postExtensionRequest(
      page,
      'CJ_WALLET_CONNECT',
      {},
      ['CJ_WALLET_RESULT', 'CJ_ERROR']
    );

    expect(connectResult.success).toBe(true);
    expect(connectResult.address).toBeDefined();

    // Step 2: Sign SIWE message
    const siweMessage = `localhost:3001 wants you to sign in with your Ethereum account:
${connectResult.address}

Sign in to CTJ

URI: http://localhost:3001
Version: 1
Chain ID: 1
Nonce: flowtest123
Issued At: ${new Date().toISOString()}`;

    const signResult = await postExtensionRequest(
      page,
      'CJ_WALLET_SIGN',
      {
        message: siweMessage,
        address: connectResult.address,
      },
      ['CJ_SIGN_RESULT', 'CJ_ERROR']
    );

    expect(signResult.success).toBe(true);
    expect(signResult.signature).toBeDefined();

    // Step 3: Store session
    const storeResult = await mutateSessionAndObserve(page, 'CJ_STORE_SESSION', {
      session: {
        sessionToken: 'flow-session-token',
        address: connectResult.address,
        chainId: '0x1',
      },
    });

    expect(storeResult.timedOut).toBe(false);
    expect(storeResult.ackCount).toBe(1);
    expect(storeResult.sessionChangedCount).toBe(1);
    expect(storeResult.ackMessage?.success).toBe(true);
    expect(storeResult.lastSession).toEqual(
      expect.objectContaining({
        address: connectResult.address,
        chainId: '0x1',
        accountMode: 'live',
        isConnected: true,
      })
    );

    // Step 4: Verify session persists
    const sessionResult = await requestPageSession(page);

    expect(sessionResult.session).toBeDefined();
    expect(sessionResult.session).toEqual(
      expect.objectContaining({
        address: connectResult.address,
        chainId: '0x1',
        accountMode: 'live',
        isConnected: true,
      })
    );
    expect(sessionResult.session).not.toHaveProperty('sessionToken');

    // Step 5: Clean up - disconnect
    const clearResult = await mutateSessionAndObserve(page, 'CJ_CLEAR_SESSION');

    expect(clearResult.timedOut).toBe(false);
    expect(clearResult.ackCount).toBe(1);
    expect(clearResult.sessionChangedCount).toBe(1);
    expect(clearResult.lastSession).toBeNull();

    await page.close();
  });
});
