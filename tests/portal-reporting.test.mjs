import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { buildAnalytics } from '../src/portal/analytics.mjs'
import { analyticsWorkbook } from '../src/portal/excel.mjs'
import { pushConfiguration, sendBroadcastPush } from '../src/portal/notifications.mjs'

const now = '2026-10-07T12:00:00Z'

test('push configuration names missing Worker values without exposing secrets', () => {
  assert.deepEqual(pushConfiguration({ VAPID_PUBLIC_KEY: 'public' }), {
    configured: false,
    missing: ['VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
    message:
      'Push is not configured on this server. Set VAPID_PRIVATE_KEY, VAPID_SUBJECT in the production Worker secrets.',
  })
  assert.equal(
    pushConfiguration({
      VAPID_PUBLIC_KEY: 'public',
      VAPID_PRIVATE_KEY: 'private',
      VAPID_SUBJECT: 'mailto:test@example.com',
    }).configured,
    true,
  )
})
const snapshot = {
  serverNow: now,
  employees: [
    { id: 'e', name: '=HYPERLINK("evil")' },
    { id: 'x', name: 'X' },
  ],
  tasks: [
    {
      id: '1',
      title: '=1+1',
      assigneeId: 'e',
      clientId: 'c',
      jobFunction: 'edit',
      state: 'Approved',
      createdAt: '2026-10-05T04:30:00Z',
      deadline: '2026-10-05T12:00:00Z',
      completedAt: '2026-10-05T11:00:00Z',
      intervals: [{ start: '2026-10-05T04:30:00Z', end: '2026-10-05T11:00:00Z' }],
      events: [
        { to: 'Completed', at: '2026-10-05T11:00:00Z' },
        { to: 'Approved', at: '2026-10-06T06:00:00Z' },
        { kind: 'rejection' },
      ],
    },
    {
      id: '2',
      title: 'other',
      assigneeId: 'x',
      clientId: 'd',
      jobFunction: 'shoot',
      state: 'Assigned',
      createdAt: '2026-10-06T04:30:00Z',
      deadline: '2026-10-06T05:00:00Z',
      intervals: [],
      events: [],
    },
  ],
  updates: [{ employeeId: 'e', date: '2026-10-05', text: '@SUM(A1)', submittedAt: '2026-10-05T04:40:00Z' }],
  absences: [
    {
      employeeId: 'e',
      kind: 'permission',
      start: '2026-10-05T09:30:00Z',
      end: '2026-10-05T10:30:00Z',
      status: 'Approved',
      reason: 'private',
    },
  ],
}

test('analytics state counts, event trends, filters and private exclusions', () => {
  const report = buildAnalytics(
    snapshot,
    { from: '2026-10-05', to: '2026-10-07', employeeId: 'e', clientId: 'c', jobFunction: 'edit' },
    now,
  )
  assert.equal(report.summary.total, 1)
  assert.equal(report.summary.approved, 1)
  assert.equal(report.summary.completed, 0)
  assert.equal(report.summary.workCount, 1)
  assert.equal(report.summary.reworkCount, 0)
  assert.equal(report.summary.activeWork, 0)
  assert.equal(report.summary.activeRework, 0)
  assert.equal(report.summary.workSeconds, 16200)
  assert.equal(report.employees[0].rejections, 1)
  assert.equal(report.employees[0].approved, 1)
  assert.equal(report.employees[0].activeWork, 0)
  assert.equal(report.employees[0].activeRework, 0)
  assert.deepEqual(report.trend, [
    { date: '2026-10-05', completed: 1, approved: 0 },
    { date: '2026-10-06', completed: 0, approved: 1 },
  ])
  assert.equal(buildAnalytics(snapshot, { state: 'Assigned' }, now).summary.total, 1)
  assert.equal(buildAnalytics(snapshot, { from: '2026-10-07' }, now).summary.total, 0)
  assert.throws(() => buildAnalytics(snapshot, { from: '2026-10-08', to: '2026-10-01' }, now), RangeError)
})

test('analytics records first login and caps employee duration at the business cutoff', () => {
  const report = buildAnalytics(
    {
      ...snapshot,
      loginRecords: [{ employeeId: 'e', date: '2026-10-05', firstLoginAt: '2026-10-05T04:45:00.000Z' }],
    },
    { from: '2026-10-05', to: '2026-10-05' },
    '2026-10-05T14:00:00Z',
  )
  assert.equal(report.employees[0].firstLoginAt, '2026-10-05T04:45:00.000Z')
  assert.equal(report.employees[0].loginDays, 1)
  assert.equal(report.employees[0].loginSeconds, 26100)
})

test('analytics reports Admin login attendance, selected Admin filters, and no Admin update debt', () => {
  const report = buildAnalytics(
    {
      ...snapshot,
      employees: [
        { id: 'admin', name: 'Administrator', role: 'Admin', createdAt: '2026-10-01T04:00:00Z' },
        { id: 'e', name: 'E', role: 'Employee', createdAt: '2026-10-01T04:00:00Z' },
      ],
      tasks: [
        {
          ...snapshot.tasks[0],
          assigneeId: 'admin',
          createdAt: '2026-10-06T04:30:00Z',
          clientId: 'c',
          jobFunction: 'edit',
        },
      ],
      loginRecords: [
        { employeeId: 'admin', date: '2026-10-06', firstLoginAt: '2026-10-06T04:30:00.000Z' },
        { employeeId: 'e', date: '2026-10-06', firstLoginAt: '2026-10-06T04:30:00.000Z' },
      ],
    },
    { from: '2026-10-06', to: '2026-10-06', employeeId: 'admin', clientId: 'c', jobFunction: 'edit' },
    '2026-10-06T06:00:00Z',
  )
  assert.deepEqual(
    report.employees.map(({ id, role }) => ({ id, role })),
    [{ id: 'admin', role: 'Admin' }],
  )
  assert.equal(report.employees[0].loginDays, 1)
  assert.equal(report.employees[0].loginSeconds, 5400)
  assert.equal(report.employees[0].todayFirstLoginAt, '2026-10-06T04:30:00.000Z')
  assert.equal(report.employees[0].todayLoginSeconds, 5400)
  assert.equal(report.employees[0].updateOnTime, 0)
  assert.equal(report.employees[0].updateLate, 0)
  assert.equal(report.employees[0].updateMissing, 0)
  assert.equal(report.employees[0].updateExempt, 0)
  assert.equal(report.summary.loginDays, 1)
  assert.equal(report.summary.loginSeconds, 5400)
})

test('reopened work counts as a second work iteration without double counting approval', () => {
  const task = {
    ...snapshot.tasks[0],
    state: 'Approved',
    completedAt: '2026-10-06T06:00:00Z',
    events: [
      { to: 'Completed', at: '2026-10-05T11:00:00Z' },
      { to: 'Approved', at: '2026-10-05T12:00:00Z' },
      { to: 'In-progress', at: '2026-10-06T05:00:00Z', kind: 'reopen' },
      { to: 'Completed', at: '2026-10-06T06:00:00Z' },
      { to: 'Approved', at: '2026-10-06T07:00:00Z' },
    ],
  }
  const report = buildAnalytics({ ...snapshot, tasks: [task] }, { from: '2026-10-05', to: '2026-10-07' }, now)
  assert.equal(report.summary.workCount, 2)
  assert.equal(report.summary.reworkCount, 1)
  assert.equal(report.summary.approved, 1)
  assert.deepEqual(report.trend, [{ date: '2026-10-05', completed: 1, approved: 1 }])
})

test('a reopened completion outside the original completion window does not create a new trend completion', () => {
  const task = {
    ...snapshot.tasks[0],
    events: [
      { to: 'Completed', at: '2026-10-01T11:00:00Z' },
      { to: 'Approved', at: '2026-10-01T12:00:00Z' },
      { to: 'In-progress', at: '2026-10-06T05:00:00Z', kind: 'reopen' },
      { to: 'Completed', at: '2026-10-06T06:00:00Z' },
    ],
  }
  const report = buildAnalytics({ ...snapshot, tasks: [task] }, { from: '2026-10-06', to: '2026-10-07' }, now)
  assert.deepEqual(report.trend, [])
})

test('role, lifecycle, pending today and future dates do not produce false missing updates', () => {
  const data = {
    ...snapshot,
    employees: [
      { id: 'admin', name: 'Administrator', role: 'Admin' },
      { id: 'e', name: 'E', role: 'Employee', createdAt: '2026-10-07T04:00:00Z' },
    ],
    tasks: [],
  }
  const result = buildAnalytics(data, { from: '2026-10-05', to: '2026-10-10' }, '2026-10-07T04:00:00Z')
  assert.equal(result.employees.length, 2)
  const admin = result.employees.find((employee) => employee.id === 'admin')
  assert.equal(admin.role, 'Admin')
  assert.equal(admin.updateExempt, 0)
  assert.equal(admin.updateMissing, 0)
  const employee = result.employees.find((employee) => employee.id === 'e')
  assert.equal(employee.updateExempt, 2)
  assert.equal(employee.updateMissing, 0)
  assert.equal(employee.updateOnTime, 0)
  assert.equal(result.summary.medianWorkSeconds, 0)
})

test('event trend includes historical-created task events in selected date; invalid filters return 400', () => {
  const task = {
    ...snapshot.tasks[0],
    createdAt: '2026-09-01T04:30:00Z',
    events: [{ to: 'Completed', at: '2026-10-06T06:00:00Z' }],
  }
  const report = buildAnalytics(
    { ...snapshot, tasks: [task] },
    { from: '2026-10-06', to: '2026-10-06', employeeId: 'e', clientId: 'c', jobFunction: 'edit' },
    now,
  )
  assert.equal(report.summary.total, 0)
  assert.deepEqual(report.trend, [{ date: '2026-10-06', completed: 1, approved: 0 }])
  assert.equal(buildAnalytics(snapshot, {}, now).summary.medianWorkSeconds, 16200)
  for (const filters of [{ from: '2026-02-30' }, { from: '2024-01-01', to: '2026-01-01' }, { from: '2024-01-01' }]) {
    assert.throws(() => buildAnalytics(snapshot, filters, now), { status: 400 })
  }
})

test('prior-year and leap-month reports retain historical events, intervals and employee records', () => {
  const historical = {
    ...snapshot,
    employees: [
      { id: 'e', name: 'E', role: 'Employee' },
      { id: 'x', name: 'X', role: 'Employee' },
    ],
    tasks: [
      {
        ...snapshot.tasks[0],
        id: 'old',
        createdAt: '2024-02-01T04:30:00Z',
        completedAt: '2024-02-02T11:00:00Z',
        intervals: [{ start: '2024-02-01T04:30:00Z', end: '2024-02-01T05:30:00Z' }],
        events: [{ to: 'Completed', at: '2024-02-02T11:00:00Z' }],
      },
      {
        ...snapshot.tasks[1],
        id: 'other',
        createdAt: '2024-02-03T04:30:00Z',
        events: [{ to: 'Completed', at: '2024-02-04T11:00:00Z' }],
      },
    ],
    updates: [{ employeeId: 'e', date: '2024-02-01', text: 'Historic update', submittedAt: '2024-02-01T04:30:00Z' }],
    absences: [],
    loginRecords: [{ employeeId: 'e', date: '2024-02-01', firstLoginAt: '2024-02-01T04:30:00Z' }],
  }
  for (const filter of [{ year: '2024' }, { month: '2024-02' }]) {
    const report = buildAnalytics(historical, { ...filter, employeeId: 'e' }, now)
    assert.equal(report.summary.total, 1)
    assert.equal(report.tasks[0].id, 'old')
    assert.equal(report.tasks[0].workSeconds, 3600)
    assert.deepEqual(report.trend, [{ date: '2024-02-02', completed: 1, approved: 0 }])
    assert.deepEqual(
      report.employees.map((e) => e.id),
      ['e'],
    )
    assert.equal(report.employees[0].loginDays, 1)
    assert.deepEqual(
      [report.filters.from, report.filters.to],
      filter.month ? ['2024-02-01', '2024-02-29'] : ['2024-01-01', '2024-12-31'],
    )
    const zip = unzipSync(analyticsWorkbook(report, historical))
    assert.match(strFromU8(zip['xl/worksheets/sheet3.xml']), /old/)
    assert.doesNotMatch(strFromU8(zip['xl/worksheets/sheet3.xml']), /other/)
    assert.match(strFromU8(zip['xl/worksheets/sheet4.xml']), /Historic update/)
  }
  for (const filter of [
    { month: '2024-13' },
    { month: '2024-2' },
    { year: '20240' },
    { year: '0000' },
    { employeeId: '' },
    { year: '2024', from: '2024-01-01' },
    { month: '2024-02', year: '2023' },
    { from: '2024-01-01', to: '2025-02-01' },
  ]) {
    assert.throws(() => buildAnalytics(historical, filter, now), { status: 400 })
  }
})

test('xlsx contains six valid package sheets, numeric seconds and inline-only hostile strings', () => {
  const report = buildAnalytics(snapshot, { employeeId: 'e', from: '2026-10-05', to: '2026-10-07' }, now)
  const zip = unzipSync(analyticsWorkbook(report, snapshot))
  for (let i = 1; i <= 6; i++) assert.ok(zip[`xl/worksheets/sheet${i}.xml`])
  const workbook = strFromU8(zip['xl/workbook.xml'])
  assert.match(workbook, /name="Definitions"/)
  const task = strFromU8(zip['xl/worksheets/sheet3.xml'])
  assert.match(task, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/)
  assert.match(task, /<c r="I2"><v>16200<\/v><\/c>/)
  const all = Object.values(zip).map(strFromU8).join('')
  assert.doesNotMatch(all, /<f>|private|subscription|password/i)
  assert.match(strFromU8(zip['xl/worksheets/sheet4.xml']), /@SUM\(A1\)/)
  assert.match(strFromU8(zip['xl/worksheets/sheet6.xml']), /Fraction from 0 to 1/)
})

test('absence export includes inclusive leave and permission overlapping selected date', () => {
  const data = {
    ...snapshot,
    absences: [
      { employeeId: 'e', kind: 'leave', start: '2026-10-01', end: '2026-10-07', status: 'Approved' },
      {
        employeeId: 'e',
        kind: 'permission',
        start: '2026-10-05T12:00:00Z',
        end: '2026-10-07T07:00:00Z',
        status: 'Approved',
      },
      {
        employeeId: 'e',
        kind: 'permission',
        start: '2026-10-01T00:00:00Z',
        end: '2026-10-01T01:00:00Z',
        status: 'Approved',
      },
    ],
  }
  const report = buildAnalytics(data, { employeeId: 'e', from: '2026-10-06', to: '2026-10-06' }, now)
  const sheet = strFromU8(unzipSync(analyticsWorkbook(report, data))['xl/worksheets/sheet5.xml'])
  assert.match(sheet, /2026-10-01<\/t>/)
  assert.match(sheet, /2026-10-07T07:00:00Z/)
  assert.doesNotMatch(sheet, /2026-10-01T01:00:00Z/)
})

test('push without optional credentials skips delivery and does not contact endpoint', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => {
    throw Error('Unexpected network access')
  }
  try {
    assert.deepEqual(await sendBroadcastPush({}, [{ endpoint: 'https://127.0.0.1/private' }]), {
      sent: 0,
      failed: 0,
      skipped: 1,
      expiredEndpoints: [],
      diagnostics: { configuration: 1, preparation: 0, network: 0, timeout: 0, httpStatuses: {} },
    })
  } finally {
    globalThis.fetch = original
  }
})

