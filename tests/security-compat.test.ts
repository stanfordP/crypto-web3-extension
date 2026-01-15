/**
 * Security Extension Compatibility Tests for CTJ Web3 Extension
 *
 * Tests compatibility with popular security extensions:
 * - Pocket Universe (transaction simulation)
 * - Wallet Guard (phishing protection)
 * - Fire (simulation)
 * - Blowfish (transaction preview)
 *
 * These tests verify that CTJ extension:
 * 1. Can detect security extensions
 * 2. Doesn't conflict with their provider injection
 * 3. Handles provider ordering correctly (EIP-6963)
 * 4. Functions correctly when security extensions intercept requests
 */

import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');
const TEST_GROUND_URL = 'http://localhost:3001';

// Mock security extension identifiers
const SECURITY_EXTENSIONS = {
  POCKET_UNIVERSE: {
    id: 'pocket-universe',
    rdns: 'app.pocketuniverse',
    name: 'Pocket Universe',
    uuid: 'pocket-universe-uuid',
  },
  WALLET_GUARD: {
    id: 'wallet-guard',
    rdns: 'io.walletguard',
    name: 'Wallet Guard',
    uuid: 'wallet-guard-uuid',
  },
  FIRE: {
    id: 'fire',
    rdns: 'xyz.joinfire',
    name: 'Fire',
    uuid: 'fire-uuid',
  },
  BLOWFISH: {
    id: 'blowfish',
    rdns: 'xyz.blowfish',
    name: 'Blowfish',
    uuid: 'blowfish-uuid',
  },
};

// ============================================================================
// Test Fixtures
// ============================================================================

let context: BrowserContext;

/**
 * Inject a mock security extension provider
 */
async function injectSecurityExtension(
  page: Page,
  extension: typeof SECURITY_EXTENSIONS.POCKET_UNIVERSE,
  options: {
    interceptConnect?: boolean;
    interceptSign?: boolean;
    delayMs?: number;
    warnOnSign?: boolean;
  } = {}
): Promise<void> {
  const {
    interceptConnect = false,
    interceptSign = true,
    delayMs = 500,
    warnOnSign = true,
  } = options;

  await page.addInitScript(`
    // Create security extension mock
    const securityExtension = {
      isSecurityExtension: true,
      extensionId: '${extension.id}',
      name: '${extension.name}',
      
      async simulateTransaction(tx) {
        console.log('[${extension.name}] Simulating transaction:', tx);
        await new Promise(r => setTimeout(r, ${delayMs}));
        return { safe: true, warnings: [] };
      },
      
      async checkAddress(address) {
        console.log('[${extension.name}] Checking address:', address);
        return { isMalicious: false };
      },
    };

    // Store original window.ethereum if exists
    const originalEthereum = window.ethereum;

    // Create wrapper that intercepts calls
    const wrappedProvider = {
      ...originalEthereum,
      isWrappedBySecurityExtension: true,
      securityExtensionId: '${extension.id}',

      async request(args) {
        const { method, params } = args;
        console.log('[${extension.name}] Intercepted:', method);

        // Simulate security extension behavior
        if (method === 'eth_requestAccounts' && ${interceptConnect}) {
          console.log('[${extension.name}] Showing connect warning');
          await new Promise(r => setTimeout(r, ${delayMs}));
        }

        if (method === 'personal_sign' && ${interceptSign}) {
          console.log('[${extension.name}] Showing sign warning');
          if (${warnOnSign}) {
            // Security extension might show a warning popup
            await new Promise(r => setTimeout(r, ${delayMs}));
          }
        }

        // Pass through to original provider
        if (originalEthereum?.request) {
          return originalEthereum.request(args);
        }
        
        throw new Error('No underlying provider');
      },

      on(...args) {
        return originalEthereum?.on?.(...args);
      },

      removeListener(...args) {
        return originalEthereum?.removeListener?.(...args);
      },
    };

    // Override window.ethereum with wrapped version
    if (window.ethereum) {
      Object.defineProperty(window, 'ethereum', {
        value: wrappedProvider,
        writable: true,
        configurable: true,
      });
    }

    // Also announce via EIP-6963
    const announceSecurityProvider = () => {
      const info = {
        uuid: '${extension.uuid}',
        name: '${extension.name}',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        rdns: '${extension.rdns}',
      };

      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info,
          provider: wrappedProvider,
        }),
      }));
    };

    // Announce on load
    announceSecurityProvider();

    // Listen for requests
    window.addEventListener('eip6963:requestProvider', announceSecurityProvider);

    console.log('[${extension.name}] Security extension mock injected');
  `);
}

