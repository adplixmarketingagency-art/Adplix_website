import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { handlePortalApi } from '../src/portal/api.mjs'
import { hashPassword, verifyPassword } from '../src/portal/auth.mjs'
import { issueSession } from '../src/portal/store.mjs'
import { fakePortalPasswords } from './support/portal-passwords.mjs'

const origin = 'https://portal.test'
const password = 'Synthetic-registration-123!'
const message = 'Registration request received. An administrator must approve access.'
const migration = await readFile(new URL('../migrations/0001_portal.sql', import.meta.url), 'utf8')

function fixture() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(migration)
  const db = {
    prepare(statement) {
      let values = []
      return {
        bind(...args) {
          values = args
          return this
        },
        async first() {
          return sql.prepare(statement).get(...values) ?? null
        },
        async run() {
          return { meta: { changes: Number(sql.prepare(statement).run(...values).changes) } }
        },
      }
    },
  }
  const passwords = fakePortalPasswords()
  const env = { PORTAL_DB: db, PORTAL_PASSWORDS: passwords }
  const state = () => JSON.parse(sql.prepare('SELECT document FROM portal_state WHERE id=1').get().document)
  const save = (value) =>
    sql.prepare('UPDATE portal_state SET revision=revision+1,document=? WHERE id=1').run(JSON.stringify(value))
  const request = (path, body, auth = {}, extra = {}) =>
    handlePortalApi(
      new Request(origin + '/api/portal/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: origin,
          'CF-Connecting-IP': '192.0.2.10',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...auth,
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      {},
    )
  const login = async (email, pass = password, ip = '192.0.2.11') =>
    request('login', { email, password: pass }, {}, { 'CF-Connecting-IP': ip })
  const as = async (user) => {
    const { token, csrfToken } = await issueSession(db, user)
    return { Cookie: `portal_session=${token}`, 'X-CSRF-Token': csrfToken }
  }
  return { sql, state, save, request, login, as, env, passwords }
}

async function withAdmin(f) {
  const admin = {
    id: 'admin',
    name: 'Admin',
    employeeId: 'ADMIN',
    email: 'admin@example.test',
    passwordHash: await hashPassword(password),
    role: 'Admin',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
  }
  const state = f.state()
  state.users.push(admin)
  f.save(state)
  return f.as(admin)
}

test('registration needs a provisioned Admin and origin, throttles persistently before hashing', async (t) => {
  const f = fixture()
  t.after(() => f.sql.close())
  const data = { name: 'New Member', email: 'member@example.test', password }
  assert.equal((await f.request('register', data)).status, 503)
  await withAdmin(f)
  assert.equal((await f.request('register', data, {}, { Origin: 'https://other.test' })).status, 403)
  assert.equal((await f.request('register', data, {}, { Origin: '' })).status, 403)
  assert.equal((await f.request('register', { ...data, password: 'short' })).status, 400)
  for (let i = 0; i < 6; i++) {
    const result = await f.request('register', { ...data, email: `member${i}@example.test` })
    assert.equal(result.status, 202)
    assert.deepEqual(await result.json(), { ok: true, message })
    assert.equal(result.headers.get('set-cookie'), null)
  }
  assert.equal((await f.request('register', { ...data, email: 'blocked@example.test' })).status, 429)
  assert.equal(f.state().registrations.length, 6)
  const limits = f.sql.prepare('SELECT bucket FROM portal_login_limits').all()
  assert.ok(limits.some((row) => row.bucket.startsWith('regIP:')))
  assert.ok(limits.some((row) => row.bucket.startsWith('regEmail:')))
})

