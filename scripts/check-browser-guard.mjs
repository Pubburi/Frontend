import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = path.join(root, 'reports/browser-guard-probe')
await fs.mkdir(directory, { recursive: true })
await fs.rm(path.join(root, 'reports/browser-guard-probe.json'), { force: true })
await fs.rm(path.join(directory, 'browser.json'), { force: true })
// This intentionally passing browser lives outside normal test discovery.
await fs.writeFile(path.join(directory, 'negative.probe.mjs'), `
import { test, expect } from '@playwright/test'
test('intentional fixture omission still passes in the browser', async ({ page }) => {
  await page.goto('/images/icon/mainIcon.webp')
  const status = await page.evaluate(async () => (await fetch('/api/intentional-unmocked?probe_query=do-not-record-query', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'do-not-record-header' },
    body: JSON.stringify({ password: 'do-not-record-body' }),
  })).status)
  expect(status).toBe(503)
})
`)
await fs.writeFile(path.join(directory, 'config.mjs'), `
import base from ${JSON.stringify(pathToFileURL(path.join(root, 'playwright.config.js')).href)}
export default { ...base, testDir: ${JSON.stringify(directory)}, testMatch: '**/*.probe.mjs',
  outputDir: ${JSON.stringify(path.join(directory, 'results'))},
  reporter: [['list'], ['json', { outputFile: ${JSON.stringify(path.join(directory, 'browser.json'))} }]],
  use: { ...base.use, trace: 'off', screenshot: 'off' },
}
`)
const child = spawn(process.execPath, [path.join(root, 'scripts/test-browser.mjs'), '--config', path.join(directory, 'config.mjs'), '--fixture-report=browser-guard-probe.json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM')
process.on('SIGINT', interrupt); process.on('SIGTERM', terminate)
let stdout = '', stderr = ''
child.stdout.on('data', (data) => { stdout += data }); child.stderr.on('data', (data) => { stderr += data })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
process.off('SIGINT', interrupt); process.off('SIGTERM', terminate)
await fs.writeFile(path.join(directory, 'runner.log'), stdout+stderr)
const runner = JSON.parse(await fs.readFile(path.join(root, 'reports/browser-guard-probe.json'), 'utf8'))
const browser = JSON.parse(await fs.readFile(path.join(directory, 'browser.json'), 'utf8'))
assert.equal(browser.stats.expected, 1); assert.equal(browser.stats.unexpected, 0)
assert.equal(browser.stats.skipped, 0); assert.equal(browser.stats.flaky, 0)
assert.equal(code, 1); assert.equal(runner.childExit, 0); assert.equal(runner.runnerExit, 1)
assert.equal(runner.ownerVerified, true); assert.equal(runner.previewClosed, true)
assert.equal(runner.serverExit, 0)
assert.deepEqual(runner.requests, [{ method: 'POST', path: '/api/intentional-unmocked' }])
for (const marker of ['do-not-record-query', 'do-not-record-header', 'do-not-record-body'])
  assert.ok(!(stdout+stderr+JSON.stringify(runner)).includes(marker), 'Fixture guard output must contain method/path only.')
console.log('Browser guard verified: browser1 passed, intentional unmocked API1, runner exit1, owned preview closed.')

// Losing the IPC owner must close the socket, even without a normal stop message.
const owner = randomUUID(), disconnected = { ownerVerified: false, exited: false, socketClosed: false }
const preview = spawn(process.execPath, [path.join(root, 'scripts/browser-fixture-server.mjs')], { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
disconnected.serverPid = preview.pid
const ended = new Promise((resolve) => { preview.once('error', () => resolve({ code: 1, signal: null })); preview.once('exit', (code, signal) => resolve({ code, signal })) })
const timers = new Set()
const deadline = (ms, message) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(message)), ms); timers.add(timer) })
try {
  const ready = new Promise((resolve, reject) => {
    preview.once('error', reject)
    preview.once('message', (message) => message.type === 'ready' && message.owner === owner ? resolve(message) : reject(new Error('Disconnect probe ownership did not match.')))
  })
  preview.send({ type: 'start', owner, port: 0 })
  const { url } = await Promise.race([ready, deadline(5000, 'Disconnect probe preview did not start.')])
  disconnected.url = url
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
  assert.ok(response.ok && response.headers.get('x-pubburi-fixture-owner') === owner)
  disconnected.ownerVerified = true
  preview.disconnect()
  const outcome = await Promise.race([ended, deadline(5000, 'Preview survived IPC owner disconnect.')])
  disconnected.exited = true; disconnected.exitCode = outcome.code
  assert.equal(outcome.code, 0); assert.equal(outcome.signal, null)
  await assert.rejects(fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) }))
  disconnected.socketClosed = true
} finally {
  for (const timer of timers) clearTimeout(timer)
  if (preview.exitCode === null && preview.signalCode === null) {
    preview.kill('SIGTERM')
    const kill = setTimeout(() => { if (preview.exitCode === null && preview.signalCode === null) preview.kill('SIGKILL') }, 3000)
    await ended; clearTimeout(kill)
  }
  await fs.writeFile(path.join(root, 'reports/browser-guard-disconnect.json'), JSON.stringify(disconnected, null, 2)+'\n')
}
console.log('Browser guard verified: IPC owner disconnect closes its preview process and socket.')
