import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hashPassword, verifyPassword } from '../src/portal/auth.mjs'
import { PortalPasswordHasher } from '../src/portal/password-object.mjs'
import { hashPortalPassword, verifyPortalPassword } from '../src/portal/password-service.mjs'

const password = 'correct horse battery staple'
const HASH_FORMAT = /^scrypt-v1\$32768\$8\$3\$[a-f0-9]{48}\$[a-f0-9]{64}$/
const endpoint = (path, body, options = {}) =>
  new Request(`https://passwords.internal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...options,
  })

function binding(
  object,
  fetch = (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://passwords.internal')
    const body = JSON.parse(init.body)
    assert.deepEqual(Object.keys(body).sort(), url.pathname === '/hash' ? ['password'] : ['encoded', 'password'])
    return object.fetch(new Request(input, init))
  },
) {
  const names = []
  return {
    names,
    PORTAL_PASSWORDS: {
      idFromName(name) {
        names.push(name)
        return name
      },
      get(id) {
        assert.equal(id, 'passwords-v1')
        return { fetch }
      },
    },
  }
}

test('namespace round trip uses the existing scrypt format, including legacy hashes', async () => {
  const object = new PortalPasswordHasher({ storage: {} }, {})
  const env = binding(object)
  const legacy = await hashPassword(password)
  assert.equal(await verifyPortalPassword(password, legacy, env), true)
  assert.equal(await verifyPortalPassword('wrong password', legacy, env), false)
  const encoded = await hashPortalPassword(password, env)
  assert.match(encoded, HASH_FORMAT)
  assert.equal(await verifyPassword(password, encoded), true)
  assert.equal(await verifyPortalPassword(password, encoded, env), true)
  assert.deepEqual(env.names, Array(4).fill('passwords-v1'))
})

test('object accepts only bounded JSON and the two internal POST operations', async () => {
  const object = new PortalPasswordHasher()
  const invalid = [
    endpoint('/hash', { password, extra: true }),
    endpoint('/hash', { value: password }),
    endpoint('/hash', { password: 'short' }),
    endpoint('/hash', { password: '😀'.repeat(257) }),
    endpoint('/hash', { password }, { headers: { 'Content-Type': 'text/plain' } }),
    endpoint('/hash', '{'),
    endpoint('/hash', '{"password":"' + 'a'.repeat(6000) + '"}'),
    endpoint('/hash', { password }, { headers: { 'Content-Length': '6001' } }),
    endpoint('/hash?debug=1', { password }),
    endpoint('/verify', { password, encoded: 'garbage', extra: 1 }),
    endpoint('/verify', { value: password, encoded: 'garbage' }),
    endpoint('/verify', []),
  ]
  for (const request of invalid) {
    const response = await object.fetch(request)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Invalid request.' })
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  }
  assert.equal((await object.fetch(new Request('https://passwords.internal/hash'))).status, 405)
  assert.equal((await object.fetch(endpoint('/other', { password }))).status, 404)
  const response = await object.fetch(endpoint('/verify', { password, encoded: 'garbage' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { verified: false })
})

test('client rejects invalid hash inputs locally and preserves false verification semantics', async () => {
  let calls = 0
  const env = binding(null, () => {
    calls++
    throw new Error('Should not be called')
  })
  for (const value of [null, 1, 'short', 'a'.repeat(257), '😀'.repeat(257)])
    await assert.rejects(hashPortalPassword(value, env), { status: 400 })
  for (const [value, hash] of [
    [null, 'bad'],
    [password, 'bad'],
    ['a'.repeat(257), 'bad'],
  ])
    assert.equal(await verifyPortalPassword(value, hash, env), false)
  assert.equal(calls, 0)
  assert.deepEqual(env.names, [])
})

test('missing, failing, and malformed bindings fail closed with safe 503', async () => {
  const encoded = await hashPassword(password)
  const failures = [
    {},
    {
      PORTAL_PASSWORDS: {
        idFromName: () => 'id',
        get: () => ({
          fetch: () => {
            throw new Error(password)
          },
        }),
      },
    },
    binding(null, () => Promise.reject(new Error(encoded))),
    binding(
      null,
      () => new Response(JSON.stringify({ hash: 'garbage' }), { headers: { 'Content-Type': 'application/json' } }),
    ),
    binding(
      null,
      () =>
        new Response(JSON.stringify({ hash: encoded, extra: password }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
    binding(
      null,
      () =>
        new Response(JSON.stringify({ hash: encoded }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
    binding(
      null,
      () =>
        new Response(JSON.stringify({ hash: encoded }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
    binding(null, () => new Response('x'.repeat(6001), { headers: { 'Content-Type': 'application/json' } })),
  ]
  for (const env of failures) {
    for (const operation of [
      () => hashPortalPassword(password, env),
      () => verifyPortalPassword(password, encoded, env),
    ])
      await assert.rejects(operation(), (error) => {
        assert.equal(error.status, 503)
        assert.equal(error.message, 'Password service unavailable.')
        assert.ok(!error.message.includes(password))
        assert.ok(!error.message.includes(encoded))
        return true
      })
  }
  for (const reply of [{ verified: 'true' }, { verified: false, extra: 1 }, { hash: encoded }]) {
    const env = binding(
      null,
      () => new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } }),
    )
    await assert.rejects(verifyPortalPassword(password, encoded, env), { status: 503 })
  }
})

test('a saturated module-wide queue rejects excess requests and drains for later work', async () => {
  const first = new PortalPasswordHasher()
  const second = new PortalPasswordHasher()
  const requests = Array.from({ length: 6 }, (_, i) => (i % 2 ? second : first).fetch(endpoint('/hash', { password })))
  const responses = await Promise.all(requests)
  assert.equal(responses.filter((response) => response.status === 503).length, 1)
  assert.equal(responses.filter((response) => response.status === 200).length, 5)
  for (const response of responses) {
    const body = await response.json()
    if (response.status === 503) assert.deepEqual(body, { error: 'Password service unavailable.' })
    else assert.match(body.hash, HASH_FORMAT)
  }
  const later = await first.fetch(endpoint('/verify', { password, encoded: 'invalid' }))
  assert.deepEqual(await later.json(), { verified: false })
})

test('password object never touches storage or logs plaintext and only returns a hash on /hash', async () => {
  const storage = new Proxy(
    {},
    {
      get: () => {
        throw new Error('Storage access')
      },
    },
  )
  const object = new PortalPasswordHasher({ storage }, {})
  const original = { log: console.log, warn: console.warn, error: console.error }
  const messages = []
  console.log = console.warn = console.error = (...args) => messages.push(args)
  try {
    const hashResponse = await object.fetch(endpoint('/hash', { password }))
    const { hash } = await hashResponse.json()
    assert.match(hash, HASH_FORMAT)
    const verifyResponse = await object.fetch(endpoint('/verify', { password, encoded: hash }))
    assert.equal(verifyResponse.status, 200)
    assert.equal((await verifyResponse.clone().text()).includes(password), false)
    assert.deepEqual(await verifyResponse.json(), { verified: true })
    assert.equal(messages.length, 0)
  } finally {
    Object.assign(console, original)
  }
  const source = await readFile(new URL('../src/portal/password-object.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.storage\b|console\.|cloudflare:workers/)
})
