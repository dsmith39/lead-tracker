// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,  // tests share a single DB — run serially
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Start the Express server before the test suite and stop it after
  webServer: {
    command: 'node server/index.js',
    url: 'http://localhost:3001',
    timeout: 15_000,
    reuseExistingServer: false,
    env: {
      PORT: '3001',
      MONGO_URI: 'mongodb://localhost:27017/lead-tracker-test',
    },
  },
});
