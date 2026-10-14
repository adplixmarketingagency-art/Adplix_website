import { zipSync, strToU8 } from 'fflate'
import { businessDate } from './domain.mjs'

// XML 1.0 forbids these control characters, so the sanitizer must match them.
// eslint-disable-next-line no-control-regex
const clean = (value) => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
const escape = (value) =>
  clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
function col(index) {
  let result = ''
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  return result
}
function sheet(rows) {
  const content = rows
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map((value, j) => {
            const ref = `${col(j)}${i + 1}`
            return typeof value === 'number' && Number.isFinite(value)
              ? `<c r="${ref}"><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`
          })
          .join('')}</row>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${content}</sheetData></worksheet>`
}

const toHours = (sec) => (typeof sec === 'number' && Number.isFinite(sec) ? Math.round((sec / 3600) * 100) / 100 : 0)
const toDuration = (sec) => {
  const s = Math.max(0, Number(sec) || 0)
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
const toPercent = (fraction) =>
  typeof fraction === 'number' && Number.isFinite(fraction) ? `${(fraction * 100).toFixed(1)}%` : ''

export function analyticsWorkbook(analytics, snapshot) {
  const s = analytics.summary
  const selectedIds = new Set(
    analytics.filters.clientId || analytics.filters.jobFunction || analytics.filters.state
      ? analytics.tasks.map((t) => t.assigneeId)
      : analytics.employees.map((e) => e.id),
  )
  const inRange = (date) =>
    (!analytics.filters.from || date >= analytics.filters.from) &&
    (!analytics.filters.to || date <= analytics.filters.to)
  const names = ['Summary', 'Team', 'Tasks', 'Daily Updates', 'Absences', 'Definitions']
  const employeeNames = new Map((snapshot.employees || []).map((e) => [e.id, e.name || e.id]))
  const clientNames = new Map((snapshot.clients || []).map((c) => [c.id, c.name || c.id]))

  const rows = [
    [
      ['Metric', 'Value', 'Formatted / Units'],
      ['Total tasks', s.total, `${s.total ?? 0} tasks`],
      ['Assigned', s.assigned, `${s.assigned ?? 0} tasks`],
      ['In-progress', s.inProgress, `${s.inProgress ?? 0} tasks`],
      ['Completed', s.completed, `${s.completed ?? 0} tasks`],
      ['Approved', s.approved, `${s.approved ?? 0} tasks`],
      ['Active work', s.activeWork, `${s.activeWork ?? 0} tasks`],
      ['Active rework', s.activeRework, `${s.activeRework ?? 0} tasks`],
      ['Login hours', toHours(s.loginSeconds), `${toHours(s.loginSeconds)} hrs (${toDuration(s.loginSeconds)})`],
      ['Login duration', toDuration(s.loginSeconds), 'Hours & minutes'],
      ['Login days', s.loginDays, `${s.loginDays ?? 0} days`],
      ['Login seconds', s.loginSeconds, 'Raw seconds'],
      ['Overdue', s.overdue, `${s.overdue ?? 0} tasks`],
      ['Work count', s.workCount, `${s.workCount ?? 0} iterations`],
      ['Rework count', s.reworkCount, `${s.reworkCount ?? 0} iterations`],
      ['On-time rate (%)', toPercent(s.onTimeRate), `${toPercent(s.onTimeRate)} on-time`],
      ['On-time completion rate (fraction)', s.onTimeRate, 'Decimal fraction 0–1'],
      ['Task work hours', toHours(s.workSeconds), `${toHours(s.workSeconds)} hrs (${toDuration(s.workSeconds)})`],
      ['Task work duration', toDuration(s.workSeconds), 'Hours & minutes'],
      ['Task work seconds', s.workSeconds, 'Raw seconds'],
      [
        'Median completed-task work hours',
        toHours(s.medianWorkSeconds),
        `${toHours(s.medianWorkSeconds)} hrs (${toDuration(s.medianWorkSeconds)})`,
      ],
      ['Median completed-task work seconds', s.medianWorkSeconds, 'Raw seconds'],
      ['Business timezone', 'Asia/Kolkata', 'UTC+05:30'],
      ['Generated at', new Date(snapshot.serverNow || Date.now()).toISOString(), 'ISO 8601'],
    ],
    [
      [
        'Team member ID',
        'Name',
        'Role',
        'Login date/time',
        'Login days',
        'Login seconds',
        'Login hours (hrs)',
        'Login duration (h m)',
        'Active work',
        'Active rework',
        'Assigned',
        'In-progress',
        'Completed',
        'Approved',
        'Average rating',
        'Rating count',
        'Overdue',
        'Work count',
        'Rework count',
        'On-time rate (fraction)',
        'On-time rate (%)',
        'Work seconds',
        'Work hours (hrs)',
        'Work duration (h m)',
        'Median completed-task seconds',
        'Median completed-task hours',
        'Rejections',
        'Updates on time',
        'Updates late',
        'Updates missing',
        'Updates exempt',
      ],
      ...analytics.employees
        .filter((e) => selectedIds.has(e.id))
        .map((e) => [
          e.id,
          e.name,
          e.role || 'Employee',
          e.firstLoginAt,
          e.loginDays,
          e.loginSeconds,
          toHours(e.loginSeconds),
          toDuration(e.loginSeconds),
          e.activeWork,
          e.activeRework,
          e.assigned,
          e.inProgress,
          e.completed,
          e.approved,
          e.averageRating ?? e.rating ?? '',
          e.ratingCount ?? '',
          e.overdue,
          e.workCount,
          e.reworkCount,
          e.onTimeRate,
          toPercent(e.onTimeRate),
          e.workSeconds,
          toHours(e.workSeconds),
          toDuration(e.workSeconds),
          e.medianWorkSeconds,
          toHours(e.medianWorkSeconds),
          e.rejections,
          e.updateOnTime,
          e.updateLate,
          e.updateMissing,
          e.updateExempt,
        ]),
    ],
    [
      [
        'Task ID',
        'Title',
        'Assignee ID',
        'Client ID',
        'Job function',
        'State',
        'Deadline',
        'Completed at',
        'Work seconds',
        'Work hours',
        'Work duration (h m)',
        'Assignee name',
        'Client name',
        'Overdue',
        'Rating',
        'Rating note',
      ],
      ...analytics.tasks.map((t) => [
        t.id,
        t.title,
        t.assigneeId,
        t.clientId,
        t.jobFunction,
        t.state,
        t.deadline,
        t.completedAt,
        t.workSeconds,
        toHours(t.workSeconds),
        toDuration(t.workSeconds),
        employeeNames.get(t.assigneeId) || t.assigneeId || 'Unassigned',
        clientNames.get(t.clientId) || t.clientId || 'Internal',
        t.overdue ? 'Yes' : 'No',
        t.rating ?? '',
        t.ratingNote ?? '',
      ]),
    ],
    [
      ['Employee ID', 'Date', 'Submitted at', 'Edited at', 'Update'],
      ...(snapshot.updates || [])
        .filter((u) => selectedIds.has(u.employeeId) && inRange(u.date))
        .map((u) => [u.employeeId, u.date, u.submittedAt, u.editedAt, u.text]),
    ],
    [
      ['Employee ID', 'Kind', 'Start', 'End', 'Status'],
      ...(snapshot.absences || [])
        .filter(
          (a) =>
            selectedIds.has(a.employeeId) &&
            (!analytics.filters.from ||
              (a.kind === 'leave' ? a.end : businessDate(new Date(new Date(a.end).getTime() - 1))) >=
                analytics.filters.from) &&
            (!analytics.filters.to || (a.kind === 'leave' ? a.start : businessDate(a.start)) <= analytics.filters.to),
        )
        .map((a) => [a.employeeId, a.kind, a.start, a.end, a.status]),
    ],
    [
      ['Metric', 'Definition'],
      [
        'Date filter',
        'Task creation business date for task counts; event business date for trends (even if task was created earlier); daily record date for updates; absences overlapping the selected dates.',
      ],
      [
        'Work hours & duration',
        'Active working duration in decimal hours (hours = seconds / 3600, rounded to 2 decimal places) and human-friendly duration (Xh Ym). Measured during business hours (Mon–Sat 10:00–13:00 and 14:00–19:00 Asia/Kolkata) and excludes approved absences. Concurrent task totals can overlap and are not attendance.',
      ],
      [
        'Work seconds',
        'Per-task active working time in raw seconds excluding approved absences; concurrent task totals can overlap and are not attendance.',
      ],
      [
        'Login hours & duration',
        'Attendance time in decimal hours and formatted duration (Xh Ym) from a team member’s first login of each business date through the earlier of the current time or 17:30 Asia/Kolkata (extended to 19:00 Asia/Kolkata when tasks are in progress); one first-login record per team member per date.',
      ],
      [
        'Current status segments',
        'Work and Rework are active Assigned/In-progress tasks; Completed and Approved are mutually exclusive current task states.',
      ],
      [
        'On-time rate',
        'Fraction from 0 to 1 and percentage: tasks with a completion timestamp no later than deadline divided by tasks with a completion timestamp; multiply by 100 for percent.',
      ],
      [
        'Median completed-task hours & seconds',
        'Middle per-task working duration among tasks with a completion timestamp in hours and seconds; mean of two middle values for an even count.',
      ],
      [
        'Daily missing',
        'Working days without an update after the deadline, excluding Sundays, approved full-day leave and dates outside employment. Pending today is not missing.',
      ],
      ['Timezone', 'Asia/Kolkata; Monday–Saturday 10:00–13:00 and 14:00–19:00.'],
    ],
  ]
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  }
  rows.forEach((data, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheet(data)
  })
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])))
}
