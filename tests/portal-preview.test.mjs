import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, preview, resolveConfig } from 'vite'

const proxyPath = '/api/portal'
const origin = 'https://portal.example.test'

async function closeHttp(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

test(
  'dev and preview forward portal API requests and return JSON 503 without a backend',
  { timeout: 30000 },
  async () => {
    const config = await resolveConfig({}, 'serve')
    const devProxy = config.server.proxy[proxyPath]
    const previewProxy = config.preview.proxy[proxyPath]
    for (const proxy of [devProxy, previewProxy]) {
      assert.equal(proxy.target, 'http://127.0.0.1:8787')
      assert.equal(proxy.changeOrigin, false)
      assert.equal(typeof proxy.configure, 'function')
    }
    // Preview must declare its own proxy rather than relying on Vite's fallback to server.proxy.
    const withoutDevProxy = await resolveConfig({ server: { proxy: {} } }, 'serve')
    assert.equal(withoutDevProxy.preview.proxy[proxyPath].target, 'http://127.0.0.1:8787')

    const root = await mkdtemp(join(tmpdir(), 'adplix-portal-preview-'))
    try {
      await mkdir(join(root, 'dist'))
      await writeFile(join(root, 'index.html'), '<!doctype html><title>static fallback marker</title>')
      await writeFile(join(root, 'dist', 'index.html'), '<!doctype html><title>static fallback marker</title>')

      for (const mode of ['dev', 'preview']) {
        const requests = []
        const backend = createHttpServer(async (request, response) => {
          let body = ''
          for await (const chunk of request) body += chunk
          const received = {
            method: request.method,
            url: request.url,
            origin: request.headers.origin,
            host: request.headers.host,
            body,
          }
          requests.push(received)
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify(received))
        })
        let frontend
        let backendOpen = false
        try {
          await new Promise((resolve, reject) => {
            backend.once('error', reject)
            backend.listen(0, '127.0.0.1', resolve)
          })
          backendOpen = true
          const target = `http://127.0.0.1:${backend.address().port}`
          const options = {
            configFile: false,
            root,
            publicDir: false,
            logLevel: 'silent',
            build: { outDir: 'dist' },
            server: {
              ...config.server,
              open: false,
              port: 0,
              fs: { ...config.server.fs, allow: [root] },
              proxy: { [proxyPath]: { ...devProxy, target } },
            },
            preview: {
              ...config.preview,
              open: false,
              port: 0,
              proxy: { [proxyPath]: { ...previewProxy, target } },
            },
          }
          frontend = mode === 'dev' ? await createServer(options) : await preview(options)
          if (mode === 'dev') await frontend.listen()
          const base = `http://127.0.0.1:${frontend.httpServer.address().port}`
          const staticPage = await fetch(`${base}/`)
          assert.equal(staticPage.status, 200, mode)
          assert.match(await staticPage.text(), /static fallback marker/)
          const get = await fetch(`${base}/api/portal/session?fixture=1`, { headers: { Origin: origin } })
          assert.equal(get.status, 200, mode)
          assert.match(get.headers.get('content-type'), /application\/json/)
          assert.deepEqual(await get.json(), {
            method: 'GET',
            url: '/api/portal/session?fixture=1',
            origin,
            host: `127.0.0.1:${frontend.httpServer.address().port}`,
            body: '',
          })
          const post = await fetch(`${base}/api/portal/tasks`, {
            method: 'POST',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Fixture' }),
          })
          assert.equal(post.status, 200, mode)
          assert.deepEqual(await post.json(), {
            method: 'POST',
            url: '/api/portal/tasks',
            origin,
            host: `127.0.0.1:${frontend.httpServer.address().port}`,
            body: '{"title":"Fixture"}',
          })
          assert.equal(requests.length, 2)

          await closeHttp(backend)
          backendOpen = false
          for (const [path, init] of [
            ['/api/portal/session', { headers: { Origin: origin } }],
            ['/api/portal/tasks', { method: 'POST', headers: { Origin: origin }, body: '{}' }],
          ]) {
            const unavailable = await fetch(`${base}${path}`, init)
            assert.equal(unavailable.status, 503, `${mode} ${path}`)
            assert.match(unavailable.headers.get('content-type'), /^application\/json/)
            assert.equal(unavailable.headers.get('cache-control'), 'no-store')
            assert.equal(unavailable.headers.get('access-control-allow-origin'), null)
            assert.deepEqual(await unavailable.json(), { error: 'Portal API unavailable.' })
          }
          assert.equal(requests.length, 2)
        } finally {
          await frontend?.close()
          if (backendOpen) await closeHttp(backend)
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
