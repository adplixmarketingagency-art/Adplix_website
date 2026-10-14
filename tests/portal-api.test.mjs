import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePortalApi } from '../src/portal/api.mjs'
import { tokenHash } from '../src/portal/auth.mjs'
import { webcrypto } from 'node:crypto'

const db = {
  prepare(sql) {
    return {
      bind() {
        return {
          async first() {
            if (sql.includes('portal_sessions')) return null
            if (sql.includes('portal_state'))
              return {
                revision: 0,
                document: JSON.stringify({
                  schema: 1,
                  users: [],
                  clients: [],
                  tasks: [],
                  updates: [],
                  absences: [],
                  notes: [],
                  notifications: [],
                  subscriptions: [],
                }),
              }
            return null
          },
          async run() {
            return { meta: { changes: 1 } }
          },
        }
      },
      async first() {
        return null
      },
    }
  },
}
const call = (path, options = {}) =>
  handlePortalApi(new Request('https://portal.example' + path, options), { PORTAL_DB: db })

test('anonymous snapshot and export are denied without revealing state', async () => {
  for (const endpoint of ['snapshot', 'analytics', 'export']) {
    const response = await call('/api/portal/' + endpoint)
    assert.equal(response.status, 401)
    assert.match(response.headers.get('Cache-Control'), /no-store/)
    assert.equal((await response.json()).error, 'Sign in required.')
  }
})
test('mutations require same-origin Origin and no public signup exists', async () => {
  const request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  assert.equal((await call('/api/portal/actions', request)).status, 403)
  assert.equal(
    (
      await call('/api/portal/signup', {
        ...request,
        headers: { ...request.headers, Origin: 'https://portal.example' },
      })
    ).status,
    401,
  )
})

function fixture(users, tasks = []) {
  let revision = 0,
    state = {
      schema: 1,
      users,
      clients: [],
      tasks,
      updates: [],
      absences: [],
      notes: [],
      notifications: [],
      subscriptions: [],
      audit: [],
    }
  const sessions = new Map()
  const limits = new Map()
  const db = {
    prepare(sql) {
      const bound = (values) => ({
        async first() {
          if (sql.includes('FROM portal_state')) return { revision, document: JSON.stringify(state) }
          if (sql.includes('FROM portal_sessions')) return sessions.get(values[0]) || null
          if (sql.includes('FROM portal_login_limits')) return limits.get(values[0]) || null
          return null
        },
        async run() {
          if (sql.startsWith('INSERT INTO portal_login_limits')) {
            const previous = limits.get(values[0])
            limits.set(values[0], { attempts: (previous?.attempts || 0) + 1, blocked_until: 0 })
          }
          if (sql.startsWith('UPDATE portal_state')) {
            if (revision !== values[1]) return { meta: { changes: 0 } }
            state = JSON.parse(values[0])
            revision++
            return { meta: { changes: 1 } }
          }
          if (sql.startsWith('DELETE FROM portal_sessions')) {
            for (const [key, value] of sessions)
              if (sql.includes('user_id') ? value.user_id === values[0] : key === values[0]) sessions.delete(key)
          }
          return { meta: { changes: 1 } }
        },
      })
      return {
        bind(...values) {
          return bound(values)
        },
        first() {
          return bound([]).first()
        },
      }
    },
  }
  return {
    db,
    sessions,
    get state() {
      return state
    },
  }
}
const asUser = (fixture, user, token = 'a'.repeat(64)) => {
  const csrf = tokenHash('csrf:' + token)
  fixture.sessions.set(tokenHash(token), {
    user_id: user.id,
    csrf_hash: tokenHash(csrf),
    created_at: Date.now(),
    expires_at: Date.now() + 86_400_000,
    credential_version: user.credentialVersion || 0,
  })
  return {
    Cookie: `portal_session=${token}`,
    Origin: 'https://portal.example',
    'X-CSRF-Token': csrf,
    'Content-Type': 'application/json',
  }
}
test('employee unchanged email edit preserves session, changed email invalidates and audit contains no credentials', async () => {
  const admin = {
    id: 'admin',
    role: 'Admin',
    name: 'Admin',
    email: 'admin@example.com',
    active: true,
    credentialVersion: 0,
  }
  const employee = {
    id: 'emp',
    role: 'Employee',
    name: 'Sam',
    employeeId: 'E1',
    email: 'sam@example.com',
    jobFunctions: ['Design'],
    active: true,
    credentialVersion: 0,
  }
  const f = fixture([admin, employee])
  const headers = asUser(f, admin)
  asUser(f, employee, 'b'.repeat(64))
  const update = (email) =>
    callWith(f, 'actions', 'POST', headers, {
      type: 'employee.update',
      id: 'emp',
      name: 'Sam',
      employeeId: 'E1',
      email,
      jobFunctions: ['Design'],
    })
  assert.equal((await update('sam@example.com')).status, 200)
  assert.equal(f.sessions.size, 2)
  assert.equal(f.state.users[1].credentialVersion, 0)
  assert.equal((await update('sam.changed@example.com')).status, 200)
  assert.equal(f.sessions.size, 1)
  assert.equal(f.state.users[1].credentialVersion, 1)
  assert.equal(f.state.audit.length, 2)
  assert.equal(JSON.stringify(f.state.audit).includes('sam.changed@example.com'), false)
})
const callWith = (f, path, method, headers, body) =>
  handlePortalApi(
    new Request('https://portal.example/api/portal/' + path, { method, headers, body: body && JSON.stringify(body) }),
    { PORTAL_DB: f.db },
  )