test('configured push rejects untrusted destinations before encryption/network', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => {
    throw Error('Unexpected network access')
  }
  try {
    const env = { VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y', VAPID_SUBJECT: 'mailto:operator@example.com' }
    assert.deepEqual(
      await sendBroadcastPush(env, [
        { endpoint: 'https://127.0.0.1/' },
        { endpoint: 'https://fcm.googleapis.com.evil.test/' },
        { endpoint: 'http://fcm.googleapis.com/' },
      ]),
      {
        sent: 0,
        failed: 0,
        skipped: 3,
        expiredEndpoints: [],
        diagnostics: { configuration: 0, preparation: 0, network: 0, timeout: 0, httpStatuses: {} },
      },
    )
  } finally {
    globalThis.fetch = original
  }
})

test('push reports expired endpoints on 404 and 410 without following redirects', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const recipient = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const vapid = {
    VAPID_PUBLIC_KEY: Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'),
    VAPID_PRIVATE_KEY: (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d,
    VAPID_SUBJECT: 'mailto:test@example.com',
  }
  const keys = {
    p256dh: Buffer.from(await webcrypto.subtle.exportKey('raw', recipient.publicKey)).toString('base64url'),
    auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  }
  const subscriptions = [404, 410, 201].map((_, i) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, keys }))
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, 'manual')
    const status = [404, 410, 201][Number(url.split('/').at(-1))]
    return { status, ok: status === 201 }
  }
  try {
    const result = await sendBroadcastPush(vapid, subscriptions)
    assert.deepEqual(result, {
      sent: 1,
      failed: 2,
      skipped: 0,
      expiredEndpoints: subscriptions.slice(0, 2).map((s) => s.endpoint),
      diagnostics: { configuration: 0, preparation: 0, network: 0, timeout: 0, httpStatuses: { 404: 1, 410: 1 } },
    })
  } finally {
    globalThis.fetch = original
  }
})

