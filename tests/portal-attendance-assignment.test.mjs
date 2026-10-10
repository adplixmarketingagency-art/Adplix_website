import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalytics } from '../src/portal/analytics.mjs'
import { currentLoginRecord, loginSeconds } from '../src/portal/domain.mjs'

const employee = { id: 'e1', name: 'E', role: 'Employee', createdAt: '2025-01-01T00:00:00Z' }
const snapshot = (records) => ({ employees: [employee], loginRecords: records, tasks: [], updates: [], absences: [] })

test('analytics separates current login from historical first login and resets after 19:00 cutoff', () => {
  const now = new Date('2025-06-10T10:00:00+05:30')
  const records = [
    { employeeId: 'e1', date: '2025-06-09', firstLoginAt: '2025-06-09T04:00:00Z' },
    { employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' },
  ]
  const result = buildAnalytics(snapshot(records), {}, now).employees[0]
  assert.equal(result.firstLoginAt, records[0].firstLoginAt)
  assert.equal(result.todayFirstLoginAt, records[1].firstLoginAt)
  assert.equal(result.todayLoginSeconds, 3600)
  assert.equal(currentLoginRecord(records, 'e1', new Date('2025-06-10T13:29:59Z')), records[1])
  assert.equal(currentLoginRecord(records, 'e1', new Date('2025-06-10T13:30:00Z')), null)
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayFirstLoginAt,
    records[1].firstLoginAt,
  )
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayLoginSeconds,
    30660,
  )
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T13:30:00Z')).employees[0].todayFirstLoginAt,
    null,
  )
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T13:30:00Z')).employees[0].todayLoginSeconds,
    0,
  )
})

test('login duration is capped at 19:00 and malformed records are safe', () => {
  const record = { employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' }
  assert.equal(loginSeconds(record, new Date('2025-06-10T14:00:00Z')), 36000)
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
  assert.equal(row.loginSeconds, 32400 + 5400)
  assert.equal(result.summary.loginSeconds, row.loginSeconds + 3600)
  const beforeClose = buildAnalytics(data, { employeeId: 'a1' }, '2025-06-10T12:00:00Z').employees[0]
  assert.equal(beforeClose.todayFirstLoginAt, '2025-06-10T04:30:00Z')
  assert.equal(beforeClose.todayLoginSeconds, 27000)
  assert.equal(beforeClose.loginSeconds, 59400)
  const cutoff = buildAnalytics(data, { employeeId: 'a1' }, '2025-06-10T13:30:00Z').employees[0]
  assert.equal(cutoff.todayFirstLoginAt, null)
  assert.equal(cutoff.todayLoginSeconds, 0)
  assert.equal(cutoff.loginSeconds, 64800)
  const tomorrow = buildAnalytics(data, { employeeId: 'a1' }, '2025-06-11T05:00:00Z').employees[0]
  assert.equal(tomorrow.todayFirstLoginAt, null)
  assert.equal(tomorrow.loginDays, 2)
  assert.equal(tomorrow.updateMissing, 0)
})
