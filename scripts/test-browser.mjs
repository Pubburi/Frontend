import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

const root = fileURLToPath(new URL('../', import.meta.url)), require = createRequire(import.meta.url)
const owner = randomUUID(), args = process.argv.slice(2)
const reportArg = args.find((argument) => argument.startsWith('--fixture-report='))
const reportName = reportArg?.slice('--fixture-report='.length) ?? 'browser-runner.json'
if (!/^[a-z0-9-]+\.json$/.test(reportName)) throw new Error('Fixture report must be a simple JSON filename.')
const explicitPort = process.env.PLAYWRIGHT_PORT
if (explicitPort !== undefined && (!/^[1-9]\d{0,4}$/.test(explicitPort) || Number(explicitPort) > 65535 || [5173, 9987, 8000].includes(Number(explicitPort))))
  throw new Error('PLAYWRIGHT_PORT must be an available test port; development service ports are reserved.')
const report = { childExit: null, runnerExit: 1, ownerVerified: false, previewClosed: false, requests: [] }
let server, browser, interrupted = 0
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref())
function completed(child) {
  return new Promise((resolve) => { child.once('error', (error) => resolve({ code: 1, error: error.message })); child.once('close', (code, signal) => resolve({ code: code ?? 1, signal })) })
}
function messageFrom(child, type) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) { reject(new Error(`Fixture server exited before ${type}.`)); return }
    const timer = setTimeout(() => finish(new Error(`Fixture server did not report ${type}.`)), 30000)
    const onExit = () => finish(new Error(`Fixture server exited before ${type}.`))
    const onMessage = (message) => {
      if (message.owner !== owner) { finish(new Error('Fixture server owner did not match.')); return }
      if (message.type === 'failed') finish(new Error(message.message))
      else if (message.type === type) finish(null, message)
    }
    function finish(error, value) { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); error ? reject(error) : resolve(value) }
    child.on('message', onMessage); child.once('exit', onExit)
  })
}
async function terminate(child, done) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([done.catch(() => {}), sleep(5000)])
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done.catch(() => {}) }
}
const signal = (name, code) => { interrupted = code; browser?.kill(name) }
const onInterrupt = () => signal('SIGINT', 130), onTerminate = () => signal('SIGTERM', 143)
process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate)
let serverDone, browserDone
try {
  server = spawn(process.execPath, [path.join(root, 'scripts/browser-fixture-server.mjs')], { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  serverDone = completed(server)
  const ready = messageFrom(server, 'ready'); server.send({ type: 'start', owner, port: explicitPort === undefined ? 0 : Number(explicitPort) })
  const { url } = await ready
  report.url = url; report.serverPid = server.pid
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/' || [5173, 9987, 8000].includes(Number(parsed.port))) throw new Error('Invalid owned fixture URL.')
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
  if (!response.ok || response.headers.get('x-pubburi-fixture-owner') !== owner) throw new Error('Fixture preview ownership check failed.')
  report.ownerVerified = true
  if (interrupted) throw new Error('Browser tests were interrupted before launch.')
  console.log(`[browser-fixture] owned preview ${url}`)
  browser = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...args.filter((argument) => argument !== reportArg)], {
    cwd: root, stdio: 'inherit', env: { ...process.env, PUBBURI_FIXTURE_URL: url, PUBBURI_FIXTURE_OWNER: owner },
  })
  report.playwrightPid = browser.pid
  browserDone = completed(browser)
  const outcome = await browserDone; report.childExit = outcome.code
  report.runnerExit = interrupted || outcome.code
} catch (error) {
  console.error(`[browser-fixture] ${error.message}`); report.runnerExit = interrupted || 1
} finally {
  if (browser && browserDone) await terminate(browser, browserDone)
  if (server && serverDone && server.connected && server.exitCode === null && server.signalCode === null) {
    try {
      const closed = messageFrom(server, 'closed'); server.send({ type: 'stop', owner })
      const final = await closed; report.requests = final.requests; report.previewClosed = true
      report.serverExit = (await serverDone).code
      if (report.serverExit !== 0) report.runnerExit = report.runnerExit || 1
    } catch (error) { console.error(`[browser-fixture] cleanup: ${error.message}`); report.runnerExit = report.runnerExit || 1; await terminate(server, serverDone) }
  } else if (serverDone) { await serverDone; report.runnerExit = report.runnerExit || 1 }
  if (report.requests.length) {
    console.error(`[browser-fixture] ${report.requests.length} API request(s) escaped browser fixtures:`)
    for (const request of report.requests) console.error(JSON.stringify(request))
    report.runnerExit = report.runnerExit || 1
  }
  report.runnerExit = interrupted || report.runnerExit
  process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate)
  await fs.mkdir(path.join(root, 'reports'), { recursive: true })
  await fs.writeFile(path.join(root, 'reports', reportName), JSON.stringify(report, null, 2)+'\n')
  process.exitCode = report.runnerExit
}
