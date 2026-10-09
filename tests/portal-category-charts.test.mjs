import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalytics } from '../src/portal/analytics.mjs'
import { taskCategory } from '../src/portal/task-categories.mjs'
import { employeeChart, trendChart } from '../portal/analytics-charts.mjs'

const now = '2026-10-07T12:00:00Z'
const task = (id, jobFunction, state, date = '2026-10-05', events = []) => ({
  id,
  title: id,
  jobFunction,
  state,
  assigneeId: 'e',
  clientId: 'c',
  createdAt: `${date}T04:30:00Z`,
  deadline: '2026-10-08T12:00:00Z',
  intervals: [],
  events,
})
const event = (to, date) => ({ to, at: `${date}T10:00:00Z` })
const snapshot = (tasks) => ({
  tasks,
  employees: [{ id: 'e', name: 'Alice', role: 'Employee' }],
  absences: [],
  updates: [],
})

test('category aliases and unknowns map to stable keys', () => {
  for (const text of ['Video Editing', 'video-edit', 'edit']) assert.equal(taskCategory(text).key, 'video-editing')
  for (const text of ['Canva design', 'Canva Poster', 'poster'])
    assert.deepEqual([taskCategory(text).key, taskCategory(text).label], ['canva-poster', 'Canva Poster'])
  for (const text of ['', '<img src=x>', 'admin custom']) assert.equal(taskCategory(text).key, 'other')
})

