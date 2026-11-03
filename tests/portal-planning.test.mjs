import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deadlineDate,
  groupTasksByMonth,
  filterCalendarTasks,
  calendarItems,
  planningSummary,
  planningSignature,
  shiftMonth,
} from '../portal/planning.mjs'
import { sortTasks } from '../portal/task-presentation.mjs'
import { renderCalendar, renderAssignmentGroups } from '../portal/planning-view.mjs'

test('deadlines use the IST business date across midnight, month and year boundaries', () => {
  assert.equal(deadlineDate('2026-10-31T18:29:59Z'), '2026-10-31')
  assert.equal(deadlineDate('2026-10-31T18:30:00Z'), '2026-11-01')
  assert.equal(deadlineDate('2026-12-31T20:00:00Z'), '2027-01-01')
  assert.equal(deadlineDate('2028-02-28T18:30:00Z'), '2028-02-29')
  assert.equal(deadlineDate('invalid'), '')
  assert.equal(deadlineDate(null), '')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2027-01', -1), '2026-12')
})

test('assignments group by IST deadline month with the current month first and requested work order', () => {
  const tasks = [
    { id: 'completed', state: 'Completed', deadline: '2026-11-02T12:00:00Z', overdue: true },
    { id: 'assigned', state: 'Assigned', deadline: '2026-11-05T12:00:00Z' },
    { id: 'overdue', state: 'Assigned', deadline: '2026-11-01T12:00:00Z', overdue: true },
    { id: 'progress', state: 'In-progress', deadline: '2026-10-31T18:30:00Z' },
    { id: 'approved', state: 'Approved', deadline: '2026-11-02T12:00:00Z' },
    { id: 'past', state: 'Assigned', deadline: '2026-10-02T12:00:00Z' },
    { id: 'future', state: 'Assigned', deadline: '2026-12-02T12:00:00Z' },
    { id: 'missing', state: 'Assigned' },
  ]
  const groups = groupTasksByMonth(tasks, '2026-11-02', sortTasks)
  assert.deepEqual(
    groups.map((group) => group.month),
    ['2026-11', '2026-12', '2026-10', ''],
  )
  assert.equal(groups[0].label, 'November 2026')
  assert.deepEqual(
    groups[0].tasks.map((task) => task.id),
    ['overdue', 'progress', 'assigned', 'completed', 'approved'],
  )
  assert.equal(tasks[0].id, 'completed')
})

test('calendar filters include own tasks in the team view without expanding employee permissions', () => {
  const user = { id: 'me', role: 'Employee' }
  const tasks = [
    { id: 'mine', assigneeId: 'me', clientId: 'a', state: 'Assigned', overdue: true },
    { id: 'peer', assigneeId: 'peer', clientId: 'b', state: 'In-progress' },
    { id: 'done', assigneeId: 'me', clientId: 'a', state: 'Completed', overdue: true },
  ]
  assert.deepEqual(
    filterCalendarTasks(tasks, user).map((task) => task.id),
    ['mine', 'done'],
  )
  assert.deepEqual(filterCalendarTasks(tasks, user, { scope: 'all' }), tasks)
  assert.deepEqual(
    filterCalendarTasks(tasks, user, { status: 'overdue' }).map((task) => task.id),
    ['mine'],
  )
  assert.deepEqual(
    filterCalendarTasks(tasks, user, { status: 'active' }).map((task) => task.id),
    ['mine'],
  )
  assert.deepEqual(
    filterCalendarTasks(tasks, user, { scope: 'all', clientId: 'b' }).map((task) => task.id),
    ['peer'],
  )
  assert.deepEqual(filterCalendarTasks(tasks, user, { scope: 'all', assigneeId: 'peer' }), tasks)
  assert.deepEqual(
    filterCalendarTasks(tasks, { ...user, role: 'Admin' }, { assigneeId: 'peer' }).map((task) => task.id),
    ['peer'],
  )
})

test('calendar agenda combines deadlines and events in IST time order without mutating or duplicating data', () => {
  const task = { id: 'task', title: 'Edit reel', deadline: '2026-11-01T18:45:00Z' }
  const events = [
    { id: 'review', title: 'Review', date: '2026-11-02', time: '09:00' },
    { id: 'holiday', title: 'Holiday', date: '2026-11-02' },
  ]
  const items = calendarItems([task, { id: 'invalid', deadline: 'invalid' }], events)
  assert.deepEqual(
    items.map(({ id, time }) => [id, time]),
    [
      ['holiday', ''],
      ['task', '00:15'],
      ['review', '09:00'],
    ],
  )
  assert.equal(items[1].date, '2026-11-02')
  assert.equal(events[0].type, undefined)
  assert.equal(calendarItems([{ ...task, deadline: '2026-12-01T12:00:00Z' }], events)[2].date, '2026-12-01')
})

test('planning summaries keep overdue active work visible outside the displayed month and exclude finished work', () => {
  const tasks = [
    { id: 'old', state: 'In-progress', deadline: '2026-10-01T12:00:00Z', overdue: true },
    { id: 'today', state: 'Assigned', deadline: '2026-11-02T12:00:00Z' },
    { id: 'next', state: 'Assigned', deadline: '2026-11-08T20:00:00Z' },
    { id: 'later', state: 'Assigned', deadline: '2026-11-09T20:00:00Z' },
    { id: 'finished', state: 'Completed', deadline: '2026-11-02T12:00:00Z', overdue: true },
  ]
  const summary = planningSummary(tasks, '2026-11-02')
  assert.deepEqual(
    summary.overdue.map((task) => task.id),
    ['old'],
  )
  assert.deepEqual(
    summary.today.map((task) => task.id),
    ['today'],
  )
  assert.deepEqual(
    summary.next.map((task) => task.id),
    ['next'],
  )
})

