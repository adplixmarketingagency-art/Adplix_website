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
            const subscription = await request.json();
             return Response.json(await sendBroadcastPush(env, [subscription]));
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
    const dispatch = async (path) => {
      const response = await mf.dispatchFetch(`http://localhost${path}`, {
        method: 'POST',
        body: JSON.stringify(keys.subscription),
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
      title: 'Adplix Portal',
      body: 'You have a new notification.',
    })
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
