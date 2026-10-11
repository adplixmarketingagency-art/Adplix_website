import { TASK_CATEGORIES, taskCategory } from '../src/portal/task-categories.mjs'

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const n = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0)
const colorClass = (key) => `task-type-${key}`
const duration = (value) => `${Math.floor(n(value) / 3600)}h ${Math.floor((n(value) % 3600) / 60)}m`
const loginClock = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—'
const categoryFor = (item) => TASK_CATEGORIES.find((category) => category.key === item.key) || taskCategory(item.label)

function legend(label, pending = false) {
  return `<div class="chart-legend task-category-legend" role="group" aria-label="${esc(label)}">${TASK_CATEGORIES.map((category) => `<span class="${colorClass(category.key)}">${esc(category.label)}</span>`).join('')}${pending ? '<span class="assignment-pending">Assigned / In-progress (dotted)</span><span class="assignment-filled">Completed / Approved (filled)</span>' : ''}</div>`
}

function currentTypes(employee) {
  const types = Array.isArray(employee.taskTypes) ? employee.taskTypes : []
  if (types.length)
    return types
      .map((type) => ({
        ...categoryFor(type),
        total: n(type.total),
        done: Math.min(n(type.total), n(type.completed) + n(type.approved)),
      }))
      .filter((type) => type.total)
  const total = ['assigned', 'inProgress', 'completed', 'approved'].reduce((sum, key) => sum + n(employee[key]), 0)
  return total ? [{ ...taskCategory(''), total, done: n(employee.completed) + n(employee.approved) }] : []
}

function assignmentSlots(types) {
  // Keep individual task slots for small workloads. Larger workloads use exact count-weighted groups.
  const grouped = types.reduce((sum, type) => sum + type.total, 0) > 40
  const segments = (type, count, state) => {
    const stateText = state === 'filled' ? 'completed/approved' : 'assigned/in-progress'
    const title = `${type.label} — ${count} ${stateText}`
    return grouped
      ? count
        ? `<span class="assignment-slot assignment-group ${colorClass(type.key)} ${state}" data-count="${count}" style="flex:${count}" role="img" tabindex="0" title="${esc(title)}" aria-label="${esc(title)}"></span>`
        : ''
      : Array.from(
          { length: count },
          () =>
            `<span class="assignment-slot ${colorClass(type.key)} ${state}" data-count="1" role="img" tabindex="0" title="${esc(type.label)} — 1 ${stateText}" aria-label="${esc(type.label)} — 1 ${stateText}"></span>`,
        ).join('')
  }
  return {
    grouped,
    html:
      types.map((type) => segments(type, type.done, 'filled')).join('') +
      types.map((type) => segments(type, type.total - type.done, 'pending')).join(''),
  }
}

