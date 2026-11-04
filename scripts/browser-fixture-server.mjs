import { preview } from 'vite'
import path from 'node:path'
import fs from 'node:fs'

if (!process.send) throw new Error('Start the fixture server through npm run test:browser.')
let server, starting, owner, stopping
const requests = []
async function stop() {
  if (!stopping) stopping = (async () => {
    const current = server ?? await starting
    await current?.close()
    if (process.connected) process.send({ type: 'closed', owner, requests }, () => { if (process.connected) process.disconnect() })
  })()
  return stopping
}
process.once('disconnect', () => { stop().catch(() => { process.exitCode = 1 }) })
process.on('message', async (message) => {
  try {
    if (message.type === 'stop' && message.owner === owner) { await stop(); return }
    if (message.type !== 'start' || owner || !/^[a-f0-9-]{36}$/.test(message.owner) || !Number.isInteger(message.port) || message.port < 0 || message.port > 65535)
      throw new Error('Invalid fixture-server ownership or port.')
    owner = message.owner
    const root = process.cwd(), dist = path.join(root, 'dist')
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build the production application before browser tests.')
    server = await (starting = preview({
      configFile: false, root, build: { outDir: dist }, logLevel: 'error',
      // Never inherit the development Backend proxy, hosts or an existing server.
      preview: { host: '127.0.0.1', port: message.port, strictPort: true, proxy: {}, open: false },
      plugins: [{ name: 'pubburi-fixture-api-guard', configurePreviewServer(previewServer) {
        previewServer.middlewares.use((request, response, next) => {
          response.setHeader('x-pubburi-fixture-owner', owner)
          const pathname = new URL(request.url ?? '/', 'http://fixture').pathname
          if (pathname !== '/api' && !pathname.startsWith('/api/')) { next(); return }
          requests.push({ method: request.method ?? 'UNKNOWN', path: pathname })
          response.statusCode = 503
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({ data: null, message: null, error: { code: 'UNMOCKED_API', message: 'A browser API fixture is missing.' } }))
        })
      } }],
    }))
    if (!process.connected) { await stop(); return }
    const address = server.httpServer.address()
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw new Error('Fixture preview did not bind its own loopback socket.')
    process.send({ type: 'ready', owner, url: `http://127.0.0.1:${address.port}` })
  } catch (error) {
    if (process.connected) process.send({ type: 'failed', owner, message: error.message })
    await server?.close(); process.exitCode = 1
    if (process.connected) process.disconnect()
  }
})
