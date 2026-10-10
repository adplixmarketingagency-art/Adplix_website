// Read-only production smoke test. Never sends credentials or creates test records.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const origin = new URL(process.argv[2] || 'https://adplixmedia.in')
assert.equal(origin.protocol, 'https:', 'Verify the deployed HTTPS origin')
assert.ok(!origin.username && !origin.password && origin.pathname === '/', 'Pass an origin, not credentials or a path')
const request = (path) => fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000), redirect: 'manual' })
const scripts = (html) =>
  [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith('/assets/'))

for (const [path, file] of [
  ['/', '.worker-dist/index.html'],
  ['/portal/', '.worker-dist/portal/index.html'],
]) {
  const response = await request(path)
  assert.equal(response.status, 200, `${path} loads`)
  assert.match(response.headers.get('content-type') || '', /text\/html/)
  assert.ok(response.headers.get('content-security-policy'), 'CSP is present')
  const html = await response.text()
  const expected = scripts(await readFile(file, 'utf8'))
  assert.ok(expected.length, 'Local build has entry scripts')
  assert.deepEqual(scripts(html), expected, `${path} serves this exact build`)
  if (path === '/portal/') {
    assert.match(response.headers.get('cache-control') || '', /no-store/)
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
  }
  for (const asset of expected) {
    const result = await request(asset)
    assert.equal(result.status, 200, `Entry asset loads: ${asset}`)
    assert.match(result.headers.get('content-type') || '', /javascript/)
  }
  console.info(`${path}: correct build and security headers`)
}
const redirect = await request('/portal')
assert.equal(redirect.status, 308)
assert.equal(redirect.headers.get('location'), '/portal/')
const worker = await request('/portal/sw.js')
assert.equal(worker.status, 200)
assert.match(worker.headers.get('content-type') || '', /javascript/)
assert.equal(await worker.text(), await readFile('.worker-dist/portal/sw.js', 'utf8'), 'Current push service worker')
const manifest = await request('/portal/manifest.webmanifest')
assert.equal(manifest.status, 200)
assert.match(manifest.headers.get('content-type') || '', /json/)
assert.deepEqual(await manifest.json(), JSON.parse(await readFile('.worker-dist/portal/manifest.webmanifest', 'utf8')))
for (const size of [192, 512]) {
  const icon = await request(`/portal/icon-${size}.png`)
  assert.equal(icon.status, 200)
  assert.match(icon.headers.get('content-type') || '', /image\/png/)
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()), await readFile(`.worker-dist/portal/icon-${size}.png`))
}
console.info('Device push service worker, install manifest and mobile icons: correct build')
for (const endpoint of ['session', 'snapshot', 'analytics', 'export']) {
  const response = await request(`/api/portal/${endpoint}`)
  assert.equal(response.status, 401, `${endpoint} denies unauthenticated access`)
  assert.match(response.headers.get('content-type') || '', /application\/json/)
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  assert.equal((await response.json()).error, 'Sign in required.')
}
console.info(
  `Read-only deployment checks passed for ${origin.origin}. Authenticated sign-in requires a provisioned Admin; this check does not claim it.`,
)