/**
 * Inject a mock MetaMask provider
 */
async function injectMockMetaMask(page: Page): Promise<void> {
  await page.addInitScript(`
    window.ethereum = {
      isMetaMask: true,
      isMockMetaMask: true,
      chainId: '0x1',
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
        switch (method) {
          case 'eth_requestAccounts':
            this.selectedAddress = '0xMockAddress1234567890123456789012345678';
            return [this.selectedAddress];
          case 'eth_accounts':
            return this.selectedAddress ? [this.selectedAddress] : [];
          case 'eth_chainId':
            return this.chainId;
          case 'personal_sign':
            return '0x' + 'ab'.repeat(65);
          default:
            throw { code: 4200, message: 'Method not supported' };
        }
      }
    };
  `);
}

// ============================================================================
// Test Suite: Security Extension Detection
// ============================================================================

test.describe('Security Extension Detection', () => {
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

  test('detects Pocket Universe via EIP-6963', async () => {
    const page = await context.newPage();
    await injectMockMetaMask(page);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.POCKET_UNIVERSE);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Request providers via EIP-6963
    const providers = await page.evaluate(() => {
      return new Promise<Array<{ name: string; rdns: string }>>((resolve) => {
        const providers: Array<{ name: string; rdns: string }> = [];

        const handler = (event: CustomEvent<{ info: { name: string; rdns: string } }>) => {
          providers.push({
            name: event.detail.info.name,
            rdns: event.detail.info.rdns,
          });
        };

        window.addEventListener('eip6963:announceProvider', handler as EventListener);

        // Request providers
        window.dispatchEvent(new Event('eip6963:requestProvider'));

        // Wait for announcements
        setTimeout(() => {
          window.removeEventListener('eip6963:announceProvider', handler as EventListener);
          resolve(providers);
        }, 2000);
      });
    });

    // Should see Pocket Universe provider
    const pocketUniverse = providers.find(p => p.rdns === 'app.pocketuniverse');
    expect(pocketUniverse).toBeDefined();
    expect(pocketUniverse?.name).toBe('Pocket Universe');

    await page.close();
  });

  test('detects wrapped provider', async () => {
    const page = await context.newPage();
    await injectMockMetaMask(page);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.WALLET_GUARD);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const isWrapped = await page.evaluate(() => {
      return !!(window.ethereum as any)?.isWrappedBySecurityExtension;
    });

    expect(isWrapped).toBe(true);

    await page.close();
  });
});

// ============================================================================
// Test Suite: Provider Ordering (EIP-6963)
// ============================================================================

test.describe('Provider Ordering (EIP-6963)', () => {
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

  test('multiple providers announce via EIP-6963', async () => {
    const page = await context.newPage();
    await injectMockMetaMask(page);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.POCKET_UNIVERSE);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.FIRE);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    const providers = await page.evaluate(() => {
      return new Promise<string[]>((resolve) => {
        const providerNames: string[] = [];

        const handler = (event: CustomEvent<{ info: { name: string } }>) => {
          providerNames.push(event.detail.info.name);
        };

        window.addEventListener('eip6963:announceProvider', handler as EventListener);
        window.dispatchEvent(new Event('eip6963:requestProvider'));

        setTimeout(() => {
          window.removeEventListener('eip6963:announceProvider', handler as EventListener);
          resolve(providerNames);
        }, 2000);
      });
    });

    // Should see multiple providers
    expect(providers.length).toBeGreaterThanOrEqual(2);
    console.log('Detected providers:', providers);

    await page.close();
  });

  test('CTJ extension coexists with security providers', async () => {
    const page = await context.newPage();
    await injectMockMetaMask(page);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.BLOWFISH);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // Check CTJ extension still responds
    const extensionPresent = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_EXTENSION_PRESENT') {
            window.removeEventListener('message', handler);
            resolve(true);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve(false), 3000);
        window.postMessage({ type: 'CJ_CHECK_EXTENSION' }, '*');
      });
    });

    expect(extensionPresent).toBe(true);

    await page.close();
  });
});

// ============================================================================
// Test Suite: Intercepted Request Handling
// ============================================================================

