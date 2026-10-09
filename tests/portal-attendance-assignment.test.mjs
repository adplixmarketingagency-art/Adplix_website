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
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayFirstLoginAt,
    null,
  )
  assert.equal(
    buildAnalytics(snapshot(records), {}, new Date('2025-06-10T12:01:00Z')).employees[0].todayLoginSeconds,
    0,
  )
})

test('login duration is capped at 17:30 and malformed records are safe', () => {
  const record = { employeeId: 'e1', date: '2025-06-10', firstLoginAt: '2025-06-10T03:30:00Z' }
  assert.equal(loginSeconds(record, new Date('2025-06-10T14:00:00Z')), 30600)
  assert.equal(currentLoginRecord([{ employeeId: 'e1', date: 'bad' }], 'e1', new Date('2025-06-10T10:00:00Z')), null)
})
