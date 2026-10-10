import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import {
  applicationServerKey,
  devicePushGuidance,
  enableDevicePush,
  disableDevicePush,
  pushTestMessage,
} from '../portal/push.mjs'

const keyBytes = Uint8Array.from([4, ...Array.from({ length: 64 }, (_, index) => index + 1)])
const publicKey = Buffer.from(keyBytes).toString('base64url')
const subscription = (key = keyBytes) => ({
  options: { applicationServerKey: key.buffer },
  toJSON: () => ({ endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'secret' } }),
  unsubscribe: async () => true,
})

test('iOS Safari first instructs Home Screen install, while installed and Android devices can enable', () => {
  const navigator = { userAgent: 'iPhone', serviceWorker: {}, standalone: false }
  const window = { PushManager: class {}, Notification: class {}, matchMedia: () => ({ matches: false }) }
  assert.match(devicePushGuidance({ navigator, window }).message, /Share → Add to Home Screen/)
  assert.equal(devicePushGuidance({ navigator, window }).available, false)
  navigator.standalone = true
  assert.equal(devicePushGuidance({ navigator, window }).available, true)
  navigator.userAgent = 'Android Chrome'
  navigator.standalone = false
  assert.match(devicePushGuidance({ navigator, window }).message, /Chrome on Android/)
  assert.equal(devicePushGuidance({ navigator: { userAgent: 'Android' }, window }).available, false)
})

test('permission is requested synchronously before registration and an active worker persists the subscription', async () => {
  const events = []
  let resolveReady
  const ready = new Promise((resolve) => (resolveReady = resolve))
  const worker = {
    scope: 'https://portal.test/portal/',
    active: {},
    pushManager: {
      getSubscription: async () => null,
      subscribe: async ({ applicationServerKey, userVisibleOnly }) => {
        assert.deepEqual(applicationServerKey, keyBytes)
        assert.equal(userVisibleOnly, true)
        events.push('subscribe')
        return subscription()
      },
    },
  }
  const promise = enableDevicePush({
    navigator: {
      serviceWorker: {
        register: async () => {
          events.push('register')
          return worker
        },
        ready,
      },
    },
    Notification: {
      permission: 'default',
      requestPermission: () => {
        events.push('permission')
        return Promise.resolve('granted')
      },
    },
    publicKey,
    persist: async (body) => {
      events.push('persist')
      assert.equal(body.subscription.endpoint, 'https://push.example/device')
    },
  })
  assert.deepEqual(events, ['permission'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['permission', 'register'])
  resolveReady(worker)
  assert.deepEqual(await promise, { enabled: true, permission: 'granted' })
  assert.deepEqual(events, ['permission', 'register', 'subscribe', 'persist'])
})

test('denial makes no registration or persistence; existing mismatched key is replaced and matching key reused', async () => {
  let registers = 0
  const denied = await enableDevicePush({
    navigator: { serviceWorker: { register: () => registers++ } },
    Notification: { permission: 'default', requestPermission: () => Promise.resolve('denied') },
    publicKey,
    persist: () => assert.fail('Denied permission must not persist'),
  })
  assert.deepEqual(denied, { enabled: false, permission: 'denied' })
  assert.equal(registers, 0)

  let unsubscribed = 0
  let subscribed = 0
  let existing = {
    ...subscription(Uint8Array.from([4, ...Array(64).fill(0)])),
    unsubscribe: async () => (++unsubscribed, true),
  }
  const worker = {
    scope: 'https://portal.test/portal/',
    active: {},
    pushManager: {
      getSubscription: async () => existing,
      subscribe: async () => (++subscribed, subscription()),
    },
  }
  const args = {
    navigator: { serviceWorker: { register: async () => worker, ready: Promise.resolve(worker) } },
    Notification: { permission: 'granted', requestPermission: () => assert.fail('Already granted') },
    publicKey,
    persist: async () => {},
  }
  assert.equal((await enableDevicePush(args)).enabled, true)
  assert.equal(unsubscribed, 1)
  assert.equal(subscribed, 1)
  existing = subscription()
  assert.equal((await enableDevicePush(args)).enabled, true)
  assert.equal(subscribed, 1)
  await assert.rejects(
    enableDevicePush({
      ...args,
      persist: async () => {
        throw new Error('Server refused')
      },
    }),
    /Server refused/,
  )
})

test('disable requires successful server revocation before local unsubscribe', async () => {
  let unsubscribed = 0
  const navigator = {
    serviceWorker: {
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({
            endpoint: 'https://push.example/device',
            unsubscribe: async () => (++unsubscribed, true),
          }),
        },
      }),
    },
  }
  await assert.rejects(
    disableDevicePush({
      navigator,
      persist: async () => {
        throw new Error('offline')
      },
    }),
    /offline/,
  )
  assert.equal(unsubscribed, 0)
  assert.deepEqual(
    await disableDevicePush({
      navigator,
      persist: async (body) => {
        assert.equal(body.subscription, null)
        assert.equal(body.endpoint, 'https://push.example/device')
      },
    }),
    { enabled: false },
  )
  assert.equal(unsubscribed, 1)
})

test('test-result copy distinguishes provider acceptance from display', () => {
  assert.match(pushTestMessage({ status: 'sent' }), /does not confirm it appeared/)
  assert.match(pushTestMessage({ status: 'skipped' }), /skipped/)
  assert.match(pushTestMessage({ status: 'failed' }), /failed/)
  assert.match(pushTestMessage({ sent: 0, failed: 0, skipped: 0 }), /Enable notifications/)
  assert.throws(() => applicationServerKey('bad'), /Invalid server push key/)
})

test('install manifest has scoped entry and real local 192/512 PNG icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../portal/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.equal(manifest.scope, '/portal/')
  assert.equal(manifest.start_url, '/portal/#notifications')
  assert.equal(manifest.display, 'standalone')
  for (const size of [192, 512]) {
    const entry = manifest.icons.find((icon) => icon.sizes === `${size}x${size}`)
    assert.equal(entry?.src, `/portal/icon-${size}.png`)
    const image = await readFile(new URL(`../portal/icon-${size}.png`, import.meta.url))
    assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [size, size])
    assert.equal((await stat(new URL(`../portal/icon-${size}.png`, import.meta.url))).size > 1000, true)
  }
})
