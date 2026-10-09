import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePortalApi } from '../src/portal/api.mjs'
import { hashPassword, verifyPassword } from '../src/portal/auth.mjs'
import { issueSession } from '../src/portal/store.mjs'
import { fakePortalPasswords } from './support/portal-passwords.mjs'

const origin = 'https://portal.test'
const password = 'Synthetic-admin-123!'
const replacement = 'Synthetic-admin-replacement-456!'

function fixture() {
  let revision = 0
  let state = {
    schema: 1,
    users: [],
    clients: [],
    tasks: [],
    updates: [],
    absences: [],
    notes: [],
    notifications: [],
    subscriptions: [],
    audit: [],
  }
  const sessions = new Map()
  const db = {
    prepare(statement) {
      let values = []
      return {
        bind(...args) {
          values = args
          return this
        },
        async first() {
          if (statement.includes('FROM portal_state')) return { revision, document: JSON.stringify(state) }
          if (statement.includes('FROM portal_sessions')) return sessions.get(values[0]) || null
          if (statement.includes('FROM portal_login_limits')) return { attempts: 1, blocked_until: 0 }
          return null
        },
        async run() {
          if (statement.startsWith('UPDATE portal_state')) {
            if (revision !== values[1]) return { meta: { changes: 0 } }
            state = JSON.parse(values[0])
            revision++
          } else if (statement.startsWith('INSERT INTO portal_sessions')) {
            sessions.set(values[0], {
              token_hash: values[0],
              user_id: values[1],
              csrf_hash: values[2],
              expires_at: values[3],
              created_at: values[4],
              credential_version: values[5],
            })
          } else if (statement.startsWith('DELETE FROM portal_sessions')) {
            if (statement.includes('user_id')) {
              for (const [key, value] of sessions) if (value.user_id === values[0]) sessions.delete(key)
            } else {
              sessions.delete(values[0])
            }
          }
          return { meta: { changes: 1 } }
        },
      }
    },
  }
  const passwords = fakePortalPasswords()
  const env = { PORTAL_DB: db, PORTAL_PASSWORDS: passwords, PORTAL_ALLOW_HTTP_LOCAL: 'false' }
  const read = () => state
  const save = (value) => {
    state = value
    revision++
  }
  const request = (path, body, auth = {}) =>
    handlePortalApi(
      new Request(`${origin}/api/portal/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...auth },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      {},
    )
  const as = async (user) => {
    const issued = await issueSession(db, user)
    return { Cookie: `portal_session=${issued.token}`, 'X-CSRF-Token': issued.csrfToken }
  }
  return { close() {}, state: read, save, request, as, env, passwords, sessions }
}

async function withAdmin(fixtureState) {
  const admin = {
    id: 'admin',
    name: 'Initial Admin',
    employeeId: 'ADMIN-001',
    email: 'admin@example.test',
    passwordHash: await hashPassword(password),
    role: 'Admin',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: null,
  }
  const state = fixtureState.state()
  state.users.push(admin)
  fixtureState.save(state)
  return { admin, auth: await fixtureState.as(admin) }
}

test('Admin can create Admin accounts, employees cannot, and new Admins must change password', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { auth } = await withAdmin(f)
  const employee = {
    id: 'employee',
    name: 'Employee',
    employeeId: 'EMP-001',
    email: 'employee@example.test',
    passwordHash: await hashPassword(password),
    role: 'Employee',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: null,
  }
  const state = f.state()
  state.users.push(employee)
  f.save(state)
  const employeeAuth = await f.as(employee)

  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'admin.create',
          name: 'Second Admin',
          employeeId: 'ADMIN-002',
          email: 'new-admin@example.test',
          password,
          jobFunctions: ['Operations'],
        },
        auth,
      )
    ).status,
    200,
  )
  const created = f.state().users.find((user) => user.email === 'new-admin@example.test')
  assert.equal(created.role, 'Admin')
  assert.equal(created.active, true)
  assert.equal(created.mustChangePassword, true)
  assert.deepEqual(created.jobFunctions, ['Operations'])
  assert.equal(await verifyPassword(password, created.passwordHash), true)
  assert.equal(f.passwords.calls.hash, 1)
  assert.equal(JSON.stringify(f.state().audit).includes(password), false)
  assert.equal(f.state().audit.at(-1).action, 'admin.create')

  const defaultFunctions = await f.request(
    'actions',
    {
      type: 'admin.create',
      name: 'Default Functions',
      employeeId: 'ADMIN-003',
      email: 'default-admin@example.test',
      password,
    },
    auth,
  )
  assert.equal(defaultFunctions.status, 200)
  assert.deepEqual(f.state().users.find((user) => user.email === 'default-admin@example.test').jobFunctions, [])
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'admin.create',
          name: 'Employee Intruder',
          employeeId: 'ADMIN-004',
          email: 'intruder@example.test',
          password,
        },
        employeeAuth,
      )
    ).status,
    403,
  )
  const adminSnapshot = await (await f.request('snapshot', undefined, auth)).json()
  assert.ok(adminSnapshot.admins.some((user) => user.email === 'new-admin@example.test'))
  const employeeSnapshot = await (await f.request('snapshot', undefined, employeeAuth)).json()
  assert.equal('admins' in employeeSnapshot, false)
  assert.equal(
    employeeSnapshot.employees.some((user) => user.role === 'Admin'),
    false,
  )
})

test('Admin creation rejects duplicate identity fields and lists Admins only to Admins', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { admin, auth } = await withAdmin(f)
  const employee = {
    id: 'employee',
    name: 'Employee',
    employeeId: 'EMP-001',
    email: 'employee@example.test',
    passwordHash: await hashPassword(password),
    role: 'Employee',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: null,
  }
  const state = f.state()
  state.users.push(employee)
  f.save(state)
  const employeeAuth = await f.as(employee)
  const create = (body) => f.request('actions', { type: 'admin.create', name: 'Duplicate', password, ...body }, auth)

  assert.equal((await create({ employeeId: admin.employeeId, email: 'unique@example.test' })).status, 409)
  assert.equal((await create({ employeeId: 'ADMIN-004', email: admin.email })).status, 409)
  const adminSnapshot = await (await f.request('snapshot', undefined, auth)).json()
  assert.ok(adminSnapshot.admins.some((user) => user.id === admin.id))
  assert.equal('admins' in (await (await f.request('snapshot', undefined, employeeAuth)).json()), false)
})

test('Admin deactivation keeps the final active Admin protected and new Admin can log in', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { auth } = await withAdmin(f)
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'admin.create',
          name: 'Second Admin',
          employeeId: 'ADMIN-002',
          email: 'second-admin@example.test',
          password,
        },
        auth,
      )
    ).status,
    200,
  )
  const created = f.state().users.find((user) => user.email === 'second-admin@example.test')
  const login = await f.request('login', { email: created.email, password })
  assert.equal(login.status, 200)
  const loginData = await login.json()
  assert.equal(loginData.user.role, 'Admin')
  assert.equal(loginData.user.mustChangePassword, true)
  const createdAuth = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': loginData.csrfToken }
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'client.create', name: 'Blocked Until Password Change', service: 'Test' },
        createdAuth,
      )
    ).status,
    403,
  )
  const passwordResponse = await f.request(
    'password',
    { currentPassword: password, newPassword: replacement },
    createdAuth,
  )
  assert.equal(passwordResponse.status, 200)
  assert.ok(f.passwords.calls.verify >= 2)
  assert.ok(f.passwords.calls.hash >= 2)
  const passwordData = await passwordResponse.json()
  createdAuth.Cookie = passwordResponse.headers.get('set-cookie').split(';')[0]
  createdAuth['X-CSRF-Token'] = passwordData.csrfToken
  assert.equal((await f.request('actions', { type: 'employee.deactivate', id: 'admin' }, createdAuth)).status, 200)
  assert.equal((await f.request('actions', { type: 'employee.deactivate', id: created.id }, createdAuth)).status, 409)
})

test('designations, calendar, targets and note notifications follow role permissions', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { admin, auth } = await withAdmin(f)
  const employee = {
    id: 'employee',
    name: 'Employee',
    employeeId: 'EMP-001',
    email: 'employee@example.test',
    designation: 'Editor',
    passwordHash: await hashPassword(password),
    role: 'Employee',
    jobFunctions: ['video editing'],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: null,
  }
  const state = f.state()
  state.users.push(employee)
  state.clients.push({ id: 'client', name: 'Client', service: 'Content', serviceType: 'videos', active: true })
  f.save(state)
  const employeeAuth = await f.as(employee)

  assert.equal((await f.request('login', { email: employee.email, password })).status, 200)
  assert.equal((await f.request('login', { email: employee.email, password })).status, 200)
  assert.equal(f.state().loginRecords.length, 1)
  assert.equal(f.state().loginRecords[0].employeeId, employee.id)

  assert.equal(
    (await f.request('actions', { type: 'designation.update', id: employee.id, designation: 'Senior Editor' }, auth))
      .status,
    200,
  )
  assert.equal(f.state().users.find((u) => u.id === employee.id).designation, 'Senior Editor')
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'designation.update', id: admin.id, designation: 'Operations Admin' },
        employeeAuth,
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'event.create', title: 'Review', date: '2026-10-08', time: '10:30', description: 'Review work' },
        auth,
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'client.target.upsert',
          clientId: 'client',
          month: '2026-10',
          contentType: 'videos',
          requiredCount: 10,
          postedCount: 2,
        },
        auth,
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'client.target.upsert',
          clientId: 'client',
          month: '2026-10',
          contentType: 'invalid',
          requiredCount: 10,
          postedCount: 2,
        },
        auth,
      )
    ).status,
    400,
  )
  assert.equal(
    (await f.request('actions', { type: 'note.create', text: 'All-hands note', recipientIds: [] }, auth)).status,
    200,
  )
  const employeeSnapshot = await (await f.request('snapshot', undefined, employeeAuth)).json()
  assert.equal(employeeSnapshot.calendarEvents.length, 1)
  assert.equal(employeeSnapshot.targets[0].contentType, 'videos')
  assert.equal(
    employeeSnapshot.notifications.some((n) => n.title === 'New note'),
    true,
  )
  const noteId = f.state().notes[0].id
  assert.equal((await f.request('actions', { type: 'note.delete', id: noteId }, employeeAuth)).status, 403)
  assert.equal((await f.request('actions', { type: 'note.delete', id: noteId }, auth)).status, 200)
})

test('Admin-created Employee can rotate temporary password and keep a valid session', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { auth } = await withAdmin(f)
  const temporary = 'Temporary-employee-123!'
  const replacement = 'Replacement-employee-456!'
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'employee.create',
          name: 'Created Employee',
          employeeId: 'EMP-NEW',
          email: 'created@example.test',
          password: temporary,
          jobFunctions: ['video editing'],
        },
        auth,
      )
    ).status,
    200,
  )
  const created = f.state().users.find((u) => u.email === 'created@example.test')
  const login = await f.request('login', { email: created.email, password: temporary })
  assert.equal(login.status, 200)
  const loginData = await login.json()
  const createdAuth = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': loginData.csrfToken }
  const changed = await f.request('password', { currentPassword: temporary, newPassword: replacement }, createdAuth)
  assert.equal(changed.status, 200)
  const changedData = await changed.json()
  const freshAuth = { Cookie: changed.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': changedData.csrfToken }
  const snapshot = await f.request('snapshot', undefined, freshAuth)
  assert.equal(snapshot.status, 200)
  assert.equal((await snapshot.json()).user.mustChangePassword, false)
})

test('missing password namespace blocks account creation, reset and rotation without changing state or sessions', async () => {
  const f = fixture()
  const { admin, auth } = await withAdmin(f)
  const employee = {
    id: 'employee',
    role: 'Employee',
    name: 'Employee',
    employeeId: 'EMP',
    email: 'employee@example.test',
    passwordHash: await hashPassword(password),
    active: true,
    credentialVersion: 0,
  }
  f.state().users.push(employee)
  const employeeAuth = await f.as(employee)
  const before = structuredClone(f.state())
  const sessionCount = f.sessions.size
  delete f.env.PORTAL_PASSWORDS
  for (const [path, body, credentials] of [
    [
      'actions',
      { type: 'admin.create', name: 'New Admin', employeeId: 'A2', email: 'new@example.test', password },
      auth,
    ],
    [
      'actions',
      {
        type: 'employee.create',
        name: 'New Employee',
        employeeId: 'E2',
        email: 'new-emp@example.test',
        password,
        jobFunctions: [],
      },
      auth,
    ],
    ['actions', { type: 'employee.resetPassword', id: employee.id, password: replacement }, auth],
    ['password', { currentPassword: password, newPassword: replacement }, employeeAuth],
  ]) {
    const response = await f.request(path, body, credentials)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.deepEqual(f.state(), before)
    assert.equal(f.sessions.size, sessionCount)
  }
  assert.equal(admin.credentialVersion, 0)
  assert.equal(f.passwords.calls.hash, 0)
  assert.equal(f.passwords.calls.verify, 0)
})

test('Admins can assign Admin tasks and approvals require a rating', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { admin, auth } = await withAdmin(f)
  const state = f.state()
  state.clients.push({ id: 'client', name: 'Client', service: 'Content', serviceType: 'both', active: true })
  f.save(state)
  const created = await f.request(
    'actions',
    {
      type: 'task.create',
      title: 'Admin task',
      assigneeId: admin.id,
      clientId: 'client',
      jobFunction: '',
      deadline: '2026-10-08T12:00:00.000Z',
    },
    auth,
  )
  assert.equal(created.status, 200)
  const anyWork = await f.request(
    'actions',
    {
      type: 'task.create',
      title: 'Admin website task',
      assigneeId: admin.id,
      clientId: 'client',
      jobFunction: 'website maintenance',
      deadline: '2026-10-08T12:00:00.000Z',
    },
    auth,
  )
  assert.equal(anyWork.status, 200)
  const task = f.state().tasks.at(-1)
  const toProgress = await f.request(
    'actions',
    { type: 'task.transition', id: task.id, state: 'In-progress', version: task.version },
    auth,
  )
  assert.equal(toProgress.status, 200, await toProgress.text())
  const toCompleted = await f.request(
    'actions',
    { type: 'task.transition', id: task.id, state: 'Completed', version: task.version + 1 },
    auth,
  )
  assert.equal(toCompleted.status, 200)
  const completed = f.state().tasks.at(-1)
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'task.transition', id: task.id, state: 'Approved', version: completed.version },
        auth,
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'task.transition',
          id: task.id,
          state: 'Approved',
          version: completed.version,
          rating: 5,
          ratingNote: 'Clear delivery',
        },
        auth,
      )
    ).status,
    200,
  )
  const approved = f.state().tasks.at(-1)
  assert.equal(approved.rating, 5)
  assert.equal(approved.ratingNote, 'Clear delivery')
  assert.equal(approved.ratedBy, admin.id)
})

test('Employee completion notifies every active Admin, without exposing description', async (t) => {
  const f = fixture()
  t.after(() => f.close())
  const { admin, auth } = await withAdmin(f)
  const employee = {
    id: 'employee',
    name: 'Employee',
    employeeId: 'EMP-001',
    email: 'employee@example.test',
    passwordHash: await hashPassword(password),
    role: 'Employee',
    jobFunctions: ['video editing'],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: null,
  }
  const activeAdmin = {
    id: 'admin-2',
    name: 'Second Admin',
    employeeId: 'ADMIN-002',
    email: 'admin2@example.test',
    passwordHash: await hashPassword(password),
    role: 'Admin',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: null,
  }
  const inactiveAdmin = {
    id: 'admin-3',
    name: 'Inactive Admin',
    employeeId: 'ADMIN-003',
    email: 'admin3@example.test',
    passwordHash: await hashPassword(password),
    role: 'Admin',
    jobFunctions: [],
    profile: {},
    active: false,
    mustChangePassword: false,
    credentialVersion: 0,
    createdAt: new Date().toISOString(),
    deactivatedAt: new Date().toISOString(),
  }
  const state = f.state()
  state.users.push(employee, activeAdmin, inactiveAdmin)
  state.clients.push({ id: 'client', name: 'Client', service: 'Content', serviceType: 'videos', active: true })
  f.save(state)
  const employeeAuth = await f.as(employee)
  assert.equal(
    (
      await f.request(
        'actions',
        {
          type: 'task.create',
          title: 'Safe task title',
          description: 'Private description must not be sent',
          assigneeId: employee.id,
          clientId: 'client',
          jobFunction: 'video editing',
          deadline: '2026-10-08T12:00:00.000Z',
        },
        auth,
      )
    ).status,
    200,
  )
  const task = f.state().tasks.at(-1)
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'task.transition', id: task.id, state: 'In-progress', version: task.version },
        employeeAuth,
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await f.request(
        'actions',
        { type: 'task.transition', id: task.id, state: 'Completed', version: task.version + 1 },
        employeeAuth,
      )
    ).status,
    200,
  )
  const completionNotifications = f.state().notifications.filter((n) => n.taskId === task.id)
  assert.equal(completionNotifications.length, 2)
  assert.deepEqual(completionNotifications.map((n) => n.employeeId).sort(), [admin.id, activeAdmin.id].sort())
  assert.ok(
    completionNotifications.every(
      (n) => n.title.includes('Safe task title') && n.text.includes('waiting for approval'),
    ),
  )
  assert.ok(completionNotifications.every((n) => !n.text.includes('Private description')))
  assert.equal(
    f.state().notifications.some((n) => n.employeeId === employee.id && n.taskId === task.id),
    false,
  )
})