test('pending registrations remain private, duplicates preserve hash and identity, approval creates only an Employee', async (t) => {
  const f = fixture()
  t.after(() => f.sql.close())
  const admin = await withAdmin(f)
  const employee = {
    id: 'existing',
    name: 'Existing',
    employeeId: 'EXIST',
    email: 'existing@example.test',
    passwordHash: await hashPassword(password),
    role: 'Employee',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
  }
  const old = f.state()
  old.users.push(employee)
  f.save(old)
  const member = await f.as(employee)
  const input = {
    name: '  New Member  ',
    email: '  MEMBER@EXAMPLE.TEST ',
    password,
    role: 'Admin',
    employeeId: 'ADMIN',
  }
  const registered = await f.request('register', input)
  assert.equal(registered.status, 202)
  assert.deepEqual(await registered.json(), { ok: true, message })
  assert.equal(registered.headers.get('set-cookie'), null)
  const pending = f.state().registrations[0]
  assert.equal(pending.email, 'member@example.test')
  assert.equal(pending.name, 'New Member')
  assert.equal(pending.designation, 'Employee')
  assert.equal(await verifyPassword(password, pending.passwordHash), true)
  assert.equal(f.passwords.calls.hash, 1)
  assert.equal(f.state().users.length, 2)
  const duplicate = await f.request('register', {
    ...input,
    name: 'Attacker',
    password: 'Different-long-password-789!',
    role: 'Admin',
  })
  assert.equal(duplicate.status, 202)
  assert.deepEqual(await duplicate.json(), { ok: true, message })
  assert.deepEqual(f.state().registrations[0], pending)
  const existing = await f.request('register', { ...input, email: employee.email })
  assert.equal(existing.status, 202)
  assert.deepEqual(await existing.json(), { ok: true, message })
  assert.equal(f.state().registrations.length, 1)
  assert.equal((await f.login('member@example.test', 'Incorrect-long-password-123!')).status, 401)
  const waiting = await f.login('member@example.test')
  assert.equal(waiting.status, 403)
  assert.equal(f.passwords.calls.verify, 2)
  assert.equal((await waiting.json()).error, 'Administrator approval required.')
  assert.equal(waiting.headers.get('set-cookie'), null)
  for (const path of ['snapshot', 'export', 'analytics']) assert.equal((await f.request(path)).status, 401)
  const employeeSnapshot = await (await f.request('snapshot', undefined, member)).json()
  assert.equal('registrations' in employeeSnapshot, false)
  assert.equal(
    employeeSnapshot.employees.some((x) => x.email === pending.email),
    false,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'registration.approve', id: pending.id, employeeId: 'NEW', jobFunctions: [] },
        member,
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'registration.approve', id: pending.id, employeeId: 'NEW', jobFunctions: [] },
        { Cookie: admin.Cookie },
      )
    ).status,
    403,
  )
  const adminSnapshot = await (await f.request('snapshot', undefined, admin)).json()
  assert.deepEqual(adminSnapshot.registrations, [
    {
      id: pending.id,
      name: pending.name,
      email: pending.email,
      designation: 'Employee',
      status: 'Pending',
      createdAt: pending.createdAt,
      decidedAt: null,
      employeeId: null,
    },
  ])
  assert.ok(!JSON.stringify(adminSnapshot).includes(pending.passwordHash))
  assert.equal(adminSnapshot.employees.length, 2)
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'registration.approve', id: pending.id, employeeId: 'ADMIN', jobFunctions: [] },
        admin,
      )
    ).status,
    409,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'registration.approve', id: pending.id, employeeId: 'NEW', jobFunctions: ['Design'], role: 'Admin' },
        admin,
      )
    ).status,
    200,
  )
  const approved = f.state()
  const created = approved.users.at(-1)
  assert.equal(created.role, 'Employee')
  assert.equal(created.active, true)
  assert.equal(created.mustChangePassword, false)
  assert.equal(created.designation, 'Employee')
  assert.equal(created.name, pending.name)
  assert.equal(created.employeeId, 'NEW')
  assert.deepEqual(created.profile, {})
  assert.deepEqual(created.jobFunctions, ['Design'])
  assert.equal(created.passwordHash, pending.passwordHash)
  assert.notEqual(created.createdAt, pending.createdAt)
  assert.equal(approved.registrations[0].passwordHash, undefined)
  assert.equal(approved.registrations[0].status, 'Approved')
  assert.equal(approved.registrations[0].employeeId, 'NEW')
  assert.equal(approved.audit.at(-1).action, 'registration.approve')
  assert.ok(!JSON.stringify(approved.audit).includes(password))
  assert.ok(!JSON.stringify(approved.audit).includes(pending.email))
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'registration.approve', id: pending.id, employeeId: 'AGAIN', jobFunctions: [] },
        admin,
      )
    ).status,
    409,
  )
  const approvedDuplicate = await f.request('register', { ...input, password: 'Different-long-password-789!' })
  assert.equal(approvedDuplicate.status, 202)
  assert.equal(f.state().users.at(-1).passwordHash, pending.passwordHash)
  const loggedIn = await f.login('member@example.test')
  assert.equal(loggedIn.status, 200)
  assert.equal((await loggedIn.json()).user.mustChangePassword, false)
})

test('missing password namespace fails closed for registration and login without changing credentials or issuing sessions', async (t) => {
  const f = fixture()
  t.after(() => f.sql.close())
  await withAdmin(f)
  const before = f.state()
  const sessionCount = f.sql.prepare('SELECT COUNT(*) AS count FROM portal_sessions').get().count
  delete f.env.PORTAL_PASSWORDS
  const registration = await f.request('register', { name: 'No Binding', email: 'new@example.test', password })
  assert.equal(registration.status, 503)
  assert.equal(registration.headers.get('set-cookie'), null)
  assert.deepEqual(f.state(), before)
  const login = await f.login('admin@example.test')
  assert.equal(login.status, 503)
  assert.equal(login.headers.get('set-cookie'), null)
  assert.deepEqual(f.state(), before)
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM portal_sessions').get().count, sessionCount)
})

