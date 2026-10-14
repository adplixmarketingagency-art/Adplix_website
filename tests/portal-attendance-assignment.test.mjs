import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalytics } from '../src/portal/analytics.mjs'
import { currentLoginRecord, loginSeconds } from '../src/portal/domain.mjs'

const employee = { id: 'e1', name: 'E', role: 'Employee', createdAt: '2025-01-01T00:00:00Z' }
const snapshot = (records) => ({ employees: [employee], loginRecords: records, tasks: [], updates: [], absences: [] })

test('analytics separates current login from historical first login and resets after cutoff', () => {
  const now = new Date('2025-06-10T10:00:00+05:30')
  const records = [
    { employeeId: 'e1', date: '2025-06-09', firstLoginAt: '2025-06-09T04:00:00Z' },
    { employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' },
  ]
  const result = buildAnalytics(snapshot(records), {}, now).employees[0]
  assert.equal(result.firstLoginAt, records[0].firstLoginAt)
  assert.equal(result.todayFirstLoginAt, records[1].firstLoginAt)
  assert.equal(result.todayLoginSeconds, 3600)
  // When completed or any other (no in-progress task), cutoff is 17:30 IST (12:00 UTC)
  assert.equal(currentLoginRecord(records, 'e1', new Date('2025-06-10T11:59:59Z')), records[1])
  assert.equal(currentLoginRecord(records, 'e1', new Date('2025-06-10T12:00:00Z')), records[1])
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayFirstLoginAt,
    records[1].firstLoginAt,
  )
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayLoginSeconds,
    30600,
  )
  // When in-progress, cutoff extends to 19:00 IST (13:30 UTC)
  const inProgressSnapshot = (r) => ({
    ...snapshot(r),
    tasks: [
      {
        id: 't1',
        assigneeId: 'e1',
        state: 'In-progress',
        createdAt: '2025-06-10T00:00:00Z',
        deadline: '2025-06-10T18:00:00Z',
        intervals: [],
      },
    ],
  })
  assert.equal(currentLoginRecord(records, 'e1', new Date('2025-06-10T13:29:59Z'), true), records[1])
  assert.equal(currentLoginRecord(records, 'e1', new Date('2025-06-10T13:30:00Z'), true), records[1])
  assert.equal(
    buildAnalytics(inProgressSnapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayFirstLoginAt,
    records[1].firstLoginAt,
  )
  assert.equal(
    buildAnalytics(inProgressSnapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayLoginSeconds,
    30660,
  )
  assert.equal(
    buildAnalytics(inProgressSnapshot(records), {}, new Date('2025-06-10T13:30:00Z')).employees[0].todayFirstLoginAt,
    records[1].firstLoginAt,
  )
  assert.equal(
    buildAnalytics(inProgressSnapshot(records), {}, new Date('2025-06-10T13:30:00Z')).employees[0].todayLoginSeconds,
    36000,
  )
})

test('login duration is capped at 17:30 by default and 19:00 when in progress and malformed records are safe', () => {
  const record = { employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' }
  assert.equal(loginSeconds(record, new Date('2025-06-10T14:00:00Z')), 30600)
  assert.equal(loginSeconds(record, new Date('2025-06-10T14:00:00Z'), true), 36000)
  assert.equal(currentLoginRecord([{ employeeId: 'e1', date: 'bad' }], 'e1', new Date('2025-06-10T10:00:00Z')), null)
})

test('Admin in-time follows employee cutoff, day rollover and selected-period totals', () => {
  const admin = { id: 'a1', name: 'Admin', role: 'Admin' }
  const data = {
    ...snapshot([]),
    employees: [admin, employee],
    loginRecords: [
      { employeeId: 'a1', date: '2025-06-09', firstLoginAt: '2025-06-09T04:30:00Z' },
      { employeeId: 'a1', date: '2025-06-10', firstLoginAt: '2025-06-10T04:30:00Z' },
      { employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T05:00:00Z' },
    ],
  }
  const result = buildAnalytics(data, {}, '2025-06-10T06:00:00Z')
  const row = result.employees.find((person) => person.id === 'a1')
  assert.equal(row.todayFirstLoginAt, '2025-06-10T04:30:00Z')
  assert.equal(row.todayLoginSeconds, 5400)
  assert.equal(row.loginSeconds, 27000 + 5400)
  assert.equal(result.summary.loginSeconds, row.loginSeconds + 3600)
  const beforeClose = buildAnalytics(data, { employeeId: 'a1' }, '2025-06-10T11:59:00Z').employees[0]
  assert.equal(beforeClose.todayFirstLoginAt, '2025-06-10T04:30:00Z')
  assert.equal(beforeClose.todayLoginSeconds, 26940)
  assert.equal(beforeClose.loginSeconds, 53940)
  const cutoff = buildAnalytics(data, { employeeId: 'a1' }, '2025-06-10T12:00:00Z').employees[0]
  assert.equal(cutoff.todayFirstLoginAt, '2025-06-10T04:30:00Z')
  assert.equal(cutoff.todayLoginSeconds, 27000)
  assert.equal(cutoff.loginSeconds, 54000)
  // Extending to 19:00 when an active task is in progress
  const inProgressData = {
    ...data,
    tasks: [
      {
        id: 't-admin',
        assigneeId: 'a1',
        state: 'In-progress',
        createdAt: '2025-06-10T00:00:00Z',
        deadline: '2025-06-10T18:00:00Z',
        intervals: [],
      },
    ],
  }
  const inProgressReport = buildAnalytics(inProgressData, { employeeId: 'a1' }, '2025-06-10T12:01:00Z').employees[0]
  assert.equal(inProgressReport.todayFirstLoginAt, '2025-06-10T04:30:00Z')
  assert.equal(inProgressReport.todayLoginSeconds, 27060)
  const inProgressCutoff = buildAnalytics(inProgressData, { employeeId: 'a1' }, '2025-06-10T13:30:00Z').employees[0]
  assert.equal(inProgressCutoff.todayFirstLoginAt, '2025-06-10T04:30:00Z')
  assert.equal(inProgressCutoff.todayLoginSeconds, 32400)
  assert.equal(inProgressCutoff.loginSeconds, 59400)
  const tomorrow = buildAnalytics(data, { employeeId: 'a1' }, '2025-06-11T05:00:00Z').employees[0]
  assert.equal(tomorrow.todayFirstLoginAt, null)
  assert.equal(tomorrow.loginDays, 2)
  assert.equal(tomorrow.updateMissing, 0)
})

test('Analytics team rows put the first login first and expose the active-session indicator', () => {
  const data = {
    ...snapshot([]),
    employees: [
      { id: 'none', name: 'No login', role: 'Employee' },
      { id: 'early', name: 'Early', role: 'Employee' },
      { id: 'late', name: 'Late', role: 'Admin' },
    ],
    loginRecords: [
      { employeeId: 'early', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' },
      { employeeId: 'late', date: '2025-06-10', firstLoginAt: '2025-06-10T04:30:00Z' },
    ],
    onlineUserIds: new Set(['late']),
  }
  const rows = buildAnalytics(data, {}, '2025-06-10T06:00:00Z').employees
  assert.deepEqual(
    rows.map((row) => row.id),
    ['early', 'late', 'none'],
  )
  assert.equal(rows.find((row) => row.id === 'late').online, true)
  assert.equal(rows.find((row) => row.id === 'early').online, false)
})

test('today work is all-task, clipped, unioned, absence-aware, and stable after 19:00', () => {
  const data = {
    ...snapshot([{ employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' }]),
    employees: [{ ...employee }, { id: 'a1', name: 'Admin', role: 'Admin' }],
    tasks: [
      {
        id: 'old',
        assigneeId: 'e1',
        state: 'Completed',
        createdAt: '2025-06-01T00:00:00Z',
        deadline: '2025-06-10T18:00:00Z',
        intervals: [{ start: '2025-06-09T12:30:00Z', end: '2025-06-10T05:00:00Z' }],
      },
      {
        id: 'one',
        assigneeId: 'e1',
        state: 'Completed',
        createdAt: '2025-06-10T00:00:00Z',
        deadline: '2025-06-10T18:00:00Z',
        intervals: [{ start: '2025-06-10T04:00:00Z', end: '2025-06-10T13:00:00Z' }],
      },
      {
        id: 'two',
        assigneeId: 'e1',
        state: 'Assigned',
        createdAt: '2025-06-10T00:00:00Z',
        deadline: '2025-06-10T18:00:00Z',
        intervals: [{ start: '2025-06-10T06:00:00Z', end: '2025-06-10T14:00:00Z' }],
      },
      {
        id: 'admin',
        assigneeId: 'a1',
        state: 'In-progress',
        createdAt: '2025-06-10T00:00:00Z',
        deadline: '2025-06-10T18:00:00Z',
        intervals: [{ start: '2025-06-10T04:00:00Z', end: '2025-06-10T13:30:00Z' }],
      },
    ],
    absences: [
      {
        employeeId: 'e1',
        status: 'Approved',
        kind: 'permission',
        start: '2025-06-10T07:00:00Z',
        end: '2025-06-10T08:00:00Z',
      },
    ],
  }
  const atClose = buildAnalytics(data, {}, '2025-06-10T14:00:00Z')
  const row = atClose.employees.find((e) => e.id === 'e1')
  assert.equal(atClose.todayBusinessDate, '2025-06-10')
  assert.equal(row.todayLoginCapHour, 17.5)
  assert.equal(row.todayWorkSeconds, 6 * 3600)
  assert.equal(
    buildAnalytics(data, { state: 'Completed' }, '2025-06-10T14:00:00Z').employees[0].todayWorkSeconds,
    6 * 3600,
  )
  assert.equal(
    buildAnalytics(data, {}, '2025-06-10T15:00:00Z').employees.find((e) => e.id === 'e1').todayWorkSeconds,
    row.todayWorkSeconds,
  )
  const next = buildAnalytics(data, {}, '2025-06-11T05:00:00Z')
  assert.equal(next.todayBusinessDate, '2025-06-11')
  assert.equal(next.employees.find((e) => e.id === 'e1').todayWorkSeconds, 0)
  assert.equal(next.employees.find((e) => e.id === 'e1').todayFirstLoginAt, null)
  assert.equal(atClose.employees.find((e) => e.id === 'a1').todayLoginCapHour, 19)
})
