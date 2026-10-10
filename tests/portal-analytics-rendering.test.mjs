import test from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, unzipSync } from 'fflate'
import { employeeChart, trendChart } from '../portal/analytics-charts.mjs'
import { analyticsWorkbook } from '../src/portal/excel.mjs'

test('renders real dotted open cohorts and escaped hover/focus details for each category', () => {
  const employee = employeeChart([
    {
      name: '<b>Unsafe</b>',
      assigned: 1,
      inProgress: 1,
      completed: 1,
      approved: 0,
      taskTypes: [
        { key: 'video-editing', label: 'Video Editing', total: 2, completed: 1, approved: 0 },
        { key: 'canva-poster', label: 'Canva Poster', total: 1, completed: 0, approved: 0 },
      ],
    },
  ])
  assert.match(employee, /Video Editing — 1 completed\/approved/)
  assert.match(employee, /Canva Poster — 1 assigned\/in-progress/)
  assert.doesNotMatch(employee, /<b>Unsafe<\/b>/)
  const trend = trendChart(
    [{ date: '2026-10-01', completed: 1, approved: 0 }],
    [
      {
        date: '2026-10-01',
        completedByType: [{ key: 'video-editing', label: 'Video Editing', count: 1 }],
        approvedByType: [],
      },
    ],
    [
      {
        date: '2026-09-30',
        total: 2,
        assigned: 1,
        inProgress: 0,
        completed: 1,
        approved: 0,
        taskTypes: [{ key: 'video-editing', total: 2, assigned: 1, inProgress: 0, completed: 1, approved: 0 }],
      },
    ],
  )
  assert.match(trend, /progress-segment task-type-video-editing progress-open/)
  assert.match(trend, /Video Editing — 1 open \(Assigned\)/)
  assert.match(trend, /Video Editing — 1 completed first event/)
  assert.match(trend, /tabindex="0" aria-label="Video Editing/)
  assert.match(trend, /1\/2 complete · 50%/)
})

test('aligns current creation cohorts and historical first events in one date list without combining totals', () => {
  const html = trendChart(
    [
      { date: '2026-10-02', completed: 3, approved: 1 },
      { date: '2026-10-03', completed: 2, approved: 0 },
    ],
    [
      {
        date: '2026-10-02',
        completedByType: [{ key: 'shooting', count: 3 }],
        approvedByType: [{ key: 'shooting', count: 1 }],
      },
    ],
    [
      { date: '2026-10-01', total: 2, assigned: 2, inProgress: 0, completed: 0, approved: 0 },
      { date: '2026-10-02', total: 1, assigned: 0, inProgress: 0, completed: 1, approved: 0 },
    ],
  )
  assert.equal((html.match(/<section class="progress-section"/g) || []).length, 1)
  assert.equal((html.match(/class="progress-list"/g) || []).length, 1)
  const list = html.split('<div class="progress-list"')[1]?.split('<details class="chart-data">')[0]
  assert.ok(list)
  assert.equal((list.match(/class="progress-date"/g) || []).length, 3)
  assert.equal((list.match(/class="progress-label">Current tasks/g) || []).length, 2)
  assert.equal((list.match(/class="progress-label">First Completed/g) || []).length, 2)
  assert.deepEqual(
    [...list.matchAll(/<time>(.*?)<\/time>/g)].map((match) => match[1]),
    ['2026-10-01', '2026-10-02', '2026-10-03'],
  )
  assert.match(list, /Current tasks<\/span>/)
  assert.match(list, /First Completed<\/span>/)
  assert.match(list, /First Approved<\/span>/)
  assert.match(list, /2026-10-02: current assignment-date progress, 1 completed or approved, 0 open of 1/)
  assert.match(list, /2026-10-02: 3 first Completed events/)
  assert.match(list, /Current state: 1\/1 complete · 100%/)
  assert.match(html, /<strong>3<\/strong> tasks created/)
  assert.match(
    html,
    /Event counts are not a distinct-task total or assigned capacity and are not added to current task counts/,
  )
  assert.match(html, /View assignment-date counts/)
  assert.match(html, /View event-date counts/)
  assert.match(html, /Shooting \/ Production — 3 completed first event/)
  assert.match(html, /Bar lengths use separate scales for current tasks and first events/)
  assert.match(html, /First completion and approval events by date and task type/)
})

test('uses today login fields, including zero and legacy fallback labels', () => {
  const today = employeeChart([
    {
      id: 'e" onmouseover="bad()',
      name: 'Today',
      todayFirstLoginAt: null,
      todayLoginSeconds: 0,
      firstLoginAt: '2020-01-01T00:00:00Z',
      loginSeconds: 3600,
    },
  ])
  assert.match(today, /Today's first login <strong>—<\/strong>/)
  assert.match(today, /0h 0m logged today/)
  const legacy = employeeChart([{ name: 'Legacy', firstLoginAt: '2020-01-01T00:00:00Z', loginSeconds: 60 }])
  assert.match(legacy, /First login \(historical fallback\)/)
  assert.match(legacy, /historical fallback/)
  assert.match(today, /login days in selected period/)
  assert.match(today, /data-today-login="e&quot; onmouseover=&quot;bad\(\)"/)
  assert.match(today, /data-today-duration="e&quot; onmouseover=&quot;bad\(\)"/)
  assert.doesNotMatch(today, /data-today-login="e" onmouseover=/)
  assert.doesNotMatch(legacy, /data-today-login/)
})

test('labels Admin and Employee rows and shows Admin first login and duration', () => {
  const html = employeeChart([
    {
      id: 'admin-1',
      name: 'Asha Admin',
      role: 'Admin',
      assigned: 1,
      completed: 1,
      firstLoginAt: '2026-10-01T04:30:00Z',
      loginSeconds: 5400,
      loginDays: 2,
    },
    { id: 'employee-1', name: 'Editor', role: 'Employee' },
  ])
  assert.match(html, /Asha Admin <small class="team-member-role">Admin<\/small>/)
  assert.match(html, /Editor <small class="team-member-role">Employee<\/small>/)
  assert.match(html, /aria-label="Asha Admin, Admin"/)
  assert.match(html, /First login \(historical fallback\) <strong>10:00<\/strong>/)
  assert.match(html, /1h 30m logged · selected period/)
  assert.match(html, /Current task status and attendance by team member/)
})

test('exports role-aware team rows with Admin login fields and legacy role fallback', () => {
  const workbook = analyticsWorkbook(
    {
      summary: {},
      filters: {},
      employees: [
        {
          id: 'admin-1',
          name: 'Asha Admin',
          role: 'Admin',
          firstLoginAt: '2026-10-01T04:30:00Z',
          loginDays: 2,
          loginSeconds: 5400,
        },
        { id: 'employee-1', name: 'Editor' },
      ],
      tasks: [],
    },
    { serverNow: '2026-10-07T12:00:00Z' },
  )
  const files = unzipSync(workbook)
  assert.match(strFromU8(files['xl/workbook.xml']), /<sheet name="Team"/)
  const sheet = strFromU8(files['xl/worksheets/sheet2.xml'])
  assert.match(sheet, /<c r="A1" t="inlineStr"><is><t xml:space="preserve">Team member ID<\/t>/)
  assert.match(sheet, /<c r="C1" t="inlineStr"><is><t xml:space="preserve">Role<\/t>/)
  assert.match(sheet, /<c r="C2" t="inlineStr"><is><t xml:space="preserve">Admin<\/t>/)
  assert.match(sheet, /<c r="C3" t="inlineStr"><is><t xml:space="preserve">Employee<\/t>/)
  assert.match(sheet, /<c r="D2" t="inlineStr"><is><t xml:space="preserve">2026-10-01T04:30:00Z<\/t>/)
  assert.match(sheet, /<c r="F2"><v>5400<\/v><\/c>/)
})

test('pending-only cohorts render without events; historical cohorts are not invented', () => {
  const html = trendChart(
    [],
    [],
    [
      {
        date: '2026-10-03',
        total: 2,
        assigned: 1,
        inProgress: 1,
        completed: 0,
        approved: 0,
        taskTypes: [{ key: 'shooting', total: 2, assigned: 1, inProgress: 1, completed: 0, approved: 0 }],
      },
    ],
  )
  assert.match(html, /0\/2 complete · 0%/)
  assert.match(html, /<strong>2<\/strong> currently open/)
  assert.equal((html.match(/class="progress-segment /g) || []).length, 2)
  assert.match(html, /No first completion or approval events in this range/)
  assert.doesNotMatch(html, /progress-filled/)
})

test('event-only ranges do not show fabricated cohort counts, and escape all visible and hover text', () => {
  const html = trendChart([{ date: '<svg onload=bad()>', completed: 1, approved: 1 }], [], [])
  assert.match(html, /No tasks created in this range/)
  assert.match(html, /<strong>0<\/strong> tasks created/)
  assert.match(html, /Other — 1 completed first event/)
  assert.doesNotMatch(html, /<svg/)
  assert.match(html, /&lt;svg onload=bad\(\)&gt;/)
  assert.doesNotMatch(html, /progress-open/)
})

test('empty date range renders one combined empty state and keeps both count tables accurate', () => {
  const html = trendChart([], [], [])
  assert.equal((html.match(/<section class="progress-section"/g) || []).length, 1)
  assert.doesNotMatch(html, /class="progress-list"/)
  assert.match(html, /No tasks created or first completion or approval events in this range/)
  assert.match(html, /colspan="7">No tasks created in this range/)
  assert.match(html, /colspan="5">No first completion or approval events in this range/)
})

test('long cohort counts render bounded segment count, with honest state percentages', () => {
  const html = trendChart(
    [],
    [],
    [
      {
        date: '2026-10-01',
        total: 100000,
        assigned: 49999,
        inProgress: 0,
        completed: 50000,
        approved: 1,
        taskTypes: [{ key: 'other', total: 100000, assigned: 49999, inProgress: 0, completed: 50000, approved: 1 }],
      },
    ],
  )
  assert.match(html, /50001\/100000 complete · 50%/)
  assert.equal((html.match(/class="progress-segment /g) || []).length, 3)
  assert.match(html, /Other — 49999 open \(Assigned\)/)
})