test('team task summary uses real duration without disclosing description, events or intervals', async () => {
  const employee = {
    id: 'viewer',
    role: 'Employee',
    name: 'Viewer',
    employeeId: 'V',
    active: true,
    credentialVersion: 0,
  }
  const coworker = { id: 'owner', role: 'Employee', name: 'Owner', employeeId: 'O', active: true, credentialVersion: 0 }
  const t = {
    id: 'task',
    title: 'Work',
    description: 'Private customer link',
    assigneeId: 'owner',
    clientId: 'c',
    jobFunction: 'Design',
    deadline: '2026-10-09T12:00:00Z',
    priority: 'Normal',
    state: 'Completed',
    createdAt: '2026-10-05T04:30:00Z',
    completedAt: '2026-10-05T07:30:00Z',
    version: 2,
    intervals: [{ start: '2026-10-05T04:30:00Z', end: '2026-10-05T07:30:00Z' }],
    events: [{ reason: 'Private feedback' }],
  }
  const f = fixture([employee, coworker], [t])
  const headers = asUser(f, employee)
  const response = await callWith(f, 'snapshot', 'GET', headers)
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.tasks[0].workSeconds, 10800)
  for (const privateField of ['description', 'intervals', 'events']) assert.equal(privateField in data.tasks[0], false)
  assert.equal(data.employees[1].email, undefined)
})
test('recipient snapshots pick up notes and broadcasts without push, expose only safe sender data, and retain read state', async () => {
  const admin = {
    id: 'admin',
    role: 'Admin',
    name: 'Team Admin',
    email: 'private-admin@example.test',
    passwordHash: 'private-hash',
    active: true,
    credentialVersion: 0,
  }
  const employee = { id: 'employee', role: 'Employee', name: 'Recipient', active: true, credentialVersion: 0 }
  const other = { id: 'other', role: 'Employee', name: 'Other', active: true, credentialVersion: 0 }
  const f = fixture([admin, employee, other])
  const adminHeaders = asUser(f, admin)
  const employeeHeaders = asUser(f, employee, 'b'.repeat(64))
  const otherHeaders = asUser(f, other, 'c'.repeat(64))
  const snapshot = async (headers) => (await callWith(f, 'snapshot', 'GET', headers)).json()
  const send = (payload) => callWith(f, 'actions', 'POST', adminHeaders, payload)
  assert.deepEqual((await snapshot(employeeHeaders)).notifications, [])

  assert.equal((await send({ type: 'note.create', text: 'Private note', recipientIds: ['employee'] })).status, 200)
  assert.deepEqual(
    (await snapshot(employeeHeaders)).notificationProfiles.map(({ id }) => id),
    ['admin'],
  )
  assert.deepEqual((await snapshot(otherHeaders)).notificationProfiles, [])
  assert.equal(
    (await send({ type: 'broadcast.create', title: 'News', text: 'Hello team', recipientIds: [] })).status,
    200,
  )
  const mine = await snapshot(employeeHeaders)
  const colleague = await snapshot(otherHeaders)
  assert.deepEqual(
    mine.notifications.map((n) => n.title),
    ['New note', 'News'],
  )
  assert.deepEqual(
    mine.notifications.map((n) => n.kind),
    ['note', 'broadcast'],
  )
  assert.deepEqual(
    f.state.notifications.map((n) => n.kind),
    ['note', 'broadcast', 'broadcast', 'broadcast'],
  )
  assert.deepEqual(
    colleague.notifications.map((n) => n.title),
    ['News'],
  )
  assert.equal(mine.notes[0].text, 'Private note')
  assert.deepEqual(mine.notes[0].author, { id: 'admin', name: 'Team Admin', role: 'Admin' })
  assert.equal(JSON.stringify(mine.notes).includes('private-admin@example.test'), false)
  assert.equal(
    mine.profileGlimpses.some((person) => person.id === 'admin'),
    false,
  )
  assert.deepEqual(colleague.notes, [])
  assert.deepEqual(mine.notifications[0].sender, { id: 'admin', name: 'Team Admin', role: 'Admin' })
  assert.equal(mine.notifications[0].readAt, null)
  assert.equal(JSON.stringify(mine.notifications).includes('private-admin@example.test'), false)
  assert.equal(JSON.stringify(mine.notifications).includes('private-hash'), false)
  // The sender is hidden from the employee's general team glimpse, but is
  // available through the separately scoped notification profile list.
  assert.deepEqual(
    mine.notificationProfiles.map(({ id }) => id),
    ['admin'],
  )
  assert.deepEqual(
    colleague.notificationProfiles.map(({ id }) => id),
    ['admin'],
  )

  const notificationId = mine.notifications[0].id
  assert.equal(
    (await callWith(f, 'actions', 'POST', otherHeaders, { type: 'notification.read', id: notificationId })).status,
    404,
  )
  assert.equal(
    (await callWith(f, 'actions', 'POST', employeeHeaders, { type: 'notification.read', id: notificationId })).status,
    200,
  )
  const readAt = (await snapshot(employeeHeaders)).notifications[0].readAt
  assert.ok(readAt)
  assert.equal(
    (await callWith(f, 'actions', 'POST', employeeHeaders, { type: 'notification.read', id: notificationId })).status,
    200,
  )
  assert.equal((await snapshot(employeeHeaders)).notifications[0].readAt, readAt)
  assert.equal((await snapshot(otherHeaders)).notifications[0].readAt, null)

  assert.equal(
    (await callWith(f, 'actions', 'POST', otherHeaders, { type: 'notification.clear', id: notificationId })).status,
    404,
  )
  assert.equal(
    (await callWith(f, 'actions', 'POST', employeeHeaders, { type: 'notification.clear', id: notificationId })).status,
    200,
  )
  assert.equal((await snapshot(employeeHeaders)).notifications.length, 1)

  // Test clearAll
  f.state.notifications = [
    { id: 'n1', employeeId: 'employee', title: 'A', text: 'B', createdAt: '2026-10-14T00:00:00Z', readAt: null },
    { id: 'n2', employeeId: 'employee', title: 'C', text: 'D', createdAt: '2026-10-14T00:00:00Z', readAt: null },
    { id: 'n3', employeeId: 'other', title: 'E', text: 'F', createdAt: '2026-10-14T00:00:00Z', readAt: null },
  ]
  assert.equal((await snapshot(employeeHeaders)).notifications.length, 2)
  assert.equal((await callWith(f, 'actions', 'POST', employeeHeaders, { type: 'notification.clearAll' })).status, 200)
  assert.equal((await snapshot(employeeHeaders)).notifications.length, 0)
  assert.equal((await snapshot(otherHeaders)).notifications.length, 1)

  // Older state can carry extra fields; snapshots must never serialize them to recipients.
  f.state.notifications = [
    {
      id: 'n4',
      employeeId: 'employee',
      title: 'A',
      text: 'B',
      passwordHash: 'legacy-secret',
      createdAt: '2026-10-14T00:00:00Z',
      readAt: null,
    },
  ]
  assert.equal(JSON.stringify((await snapshot(employeeHeaders)).notifications).includes('legacy-secret'), false)
  f.state.notes[0].passwordHash = 'legacy-note-secret'
  f.state.notifications = []
  const legacy = await snapshot(employeeHeaders)
  assert.deepEqual(legacy.notes[0].author, { id: 'admin', name: 'Team Admin', role: 'Admin' })
  assert.equal(JSON.stringify(legacy.notes).includes('legacy-note-secret'), false)
  f.state.notifications.push(
    { id: 'legacy-task', employeeId: employee.id, title: 'Task approved', text: 'Done' },
    { id: 'legacy-other', employeeId: employee.id, title: 'Unknown message', text: 'Private', kind: 'arbitrary' },
  )
  assert.deepEqual(
    (await snapshot(employeeHeaders)).notifications.map((n) => n.kind),
    ['task-approved', 'workspace'],
  )
})
test('push mutation refuses forced-password-change sessions, without storing a subscription', async () => {
  const employee = {
    id: 'emp',
    role: 'Employee',
    name: 'Emp',
    employeeId: 'E',
    active: true,
    credentialVersion: 0,
    mustChangePassword: true,
  }
  const f = fixture([employee])
  const headers = asUser(f, employee)
  const response = await handlePortalApi(
    new Request('https://portal.example/api/portal/push-subscription', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscription: null }),
    }),
    { PORTAL_DB: f.db },
  )
  assert.equal(response.status, 403)
  assert.deepEqual(f.state.subscriptions, [])
  assert.deepEqual(f.state.audit, [])
})

