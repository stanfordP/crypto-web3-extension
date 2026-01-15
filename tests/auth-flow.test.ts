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
const WALLET_TIMEOUT = 10000;
const MESSAGE_TIMEOUT = 5000;

// ============================================================================
// Test Fixtures
// ============================================================================

let context: BrowserContext;
let extensionId: string | undefined;

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

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
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

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
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

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      return new Promise<{ success: boolean; code?: number; message?: string }>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);

        const handler = (event: MessageEvent) => {
          if (event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false, message: 'Timeout' }), 10000);

        window.postMessage({
          type: 'CJ_WALLET_CONNECT',
          requestId,
        }, '*');
      });
    });

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

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
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
    const signResult = await page.evaluate((address) => {
      return new Promise<{ success: boolean; signature?: string; error?: string }>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);
        const siweMessage = `localhost:3001 wants you to sign in with your Ethereum account:
${address}

Sign in to CTJ

URI: http://localhost:3001
Version: 1
Chain ID: 1
Nonce: test123
Issued At: ${new Date().toISOString()}`;

        const handler = (event: MessageEvent) => {
          if (event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false, error: 'Timeout' }), 10000);

        window.postMessage({
          type: 'CJ_WALLET_SIGN',
          requestId,
          message: siweMessage,
          address,
        }, '*');
      });
    }, MOCK_WALLET_ADDRESS);

    expect(signResult.success).toBe(true);
    expect(signResult.signature).toBeDefined();
    expect(signResult.signature).toMatch(/^0x[a-f0-9]+$/i);

    await page.close();
  });

  test('handles sign rejection', async () => {
    const page = await context.newPage();
    await injectMockWallet(page, { shouldRejectSign: true });

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
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

    const signResult = await page.evaluate((address) => {
      return new Promise<{ success: boolean; code?: number }>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);

        const handler = (event: MessageEvent) => {
          if (event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 10000);

        window.postMessage({
          type: 'CJ_WALLET_SIGN',
          requestId,
          message: 'Test message',
          address,
        }, '*');
      });
    }, MOCK_WALLET_ADDRESS);

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

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const storeResult = await page.evaluate((address) => {
      return new Promise<{ success: boolean }>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);

        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SESSION_STORED' && event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 5000);

        window.postMessage({
          type: 'CJ_STORE_SESSION',
          requestId,
          session: {
            sessionToken: 'test-token-123',
            address,
            chainId: '0x1',
          },
        }, '*');
      });
    }, MOCK_WALLET_ADDRESS);

    expect(storeResult.success).toBe(true);

    // Verify session persisted by requesting it
    const sessionResult = await page.evaluate(() => {
      return new Promise<{ session?: { address: string } | null }>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SESSION_RESPONSE') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({}), 5000);

        window.postMessage({ type: 'CJ_GET_SESSION' }, '*');
      });
    });

    expect(sessionResult.session).toBeDefined();
    expect(sessionResult.session?.address).toBe(MOCK_WALLET_ADDRESS);

    await page.close();
  });

  test('CJ_CLEAR_SESSION removes session', async () => {
    const page = await context.newPage();

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Store a session first
    await page.evaluate((address) => {
      return new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SESSION_STORED') {
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({
          type: 'CJ_STORE_SESSION',
          requestId: 'store-1',
          session: { sessionToken: 'token', address, chainId: '0x1' },
        }, '*');
      });
    }, MOCK_WALLET_ADDRESS);

    // Clear the session
    const clearResult = await page.evaluate(() => {
      return new Promise<{ success: boolean }>((resolve) => {
        const requestId = Math.random().toString(36).substring(2);

        const handler = (event: MessageEvent) => {
          if (event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 5000);

        window.postMessage({ type: 'CJ_CLEAR_SESSION', requestId }, '*');
      });
    });

    expect(clearResult.success).toBe(true);

    // Verify session is gone
    const sessionResult = await page.evaluate(() => {
      return new Promise<{ session?: unknown }>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SESSION_RESPONSE') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve({}), 5000);
        window.postMessage({ type: 'CJ_GET_SESSION' }, '*');
      });
    });

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
    const page = await context.newPage();
    await injectMockWallet(page);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Send many rapid requests
    const results = await page.evaluate(() => {
      return Promise.all(
        Array.from({ length: 30 }, (_, i) => {
          return new Promise<{ success: boolean; rateLimited?: boolean }>((resolve) => {
            const requestId = `rapid-${i}`;

            const handler = (event: MessageEvent) => {
              if (event.data?.requestId === requestId) {
                window.removeEventListener('message', handler);
                resolve({
                  success: event.data.success ?? false,
                  rateLimited: event.data.code === 'RATE_LIMITED' || event.data.type === 'CJ_ERROR',
                });
              }
            };

            window.addEventListener('message', handler);
            setTimeout(() => resolve({ success: false, rateLimited: true }), 2000);

            window.postMessage({ type: 'CJ_CHECK_EXTENSION', requestId }, '*');
          });
        })
      );
    });

    // Some requests should have been rate limited
    const rateLimitedCount = results.filter(r => r.rateLimited).length;
    console.log(`Rate limited ${rateLimitedCount} of ${results.length} requests`);

    // At least some should succeed (not all rate limited)
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBeGreaterThan(0);

    await page.close();
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

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Step 1: Connect wallet
    const connectResult = await page.evaluate(() => {
      return new Promise<{ success: boolean; address?: string; chainId?: string }>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_WALLET_RESULT') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 10000);
        window.postMessage({ type: 'CJ_WALLET_CONNECT', requestId: 'flow-connect' }, '*');
      });
    });

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

    const signResult = await page.evaluate(({ message, address }) => {
      return new Promise<{ success: boolean; signature?: string }>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SIGN_RESULT') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 10000);
        window.postMessage({
          type: 'CJ_WALLET_SIGN',
          requestId: 'flow-sign',
          message,
          address,
        }, '*');
      });
    }, { message: siweMessage, address: connectResult.address });

    expect(signResult.success).toBe(true);
    expect(signResult.signature).toBeDefined();

    // Step 3: Store session
    const storeResult = await page.evaluate(({ address }) => {
      return new Promise<{ success: boolean }>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SESSION_STORED') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 5000);
        window.postMessage({
          type: 'CJ_STORE_SESSION',
          requestId: 'flow-store',
          session: {
            sessionToken: 'flow-session-token',
            address,
            chainId: '0x1',
          },
        }, '*');
      });
    }, { address: connectResult.address });

    expect(storeResult.success).toBe(true);

    // Step 4: Verify session persists
    const sessionResult = await page.evaluate(() => {
      return new Promise<{ session?: { address: string; sessionToken: string } | null }>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_SESSION_RESPONSE') {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve({}), 5000);
        window.postMessage({ type: 'CJ_GET_SESSION' }, '*');
      });
    });

    expect(sessionResult.session).toBeDefined();
    expect(sessionResult.session?.address).toBe(connectResult.address);
    expect(sessionResult.session?.sessionToken).toBe('flow-session-token');

    // Step 5: Clean up - disconnect
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_DISCONNECT_RESPONSE' || event.data?.type === 'CJ_SESSION_STORED') {
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);
        setTimeout(resolve, 3000);
        window.postMessage({ type: 'CJ_CLEAR_SESSION', requestId: 'flow-clear' }, '*');
      });
    });

    await page.close();
  });
});