test('current states have one slot each; category and event totals remain aligned', () => {
  const tasks = [
    task('a', 'video editing', 'Assigned'),
    task('b', 'Canva design', 'In-progress'),
    task('c', 'video editing', 'Completed', '2026-10-05', [event('Completed', '2026-10-06')]),
    task('d', 'Canva Poster', 'Approved', '2026-10-05', [
      event('Completed', '2026-10-06'),
      event('Approved', '2026-10-07'),
    ]),
  ]
  const report = buildAnalytics(snapshot(tasks), {}, now)
  assert.equal(report.summary.total, 4)
  assert.deepEqual(
    report.summary.taskTypes.map((t) => [t.key, t.total, t.assigned, t.inProgress, t.completed, t.approved]),
    [
      ['video-editing', 2, 1, 0, 1, 0],
      ['canva-poster', 2, 0, 1, 0, 1],
    ],
  )
  assert.deepEqual(report.employees[0].taskTypes, report.summary.taskTypes)
  assert.equal(
    report.summary.taskTypes.reduce((a, t) => a + t.total, 0),
    report.summary.total,
  )
  assert.deepEqual(report.trend, [
    { date: '2026-10-06', completed: 2, approved: 0 },
    { date: '2026-10-07', completed: 0, approved: 1 },
  ])
  assert.deepEqual(report.assignmentTrend, [
    {
      date: '2026-10-05',
      total: 4,
      assigned: 1,
      inProgress: 1,
      completed: 1,
      approved: 1,
      taskTypes: report.summary.taskTypes,
    },
  ])
  assert.equal(
    report.trendBreakdown[0].completedByType.reduce((a, t) => a + t.count, 0),
    2,
  )
  const html = employeeChart(report.employees)
  assert.match(html, /2 of 4 completed \(50%\)/)
  assert.equal((html.match(/assignment-slot /g) || []).length, 4)
  assert.equal((html.match(/assignment-slot [^"\n]* filled/g) || []).length, 2)
  assert.match(trendChart(report.trend, report.trendBreakdown, report.assignmentTrend), /task-type-video-editing/)
  assert.match(trendChart(report.trend, report.trendBreakdown, report.assignmentTrend), /task-type-canva-poster/)
})

test('scope uses creation dates for current counts and event dates for first transitions', () => {
  const tasks = [
    task('old', 'video editing', 'Approved', '2026-09-01', [
      event('Completed', '2026-10-06'),
      event('Approved', '2026-10-07'),
    ]),
    task('new', 'Canva design', 'Assigned'),
    { ...task('other', 'video editing', 'Completed'), clientId: 'else', events: [event('Completed', '2026-10-06')] },
    { ...task('person', 'Canva design', 'Completed'), assigneeId: 'x', events: [event('Completed', '2026-10-06')] },
  ]
  const report = buildAnalytics(
    snapshot(tasks),
    { month: '2026-10', employeeId: 'e', clientId: 'c', jobFunction: 'video editing' },
    now,
  )
  assert.equal(report.summary.total, 0)
  assert.deepEqual(report.assignmentTrend, [])
  assert.deepEqual(report.summary.taskTypes, [])
  assert.deepEqual(
    report.trendBreakdown.map((r) => [r.date, r.completedByType[0]?.key, r.approvedByType[0]?.key]),
    [
      ['2026-10-06', 'video-editing', undefined],
      ['2026-10-07', undefined, 'video-editing'],
    ],
  )
})

test('reopened tasks are dotted now and unique historic transitions stay first-ever', () => {
  const t = task('return', 'video editing', 'In-progress', '2026-10-05', [
    event('Completed', '2026-10-05'),
    event('Approved', '2026-10-05'),
    { ...event('In-progress', '2026-10-06'), kind: 'reopen' },
    event('Completed', '2026-10-07'),
    event('Approved', '2026-10-07'),
  ])
  const report = buildAnalytics(snapshot([t]), {}, now)
  assert.equal(report.summary.taskTypes[0].inProgress, 1)
  assert.equal(report.assignmentTrend[0].inProgress, 1)
  assert.deepEqual(report.trend, [{ date: '2026-10-05', completed: 1, approved: 1 }])
  assert.match(employeeChart(report.employees), /assignment-slot task-type-video-editing pending/)
})

test('empty and legacy payloads render without false colors or injection', () => {
  const html = employeeChart([
    { name: '<script>alert(1)</script>', assigned: 0, inProgress: 0, completed: 0, approved: 0 },
  ])
  assert.match(html, /No tasks assigned/)
  assert.doesNotMatch(html, /<script>/)
  assert.equal((html.match(/assignment-slot /g) || []).length, 0)
  assert.match(
    employeeChart([{ name: 'A', assigned: 1, inProgress: 0, completed: 1, approved: 0 }]),
    /assignment-slot task-type-other filled/,
  )
  assert.match(trendChart([{ date: '2026-10-05', completed: 1, approved: 0 }]), /progress-segment task-type-other/)
  assert.doesNotMatch(trendChart([{ date: '<svg onload=alert(1)>', completed: 1, approved: 0 }]), /<svg/)
})

test('one completion fills exactly one slot and approval never removes it', () => {
  const tasks = [
    task('video', 'video editing', 'Assigned'),
    task('poster', 'Canva design', 'Assigned'),
    task('next', 'video editing', 'Assigned'),
  ]
  const render = () => employeeChart(buildAnalytics(snapshot(tasks), {}, now).employees)
  assert.equal((render().match(/ pending"/g) || []).length, 3)
  tasks[0].state = 'In-progress'
  assert.equal((render().match(/ pending"/g) || []).length, 3)
  tasks[0].state = 'Completed'
  assert.match(render(), /1 of 3 completed \(33%\)/)
  assert.equal((render().match(/ filled"/g) || []).length, 1)
  tasks[0].state = 'Approved'
  assert.equal((render().match(/ filled"/g) || []).length, 1)
  tasks[1].state = 'Completed'
  tasks[2].state = 'Completed'
  assert.match(render(), /3 of 3 completed \(100%\)/)
  assert.equal((render().match(/ pending"/g) || []).length, 0)
  assert.equal((render().match(/ filled"/g) || []).length, 3)
  assert.match(render(), /assignment-slot task-type-canva-poster filled/)
})

test('large workloads use exact weighted groups rather than clipped task slots', () => {
  const html = employeeChart([
    {
      name: 'Large workload',
      assigned: 125,
      inProgress: 25,
      completed: 50,
      approved: 0,
      taskTypes: [
        { key: 'video-editing', label: 'Video Editing', total: 100, completed: 50, approved: 0 },
        { key: 'canva-poster', label: 'Canva Poster', total: 100, completed: 0, approved: 0 },
      ],
    },
  ])
  assert.match(html, /50 of 200 completed \(25%\)/)
  assert.match(html, /assignment-track--grouped/)
  assert.equal((html.match(/class="assignment-slot /g) || []).length, 3)
  assert.match(html, /task-type-video-editing filled" data-count="50" style="flex:50"/)
  assert.match(html, /task-type-canva-poster pending" data-count="100" style="flex:100"/)
})

test('event zero values have no coloured segment and category totals have a readable fallback', () => {
  const html = trendChart(
    [{ date: '2026-10-06', completed: 2, approved: 0 }],
    [
      {
        date: '2026-10-06',
        completedByType: [
          { key: 'video-editing', label: 'Video Editing', count: 1 },
          { key: 'canva-poster', label: 'Canva Poster', count: 1 },
        ],
        approvedByType: [],
      },
    ],
  )
  assert.equal((html.match(/class="progress-segment /g) || []).length, 2)
  assert.match(html, /aria-label="2026-10-06: 2 first Completed events"/)
  assert.match(html, /aria-label="2026-10-06: 0 first Approved events"/)
  assert.match(html, /width:0%/)
  assert.match(html, /Video Editing: 1 · Canva Poster: 1/)
})

test('all current category counters add up and unknown functions remain Other', () => {
  const tasks = [
    'shooting/production',
    'video editing',
    'Canva design',
    'Instagram publishing',
    'website development',
    'website maintenance',
    'custom admin work',
  ].map((type, index) => task(String(index), type, ['Assigned', 'In-progress', 'Completed', 'Approved'][index % 4]))
  const report = buildAnalytics(snapshot(tasks), {}, now)
  assert.equal(report.summary.taskTypes.length, 7)
  for (const key of ['assigned', 'inProgress', 'completed', 'approved']) {
    assert.equal(
      report.summary.taskTypes.reduce((sum, type) => sum + type[key], 0),
      report.summary[key],
    )
  }
  assert.equal(report.summary.taskTypes.at(-1).key, 'other')
})

test('creation cohorts obey business dates and current-state filters while event history stays separate', () => {
  const tasks = [
    task('pending', 'video editing', 'Assigned', '2026-10-05'),
    task('approved', 'Canva Poster', 'Approved', '2026-10-06', [
      event('Completed', '2026-10-07'),
      event('Approved', '2026-10-07'),
    ]),
    { ...task('midnight', 'video editing', 'In-progress'), createdAt: '2026-10-05T20:00:00Z' }, // Oct 6 IST
    task('old', 'video editing', 'Completed', '2026-09-10', [event('Completed', '2026-10-07')]),
  ]
  const report = buildAnalytics(
    snapshot(tasks),
    { from: '2026-10-06', to: '2026-10-07', employeeId: 'e', clientId: 'c' },
    now,
  )
  assert.deepEqual(
    report.assignmentTrend.map((row) => [
      row.date,
      row.total,
      row.assigned,
      row.inProgress,
      row.completed,
      row.approved,
    ]),
    [['2026-10-06', 2, 0, 1, 0, 1]],
  )
  assert.deepEqual(report.trend, [{ date: '2026-10-07', completed: 2, approved: 1 }])
  assert.equal(
    report.assignmentTrend[0].taskTypes.reduce((sum, type) => sum + type.total, 0),
    2,
  )
  const assignedOnly = buildAnalytics(snapshot(tasks), { state: 'Assigned', from: '2026-10-05', to: '2026-10-07' }, now)
  assert.deepEqual(
    assignedOnly.assignmentTrend.map((row) => [row.date, row.total, row.assigned]),
    [['2026-10-05', 1, 1]],
  )
  assert.deepEqual(assignedOnly.trend, [])
  const html = trendChart(assignedOnly.trend, assignedOnly.trendBreakdown, assignedOnly.assignmentTrend)
  assert.match(html, /0\/1 complete · 0%/)
  assert.match(html, /progress-open/)
})