test('push distinguishes payload preparation, transport, timeout and HTTP failures without private details', async () => {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const recipient = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const env = {
    VAPID_PUBLIC_KEY: Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'),
    VAPID_PRIVATE_KEY: (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d,
    VAPID_SUBJECT: 'mailto:private-subject@example.test',
  }
  const keys = {
    p256dh: Buffer.from(await webcrypto.subtle.exportKey('raw', recipient.publicKey)).toString('base64url'),
    auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  }
  const subscriptions = ['bad', 'network', 'timeout', 'http', 'unknown'].map((label) => ({
    endpoint: `https://fcm.googleapis.com/private-${label}`,
    keys: label === 'bad' ? { ...keys, p256dh: 'private-invalid-key' } : keys,
  }))
  const original = globalThis.fetch
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(url)
    if (url.endsWith('network')) throw new Error('PRIVATE_NETWORK_EXCEPTION Authorization: private-token')
    if (url.endsWith('timeout')) throw new DOMException('PRIVATE_TIMEOUT_EXCEPTION', 'TimeoutError')
    if (url.endsWith('http')) return { ok: false, status: 403, body: 'PRIVATE_PROVIDER_BODY' }
    return { ok: false, status: 'PRIVATE_STATUS', body: 'PRIVATE_PROVIDER_BODY' }
  }
  try {
    const result = await sendBroadcastPush(env, subscriptions)
    assert.deepEqual(result, {
      sent: 0,
      failed: 5,
      skipped: 0,
      expiredEndpoints: [],
      diagnostics: { configuration: 0, preparation: 1, network: 1, timeout: 1, httpStatuses: { 403: 1, other: 1 } },
    })
    assert.equal(requested.includes(subscriptions[0].endpoint), false)
    const publicResult = JSON.stringify(result)
    for (const secret of ['private-', 'PRIVATE_', 'Authorization', env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT])
      assert.equal(publicResult.includes(secret), false)
  } finally {
    globalThis.fetch = original
  }
})
