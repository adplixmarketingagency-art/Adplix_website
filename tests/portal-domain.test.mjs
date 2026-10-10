import test from 'node:test'
import assert from 'node:assert/strict'
import {
  businessDate,
  workingSeconds,
  dailyUpdateStatus,
  transitionTask,
  decorateTask,
  loginSeconds,
  loginRecordFor,
} from '../src/portal/domain.mjs'
import { buildAnalytics } from '../src/portal/analytics.mjs'

const at = (day, time) => `${day}T${time}+05:30`
const interval = (start, end) => [{ start, end }]

test('employee login records are first-login-per-day and stop at 17:30', () => {
  const records = []
  loginRecordFor(records, 'e', '2026-10-05', at('2026-10-05', '10:15:00'))
  loginRecordFor(records, 'e', '2026-10-05', at('2026-10-05', '11:00:00'))
  loginRecordFor(records, 'e', '2026-10-06', at('2026-10-06', '10:05:00'))
  assert.equal(records.length, 2)
  assert.equal(records[0].firstLoginAt, '2026-10-05T04:45:00.000Z')
  assert.equal(loginSeconds(records[0], at('2026-10-05', '18:00:00')), 26100)
  assert.equal(loginSeconds(records[1], at('2026-10-06', '12:05:00')), 7200)
})
test('working calendar boundaries, lunch, Sunday and multiple days', () => {
  assert.equal(businessDate('2026-10-04T20:00:00Z'), '2026-10-05')
  for (const [start, end, seconds] of [
    [at('2026-10-05', '10:00:00'), at('2026-10-05', '17:30:00'), 23400],
    [at('2026-10-05', '12:30:00'), at('2026-10-05', '14:30:00'), 3600],
    [at('2026-10-05', '14:00:00'), at('2026-10-06', '12:00:00'), 19800],
    [at('2026-10-03', '12:00:00'), at('2026-10-05', '15:00:00'), 30600],
    [at('2026-10-04', '10:00:00'), at('2026-10-04', '17:30:00'), 0],
  ])
    assert.equal(workingSeconds(interval(start, end), []), seconds)
})

test('approved absence union and retrospective recomputation', () => {
  const work = interval(at('2026-10-05', '10:00:00'), at('2026-10-05', '17:30:00'))
  const absences = [
    {
      employeeId: 'e',
      kind: 'permission',
      start: at('2026-10-05', '15:00:00'),
      end: at('2026-10-05', '16:00:00'),
      status: 'Approved',
    },
    {
      employeeId: 'e',
      kind: 'permission',
      start: at('2026-10-05', '15:30:00'),
      end: at('2026-10-05', '16:30:00'),
      status: 'Approved',
    },
    { employeeId: 'e', kind: 'leave', start: '2026-10-06', end: '2026-10-07', status: 'Approved' },
  ]
  assert.equal(workingSeconds(work, absences), 18000)
  assert.equal(
    workingSeconds(
      work,
      absences.map((a) => ({ ...a, status: 'Pending' })),
    ),
    23400,
  )
  assert.equal(workingSeconds([...work, ...work], absences), 18000)
  assert.equal(
    decorateTask(
      { assigneeId: 'other', intervals: work, state: 'In-progress', deadline: at('2026-10-05', '16:00:00') },
      absences,
      at('2026-10-05', '17:30:00'),
    ).workSeconds,
    23400,
  )
  assert.equal(workingSeconds(interval(at('2026-10-05', '10:00:00'), at('2026-10-07', '17:30:00')), absences), 18000)
})

