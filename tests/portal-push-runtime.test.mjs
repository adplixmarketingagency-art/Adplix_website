import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const { subtle } = webcrypto
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-device'
const subject = 'mailto:push-runtime@example.test'
const b64 = (bytes) => Buffer.from(bytes).toString('base64url')
const bytes = (value) => Buffer.from(value, 'base64url')
const utf8 = (value) => Buffer.from(value, 'utf8')

async function syntheticKeys() {
  const recipient = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const vapid = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const recipientPublic = Buffer.from(await subtle.exportKey('raw', recipient.publicKey))
  const vapidPublic = Buffer.from(await subtle.exportKey('raw', vapid.publicKey))
  const vapidPrivate = await subtle.exportKey('jwk', vapid.privateKey)
  const auth = webcrypto.getRandomValues(new Uint8Array(16))
  return {
    recipient,
    recipientPublic,
    vapid,
    auth,
    subscription: { endpoint, keys: { p256dh: b64(recipientPublic), auth: b64(auth) } },
    bindings: {
      VAPID_PUBLIC_KEY: b64(vapidPublic),
      VAPID_PRIVATE_KEY: vapidPrivate.d,
      VAPID_SUBJECT: subject,
    },
  }
}

async function decryptPush(body, { recipient, recipientPublic, auth }) {
  // Independently derive the RFC 8291/8188 content key from the recipient side.
  const salt = body.subarray(0, 16)
  assert.equal(body.readUInt32BE(16), 4096)
  const keyLength = body[20]
  assert.equal(keyLength, 65)
  const senderPublic = body.subarray(21, 21 + keyLength)
  assert.equal(senderPublic[0], 4)
  const senderKey = await subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await subtle.deriveBits({ name: 'ECDH', public: senderKey }, recipient.privateKey, 256)
  const expand = async (keyMaterial, hkdfSalt, info, length) => {
    const key = await subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveBits'])
    return Buffer.from(
      await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: hkdfSalt, info }, key, length * 8),
    )
  }
  const ikm = await expand(shared, auth, Buffer.concat([utf8('WebPush: info\0'), recipientPublic, senderPublic]), 32)
  const cek = await expand(ikm, salt, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await expand(ikm, salt, utf8('Content-Encoding: nonce\0'), 12)
  const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plaintext = Buffer.from(
    await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, body.subarray(21 + keyLength)),
  )
  const delimiter = plaintext.indexOf(2)
  assert.ok(delimiter > 0, 'RFC 8188 final-record delimiter must follow the message')
  assert.ok(
    plaintext.subarray(delimiter + 1).every((byte) => byte === 0),
    'padding must contain only zeroes',
  )
  return JSON.parse(plaintext.subarray(0, delimiter).toString('utf8'))
}

