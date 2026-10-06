import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  globalSetup: './tests/ui/global-setup.ts',

  use: {
    baseURL: 'http://127.0.0.1:5000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
