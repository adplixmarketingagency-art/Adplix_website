import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('../src/index.js', import.meta.url), 'utf8'))
  .replace('./security-headers.mjs', new URL('../src/security-headers.mjs', import.meta.url).href)
  .replace('./portal/api.mjs', new URL('../src/portal/api.mjs', import.meta.url).href)
  .replace('./portal/password-object.mjs', new URL('../src/portal/password-object.mjs', import.meta.url).href)
const { default: worker } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test('portal clean routes avoid index redirect loops, use private headers and same-origin service worker', async () => {
  let fetched
  const env = {
    ASSETS: {
      fetch: async (request) => {
        fetched = new URL(request.url).pathname
        return new Response('portal', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public' } })
      },
    },
  }
  const portal = await worker.fetch(new Request('https://example.test/portal/'), env, {})
  assert.equal(fetched, '/portal/')
  assert.equal(portal.status, 200)
  assert.equal(portal.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(portal.headers.get('X-Robots-Tag'), 'noindex, nofollow')
  assert.ok(portal.headers.get('Content-Security-Policy').includes("worker-src 'self'"))
  assert.ok(!portal.headers.get('Content-Security-Policy').includes('cdn.jsdelivr.net'))
  const redirect = await worker.fetch(new Request('https://example.test/portal'), env, {})
  assert.equal(redirect.status, 308)
  assert.equal(redirect.headers.get('Location'), '/portal/')
  const method = await worker.fetch(new Request('https://example.test/portal/', { method: 'POST' }), env, {})
  assert.equal(method.status, 405)
})

test('API without a configured database fails closed, never falls back to public assets', async () => {
  let assetsCalled = false
  const response = await worker.fetch(
    new Request('https://example.test/api/portal/session'),
    {
      ASSETS: {
        fetch: async () => {
          assetsCalled = true
          return new Response('public HTML')
        },
      },
    },
    {},
  )
  assert.equal(response.status, 503)
  assert.equal(assetsCalled, false)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await response.json()).error, 'Portal database unavailable.')
})
