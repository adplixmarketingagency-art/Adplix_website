import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { securityHeaders } from '../src/security-headers.mjs'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const scriptUrl = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js'

test('assets-first headers match the Worker policy exactly', async () => {
  const file = await read('assets/_headers')
  assert.match(file, /^\/\*\n/)
  const entries = [...file.matchAll(/^ {2}([\w-]+): (.+)$/gm)]
  assert.equal(entries.length, Object.keys(securityHeaders).length)
  assert.deepEqual(Object.fromEntries(entries.map(([, key, value]) => [key, value])), securityHeaders)
  const config = await read('wrangler.toml')
  assert.match(config, /\[assets\][\s\S]*?binding\s*=\s*"ASSETS"/)
  assert.doesNotMatch(config, /run_worker_first\s*=\s*true/)
})

test('pinned script, SRI and policy allow required site resources only', async () => {
  const html = await read('index.html')
  const pinnedScript = [...html.matchAll(/<script\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(`src="${scriptUrl}"`))
  assert.ok(pinnedScript, 'Pinned script tag exists')
  assert.match(pinnedScript, /integrity="sha384-SALc35EccAf6RzGw4iNsyj7kTPr33K7RoGzYu\+7heZhT8s0GZouafRiCg1qy44AS"/)
  assert.match(pinnedScript, /crossorigin="anonymous"/)
  const directives = Object.fromEntries(
    securityHeaders['Content-Security-Policy'].split('; ').map((part) => {
      const [name, ...sources] = part.split(' ')
      return [name, sources]
    }),
  )
  assert.deepEqual(directives['script-src'], ["'self'", scriptUrl])
  assert.deepEqual(directives['frame-src'], ["'none'"])
  assert.deepEqual(directives['worker-src'], ["'none'"])
  assert.ok(directives['style-src'].includes("'unsafe-inline'"))
  assert.ok(directives['style-src'].includes('https://fonts.googleapis.com'))
  assert.ok(directives['font-src'].includes('https://fonts.gstatic.com'))
  assert.ok(directives['connect-src'].includes('https://api.emailjs.com'))
  assert.ok(directives['media-src'].includes("'self'"))
  assert.ok(!Object.hasOwn(directives, 'require-trusted-types-for'))
  assert.ok(!Object.hasOwn(securityHeaders, 'Cross-Origin-Embedder-Policy'))
})

test('Worker preserves asset responses including HEAD, range, redirects and cache metadata', async () => {
  // The Worker entry is ESM in Wrangler, while this project uses CommonJS defaults in Node.
  const entry = (await read('src/index.js'))
    .replace('./security-headers.mjs', new URL('../src/security-headers.mjs', import.meta.url).href)
    .replace('./portal/api.mjs', new URL('../src/portal/api.mjs', import.meta.url).href)
    .replace('./portal/password-object.mjs', new URL('../src/portal/password-object.mjs', import.meta.url).href)
  const { default: worker } = await import(`data:text/javascript,${encodeURIComponent(entry)}`)
  for (const { method, status, body, extra } of [
    { method: 'GET', status: 200, body: 'ok', extra: { 'Cache-Control': 'public, max-age=3600', ETag: '"v1"' } },
    { method: 'HEAD', status: 200, body: null, extra: { 'Content-Length': '42' } },
    { method: 'GET', status: 206, body: 'part', extra: { 'Content-Range': 'bytes 0-3/20', 'Accept-Ranges': 'bytes' } },
    { method: 'GET', status: 302, body: null, extra: { Location: '/new' } },
    { method: 'GET', status: 304, body: null, extra: { ETag: '"v1"' } },
  ]) {
    const asset = new Response(body, { status, statusText: 'Asset status', headers: { ...extra, 'X-Asset': 'kept' } })
    const request = new Request('https://example.com/file', { method })
    const result = await worker.fetch(
      request,
      {
        ASSETS: {
          fetch: async (received) => {
            assert.equal(received, request)
            return asset
          },
        },
      },
      {},
    )
    assert.equal(result.status, status)
    assert.equal(result.statusText, 'Asset status')
    assert.equal(await result.text(), body ?? '')
    assert.equal(result.headers.get('X-Asset'), 'kept')
    for (const [name, value] of Object.entries(extra)) assert.equal(result.headers.get(name), value)
    for (const [name, value] of Object.entries(securityHeaders)) assert.equal(result.headers.get(name), value)
  }
})