test('workerd prepares and sends an interoperable synthetic Web Push payload', async () => {
  const keys = await syntheticKeys()
  // Bundle the installed library and the actual sender without writing a Worker file.
  const bundled = await build({
    stdin: {
      contents: `
        import { sendBroadcastPush } from './src/portal/notifications.mjs';
        export default {
          async fetch(request, env) {
            const { subscription, entries, kind, title, body } = await request.json();
            return Response.json(await sendBroadcastPush(env, entries || [subscription], { kind, title, body }));
          },
        };`,
      resolveDir: process.cwd(),
      sourcefile: 'portal-push-runtime-harness.mjs',
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  })
  const requests = []
  let providerStatus = 201
  // Installed Wrangler ships Miniflare 5; its converter accepts the documented
  // Miniflare 4 worker options and supplies the v5 config/manifest shape.
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'synthetic-push',
          modules: true,
          script: bundled.outputFiles[0].text,
          compatibilityDate: '2026-09-12',
          bindings: keys.bindings,
          // Intercept ALL global fetches. No request can reach a real push provider.
          outboundService: async (request) => {
            requests.push({
              url: request.url,
              method: request.method,
              headers: Object.fromEntries(request.headers),
              body: Buffer.from(await request.arrayBuffer()),
            })
            return new Response(null, {
              status: providerStatus,
              headers: providerStatus === 302 ? { Location: 'https://untrusted.example/steal-auth' } : {},
            })
          },
        },
      ],
    }),
  )
  try {
    const dispatch = async (path, kind, entries) => {
      const response = await mf.dispatchFetch(`http://localhost${path}`, {
        method: 'POST',
        body: JSON.stringify({
          subscription: keys.subscription,
          entries,
          kind,
          title: 'Private task title',
          body: 'Private credentials',
        }),
        headers: { 'content-type': 'application/json' },
      })
      if (response.status !== 200) assert.fail(`workerd returned HTTP ${response.status}: ${await response.text()}`)
      return response.json()
    }
    const result = await dispatch('/send')
    assert.equal(result.sent, 1, `actual workerd sender failed: ${JSON.stringify(result)}`)
    assert.equal(result.failed, 0)
    assert.equal(result.skipped, 0)
    assert.deepEqual(result.expiredEndpoints, [])
    assert.equal(requests.length, 1, 'one synthetic provider request')
    const push = requests[0]
    assert.equal(push.url, endpoint)
    assert.equal(push.method, 'POST')
    assert.equal(push.headers.ttl, '3600')
    assert.equal(push.headers['content-encoding'], 'aes128gcm')
    assert.equal(push.headers['content-type'], 'application/octet-stream')
    assert.equal(Number(push.headers['content-length']), push.body.length)
    assert.equal(push.headers.authorization.startsWith('vapid t='), true)
    const match = /^vapid t=([^,]+), k=([^,]+)$/.exec(push.headers.authorization)
    assert.ok(match, 'VAPID authorization header has a JWT and public key')
    assert.equal(match[2], keys.bindings.VAPID_PUBLIC_KEY)
    const [header, claims, signature] = match[1].split('.')
    assert.deepEqual(JSON.parse(bytes(header).toString('utf8')), { typ: 'JWT', alg: 'ES256' })
    const jwt = JSON.parse(bytes(claims).toString('utf8'))
    assert.equal(jwt.aud, 'https://fcm.googleapis.com')
    assert.equal(jwt.sub, subject)
    const now = Math.floor(Date.now() / 1000)
    assert.ok(jwt.iat >= now - 60 && jwt.iat <= now + 60)
    assert.ok(jwt.exp >= now + 12 * 3600 - 60 && jwt.exp <= now + 12 * 3600 + 60)
    assert.equal(
      await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.vapid.publicKey,
        bytes(signature),
        utf8(`${header}.${claims}`),
      ),
      true,
      'recipient can verify VAPID ES256 signature',
    )
    assert.deepEqual(await decryptPush(push.body, keys), {
      kind: 'workspace',
      title: 'Adplix workspace',
      body: 'You have a new workspace update. Sign in to view it.',
    })
    for (const [kind, title, body] of [
      ['note', 'Note', 'You have a new note. Sign in to view it.'],
      ['broadcast', 'Broadcast', 'You have a new broadcast. Sign in to view it.'],
      ['task-assigned', 'New task assigned', 'A new task was assigned to you. Sign in to view it.'],
      ['task-updated', 'Task updated', 'A task was updated. Sign in to view it.'],
      ['absence-updated', 'Time-off request updated', 'A time-off request was updated. Sign in to view it.'],
      ['leave-requested', 'New leave request', 'A new leave request needs review. Sign in to view it.'],
      ['permission-requested', 'New permission request', 'A new permission request needs review. Sign in to view it.'],
      ['leave-approved', 'Your leave request approved', 'Your leave request was approved. Sign in to view it.'],
      ['leave-rejected', 'Your leave request rejected', 'Your leave request was rejected. Sign in to view it.'],
      [
        'permission-approved',
        'Your permission request approved',
        'Your permission request was approved. Sign in to view it.',
      ],
      [
        'permission-rejected',
        'Your permission request rejected',
        'Your permission request was rejected. Sign in to view it.',
      ],
      ['task-completed', 'Task completed', 'A task was completed and needs review. Sign in to view it.'],
      ['task-approved', 'Your task approved', 'Your task was approved. Sign in to view it.'],
      ['task-revision', 'Task needs revision', 'Your task needs revision. Sign in to view it.'],
      ['task-deadline', 'Task deadline changed', 'A task deadline changed. Sign in to view it.'],
      ['test', 'Test notification', 'This is a test device notification from Adplix.'],
      ['invalid-private-kind', 'Adplix workspace', 'You have a new workspace update. Sign in to view it.'],
    ]) {
      requests.length = 0
      assert.equal((await dispatch('/send', kind)).sent, 1)
      const decrypted = await decryptPush(requests[0].body, keys)
      assert.equal(decrypted.kind, kind === 'invalid-private-kind' ? 'workspace' : kind)
      assert.equal(decrypted.title, title)
      assert.equal(decrypted.body, body)
      assert.ok(!JSON.stringify(decrypted).includes('Private'))
    }
    requests.length = 0
    const device = (index) => ({ ...keys.subscription, endpoint: `${endpoint}-${index}` })
    const mixed = [
      { subscription: device(0), kind: 'leave-requested', title: 'Private note', body: 'Private credentials' },
      { ...device(1), kind: 'leave-approved', title: 'Private note', body: 'Private credentials' },
      { subscription: device(2), kind: 'not-a-kind', title: 'Private note' },
      { subscription: device(3), kind: 'task-revision' },
      { subscription: device(4), kind: 'test' },
    ]
    const mixedResult = await dispatch('/send', 'broadcast', mixed)
    assert.equal(mixedResult.sent, mixed.length)
    assert.equal(mixedResult.failed, 0)
    assert.equal(requests.length, mixed.length)
    const expected = [
      ['leave-requested', 'New leave request'],
      ['broadcast', 'Broadcast'],
      ['broadcast', 'Broadcast'],
      ['task-revision', 'Task needs revision'],
      ['test', 'Test notification'],
    ]
    for (const [index, [kind, title]] of expected.entries()) {
      const push = requests.find((request) => request.url === `${endpoint}-${index}`)
      assert.ok(push, `provider request for device ${index}`)
      const decrypted = await decryptPush(push.body, keys)
      assert.equal(decrypted.kind, kind)
      assert.equal(decrypted.title, title)
      assert.ok(!JSON.stringify(decrypted).includes('Private'))
    }
    requests.length = 0
    providerStatus = 302
    const redirected = await dispatch('/send')
    assert.equal(redirected.sent, 0)
    assert.equal(redirected.failed, 1)
    assert.deepEqual(redirected.diagnostics.httpStatuses, { 302: 1 })
    assert.equal(requests.length, 1, 'redirect must not cause a second request carrying VAPID credentials')
    assert.equal(requests[0].url, endpoint)
  } finally {
    await mf.dispose()
  }
})