test('planning refresh detects deadline, state, event and day changes but ignores running work timers', () => {
  const snapshot = { today: '2026-11-02', tasks: [{ id: 'task', deadline: '2026-11-02T12:00:00Z', workSeconds: 1 }] }
  assert.equal(
    planningSignature(snapshot),
    planningSignature({ ...snapshot, tasks: [{ ...snapshot.tasks[0], workSeconds: 2 }] }),
  )
  assert.notEqual(
    planningSignature(snapshot),
    planningSignature({ ...snapshot, tasks: [{ ...snapshot.tasks[0], deadline: '2026-12-02T12:00:00Z' }] }),
  )
  assert.notEqual(planningSignature(snapshot), planningSignature({ ...snapshot, today: '2026-11-03' }))
  assert.notEqual(planningSignature(snapshot), planningSignature({ ...snapshot, calendarEvents: [{ id: 'event' }] }))
})

const renderingSnapshot = {
  today: '2026-11-02',
  tasks: [
    { id: 'own', title: '<script>own</script>', assigneeId: 'me', state: 'Assigned', deadline: '2026-11-01T18:45:00Z' },
    { id: 'peer', title: 'Team deadline', assigneeId: 'peer', state: 'Completed', deadline: '2026-11-02T12:00:00Z' },
  ],
  employees: [
    { id: 'me', name: 'Me' },
    { id: 'peer', name: 'Colleague' },
  ],
  calendarEvents: [{ id: 'event', title: '<b>Shared event</b>', description: '<img src=x>', date: '2026-11-02' }],
}
const calendarHtml = (overrides = {}) =>
  renderCalendar({
    snapshot: renderingSnapshot,
    user: { id: 'me', role: 'Employee' },
    month: '2026-11',
    selectedDate: '2026-11-02',
    ...overrides,
  })

test('calendar renders escaped deadlines on the IST date and counts alongside read-only shared events', () => {
  const html = calendarHtml()
  assert.match(html, /aria-label="Mon, 2 Nov, 1 task, 1 event"/)
  assert.match(html, /aria-current="date"/)
  assert.match(html, /data-action="calendar-task" data-id="own"/)
  assert.match(html, /&lt;script&gt;own&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x&gt;/)
  assert.doesNotMatch(html, /data-action="calendar-task" data-id="peer"|data-action="event-edit"|<script>|<img/)
  assert.doesNotMatch(html, /data-calendar-filter="assigneeId"/)
  const team = calendarHtml({ filters: { scope: 'all' } })
  assert.match(team, /aria-label="Mon, 2 Nov, 2 tasks, 1 event"/)
  assert.match(team, /Completed/)
  assert.match(team, /Colleagues’ tasks are read-only/)
})

test('admin calendar includes event actions and assignee filters, and summary shows active deadlines only', () => {
  const html = calendarHtml({ user: { id: 'me', role: 'Admin' } })
  assert.match(html, /data-calendar-filter="assigneeId"/)
  assert.match(html, /data-action="event-edit" data-id="event"/)
  assert.match(html, /data-action="event-delete" data-id="event"/)
  const summary = calendarHtml({ filters: { scope: 'all' }, summaryView: 'today' })
  assert.match(summary, /data-action="calendar-task" data-id="own"/)
  assert.doesNotMatch(summary, /data-action="calendar-task" data-id="peer"/)
})

test('assignment renderer uses separate month sections and does not lose completed or undated work', () => {
  const snapshot = {
    ...renderingSnapshot,
    tasks: [
      ...renderingSnapshot.tasks,
      { id: 'past', state: 'Assigned', deadline: '2026-10-01T12:00:00Z' },
      { id: 'undated', state: 'Assigned' },
    ],
  }
  const card = (task) => `<article data-test-task="${task.id}"></article>`
  const button = () => '<button>Adjust deadline</button>'
  const html = renderAssignmentGroups(snapshot, 'all', card, button)
  assert.match(html, /data-assignment-month="2026-11"/)
  assert.match(html, /data-assignment-month="2026-10"/)
  assert.match(html, /No deadline/)
  assert.ok(html.indexOf('data-test-task="own"') < html.indexOf('data-test-task="peer"'))
  const past = renderAssignmentGroups(snapshot, '2026-10', card, button)
  assert.match(past, /data-test-task="past"/)
  assert.doesNotMatch(past, /data-test-task="own"/)
  assert.match(renderAssignmentGroups(snapshot, '2027-01', card, button), /No tasks assigned for this month/)
})

test('every admin assignment keeps delete and deadline controls through month filtering', () => {
  const tasks = [
    { id: 'overdue', state: 'Assigned', overdue: true },
    { id: 'progress', state: 'In-progress' },
    { id: 'assigned', state: 'Assigned' },
    { id: 'completed', state: 'Completed' },
    { id: 'approved', state: 'Approved' },
  ].map((task) => ({ ...task, deadline: '2026-11-02T12:00:00Z' }))
  const snapshot = { ...renderingSnapshot, user: { role: 'Admin' }, tasks }
  const button = (label, action, id, cls) =>
    `<button class="${cls}" data-action="${action}" data-id="${id}">${label}</button>`
  for (const month of ['all', '2026-11']) {
    const html = renderAssignmentGroups(snapshot, month, () => '', button)
    for (const task of tasks) {
      assert.ok(html.includes(button('Adjust deadline', 'deadline', task.id, 'small')))
      assert.ok(html.includes(button('Delete task', 'task-delete', task.id, 'small danger')))
    }
  }
  const employee = renderAssignmentGroups({ ...snapshot, user: { role: 'Employee' } }, 'all', () => '', button)
  assert.doesNotMatch(employee, /task-delete|Delete task/)
})