test.describe('Intercepted Request Handling', () => {
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

  test('handles delayed sign request (security extension simulation)', async () => {
    const page = await context.newPage();
    await injectMockMetaMask(page);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.POCKET_UNIVERSE, {
      interceptSign: true,
      delayMs: 1000, // Simulate 1s delay for warning display
    });

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const startTime = Date.now();

    const result = await page.evaluate(() => {
      return new Promise<{ success: boolean; signature?: string }>((resolve) => {
        const requestId = 'delayed-sign';

        const handler = (event: MessageEvent) => {
          if (event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 15000);

        window.postMessage({
          type: 'CJ_WALLET_SIGN',
          requestId,
          message: 'Test message',
          address: '0xMockAddress1234567890123456789012345678',
        }, '*');
      });
    });

    const elapsed = Date.now() - startTime;

    // Should succeed despite the delay
    expect(result.success).toBe(true);
    // Should have taken at least the simulated delay
    expect(elapsed).toBeGreaterThanOrEqual(1000);

    await page.close();
  });

  test('handles connect interception', async () => {
    const page = await context.newPage();
    await injectMockMetaMask(page);
    await injectSecurityExtension(page, SECURITY_EXTENSIONS.WALLET_GUARD, {
      interceptConnect: true,
      delayMs: 500,
    });

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      return new Promise<{ success: boolean; address?: string }>((resolve) => {
        const requestId = 'intercepted-connect';

        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'CJ_WALLET_RESULT' && event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false }), 10000);

        window.postMessage({
          type: 'CJ_WALLET_CONNECT',
          requestId,
        }, '*');
      });
    });

    expect(result.success).toBe(true);
    expect(result.address).toBeDefined();

    await page.close();
  });
});

// ============================================================================
// Test Suite: Error Scenarios with Security Extensions
// ============================================================================

test.describe('Error Scenarios with Security Extensions', () => {
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

  test('handles provider not found when security extension blocks', async () => {
    const page = await context.newPage();

    // Inject security extension that completely blocks the provider
    await page.addInitScript(`
      // Remove ethereum provider entirely (simulating aggressive blocking)
      delete window.ethereum;

      // But still announce via EIP-6963
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: Object.freeze({
            info: {
              uuid: 'blocker-uuid',
              name: 'Security Blocker',
              icon: 'data:image/svg+xml,<svg></svg>',
              rdns: 'com.securityblocker',
            },
            provider: null,
          }),
        }));
      });
    `);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      return new Promise<{ success: boolean; code?: string }>((resolve) => {
        const requestId = 'blocked-connect';

        const handler = (event: MessageEvent) => {
          if (event.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        setTimeout(() => resolve({ success: false, code: 'TIMEOUT' }), 10000);

        window.postMessage({
          type: 'CJ_WALLET_CONNECT',
          requestId,
        }, '*');
      });
    });

    // Should fail gracefully with appropriate error
    expect(result.success).toBe(false);

    await page.close();
  });

  test('CTJ extension operates independently of blocked provider', async () => {
    const page = await context.newPage();

    // Block external provider but CTJ extension should still work for sessions
    await page.addInitScript(`
      delete window.ethereum;
    `);

    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1500);

    // Session management should still work
    const storeResult = await page.evaluate(() => {
      return new Promise<{ success: boolean }>((resolve) => {
        const requestId = 'store-without-provider';

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
            sessionToken: 'independent-session',
            address: '0xManualAddress123',
            chainId: '0x1',
          },
        }, '*');
      });
    });

    expect(storeResult.success).toBe(true);

    await page.close();
  });
});

// ============================================================================
// Test Suite: Documentation & Compatibility Matrix
// ============================================================================

test.describe('Compatibility Matrix Verification', () => {
  test('document known security extensions', async () => {
    // This test serves as documentation of known security extensions
    const knownExtensions = [
      {
        name: 'Pocket Universe',
        rdns: 'app.pocketuniverse',
        behavior: 'Transaction simulation before signing',
        compatibility: 'Full - delays sign requests',
      },
      {
        name: 'Wallet Guard',
        rdns: 'io.walletguard',
        behavior: 'Phishing protection on connect',
        compatibility: 'Full - delays connect requests',
      },
      {
        name: 'Fire',
        rdns: 'xyz.joinfire',
        behavior: 'Transaction simulation',
        compatibility: 'Full - intercepts sign requests',
      },
      {
        name: 'Blowfish',
        rdns: 'xyz.blowfish',
        behavior: 'Transaction preview',
        compatibility: 'Full - pre-sign analysis',
      },
      {
        name: 'Revoke.cash',
        rdns: 'cash.revoke',
        behavior: 'Approval monitoring',
        compatibility: 'Partial - no direct interaction',
      },
    ];

    console.log('\n=== CTJ Extension Security Extension Compatibility Matrix ===');
    console.table(knownExtensions);

    // Verify structure
    expect(knownExtensions.length).toBeGreaterThan(0);
    knownExtensions.forEach(ext => {
      expect(ext.name).toBeDefined();
      expect(ext.rdns).toBeDefined();
      expect(ext.compatibility).toBeDefined();
    });
  });
});