test('push key reports the exact missing Worker configuration without exposing values', async () => {
  const employee = {
    id: 'emp',
    role: 'Employee',
    name: 'Emp',
    employeeId: 'E',
    email: 'emp@example.com',
    active: true,
    credentialVersion: 0,
  }
  const f = fixture([employee])
  const response = await handlePortalApi(
    new Request('https://portal.example/api/portal/push-key', { headers: asUser(f, employee) }),
    { PORTAL_DB: f.db, VAPID_PUBLIC_KEY: 'public-only' },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    publicKey: null,
    configured: false,
    missing: ['VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
    deviceSubscribed: false,
    message:
      'Push is not configured on this server. Set VAPID_PRIVATE_KEY, VAPID_SUBJECT in the production Worker secrets.',
  })
  const subscribe = await handlePortalApi(
    new Request('https://portal.example/api/portal/push-subscription', {
      method: 'POST',
      headers: asUser(f, employee),
      body: JSON.stringify({ subscription: { endpoint: 'https://fcm.googleapis.com/send/test', keys: {} } }),
    }),
    { PORTAL_DB: f.db, VAPID_PUBLIC_KEY: 'public-only' },
  )
  assert.equal(subscribe.status, 503)
  assert.match((await subscribe.json()).error, /VAPID_PRIVATE_KEY, VAPID_SUBJECT/)
  assert.deepEqual(f.state.subscriptions, [])
})

const people = () => [
  { id: 'admin', role: 'Admin', name: 'Admin', active: true, credentialVersion: 0 },
  { id: 'employee', role: 'Employee', name: 'Employee', active: true, credentialVersion: 0 },
  { id: 'other', role: 'Employee', name: 'Other', active: true, credentialVersion: 0 },
]
const pushKeys = async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const recipient = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const recipientPublic = Buffer.from(await webcrypto.subtle.exportKey('raw', recipient.publicKey))
  const auth = webcrypto.getRandomValues(new Uint8Array(16))
  return {
    recipient,
    recipientPublic,
    auth,
    env: {
      VAPID_PUBLIC_KEY: Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'),
      VAPID_PRIVATE_KEY: (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d,
      VAPID_SUBJECT: 'mailto:test@example.com',
    },
    keys: {
      p256dh: recipientPublic.toString('base64url'),
      auth: Buffer.from(auth).toString('base64url'),
    },
  }
}
const device = (keys, name) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys })
const pushCall = (f, env, path, headers, body, context) =>
  handlePortalApi(
    new Request('https://portal.example/api/portal/' + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    { PORTAL_DB: f.db, ...env },
    context,
  )

async function decryptProviderPayload(body, { recipient, recipientPublic, auth }) {
  const subtle = webcrypto.subtle
  const salt = body.subarray(0, 16)
  const senderPublic = body.subarray(21, 21 + body[20])
  const senderKey = await subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await subtle.deriveBits({ name: 'ECDH', public: senderKey }, recipient.privateKey, 256)
  const expand = async (material, hkdfSalt, info, length) => {
    const key = await subtle.importKey('raw', material, 'HKDF', false, ['deriveBits'])
    return Buffer.from(
      await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: hkdfSalt, info }, key, length * 8),
    )
  }
  const utf8 = (text) => Buffer.from(text, 'utf8')
  const ikm = await expand(shared, auth, Buffer.concat([utf8('WebPush: info\0'), recipientPublic, senderPublic]), 32)
  const cek = await expand(ikm, salt, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await expand(ikm, salt, utf8('Content-Encoding: nonce\0'), 12)
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plaintext = Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.subarray(21 + body[20])))
  return JSON.parse(plaintext.subarray(0, plaintext.indexOf(2)).toString('utf8'))
}

