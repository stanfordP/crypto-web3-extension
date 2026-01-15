import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    trace: 'on-first-retry',
    headless: false,
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'auth-flow',
      testMatch: 'auth-flow.test.ts',
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'security-compat',
      testMatch: 'security-compat.test.ts',
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'extension-basic',
      testMatch: 'extension.test.ts',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