export function employeeChart(rows, renderName = (person) => esc(person.name), renderAvatar = () => '') {
  const sorted = [...rows].sort(
    (a, b) =>
      currentTypes(b).reduce((sum, type) => sum + type.total, 0) -
      currentTypes(a).reduce((sum, type) => sum + type.total, 0),
  )
  return `${legend('Team current status legend', true)}<p class="chart-note">Each task completion fills one slot in its task-type colour. Approved tasks stay filled; reopened tasks return to dotted. Login duration is shown for every team member and capped at 19:00 IST; working time follows the same business-day close.</p><div class="employee-chart" role="list" aria-label="Current task status and attendance by team member">${sorted
    .map((e) => {
      const types = currentTypes(e),
        total = types.reduce((sum, type) => sum + type.total, 0),
        done = types.reduce((sum, type) => sum + type.done, 0)
      const slots = assignmentSlots(types)
      const counts = types.map((type) => `${type.label}: ${type.done} of ${type.total} complete`).join('; ')
      const today =
        Object.prototype.hasOwnProperty.call(e, 'todayFirstLoginAt') ||
        Object.prototype.hasOwnProperty.call(e, 'todayLoginSeconds')
      const loginLabel = today ? "Today's first login" : 'First login (historical fallback)'
      const loginAt = today ? e.todayFirstLoginAt : e.firstLoginAt
      const loginSeconds = today ? e.todayLoginSeconds : e.loginSeconds
      const role = e.role === 'Admin' ? 'Admin' : 'Employee'
      return `<div class="employee-row" role="listitem" aria-label="${esc(e.name)}, ${role}">
       <div class="employee-label">${renderAvatar(e)}<span>${renderName(e)} <small class="team-member-role">${role}</small></span><strong>${done} of ${total} completed (${total ? Math.round((done / total) * 100) : 0}%)</strong></div>
       <div class="assignment-track${slots.grouped ? ' assignment-track--grouped' : ''}" role="group" aria-label="${esc(e.name)}: ${done} completed of ${total}; Assigned ${n(e.assigned)}, In-progress ${n(e.inProgress)}, Completed ${n(e.completed)}, Approved ${n(e.approved)}${counts ? `; ${counts}` : ''}">${total ? slots.html : '<span class="assignment-empty">No tasks assigned</span>'}</div>
       ${total ? `<ul class="assignment-type-counts" aria-label="${esc(e.name)} task-type progress">${types.map((type) => `<li class="${colorClass(type.key)}">${type.label} <strong>${type.done}/${type.total}</strong> complete</li>`).join('')}</ul>` : ''}
          <div class="employee-attendance"><span>Assigned ${n(e.assigned)} · In-progress ${n(e.inProgress)} · Completed ${n(e.completed)} · Approved ${n(e.approved)}</span><span${today ? ` data-today-login="${esc(e.id)}"` : ''}>${loginLabel} <strong>${esc(loginClock(loginAt))}</strong></span><span>${n(e.loginDays)} login days in selected period</span><span${today ? ` data-today-duration="${esc(e.id)}"` : ''}>${duration(Math.min(n(loginSeconds), 19 * 3600))} logged${today ? ' today' : ' · selected period (historical fallback)'} · capped 19:00</span><small>Active work ${n(e.activeWork)} · Active rework ${n(e.activeRework)} · Historical iterations ${n(e.workCount)} / rework ${n(e.reworkCount)}</small></div>
     </div>`
    })
    .join('')}</div>`
}

function trendTypes(items, count) {
  const types = (Array.isArray(items) ? items : [])
    .map((item) => ({ ...categoryFor(item), count: n(item.count) }))
    .filter((type) => type.count)
  return types.reduce((sum, type) => sum + type.count, 0) === count
    ? types
    : count
      ? [{ ...taskCategory(''), count }]
      : []
}

const textCounts = (types) => types.map((type) => `${type.label}: ${type.count}`).join(' · ') || 'None'

function segment(type, count, state, context) {
  if (!count) return ''
  const detail = `${type.label} — ${count} ${state} ${context}`
  return `<span class="progress-segment ${colorClass(type.key)} ${state === 'open' ? 'progress-open' : 'progress-filled'}" style="flex:${count}" role="img" tabindex="0" aria-label="${esc(detail)}" title="${esc(detail)}" data-detail="${esc(detail)}"></span>`
}

function cohortTypes(row) {
  const total = n(row.total)
  const states = ['assigned', 'inProgress', 'completed', 'approved']
  const types = (Array.isArray(row.taskTypes) ? row.taskTypes : []).map((type) => ({
    ...categoryFor(type),
    total: n(type.total),
    assigned: n(type.assigned),
    inProgress: n(type.inProgress),
    completed: n(type.completed),
    approved: n(type.approved),
  }))
  if (
    types.reduce((sum, type) => sum + type.total, 0) === total &&
    types.every((type) => states.reduce((sum, state) => sum + type[state], 0) === type.total)
  )
    return types
  // Older payloads have only status totals; never synthesize extra capacity.
  const fallback = { ...taskCategory(''), total }
  for (const state of states) fallback[state] = n(row[state])
  return total && states.reduce((sum, state) => sum + fallback[state], 0) === total ? [fallback] : []
}