test('leave and permission workflow alerts reach only active role owners and use private-safe typed device payloads', async () => {
  const users = [
    { id: 'admin', role: 'Admin', name: 'Reviewer', active: true, credentialVersion: 0 },
    { id: 'admin2', role: 'Admin', name: 'Reviewer 2', active: true, credentialVersion: 0 },
    { id: 'disabled', role: 'Admin', name: 'Disabled reviewer', active: false, credentialVersion: 0 },
    { id: 'employee', role: 'Employee', name: 'Requester', active: true, credentialVersion: 0 },
    { id: 'other', role: 'Employee', name: 'Other employee', active: true, credentialVersion: 0 },
  ]
  const f = fixture(users)
  const keys = await pushKeys()
  const credentials = new Map(
    users
      .slice(0, 2)
      .concat(users.slice(3))
      .map((user, i) => [user.id, asUser(f, user, String.fromCharCode(97 + i).repeat(64))]),
  )
  for (const user of users)
    f.state.subscriptions.push({ employeeId: user.id, subscription: device(keys.keys, user.id) })
  const outbound = []
  const pending = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const payload = await decryptProviderPayload(Buffer.from(await new Response(options.body).arrayBuffer()), keys)
    assert.deepEqual(Object.keys(payload).sort(), ['body', 'kind', 'title'])
    assert.equal(JSON.stringify(payload).includes('PRIVATE_ABSENCE_REASON'), false)
    assert.equal(JSON.stringify(payload).includes('PRIVATE_DECISION_NOTE'), false)
    assert.equal(JSON.stringify(payload).includes('PRIVATE_ADMIN_REASON'), false)
    assert.equal(JSON.stringify(payload).includes('PRIVATE_ADMIN_PERMISSION_REASON'), false)
    outbound.push({ url, payload })
    return { ok: true, status: 201 }
  }
  const send = async (actor, action) => {
    const result = await pushCall(f, keys.env, 'actions', credentials.get(actor), action, {
      waitUntil: (promise) => pending.push(promise),
    })
    await Promise.all(pending.splice(0))
    return result
  }
  try {
    for (const [kind, status] of [
      ['leave', 'Approved'],
      ['leave', 'Rejected'],
      ['permission', 'Approved'],
      ['permission', 'Rejected'],
    ]) {
      const request =
        kind === 'leave'
          ? { start: '2026-10-11', end: '2026-10-12' }
          : { start: '2026-10-11T07:00:00Z', end: '2026-10-11T08:00:00Z' }
      assert.equal(
        (await send('employee', { type: 'absence.request', kind, reason: 'PRIVATE_ABSENCE_REASON', ...request }))
          .status,
        200,
      )
      const absence = f.state.absences.at(-1)
      assert.deepEqual(
        outbound
          .splice(0)
          .map((item) => [item.url, item.payload.kind])
          .sort(),
        [
          [device(keys.keys, 'admin').endpoint, `${kind}-requested`],
          [device(keys.keys, 'admin2').endpoint, `${kind}-requested`],
        ].sort(),
      )
      const beforeDecision = f.state.notifications.length
      assert.equal((await send('admin', { type: 'absence.decide', id: absence.id, status: 'Invalid' })).status, 409)
      assert.equal(f.state.notifications.length, beforeDecision)
      assert.deepEqual(outbound, [])
      assert.equal(
        (await send('admin', { type: 'absence.decide', id: absence.id, status, decisionNote: 'PRIVATE_DECISION_NOTE' }))
          .status,
        200,
      )
      assert.deepEqual(
        outbound.splice(0).map((item) => [item.url, item.payload.kind]),
        [[device(keys.keys, 'employee').endpoint, `${kind}-${status.toLowerCase()}`]],
      )
      assert.equal(f.state.notifications.at(-1).title, `Your ${kind} request ${status.toLowerCase()}`)
      assert.equal(f.state.notifications.at(-1).senderId, 'admin')
      assert.equal(f.state.absences.find((item) => item.id === absence.id).decisionNote, 'PRIVATE_DECISION_NOTE')
      assert.equal(JSON.stringify(f.state.notifications).includes('PRIVATE_DECISION_NOTE'), false)
      const notificationCount = f.state.notifications.length
      assert.equal((await send('admin', { type: 'absence.decide', id: absence.id, status })).status, 409)
      assert.equal(f.state.notifications.length, notificationCount)
      assert.deepEqual(outbound, [])
    }
    const adminRequest = {
      type: 'absence.request',
      kind: 'leave',
      start: '2026-10-20',
      end: '2026-10-20',
      reason: 'PRIVATE_ADMIN_REASON',
    }
    assert.equal((await send('admin', adminRequest)).status, 200)
    const adminLeave = f.state.absences.at(-1)
    assert.equal(adminLeave.employeeId, 'admin')
    assert.deepEqual(
      outbound.splice(0).map((item) => [item.url, item.payload.kind]),
      [[device(keys.keys, 'admin2').endpoint, 'leave-requested']],
    )
    assert.equal(f.state.notifications.at(-1).employeeId, 'admin2')
    assert.equal(f.state.notifications.at(-1).text.includes('PRIVATE_ADMIN_REASON'), false)
    assert.equal((await send('admin', { type: 'absence.decide', id: adminLeave.id, status: 'Approved' })).status, 409)
    assert.deepEqual(outbound, [])
    assert.equal(f.state.absences.find((item) => item.id === adminLeave.id).status, 'Pending')
    assert.equal((await send('admin2', { type: 'absence.decide', id: adminLeave.id, status: 'Approved' })).status, 200)
    assert.deepEqual(
      outbound.splice(0).map((item) => [item.url, item.payload.kind]),
      [[device(keys.keys, 'admin').endpoint, 'leave-approved']],
    )
    const adminPermission = {
      type: 'absence.request',
      kind: 'permission',
      start: '2026-10-21T07:00:00Z',
      end: '2026-10-21T08:00:00Z',
      reason: 'PRIVATE_ADMIN_PERMISSION_REASON',
    }
    assert.equal((await send('admin', adminPermission)).status, 200)
    const adminPermissionItem = f.state.absences.at(-1)
    assert.equal(adminPermissionItem.employeeId, 'admin')
    assert.deepEqual(
      outbound.splice(0).map((item) => [item.url, item.payload.kind]),
      [[device(keys.keys, 'admin2').endpoint, 'permission-requested']],
    )
    for (const status of ['Approved', 'Rejected']) {
      assert.equal((await send('admin', { type: 'absence.decide', id: adminPermissionItem.id, status })).status, 409)
      assert.equal((await send('employee', { type: 'absence.decide', id: adminPermissionItem.id, status })).status, 403)
      assert.deepEqual(outbound, [])
    }
    assert.equal(
      (
        await send('admin2', {
          type: 'absence.decide',
          id: adminPermissionItem.id,
          status: 'Rejected',
          decisionNote: 'PRIVATE_DECISION_NOTE',
        })
      ).status,
      200,
    )
    assert.deepEqual(
      outbound.splice(0).map((item) => [item.url, item.payload.kind]),
      [[device(keys.keys, 'admin').endpoint, 'permission-rejected']],
    )
    assert.equal(JSON.stringify(f.state.notifications).includes('PRIVATE_DECISION_NOTE'), false)
    assert.equal(
      f.state.notifications.some(
        (n) => n.employeeId === 'employee' && n.text.includes('PRIVATE_ADMIN_PERMISSION_REASON'),
      ),
      false,
    )
    assert.equal(
      (
        await send('admin', {
          type: 'absence.request',
          kind: 'permission',
          start: '2026-10-21T07:00:00Z',
          end: '2026-10-22T08:00:00Z',
          reason: 'bad interval',
        })
      ).status,
      400,
    )
    assert.deepEqual(
      f.state.notifications.filter((n) => n.employeeId === 'disabled'),
      [],
    )
    assert.deepEqual(
      f.state.notifications.filter((n) => n.employeeId === 'other'),
      [],
    )
    assert.deepEqual(
      f.state.notifications.filter((n) => n.employeeId === 'employee').map((n) => n.kind),
      ['leave-approved', 'leave-rejected', 'permission-approved', 'permission-rejected'],
    )
    const adminInbox = (await (await callWith(f, 'snapshot', 'GET', credentials.get('admin'))).json()).notifications
    const employeeReviewerAlerts = adminInbox.filter((n) => n.sender?.id === 'employee')
    assert.deepEqual(
      employeeReviewerAlerts.map((n) => n.kind),
      ['leave-requested', 'leave-requested', 'permission-requested', 'permission-requested'],
    )
    assert.ok(employeeReviewerAlerts.every((n) => n.readAt === null))
    assert.ok(adminInbox.some((n) => n.kind === 'leave-approved' && n.sender?.id === 'admin2'))
    assert.ok(adminInbox.some((n) => n.kind === 'permission-rejected' && n.sender?.id === 'admin2'))
    const admin2Inbox = (await (await callWith(f, 'snapshot', 'GET', credentials.get('admin2'))).json()).notifications
    assert.ok(admin2Inbox.some((n) => n.kind === 'permission-requested' && n.sender?.id === 'admin'))
    const first = employeeReviewerAlerts[0].id
    assert.equal((await send('admin2', { type: 'notification.read', id: first })).status, 404)
    assert.equal((await send('other', { type: 'notification.read', id: first })).status, 404)
    assert.equal((await send('admin', { type: 'notification.read', id: first })).status, 200)
    assert.ok((await (await callWith(f, 'snapshot', 'GET', credentials.get('admin'))).json()).notifications[0].readAt)
    assert.equal(
      (await (await callWith(f, 'snapshot', 'GET', credentials.get('admin2'))).json()).notifications[0].readAt,
      null,
    )
    assert.deepEqual(outbound, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('an only active Admin can submit an absence without creating a reviewer alert', async () => {
  const admin = { id: 'admin', role: 'Admin', name: 'Only Admin', active: true, credentialVersion: 0 }
  const f = fixture([
    admin,
    { id: 'inactive-admin', role: 'Admin', active: false },
    { id: 'employee', role: 'Employee', active: true },
  ])
  const headers = asUser(f, admin)
  for (const request of [
    { kind: 'permission', start: '2026-10-21T07:00:00Z', end: '2026-10-21T08:00:00Z' },
    { kind: 'leave', start: '2026-10-21', end: '2026-10-21' },
  ]) {
    const response = await callWith(f, 'actions', 'POST', headers, {
      type: 'absence.request',
      ...request,
      reason: 'Private reason',
    })
    assert.equal(response.status, 200)
    assert.equal(f.state.absences.at(-1).status, 'Pending')
    assert.equal(
      (
        await callWith(f, 'actions', 'POST', headers, {
          type: 'absence.decide',
          id: f.state.absences.at(-1).id,
          status: 'Approved',
        })
      ).status,
      409,
    )
  }
  assert.equal(f.state.absences.length, 2)
  assert.deepEqual(f.state.notifications, [])
})

test('Admin and Employee absence requests share validation and cannot spoof the requester or pre-approve', async () => {
  for (const role of ['Admin', 'Employee']) {
    const actor = { id: 'requester', role, active: true, credentialVersion: 0 }
    const f = fixture([actor, { id: 'reviewer', role: 'Admin', active: true }])
    const headers = asUser(f, actor)
    const send = (payload, requestHeaders = headers) => callWith(f, 'actions', 'POST', requestHeaders, payload)
    const leave = { type: 'absence.request', kind: 'leave', start: '2026-10-12', end: '2026-10-13', reason: 'Reason' }
    const permission = {
      ...leave,
      kind: 'permission',
      start: '2026-10-12T10:00:00+05:30',
      end: '2026-10-12T11:00:00+05:30',
    }
    for (const invalid of [
      { ...leave, kind: 'holiday' },
      { ...leave, start: '2026-02-30' },
      { ...leave, end: '2026-02-30' },
      { ...leave, start: '2026-10-14' },
      { ...leave, reason: '   ' },
      { ...leave, reason: 'x'.repeat(1001) },
      { ...permission, start: '2026-10-12T10:00:00' },
      { ...permission, end: permission.start },
      { ...permission, end: '2026-10-12T09:00:00+05:30' },
      { ...permission, end: '2026-10-13T10:00:00+05:30' },
      { ...permission, start: '2026-10-12T18:00:00Z', end: '2026-10-12T19:00:00Z' },
      { ...permission, reason: null },
    ]) {
      const before = JSON.stringify(f.state)
      assert.equal((await send(invalid)).status, 400, `${role}: invalid request`)
      assert.equal(JSON.stringify(f.state), before, 'Validation failures must not persist rows or alerts')
    }
    assert.equal((await send(leave, { ...headers, 'X-CSRF-Token': '' })).status, 403)
    assert.equal((await send(leave, { ...headers, Origin: 'https://other.test' })).status, 403)
    for (const request of [leave, permission]) {
      assert.equal(
        (await send({ ...request, employeeId: 'reviewer', status: 'Approved', reason: '  Own reason  ' })).status,
        200,
      )
      const item = f.state.absences.at(-1)
      assert.equal(item.employeeId, actor.id)
      assert.equal(item.status, 'Pending')
      assert.equal(item.reason, 'Own reason')
      assert.equal(item.decidedAt, null)
    }
    const snapshot = await (await callWith(f, 'snapshot', 'GET', headers)).json()
    assert.equal(snapshot.absences.length, 2)
    assert.equal(snapshot.absences[1].start, '2026-10-12T04:30:00.000Z')
    assert.equal(snapshot.absences[1].end, '2026-10-12T05:30:00.000Z')
  }
})

test('absence requests and decisions keep active-session, password-rotation and role gates', async () => {
  for (const [fields, expected] of [
    [{ role: 'Guest', active: true }, 403],
    [{ role: 'Admin', active: false }, 401],
    [{ role: 'Admin', active: true, mustChangePassword: true }, 403],
  ]) {
    const actor = { id: 'actor', credentialVersion: 0, ...fields }
    const f = fixture([actor])
    const headers = asUser(f, actor)
    for (const payload of [
      { type: 'absence.request', kind: 'leave', start: '2026-10-12', end: '2026-10-12', reason: 'Private' },
      { type: 'absence.decide', id: 'pending', status: 'Approved' },
    ]) {
      assert.equal((await callWith(f, 'actions', 'POST', headers, payload)).status, expected)
      assert.deepEqual(f.state.absences, [])
      assert.deepEqual(f.state.notifications, [])
    }
  }
})

test('device subscriptions preserve other devices, transfer shared endpoint ownership and revoke only own endpoint', async () => {
  const f = fixture(people())
  const { env, keys } = await pushKeys()
  const employee = asUser(f, f.state.users[1])
  const other = asUser(f, f.state.users[2], 'b'.repeat(64))
  const a = device(keys, 'phone'),
    b = device(keys, 'desktop')
  const subscribe = (headers, subscription) => pushCall(f, env, 'push-subscription', headers, { subscription })
  assert.equal((await subscribe(employee, a)).status, 200)
  assert.equal((await subscribe(employee, b)).status, 200)
  assert.equal((await subscribe(employee, a)).status, 200)
  assert.deepEqual(f.state.subscriptions.map((x) => x.subscription.endpoint).sort(), [a.endpoint, b.endpoint].sort())
  assert.equal((await subscribe(other, a)).status, 200)
  assert.deepEqual(f.state.subscriptions.map((x) => x.employeeId).sort(), ['employee', 'other'])
  assert.equal(
    (await pushCall(f, env, 'push-subscription', employee, { subscription: null, endpoint: a.endpoint })).status,
    200,
  )
  assert.equal(f.state.subscriptions.length, 2)
  assert.equal(
    (await pushCall(f, env, 'push-subscription', employee, { subscription: null, endpoint: b.endpoint })).status,
    200,
  )
  assert.deepEqual(
    f.state.subscriptions.map((x) => x.employeeId),
    ['other'],
  )
  for (let i = 0; i < 5; i++) assert.equal((await subscribe(employee, device(keys, `extra${i}`))).status, 200)
  assert.equal((await subscribe(employee, device(keys, 'sixth'))).status, 409)
  assert.equal(f.state.subscriptions.filter((x) => x.employeeId === 'employee').length, 5)
  assert.equal((await pushCall(f, env, 'push-subscription', employee, { subscription: null })).status, 200)
  assert.equal(f.state.subscriptions.filter((x) => x.employeeId === 'employee').length, 5)
})

test('shared-browser login and logout revoke only the device-bound previous account subscription', async () => {
  const users = people()
  for (const user of users) {
    user.email = `${user.id}@example.test`
    user.passwordHash =
      'scrypt-v1$32768$8$3$000000000000000000000000000000000000000000000000$1813bc929d4e4c36f4af9f60a856cd8f8b9ceaa91712765a73926b1cba497501'
  }
  const f = fixture(users)
  const { env, keys } = await pushKeys()
  const auth = asUser(f, users[1])
  const phone = device(keys, 'phone'),
    desktop = device(keys, 'desktop')
  const first = await pushCall(f, env, 'push-subscription', auth, { subscription: phone })
  const deviceCookie = first.headers.get('Set-Cookie').split(';')[0]
  assert.match(deviceCookie, /^portal_push_device=[a-f0-9]{32}$/)
  const readDevice = () =>
    handlePortalApi(
      new Request('https://portal.example/api/portal/push-key', {
        headers: { ...auth, Cookie: `${auth.Cookie}; ${deviceCookie}` },
      }),
      { PORTAL_DB: f.db, ...env },
    )
  const deviceStatus = await (await readDevice()).json()
  assert.equal(deviceStatus.deviceSubscribed, true)
  assert.equal('endpoint' in deviceStatus, false)
  assert.equal((await pushCall(f, env, 'push-subscription', auth, { subscription: desktop })).status, 200)
  const passwords = {
    idFromName: () => 'passwords-v1',
    get: () => ({
      fetch: async () =>
        new Response(JSON.stringify({ verified: true }), { headers: { 'Content-Type': 'application/json' } }),
    }),
  }
  const login = await handlePortalApi(
    new Request('https://portal.example/api/portal/login', {
      method: 'POST',
      headers: { Origin: 'https://portal.example', Cookie: deviceCookie },
      body: JSON.stringify({ email: users[2].email, password: 'twelve-characters' }),
    }),
    { PORTAL_DB: f.db, PORTAL_PASSWORDS: passwords },
  )
  assert.equal(login.status, 200)
  assert.deepEqual(
    f.state.subscriptions.map((x) => x.subscription.endpoint),
    [desktop.endpoint],
  )
  assert.equal((await (await readDevice()).json()).deviceSubscribed, false)
  // A logout in the other browser only removes its own device, not the desktop.
  const rebound = await pushCall(
    f,
    env,
    'push-subscription',
    { ...auth, Cookie: `${auth.Cookie}; ${deviceCookie}` },
    { subscription: phone },
  )
  assert.equal(rebound.status, 200)
  const logout = await pushCall(f, env, 'logout', { ...auth, Cookie: `${auth.Cookie}; ${deviceCookie}` }, {})
  assert.equal(logout.status, 200)
  assert.deepEqual(
    f.state.subscriptions.map((x) => x.subscription.endpoint),
    [desktop.endpoint],
  )
})

test('only committed new inbox rows push to active owners, including Admin workflow; read and failed actions do not replay', async () => {
  const f = fixture(people())
  const { env, keys } = await pushKeys()
  const admin = asUser(f, f.state.users[0])
  const employee = asUser(f, f.state.users[1], 'b'.repeat(64))
  const other = asUser(f, f.state.users[2], 'c'.repeat(64))
  const a = device(keys, 'admin'),
    b = device(keys, 'employee'),
    c = device(keys, 'employee2'),
    d = device(keys, 'other')
  f.state.subscriptions.push(
    { employeeId: 'admin', subscription: a },
    { employeeId: 'employee', subscription: b },
    { employeeId: 'employee', subscription: c },
    { employeeId: 'other', subscription: d },
  )
  f.state.clients.push({ id: 'client', active: true })
  const requests = [],
    pending = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    requests.push(url)
    return { ok: true, status: 201 }
  }
  const send = async (headers, body) => {
    const result = await pushCall(f, env, 'actions', headers, body, { waitUntil: (promise) => pending.push(promise) })
    await Promise.all(pending.splice(0))
    return result
  }
  try {
    assert.equal(
      (
        await send(admin, {
          type: 'task.create',
          assigneeId: 'employee',
          clientId: 'client',
          title: 'Task',
          jobFunction: 'Design',
          deadline: '2026-12-01T12:00:00Z',
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0).sort(), [b.endpoint, c.endpoint].sort())
    assert.equal(f.state.notifications.at(-1).kind, 'task-assigned')
    const task = f.state.tasks[0]
    assert.equal(
      (await send(employee, { type: 'task.transition', id: task.id, version: task.version, state: 'In-progress' }))
        .status,
      200,
    )
    assert.deepEqual(requests.splice(0), [])
    assert.equal(
      (
        await send(employee, {
          type: 'task.transition',
          id: task.id,
          version: f.state.tasks[0].version,
          state: 'Completed',
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0), [a.endpoint])
    assert.ok(f.state.notifications.filter((n) => n.taskId === task.id).every((n) => n.kind === 'task-completed'))
    assert.equal(
      (
        await send(admin, {
          type: 'task.transition',
          id: task.id,
          version: f.state.tasks[0].version,
          state: 'In-progress',
          reason: 'PRIVATE_REVISION_REASON',
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0).sort(), [b.endpoint, c.endpoint].sort())
    assert.equal(f.state.notifications.at(-1).kind, 'task-revision')
    assert.equal(
      (
        await send(employee, {
          type: 'task.transition',
          id: task.id,
          version: f.state.tasks[0].version,
          state: 'Completed',
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0), [a.endpoint])
    assert.equal(
      (
        await send(admin, {
          type: 'task.transition',
          id: task.id,
          version: f.state.tasks[0].version,
          state: 'Approved',
          rating: 5,
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0).sort(), [b.endpoint, c.endpoint].sort())
    assert.equal(f.state.notifications.at(-1).kind, 'task-approved')
    assert.equal(
      (
        await send(admin, {
          type: 'task.deadline',
          id: task.id,
          version: f.state.tasks[0].version,
          deadline: '2026-12-02T12:00:00Z',
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0).sort(), [b.endpoint, c.endpoint].sort())
    assert.equal(f.state.notifications.at(-1).kind, 'task-deadline')
    assert.equal(
      (
        await send(admin, {
          type: 'task.create',
          assigneeId: 'admin',
          clientId: 'client',
          title: 'Admin-owned',
          deadline: '2026-12-01T12:00:00Z',
        })
      ).status,
      200,
    )
    assert.deepEqual(requests.splice(0), [a.endpoint])
    assert.equal(f.state.notifications.at(-1).kind, 'task-assigned')
    assert.equal((await send(admin, { type: 'note.create', text: 'Private', recipientIds: ['employee'] })).status, 200)
    assert.deepEqual(requests.splice(0).sort(), [b.endpoint, c.endpoint].sort())
    assert.equal(
      (await send(admin, { type: 'broadcast.create', title: 'News', text: 'Update', recipientIds: [] })).status,
      200,
    )
    assert.deepEqual(requests.splice(0).sort(), [a.endpoint, b.endpoint, c.endpoint, d.endpoint].sort())
    const before = f.state.notifications.length
    assert.equal((await send(other, { type: 'notification.read', id: f.state.notifications[0].id })).status, 404)
    assert.equal((await send(employee, { type: 'notification.read', id: f.state.notifications[0].id })).status, 200)
    assert.equal((await send(employee, { type: 'notification.read', id: f.state.notifications[0].id })).status, 200)
    assert.deepEqual(requests, [])
    assert.equal(f.state.notifications.length, before)
  } finally {
    globalThis.fetch = original
  }
})

test('push-test is authenticated, CSRF-protected, bounded, and returns counts without exposing provider or subscription details', async () => {
  const f = fixture(people())
  const { env, keys } = await pushKeys()
  const mine = asUser(f, f.state.users[1])
  const other = device(keys, 'other'),
    success = device(keys, 'success'),
    expired = device(keys, 'expired')
  f.state.subscriptions.push(
    { employeeId: 'employee', subscription: success },
    { employeeId: 'employee', subscription: expired },
    { employeeId: 'other', subscription: other },
  )
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(url)
    return { ok: url === success.endpoint, status: url === success.endpoint ? 201 : 410 }
  }
  try {
    assert.equal((await pushCall(f, env, 'push-test', { Origin: mine.Origin }, {})).status, 401)
    assert.equal((await pushCall(f, env, 'push-test', { Cookie: mine.Cookie, Origin: mine.Origin }, {})).status, 403)
    assert.equal((await pushCall(f, env, 'push-test', mine, { target: other.endpoint })).status, 400)
    const result = await pushCall(f, env, 'push-test', mine, {})
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), {
      sent: 1,
      failed: 1,
      skipped: 0,
      diagnostics: { configuration: 0, preparation: 0, network: 0, timeout: 0, httpStatuses: { 410: 1 } },
    })
    assert.deepEqual(requests.sort(), [success.endpoint, expired.endpoint].sort())
    assert.deepEqual(
      f.state.subscriptions.map((x) => x.subscription.endpoint).sort(),
      [success.endpoint, other.endpoint].sort(),
    )
    for (let i = 0; i < 7; i++) assert.equal((await pushCall(f, env, 'push-test', mine, {})).status, 200)
    assert.equal((await pushCall(f, env, 'push-test', mine, {})).status, 429)
  } finally {
    globalThis.fetch = original
  }
})

test('push-test returns bounded diagnostics without leaking subscription, exception or provider body', async () => {
  const f = fixture(people())
  const { env, keys } = await pushKeys()
  const headers = asUser(f, f.state.users[1])
  const invalid = device(keys, 'private-preparation')
  invalid.keys = { ...keys, p256dh: 'PRIVATE_KEY_SENTINEL' }
  const rejected = device(keys, 'private-provider')
  const network = device(keys, 'private-network')
  f.state.subscriptions.push(
    ...[invalid, rejected, network].map((subscription) => ({ employeeId: 'employee', subscription })),
  )
  const original = globalThis.fetch
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(url)
    if (url === rejected.endpoint) return { ok: false, status: 403, body: 'PRIVATE_PROVIDER_BODY' }
    throw new Error('PRIVATE_NETWORK_EXCEPTION Authorization PRIVATE_TOKEN')
  }
  try {
    const response = await pushCall(f, env, 'push-test', headers, {})
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body, {
      sent: 0,
      failed: 3,
      skipped: 0,
      diagnostics: { configuration: 0, preparation: 1, network: 1, timeout: 0, httpStatuses: { 403: 1 } },
    })
    assert.deepEqual(requested.sort(), [rejected.endpoint, network.endpoint].sort())
    for (const privateValue of ['PRIVATE_', 'private-', 'Authorization', env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT])
      assert.equal(JSON.stringify(body).includes(privateValue), false)
  } finally {
    globalThis.fetch = original
  }
})

test('provider failure never rolls back inbox; ambiguous shared ownership is never delivered', async () => {
  const f = fixture(people())
  const { env, keys } = await pushKeys()
  const admin = asUser(f, f.state.users[0])
  const endpoint = device(keys, 'shared')
  f.state.subscriptions.push(
    { employeeId: 'employee', subscription: endpoint },
    { employeeId: 'other', subscription: endpoint },
  )
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    calls++
    throw new Error('provider private detail')
  }
  try {
    const pending = []
    const context = { waitUntil: (promise) => pending.push(promise) }
    assert.equal(
      (
        await pushCall(
          f,
          env,
          'actions',
          admin,
          { type: 'broadcast.create', title: 'News', text: 'Body', recipientIds: [] },
          context,
        )
      ).status,
      200,
    )
    await Promise.all(pending)
    assert.equal(calls, 0)
    assert.equal(f.state.notifications.length, 3)
    f.state.subscriptions.pop()
    assert.equal(
      (
        await pushCall(
          f,
          env,
          'actions',
          admin,
          { type: 'note.create', text: 'Note', recipientIds: ['employee'] },
          context,
        )
      ).status,
      200,
    )
    await Promise.all(pending)
    assert.equal(calls, 1)
    assert.equal(f.state.notifications.length, 4)
  } finally {
    globalThis.fetch = original
  }
})