test('transitions enforce ownership, role, reason and preserve audit intervals', () => {
  const owner = { id: 'e', role: 'Employee' },
    admin = { id: 'a', role: 'Admin' }
  let task = { id: 't', assigneeId: 'e', state: 'Assigned', version: 0, intervals: [], events: [] }
  assert.throws(() => transitionTask(task, { id: 'x', role: 'Employee' }, 'In-progress'), { status: 403 })
  assert.throws(() => transitionTask(task, admin, 'In-progress'), { status: 403 })
  task = transitionTask(task, owner, 'In-progress', at('2026-10-05', '10:00:00'))
  assert.throws(() => transitionTask(task, owner, 'In-progress'), { status: 403 })
  task = transitionTask(task, owner, 'Completed', at('2026-10-05', '12:00:00'))
  assert.throws(() => transitionTask(task, admin, 'In-progress', at('2026-10-05', '14:00:00')), { status: 400 })
  task = transitionTask(task, owner, 'In-progress', at('2026-10-05', '15:00:00'))
  task = transitionTask(task, owner, 'Completed', at('2026-10-05', '16:00:00'))
  assert.equal(workingSeconds(task.intervals, []), 10800)
  task = transitionTask(task, admin, 'In-progress', at('2026-10-05', '16:30:00'), 'Please revise')
  assert.equal(task.events.at(-1).kind, 'rejection')
  assert.equal(task.events.at(-1).reason, 'Please revise')
  task = transitionTask(task, owner, 'Completed', at('2026-10-05', '17:00:00'))
  task = transitionTask(task, admin, 'Approved', at('2026-10-05', '17:10:00'), '', 5, 'Clear delivery')
  assert.equal(task.version, 7)
  assert.equal(task.events.length, 7)
  assert.equal(workingSeconds(task.intervals, []), 12600)
  assert.throws(() => transitionTask(task, owner, 'In-progress'), { status: 403 })
})

test('daily update deadline, Sunday, leave and permission', () => {
  const now = at('2026-10-05', '11:00:00')
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-05', '10:59:59')).status, 'pending')
  assert.equal(dailyUpdateStatus('e', [], [], now).status, 'overdue')
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-04', '11:00:00')).status, 'exempt')
  const leave = [{ employeeId: 'e', kind: 'leave', start: '2026-10-05', end: '2026-10-07', status: 'Approved' }]
  assert.equal(dailyUpdateStatus('e', [], leave, now).status, 'exempt')
  const permission = [
    {
      employeeId: 'e',
      kind: 'permission',
      start: at('2026-10-05', '10:30:00'),
      end: at('2026-10-05', '12:00:00'),
      status: 'Approved',
    },
  ]
  assert.equal(
    dailyUpdateStatus('e', [], permission, now).deadline,
    new Date(at('2026-10-05', '12:00:00')).toISOString(),
  )
  const updates = [
    {
      employeeId: 'e',
      date: '2026-10-05',
      submittedAt: at('2026-10-05', '10:50:00'),
      editedAt: at('2026-10-05', '12:00:00'),
    },
  ]
  assert.equal(dailyUpdateStatus('e', updates, [], now).status, 'on-time')
  assert.equal(dailyUpdateStatus('e', [{ ...updates[0], submittedAt: now }], [], now).status, 'late')
})

test('optional employee lifecycle exempts days outside employment without changing four-argument behavior', () => {
  const employee = { createdAt: '2026-10-06T12:00:00Z', deactivatedAt: '2026-10-08T08:00:00Z' }
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-05', '12:00:00'), employee).status, 'exempt')
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-09', '12:00:00'), employee).status, 'exempt')
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-07', '12:00:00'), employee).status, 'overdue')
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-05', '12:00:00')).status, 'overdue')
})

test('reactivated employee has no missing updates during historical disabled periods', () => {
  const employee = {
    createdAt: '2026-10-01T04:30:00Z',
    deactivatedAt: null,
    inactivePeriods: [{ from: '2026-10-05', to: '2026-10-09' }],
  }
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-05', '12:00:00'), employee).status, 'overdue')
  for (const date of ['2026-10-06', '2026-10-07', '2026-10-08'])
    assert.equal(dailyUpdateStatus('e', [], [], at(date, '12:00:00'), employee).status, 'exempt')
  assert.equal(dailyUpdateStatus('e', [], [], at('2026-10-09', '12:00:00'), employee).status, 'overdue')
  const report = buildAnalytics(
    { employees: [{ id: 'e', role: 'Employee', ...employee }] },
    { from: '2026-10-05', to: '2026-10-09' },
    new Date(at('2026-10-10', '18:00:00')),
  )
  assert.equal(report.employees[0].updateMissing, 2)
  assert.equal(report.employees[0].updateExempt, 3)
})

test('invalid unbounded inputs fail rather than silently produce time', () => {
  assert.throws(() => workingSeconds(interval('nonsense', null), []), RangeError)
  assert.throws(
    () => workingSeconds(interval(at('2026-10-05', '12:00:00'), at('2026-10-05', '11:00:00')), []),
    RangeError,
  )
  assert.throws(
    () =>
      workingSeconds(interval(at('2026-03-01', '10:00:00'), at('2026-03-02', '11:00:00')), [
        { kind: 'leave', start: '2026-02-30', end: '2026-03-01', status: 'Approved' },
      ]),
    RangeError,
  )
})