test('rejection purges credentials, decision races have a single winner, legacy state reads safely', async (t) => {
  const f = fixture()
  t.after(() => f.sql.close())
  const admin = await withAdmin(f)
  assert.deepEqual((await (await f.request('snapshot', undefined, admin)).json()).registrations, [])
  const registration = { name: 'Rejected User', email: 'rejected@example.test', password }
  assert.equal((await f.request('register', registration)).status, 202)
  const original = f.state().registrations[0]
  const outcomes = await Promise.all([
    f.request('actions', { type: 'registration.reject', id: original.id }, admin),
    f.request(
      'actions',
      { type: 'registration.approve', id: original.id, employeeId: 'RACE', jobFunctions: [] },
      admin,
    ),
  ])
  assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 409])
  const state = f.state()
  assert.equal(state.registrations[0].passwordHash, undefined)
  if (state.registrations[0].status === 'Rejected') {
    assert.equal(state.users.length, 1)
    assert.equal((await f.login(registration.email)).status, 401)
    assert.equal((await f.request('register', registration)).status, 202)
    assert.equal(f.state().registrations[0].status, 'Rejected')
  } else {
    assert.equal(state.users.length, 2)
    assert.equal(state.users[1].passwordHash, original.passwordHash)
  }
  assert.equal((await f.request('actions', { type: 'registration.reject', id: original.id }, admin)).status, 409)
})

test('rejected credentials never authenticate and an email claimed before approval cannot be overwritten', async (t) => {
  const f = fixture()
  t.after(() => f.sql.close())
  const admin = await withAdmin(f)
  assert.equal((await f.request('register', { name: 'Reject Me', email: 'reject@example.test', password })).status, 202)
  const rejected = f.state().registrations[0]
  assert.equal((await f.request('actions', { type: 'registration.reject', id: rejected.id }, admin)).status, 200)
  assert.equal(f.state().registrations[0].passwordHash, undefined)
  assert.equal((await f.login(rejected.email)).status, 401)
  assert.equal((await f.request('register', { name: 'Again', email: rejected.email, password })).status, 202)
  assert.equal(f.state().registrations.length, 1)
  assert.equal(
    (await f.request('register', { name: 'Contested', email: 'contested@example.test', password })).status,
    202,
  )
  const contested = f.state().registrations.at(-1)
  const state = f.state()
  state.users.push({
    id: 'claimed',
    employeeId: 'CLAIMED',
    name: 'Claimed',
    email: contested.email,
    role: 'Employee',
    passwordHash: await hashPassword('Another-long-secret-456!'),
    active: true,
    credentialVersion: 0,
  })
  f.save(state)
  const approval = await f.request(
    'actions',
    { type: 'registration.approve', id: contested.id, employeeId: 'NEW', jobFunctions: [] },
    admin,
  )
  assert.equal(approval.status, 409)
  assert.equal(f.state().registrations.at(-1).status, 'Pending')
  assert.equal(f.state().users.length, 2)
})

test('pending cap and decided-record retention bound registration state', async (t) => {
  const f = fixture()
  t.after(() => f.sql.close())
  await withAdmin(f)
  const state = f.state()
  state.registrations = Array.from({ length: 100 }, (_, n) => ({
    id: `pending-${n}`,
    name: 'Applicant',
    email: `pending${n}@example.test`,
    passwordHash: 'synthetic',
    status: 'Pending',
    createdAt: new Date().toISOString(),
    decidedAt: null,
  }))
  f.save(state)
  const result = await f.request('register', { name: 'Fresh Applicant', email: 'fresh@example.test', password })
  assert.equal(result.status, 503)
  assert.equal(f.state().registrations.length, 100)
  const again = await f.request('register', { name: 'Applicant', email: 'pending0@example.test', password })
  assert.equal(again.status, 202)
  const next = f.state()
  next.registrations.shift()
  next.registrations.push({
    id: 'expired',
    name: 'Old',
    email: 'old@example.test',
    status: 'Rejected',
    createdAt: '2020-01-01T00:00:00.000Z',
    decidedAt: '2020-01-01T00:00:00.000Z',
  })
  f.save(next)
  assert.equal(
    (await f.request('register', { name: 'Fresh Applicant', email: 'fresh@example.test', password })).status,
    202,
  )
  assert.equal(
    f.state().registrations.some((x) => x.id === 'expired'),
    false,
  )
  assert.equal(f.state().registrations.filter((x) => x.status === 'Pending').length, 100)
})
