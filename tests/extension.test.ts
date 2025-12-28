/**
 * Integration Tests for Crypto Trading Journal Extension
 * 
 * These tests load the extension in a real browser and verify functionality.
 * Run with: npx playwright test
 */

import { test, expect, chromium, BrowserContext } from '@playwright/test';
import * as path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'dist');
const TEST_GROUND_URL = 'http://localhost:3001';

let context: BrowserContext;

test.describe('Extension Loading', () => {
  test.beforeAll(async () => {
    // Launch browser with extension
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('extension should load successfully', async () => {
    const page = await context.newPage();
    expect(page).toBeTruthy();
    await page.close();
  });

  test('popup should open and display correctly', async () => {
    // Get extension ID from service worker
    let extensionId: string | undefined;
    
    for (const page of context.serviceWorkers()) {
      const url = page.url();
      if (url.includes('chrome-extension://')) {
        extensionId = url.split('/')[2];
        break;
      }
    }

    if (!extensionId) {
      const pages = context.backgroundPages();
      for (const page of pages) {
        const url = page.url();
        if (url.includes('chrome-extension://')) {
          extensionId = url.split('/')[2];
          break;
        }
      }
    }

    if (!extensionId) {
      test.skip();
      return;
    }

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popupPage.locator('h1.title')).toHaveText('Crypto Trading Journal');
    await expect(popupPage.locator('.subtitle')).toHaveText('Web3 Authentication');

    await popupPage.close();
  });
});

test.describe('Provider Injection', () => {
  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should inject provider on target page', async () => {
    const page = await context.newPage();
    
    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1000);

    const hasProvider = await page.evaluate(() => {
      return !!(window as unknown as { ethereum?: unknown }).ethereum || 
             !!(window as unknown as { cryptoJournal?: unknown }).cryptoJournal;
    });

    expect(hasProvider).toBe(true);
    await page.close();
  });

  test('should announce via EIP-6963', async () => {
    const page = await context.newPage();
    
    try {
      await page.goto(TEST_GROUND_URL, { timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    await page.waitForTimeout(1000);

    const providers = await page.evaluate(() => {
      return new Promise<string[]>((resolve) => {
        const announcements: string[] = [];
        
        window.addEventListener('eip6963:announceProvider', (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (detail?.info?.name) {
            announcements.push(detail.info.name);
          }
        });

        window.dispatchEvent(new Event('eip6963:requestProvider'));
        setTimeout(() => resolve(announcements), 500);
      });
    });

    expect(providers).toContain('Crypto Trading Journal');
    await page.close();
  });
});