export function trendChart(rows, breakdownRows = [], assignmentRows = []) {
  const events = Array.isArray(rows) ? rows : []
  const cohorts = Array.isArray(assignmentRows) ? assignmentRows : []
  const map = new Map((Array.isArray(breakdownRows) ? breakdownRows : []).map((row) => [row.date, row]))
  const dates = events
    .map((row) => ({
      ...row,
      completedByType: trendTypes(map.get(row.date)?.completedByType, n(row.completed)),
      approvedByType: trendTypes(map.get(row.date)?.approvedByType, n(row.approved)),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const total = cohorts.reduce((sum, row) => sum + n(row.total), 0)
  const done = cohorts.reduce((sum, row) => sum + n(row.completed) + n(row.approved), 0)
  const open = cohorts.reduce((sum, row) => sum + n(row.assigned) + n(row.inProgress), 0)
  const completionRate = total ? Math.round((done / total) * 100) : 0
  const eventMax = Math.max(1, ...dates.flatMap((row) => [n(row.completed), n(row.approved)]))
  const barSize = (count) => Math.min(100, (n(count) / eventMax) * 100)
  const breakdown = (row, key) => textCounts(row[`${key}ByType`])
  const eventChart = (label, key, modifier) => {
    const description =
      key === 'completed' ? 'First Completed events by event date.' : 'First Approved events by event date.'
    const totalEvents = dates.reduce((sum, row) => sum + n(row[key]), 0)
    return `<section class="event-chart-panel ${modifier}" aria-labelledby="${key}-over-time-title"><div class="event-chart-heading"><div><p class="chart-kicker">Historical events</p><h4 id="${key}-over-time-title">${label}</h4></div><strong class="event-chart-total">${totalEvents} total</strong></div><p class="chart-note">${description}</p><div class="event-bar-list" role="list" aria-label="${esc(label)} by date">${dates
      .map((row) => {
        const count = n(row[key])
        const detail = `${row.date}: ${count} ${key === 'completed' ? 'Completed' : 'Approved'} events; ${breakdown(row, key)}`
        return `<div class="event-bar-row" role="listitem"><time datetime="${esc(row.date)}">${esc(row.date)}</time><div class="event-bar-track"><span class="event-bar-fill ${modifier}" style="--bar-size:${barSize(count)}%" role="img" tabindex="0" aria-label="${esc(detail)}" title="${esc(detail)}"></span></div><strong>${count}</strong></div>`
      })
      .join('')}</div></section>`
  }
  const pipeline = cohorts.length
    ? `<div class="pipeline-list" role="list" aria-label="Current assignment cohorts">${cohorts
        .map((cohort) => {
          const types = cohortTypes(cohort)
          const count = n(cohort.total)
          const completed = n(cohort.completed) + n(cohort.approved)
          const pending = n(cohort.assigned) + n(cohort.inProgress)
          const detail = `${cohort.date}: current assignment cohort with ${count} tasks; ${completed} completed or approved and ${pending} open`
          const segments = types
            .flatMap((type) => [
              segment(type, type.assigned, 'open', '(Assigned)'),
              segment(type, type.inProgress, 'open', '(In-progress)'),
              segment(type, type.completed, 'completed', '(Completed)'),
              segment(type, type.approved, 'approved', '(Approved)'),
            ])
            .join('')
          return `<article class="pipeline-cohort" role="listitem"><div class="pipeline-cohort-heading"><time datetime="${esc(cohort.date)}">${esc(cohort.date)}</time><span>Created cohort</span><strong>${count} ${count === 1 ? 'task' : 'tasks'}</strong></div><div class="cohort-track" role="img" aria-label="${esc(detail)}">${segments || '<span class="cohort-track-empty">No task status detail</span>'}</div><div class="cohort-statuses" aria-label="${esc(cohort.date)} current status counts"><span>Assigned <strong>${n(cohort.assigned)}</strong></span><span>In-progress <strong>${n(cohort.inProgress)}</strong></span><span>Completed <strong>${n(cohort.completed)}</strong></span><span>Approved <strong>${n(cohort.approved)}</strong></span></div><p class="progress-breakdown">${types.map((type) => `${esc(type.label)} ${n(type.completed) + n(type.approved)}/${type.total} complete`).join(' · ') || 'No task-type breakdown'}</p></article>`
        })
        .join('')}</div>`
    : '<p class="progress-empty" role="status">No current assignment cohorts in this range.</p>'
  const history = dates.length
    ? `<div class="historical-timeline" role="list" aria-label="Historical event timeline">${dates
        .map(
          (row) =>
            `<article class="historical-event" role="listitem"><div class="historical-event-heading"><time datetime="${esc(row.date)}">${esc(row.date)}</time><span>First transition events</span></div><div class="historical-event-counts"><span class="historical-completed">Completed <strong>${n(row.completed)}</strong></span><span class="historical-approved">Approved <strong>${n(row.approved)}</strong></span></div><p class="progress-breakdown">Completed by type: ${esc(breakdown(row, 'completed'))} · Approved by type: ${esc(breakdown(row, 'approved'))}</p></article>`,
        )
        .join('')}</div>`
    : '<p class="progress-empty" role="status">No first completion or approval events in this range.</p>'
  return `<div class="analytics-progress">
    <section class="progress-section analytics-summary" aria-labelledby="analytics-summary-title"><div class="analytics-section-heading"><div><p class="chart-kicker">Executive view</p><h3 id="analytics-summary-title">Work outcomes</h3><p class="chart-note">A concise view of current task state. Historical events below are measured by their first transition date and are not added to these current counts.</p></div></div><div class="progress-metrics analytics-summary-band" aria-label="Current work summary"><div class="analytics-summary-metric"><span>Created</span><strong>${total}</strong><small>current assignment capacity</small></div><div class="analytics-summary-metric"><span>Done</span><strong>${done}</strong><small>completed or approved now</small></div><div class="analytics-summary-metric"><span>Open</span><strong>${open}</strong><small>assigned or in-progress now</small></div><div class="analytics-summary-metric"><span>Completion rate</span><strong>${completionRate}%</strong><small>${done} of ${total} current tasks</small></div></div></section>
    <section class="progress-section analytics-trends" aria-labelledby="analytics-trends-title"><div class="analytics-section-heading"><div><p class="chart-kicker">Historical activity</p><h3 id="analytics-trends-title">Completed over time + Approved over time</h3><p class="chart-note">Each chart uses the first transition event for that date. Counts stay separate from current assignment cohorts.</p></div></div>${legend('Task type legend')}${dates.length ? `<div class="event-chart-grid">${eventChart('Completed over time', 'completed', 'completed')}${eventChart('Approved over time', 'approved', 'approved')}</div>` : '<p class="progress-empty" role="status">No completion or approval events in this range.</p>'}</section>
    <section class="progress-section current-pipeline" aria-labelledby="current-pipeline-title"><div class="analytics-section-heading"><div><p class="chart-kicker">Current state</p><h3 id="current-pipeline-title">Current work pipeline</h3><p class="chart-note">Assignment cohorts grouped by creation date. Filled segments are currently Completed or Approved; dotted segments are currently Assigned or In-progress. Reopened work stays open here.</p></div></div>${pipeline}<details class="chart-data"><summary>View current pipeline table</summary><div class="table-wrap"><table><caption>Current task states by assignment date and task type</caption><thead><tr><th scope="col">Created</th><th scope="col">Total</th><th scope="col">Assigned</th><th scope="col">In-progress</th><th scope="col">Completed</th><th scope="col">Approved</th><th scope="col">Task types (complete / total)</th></tr></thead><tbody>${
      cohorts
        .map(
          (row) =>
            `<tr><th scope="row">${esc(row.date)}</th><td>${n(row.total)}</td><td>${n(row.assigned)}</td><td>${n(row.inProgress)}</td><td>${n(row.completed)}</td><td>${n(row.approved)}</td><td>${
              cohortTypes(row)
                .map((type) => `${esc(type.label)}: ${n(type.completed) + n(type.approved)}/${type.total}`)
                .join(' · ') || 'None'
            }</td></tr>`,
        )
        .join('') || '<tr><td colspan="7">No current assignment cohorts in this range.</td></tr>'
    }</tbody></table></div></details></section>
    <section class="progress-section historical-section" aria-labelledby="historical-events-title"><div class="analytics-section-heading"><div><p class="chart-kicker">Event history</p><h3 id="historical-events-title">Historical event timeline</h3><p class="chart-note">First Completed and First Approved events can belong to tasks created before this period. Event counts are not distinct-task totals and are never added to created, done, or open.</p></div></div>${history}<details class="chart-data"><summary>View historical event table</summary><div class="table-wrap"><table><caption>First completion and approval events by date and task type</caption><thead><tr><th scope="col">Date</th><th scope="col">Completed</th><th scope="col">Task types completed</th><th scope="col">Approved</th><th scope="col">Task types approved</th></tr></thead><tbody>${dates.map((row) => `<tr><th scope="row">${esc(row.date)}</th><td>${n(row.completed)}</td><td>${esc(textCounts(row.completedByType))}</td><td>${n(row.approved)}</td><td>${esc(textCounts(row.approvedByType))}</td></tr>`).join('') || '<tr><td colspan="5">No first completion or approval events in this range.</td></tr>'}</tbody></table></div></details></section>
  </div>`
}
