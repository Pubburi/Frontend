import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const rawUrl = process.env.PUBBURI_FIXTURE_URL
if (!rawUrl || !/^[a-f0-9-]{36}$/.test(process.env.PUBBURI_FIXTURE_OWNER ?? '')) throw new Error('Use npm run test:browser to start an owned API-isolated preview.')
const url = new URL(rawUrl)
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password || [5173, 9987, 8000].includes(Number(url.port)))
  throw new Error('Browser tests require the owned loopback fixture URL.')

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  globalSetup: fileURLToPath(new URL('./scripts/browser-fixture-owner.mjs', import.meta.url)),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'reports/browser.xml' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: url.origin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
