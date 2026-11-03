import { defineConfig, devices } from '@playwright/test'

// Isolated checkouts can reserve their own loopback port; CI keeps 4173.
const port = process.env.PLAYWRIGHT_PORT || '4173'
if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535)
  throw new Error('PLAYWRIGHT_PORT must be an integer from 1 to 65535')
const previewUrl = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'reports/browser.xml' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: previewUrl,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: previewUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
