import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { handlePortalApi } from '../src/portal/api.mjs'
import { hashPassword } from '../src/portal/auth.mjs'
import { fakePortalPasswords } from './support/portal-passwords.mjs'

// Synthetic test accounts only; no production bootstrap or external service call.
const sqlite = await import('node:sqlite').catch(() => null)
const origin = 'https://portal.test'
const temporary = 'Synthetic-test-temporary-123!'
const replacement = 'Synthetic-test-replacement-456!'

function d1Adapter(sqliteDb) {
  return {
    prepare(sql) {
      let params = []
      return {
        bind(...values) {
          params = values
          return this
        },
        async first() {
          return sqliteDb.prepare(sql).get(...params) ?? null
        },
        async run() {
          return { meta: { changes: Number(sqliteDb.prepare(sql).run(...params).changes) } }
        },
      }
    },
  }
}

test(
  'SQLite-backed secure portal: accounts, roles, tasks, absences, reports and revocation',
  { skip: !sqlite && 'Node 22+ required for SQLite integration' },
  async (t) => {
    const sql = new sqlite.DatabaseSync(':memory:')
    sql.exec(await readFile(new URL('../migrations/0001_portal.sql', import.meta.url), 'utf8'))
    const state = JSON.parse(sql.prepare('SELECT document FROM portal_state WHERE id=1').get().document)
    state.users.push({
      id: 'admin',
      employeeId: 'ADMIN-TEST',
      name: 'Test Admin',
      email: 'admin@example.test',
      role: 'Admin',
      passwordHash: await hashPassword(temporary),
      jobFunctions: [],
      profile: {},
      active: true,
      mustChangePassword: true,
      credentialVersion: 0,
      createdAt: new Date().toISOString(),
    })
    sql.prepare('UPDATE portal_state SET document=? WHERE id=1').run(JSON.stringify(state))
    const passwords = fakePortalPasswords()
    const env = { PORTAL_DB: d1Adapter(sql), PORTAL_PASSWORDS: passwords }
    const account = { cookie: '', csrf: '' }
    const employee = { cookie: '', csrf: '' }
    const other = { cookie: '', csrf: '' }
    const saved = () => JSON.parse(sql.prepare('SELECT document FROM portal_state WHERE id=1').get().document)
    async function call(path, actor = {}, body, expected = 200) {
      const headers = {
        Origin: origin,
        'CF-Connecting-IP': actor === employee ? '192.0.2.2' : actor === other ? '192.0.2.3' : '192.0.2.1',
      }
      if (actor.cookie) headers.Cookie = actor.cookie
      if (actor.csrf) headers['X-CSRF-Token'] = actor.csrf
      if (body) headers['Content-Type'] = 'application/json'
      const response = await handlePortalApi(
        new Request(origin + '/api/portal/' + path, {
          method: body ? 'POST' : 'GET',
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        env,
        {},
      )
      assert.equal(response.status, expected, `${path}: ${response.status}`)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      const cookie = response.headers.get('set-cookie')?.split(';')[0]
      if (cookie && expected === 200) actor.cookie = cookie
      if (path.startsWith('export')) return response
      const data = await response.json()
      if (data.csrfToken) actor.csrf = data.csrfToken
      return data
    }
    const action = (actor, payload, expected) => call('actions', actor, payload, expected)
    let employeeId, otherId, clientId, taskId
    try {
      await t.test(
        'restricted login, no automatic activation, forced password change and session rotation',
        async () => {
          await call('signup', {}, { email: 'public@example.test', password: temporary }, 401)
          await call('login', account, { email: 'admin@example.test', password: temporary })
          const old = { ...account }
          await call('snapshot', account, undefined, 403)
          await action(account, { type: 'client.create', name: 'Denied', service: 'Design' }, 403)
          const before = saved()
          const beforeAdmin = before.users.find((u) => u.id === 'admin')
          const sessionCount = sql
            .prepare('SELECT COUNT(*) AS count FROM portal_sessions WHERE user_id=?')
            .get('admin').count
          const incorrect = await call(
            'password',
            account,
            {
              currentPassword: 'Synthetic-test-wrong-789!',
              newPassword: replacement,
            },
            400,
          )
          assert.deepEqual(incorrect, {
            error: 'Current password is incorrect. Enter the password you used to sign in.',
            code: 'CURRENT_PASSWORD_INCORRECT',
          })
          assert.ok(passwords.calls.verify >= 2)
          const afterIncorrect = saved()
          const afterIncorrectAdmin = afterIncorrect.users.find((u) => u.id === 'admin')
          assert.equal(afterIncorrectAdmin.passwordHash, beforeAdmin.passwordHash)
          assert.equal(afterIncorrectAdmin.credentialVersion, beforeAdmin.credentialVersion)
          assert.equal(afterIncorrectAdmin.mustChangePassword, true)
          assert.deepEqual(afterIncorrect.audit, before.audit)
          assert.equal(
            sql.prepare('SELECT COUNT(*) AS count FROM portal_sessions WHERE user_id=?').get('admin').count,
            sessionCount,
          )
          assert.equal((await call('session', old)).user.mustChangePassword, true)
          await call(
            'password',
            { cookie: account.cookie },
            { currentPassword: temporary, newPassword: replacement },
            403,
          )
          await call('password', {}, { currentPassword: temporary, newPassword: replacement }, 401)
          await call('password', account, { currentPassword: temporary, newPassword: 'Too-short' }, 400)
          const changed = await call('password', account, { currentPassword: temporary, newPassword: replacement })
          assert.ok(passwords.calls.hash >= 1)
          assert.equal(changed.user.mustChangePassword, false)
          assert.notEqual(account.cookie, old.cookie)
          assert.equal(saved().audit.filter((entry) => entry.action === 'password.change').length, 1)
          assert.equal(saved().users.find((u) => u.id === 'admin').credentialVersion, beforeAdmin.credentialVersion + 1)
          await call('session', old, undefined, 401)
          const restored = await call('session', account)
          assert.equal(restored.user.mustChangePassword, false)
          assert.equal(restored.csrfToken, account.csrf)
          assert.equal((await call('snapshot', account)).user.id, 'admin')
        },
      )
      await t.test('Admin provisions employees and employee cannot provision anyone', async () => {
        for (const [name, employeeId, email] of [
          ['Test Editor', 'TEST-001', 'editor@example.test'],
          ['Test Designer', 'TEST-002', 'designer@example.test'],
        ]) {
          await action(account, {
            type: 'employee.create',
            name,
            employeeId,
            email,
            password: temporary,
            jobFunctions: [],
          })
        }
        ;[employeeId, otherId] = saved()
          .users.filter((u) => u.role === 'Employee')
          .map((u) => u.id)
        for (const [actor, email] of [
          [employee, 'editor@example.test'],
          [other, 'designer@example.test'],
        ]) {
          await call('login', actor, { email, password: temporary })
          await call('password', actor, { currentPassword: temporary, newPassword: replacement })
        }
        await action(employee, { type: 'employee.create', name: 'Intruder' }, 403)
        await action(account, { type: 'client.create', name: 'Synthetic Client', service: 'Reels' })
        clientId = saved().clients[0].id
      })
      await t.test('CSRF, ownership, approval, rejection, reopening and optimistic conflicts', async () => {
        await action({ cookie: employee.cookie }, { type: 'profile.update', profile: {} }, 403)
        await action(account, {
          type: 'task.create',
          title: 'Edit synthetic reel',
          description: 'Private task brief',
          assigneeId: employeeId,
          clientId,
          jobFunction: 'video editing',
          deadline: new Date(Date.now() - 60000).toISOString(),
          priority: 'Normal',
        })
        taskId = saved().tasks[0].id
        const adminId = saved().users.find((user) => user.role === 'Admin').id
        await action(account, {
          type: 'task.create',
          title: 'Admin website task',
          assigneeId: adminId,
          clientId,
          jobFunction: 'website maintenance',
          deadline: new Date(Date.now() + 3600000).toISOString(),
          priority: 'Normal',
        })
        assert.equal(saved().tasks[1].jobFunction, 'website maintenance')
        await action(other, { type: 'task.transition', id: taskId, state: 'In-progress', version: 1 }, 403)
        await action(employee, { type: 'task.transition', id: taskId, state: 'Approved', version: 1 }, 403)
        await action(employee, { type: 'task.transition', id: taskId, state: 'In-progress', version: 1 })
        await action(employee, { type: 'task.transition', id: taskId, state: 'Completed', version: 1 }, 409)
        await action(employee, { type: 'task.transition', id: taskId, state: 'Completed', version: 2 })
        await action(account, { type: 'task.transition', id: taskId, state: 'In-progress', version: 3 }, 400)
        await action(account, {
          type: 'task.transition',
          id: taskId,
          state: 'In-progress',
          version: 3,
          reason: 'Improve pacing',
        })
        assert.equal(saved().tasks[0].intervals.length, 2)
        await action(employee, { type: 'task.transition', id: taskId, state: 'Completed', version: 4 })
        await action(employee, { type: 'task.transition', id: taskId, state: 'In-progress', version: 5 })
        await action(employee, { type: 'task.transition', id: taskId, state: 'Completed', version: 6 })
        await action(account, {
          type: 'task.transition',
          id: taskId,
          state: 'Approved',
          version: 7,
          rating: 5,
          ratingNote: 'Clear delivery',
        })
        await action(employee, { type: 'task.transition', id: taskId, state: 'In-progress', version: 8 }, 403)
        assert.equal(saved().tasks[0].events.filter((e) => e.kind === 'rejection').length, 1)
      })
      await t.test('concurrent state transitions cannot overwrite each other', async () => {
        await action(account, {
          type: 'task.create',
          title: 'Concurrent task',
          assigneeId: employeeId,
          clientId,
          jobFunction: 'video editing',
          deadline: new Date(Date.now() + 3600000).toISOString(),
        })
        const task = saved().tasks.at(-1)
        const request = () =>
          new Request(origin + '/api/portal/actions', {
            method: 'POST',
            headers: {
              Origin: origin,
              Cookie: employee.cookie,
              'X-CSRF-Token': employee.csrf,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'task.transition', id: task.id, state: 'In-progress', version: 1 }),
          })
        const responses = await Promise.all([handlePortalApi(request(), env, {}), handlePortalApi(request(), env, {})])
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
        assert.equal(saved().tasks.at(-1).intervals.length, 1)
      })
      await t.test('leave and permission decisions, daily updates and private notes', async () => {
        const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
        await action(employee, {
          type: 'absence.request',
          kind: 'leave',
          start: today,
          end: today,
          reason: 'Synthetic private leave reason',
        })
        const leaveId = saved().absences[0].id
        await action(employee, { type: 'absence.decide', id: leaveId, status: 'Approved' }, 403)
        await action(account, {
          type: 'absence.decide',
          id: leaveId,
          status: 'Approved',
          decisionNote: 'Approved test leave',
        })
        await action(employee, {
          type: 'absence.request',
          kind: 'permission',
          start: `${today}T15:00:00+05:30`,
          end: `${today}T16:00:00+05:30`,
          reason: 'Synthetic permission',
        })
        await action(account, { type: 'absence.decide', id: saved().absences.at(-1).id, status: 'Rejected' })
        await action(employee, { type: 'update.submit', text: 'Synthetic daily progress' })
        const original = saved().updates[0].submittedAt
        await action(employee, { type: 'update.submit', text: 'Edited synthetic progress' })
        assert.equal(saved().updates[0].submittedAt, original)
        await action(account, { type: 'note.create', text: 'Synthetic private note', recipientIds: [employeeId] })
        await action(account, {
          type: 'broadcast.create',
          title: 'Synthetic announcement',
          text: 'Test inbox delivery',
          recipientIds: [],
        })
        const mine = await call('snapshot', employee)
        const colleague = await call('snapshot', other)
        assert.equal(mine.updateStatus.status, 'exempt')
        assert.equal(colleague.absences.length, 0)
        assert.equal(colleague.updates.length, 0)
        assert.equal(colleague.notes.length, 0)
        assert.ok(colleague.notifications.some((n) => n.title === 'Synthetic announcement'))
        assert.equal(colleague.employees.find((e) => e.id === employeeId).email, undefined)
        assert.equal(colleague.tasks.find((t) => t.id === taskId).description, undefined)
        assert.equal(colleague.tasks.find((t) => t.id === taskId).events, undefined)
        assert.ok(!JSON.stringify(mine).includes('passwordHash'))
        assert.ok(saved().audit.every((a) => !('password' in a) && !('payload' in a)))
      })
      await t.test('Admin graphs and real Excel use the same task totals; Employee is denied', async () => {
        await call('analytics', employee, undefined, 403)
        await call('export', employee, undefined, 403)
        const analytics = await call('analytics', account)
        assert.equal(analytics.summary.approved, 1)
        const adminAttendance = analytics.employees.find((e) => e.id === 'admin')
        assert.equal(adminAttendance.role, 'Admin')
        assert.equal(adminAttendance.loginDays, 1)
        assert.equal(adminAttendance.updateMissing, 0)
        const selectedAdmin = await call('analytics?employeeId=admin', account)
        assert.deepEqual(
          selectedAdmin.employees.map((e) => e.id),
          ['admin'],
        )
        assert.equal(selectedAdmin.summary.loginDays, 1)
        const workbook = await call('export', account)
        const files = unzipSync(new Uint8Array(await workbook.arrayBuffer()))
        assert.equal(Object.keys(files).filter((p) => /worksheets\/sheet\d.xml$/.test(p)).length, 6)
        assert.ok(strFromU8(files['xl/worksheets/sheet1.xml']).includes('<v>1</v>'))
        await call('analytics?from=2020-01-01&to=2026-01-01', account, undefined, 400)
      })
      await t.test('historical analytics reads persisted task history by month, year and employee', async () => {
        const persisted = saved()
        persisted.tasks.push({
          id: 'historical-task',
          title: 'Historical synthetic task',
          assigneeId: employeeId,
          clientId,
          jobFunction: 'video editing',
          state: 'Approved',
          createdAt: '2024-02-01T04:30:00.000Z',
          updatedAt: '2024-02-03T05:30:00.000Z',
          completedAt: '2024-02-02T05:30:00.000Z',
          approvedAt: '2024-02-03T05:30:00.000Z',
          deadline: '2024-02-05T12:00:00.000Z',
          priority: 'Normal',
          version: 3,
          intervals: [{ start: '2024-02-01T04:30:00.000Z', end: '2024-02-01T05:30:00.000Z' }],
          events: [
            {
              actorId: employeeId,
              from: 'In-progress',
              to: 'Completed',
              at: '2024-02-02T05:30:00.000Z',
              kind: 'transition',
            },
            { actorId: 'admin', from: 'Completed', to: 'Approved', at: '2024-02-03T05:30:00.000Z', kind: 'approval' },
          ],
        })
        persisted.updates.push({
          employeeId,
          date: '2024-02-01',
          text: 'Historical synthetic update',
          submittedAt: '2024-02-01T04:45:00.000Z',
          editedAt: null,
        })
        persisted.loginRecords ||= []
        persisted.loginRecords.push({
          id: 'historical-login',
          employeeId,
          date: '2024-02-01',
          firstLoginAt: '2024-02-01T04:30:00.000Z',
        })
        sql.prepare('UPDATE portal_state SET document=? WHERE id=1').run(JSON.stringify(persisted))

        const month = await call(`analytics?month=2024-02&employeeId=${encodeURIComponent(employeeId)}`, account)
        assert.equal(month.summary.total, 1)
        assert.equal(month.summary.workSeconds, 3600)
        assert.equal(month.employees.length, 1)
        assert.equal(month.employees[0].id, employeeId)
        assert.deepEqual([month.filters.from, month.filters.to], ['2024-02-01', '2024-02-29'])
        assert.equal(month.tasks[0].id, 'historical-task')

        const year = await call(`analytics?year=2024&employeeId=${encodeURIComponent(employeeId)}`, account)
        assert.equal(year.summary.total, 1)
        assert.equal(year.summary.approved, 1)
        assert.deepEqual([year.filters.from, year.filters.to], ['2024-01-01', '2024-12-31'])
        const otherEmployee = await call(`analytics?month=2024-02&employeeId=${encodeURIComponent(otherId)}`, account)
        assert.equal(otherEmployee.summary.total, 0)
        assert.equal(otherEmployee.tasks.length, 0)
      })
      await t.test('unchanged email retains session; edits, reset and deactivation revoke it', async () => {
        const user = saved().users.find((u) => u.id === employeeId)
        const update = {
          type: 'employee.update',
          id: employeeId,
          name: user.name,
          employeeId: user.employeeId,
          email: user.email,
          jobFunctions: user.jobFunctions,
        }
        await action(account, update)
        await call('session', employee)
        await action(account, { ...update, email: 'editor-changed@example.test' })
        await call('session', employee, undefined, 401)
        await call('login', employee, { email: 'editor-changed@example.test', password: replacement })
        await action(account, { type: 'employee.resetPassword', id: employeeId, password: temporary })
        assert.ok(passwords.calls.hash >= 4)
        await call('session', employee, undefined, 401)
        await action(account, { type: 'employee.deactivate', id: otherId })
        await call('session', other, undefined, 401)
        await action(account, { type: 'employee.deactivate', id: 'admin' }, 409)
        assert.ok(saved().tasks.some((t) => t.assigneeId === employeeId))
      })
    } finally {
      sql.close()
    }
  },
)
