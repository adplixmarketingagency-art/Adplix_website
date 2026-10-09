import { TASK_CATEGORIES, taskCategory } from '../src/portal/task-categories.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const n = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const colorClass = key => `task-type-${key}`;
const duration = value => `${Math.floor(n(value) / 3600)}h ${Math.floor((n(value) % 3600) / 60)}m`;
const loginClock = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date(value)) : '—';
const categoryFor = item => TASK_CATEGORIES.find(category => category.key === item.key) || taskCategory(item.label);

function legend(label, pending = false) {
  return `<div class="chart-legend task-category-legend" role="group" aria-label="${esc(label)}">${TASK_CATEGORIES.map(category => `<span class="${colorClass(category.key)}">${esc(category.label)}</span>`).join('')}${pending ? '<span class="assignment-pending">Assigned / In-progress (dotted)</span><span class="assignment-filled">Completed / Approved (filled)</span>' : ''}</div>`;
}

function currentTypes(employee) {
  const types = Array.isArray(employee.taskTypes) ? employee.taskTypes : [];
  if (types.length) return types.map(type => ({ ...categoryFor(type), total: n(type.total), done: Math.min(n(type.total), n(type.completed) + n(type.approved)) })).filter(type => type.total);
  const total = ['assigned', 'inProgress', 'completed', 'approved'].reduce((sum, key) => sum + n(employee[key]), 0);
  return total ? [{ ...taskCategory(''), total, done: n(employee.completed) + n(employee.approved) }] : [];
}

function assignmentSlots(types) {
  // Keep individual task slots for small workloads. Larger workloads use exact
  // count-weighted groups so no tasks are clipped or lost on narrow screens.
  const grouped = types.reduce((sum, type) => sum + type.total, 0) > 40;
  const segments = (type, count, state) => {
    const stateText = state === 'filled' ? 'completed/approved' : 'assigned/in-progress';
    const title = `${type.label} — ${count} ${stateText}`;
    return grouped
       ? (count ? `<span class="assignment-slot assignment-group ${colorClass(type.key)} ${state}" data-count="${count}" style="flex:${count}" role="img" tabindex="0" title="${esc(title)}" aria-label="${esc(title)}"></span>` : '')
       : Array.from({ length: count }, () => `<span class="assignment-slot ${colorClass(type.key)} ${state}" data-count="1" role="img" tabindex="0" title="${esc(type.label)} — 1 ${stateText}" aria-label="${esc(type.label)} — 1 ${stateText}"></span>`).join('');
  };
  return { grouped, html: types.map(type => segments(type, type.done, 'filled')).join('') + types.map(type => segments(type, type.total - type.done, 'pending')).join('') };
}

export function employeeChart(rows) {
  const sorted = [...rows].sort((a, b) => currentTypes(b).reduce((sum, type) => sum + type.total, 0) - currentTypes(a).reduce((sum, type) => sum + type.total, 0));
  return `${legend('Employee current status legend', true)}<p class="chart-note">Each task completion fills one slot in its task-type colour. Approved tasks stay filled; reopened tasks return to dotted. Login duration is capped at 17:30 IST.</p><div class="employee-chart" role="list" aria-label="Current task status and attendance by employee">${sorted.map(e => {
    const types = currentTypes(e), total = types.reduce((sum, type) => sum + type.total, 0), done = types.reduce((sum, type) => sum + type.done, 0);
    const slots = assignmentSlots(types);
    const counts = types.map(type => `${type.label}: ${type.done} of ${type.total} complete`).join('; ');
     const today = Object.prototype.hasOwnProperty.call(e, 'todayFirstLoginAt') || Object.prototype.hasOwnProperty.call(e, 'todayLoginSeconds');
     const loginLabel = today ? "Today's first login" : 'First login (historical fallback)';
     const loginAt = today ? e.todayFirstLoginAt : e.firstLoginAt;
     const loginSeconds = today ? e.todayLoginSeconds : e.loginSeconds;
     return `<div class="employee-row" role="listitem">
      <div class="employee-label"><span>${esc(e.name)}</span><strong>${done} of ${total} completed (${total ? Math.round(done / total * 100) : 0}%)</strong></div>
       <div class="assignment-track${slots.grouped ? ' assignment-track--grouped' : ''}" role="group" aria-label="${esc(e.name)}: ${done} completed of ${total}; Assigned ${n(e.assigned)}, In-progress ${n(e.inProgress)}, Completed ${n(e.completed)}, Approved ${n(e.approved)}${counts ? `; ${counts}` : ''}">${total ? slots.html : '<span class="assignment-empty">No tasks assigned</span>'}</div>
      ${total ? `<ul class="assignment-type-counts" aria-label="${esc(e.name)} task-type progress">${types.map(type => `<li class="${colorClass(type.key)}">${type.label} <strong>${type.done}/${type.total}</strong> complete</li>`).join('')}</ul>` : ''}
        <div class="employee-attendance"><span>Assigned ${n(e.assigned)} · In-progress ${n(e.inProgress)} · Completed ${n(e.completed)} · Approved ${n(e.approved)}</span><span${today ? ` data-today-login="${esc(e.id)}"` : ''}>${loginLabel} <strong>${esc(loginClock(loginAt))}</strong></span><span>${n(e.loginDays)} login days in selected period</span><span${today ? ` data-today-duration="${esc(e.id)}"` : ''}>${duration(Math.min(n(loginSeconds), 17.5 * 3600))} logged${today ? " today" : " · selected period (historical fallback)"} · capped 17:30</span><small>Active work ${n(e.activeWork)} · Active rework ${n(e.activeRework)} · Historical iterations ${n(e.workCount)} / rework ${n(e.reworkCount)}</small></div>
    </div>`;
  }).join('')}</div>`;
}

function trendTypes(items, count) {
  const types = (Array.isArray(items) ? items : []).map(item => ({ ...categoryFor(item), count: n(item.count) })).filter(type => type.count);
  return types.reduce((sum, type) => sum + type.count, 0) === count ? types : count ? [{ ...taskCategory(''), count }] : [];
}

const textCounts = types => types.map(type => `${type.label}: ${type.count}`).join(' · ') || 'None';

function segment(type, count, state, context) {
  if (!count) return '';
  const detail = `${type.label} — ${count} ${state} ${context}`;
  return `<span class="progress-segment ${colorClass(type.key)} ${state === 'open' ? 'progress-open' : 'progress-filled'}" style="flex:${count}" role="img" tabindex="0" aria-label="${esc(detail)}" title="${esc(detail)}" data-detail="${esc(detail)}"></span>`;
}

function cohortTypes(row) {
  const total = n(row.total);
  const states = ['assigned', 'inProgress', 'completed', 'approved'];
  const types = (Array.isArray(row.taskTypes) ? row.taskTypes : []).map(type => ({
    ...categoryFor(type), total: n(type.total),
    assigned: n(type.assigned), inProgress: n(type.inProgress), completed: n(type.completed), approved: n(type.approved)
  }));
  // Older payloads have only status totals; never synthesize extra capacity.
  if (types.reduce((sum, type) => sum + type.total, 0) === total && types.every(type => states.reduce((sum, state) => sum + type[state], 0) === type.total)) return types;
  const fallback = { ...taskCategory(''), total };
  for (const state of states) fallback[state] = n(row[state]);
  return total && states.reduce((sum, state) => sum + fallback[state], 0) === total ? [fallback] : [];
}

function progressRow(label, count, max, segments, detail) {
  return `<div class="progress-row"><span class="progress-label">${label}</span><div class="progress-bar-area"><div class="progress-track" style="width:${count ? count / max * 100 : 0}%" role="group" aria-label="${esc(detail)}">${segments}</div></div><strong class="progress-count">${count}</strong></div>`;
}

export function trendChart(rows, breakdownRows = [], assignmentRows = []) {
  const events = Array.isArray(rows) ? rows : [];
  const cohorts = Array.isArray(assignmentRows) ? assignmentRows : [];
  const map = new Map((Array.isArray(breakdownRows) ? breakdownRows : []).map(row => [row.date, row]));
  const dates = events.map(row => ({ ...row,
    completedByType: trendTypes(map.get(row.date)?.completedByType, n(row.completed)),
    approvedByType: trendTypes(map.get(row.date)?.approvedByType, n(row.approved)) }));
  const total = cohorts.reduce((sum, row) => sum + n(row.total), 0);
  const done = cohorts.reduce((sum, row) => sum + n(row.completed) + n(row.approved), 0);
  const open = cohorts.reduce((sum, row) => sum + n(row.assigned) + n(row.inProgress), 0);
  const cohortMax = Math.max(1, ...cohorts.map(row => n(row.total)));
  const eventMax = Math.max(1, ...dates.flatMap(row => [n(row.completed), n(row.approved)]));
  const cohortsByDate = new Map(cohorts.map(row => [row.date, row]));
  const eventsByDate = new Map(dates.map(row => [row.date, row]));
  const timelineDates = [...new Set([...cohortsByDate.keys(), ...eventsByDate.keys()])].sort((a, b) => String(a).localeCompare(String(b)));
  return `<div class="analytics-progress">
    <section class="progress-section" aria-label="Current assignment-date progress and historical first events by date"><h3>Task progress and first events by date</h3><p class="chart-note">Current tasks are grouped by creation date in the selected period: filled = currently Completed or Approved; dotted = currently Assigned or In-progress. Reopened work returns to dotted. First Completed and First Approved are historical events by first transition date, including tasks created before this period. A task may appear once in each event state. Event counts are not a distinct-task total or assigned capacity and are not added to current task counts. Bar lengths use separate scales for current tasks and first events.</p>
      <div class="progress-metrics"><span><strong>${total}</strong> tasks created</span><span><strong>${done}</strong> currently completed / approved</span><span><strong>${open}</strong> currently open</span></div>
      ${legend('Task types, current task status, and first-event types', true)}
      ${timelineDates.length ? `<div class="progress-list" role="list" aria-label="Current assignment-date progress and first events by date">${timelineDates.map(date => {
        const cohort = cohortsByDate.get(date), event = eventsByDate.get(date);
        let current = '';
        if (cohort) {
          const types = cohortTypes(cohort), count = n(cohort.total), completed = n(cohort.completed) + n(cohort.approved);
          const openParts = types.flatMap(type => [segment(type, type.assigned, 'open', '(Assigned)'), segment(type, type.inProgress, 'open', '(In-progress)')]).join('');
          const filledParts = types.flatMap(type => [segment(type, type.completed, 'completed', '(current)'), segment(type, type.approved, 'approved', '(current)')]).join('');
          current = `${progressRow('Current tasks', count, cohortMax, filledParts + openParts, `${date}: current assignment-date progress, ${completed} completed or approved, ${n(cohort.assigned) + n(cohort.inProgress)} open of ${count}`)}<p class="progress-breakdown">Current state: ${completed}/${count} complete · ${count ? Math.round(completed / count * 100) : 0}% · ${types.map(type => `${esc(type.label)} ${n(type.completed) + n(type.approved)}/${type.total}`).join(' · ') || 'No task-type breakdown'}</p>`;
        }
        const historical = event ? `${progressRow('First Completed', n(event.completed), eventMax, event.completedByType.map(type => segment(type, type.count, 'completed', 'first event')).join(''), `${date}: ${n(event.completed)} first Completed events`)}${progressRow('First Approved', n(event.approved), eventMax, event.approvedByType.map(type => segment(type, type.count, 'approved', 'first event')).join(''), `${date}: ${n(event.approved)} first Approved events`)}` : '';
        return `<div class="progress-date" role="listitem"><div class="progress-date-heading"><time>${esc(date)}</time></div>${current}${historical}</div>`;
      }).join('')}</div>` : '<p class="progress-empty">No tasks created or first completion or approval events in this range.</p>'}
      ${!cohorts.length && dates.length ? '<p class="chart-note">No tasks created in this range.</p>' : ''}
      ${!dates.length && cohorts.length ? '<p class="chart-note">No first completion or approval events in this range.</p>' : ''}
      <details class="chart-data"><summary>View assignment-date counts</summary><div class="table-wrap"><table><caption>Current task states by assignment date and task type</caption><thead><tr><th scope="col">Created</th><th scope="col">Total</th><th scope="col">Assigned</th><th scope="col">In-progress</th><th scope="col">Completed</th><th scope="col">Approved</th><th scope="col">Task types (complete / total)</th></tr></thead><tbody>${cohorts.map(row => `<tr><th scope="row">${esc(row.date)}</th><td>${n(row.total)}</td><td>${n(row.assigned)}</td><td>${n(row.inProgress)}</td><td>${n(row.completed)}</td><td>${n(row.approved)}</td><td>${cohortTypes(row).map(type => `${esc(type.label)}: ${n(type.completed) + n(type.approved)}/${type.total}`).join(' · ') || 'None'}</td></tr>`).join('') || '<tr><td colspan="7">No tasks created in this range.</td></tr>'}</tbody></table></div></details>
      <details class="chart-data"><summary>View event-date counts</summary><div class="table-wrap"><table><caption>First completion and approval events by date and task type</caption><thead><tr><th scope="col">Date</th><th scope="col">Completed</th><th scope="col">Task types completed</th><th scope="col">Approved</th><th scope="col">Task types approved</th></tr></thead><tbody>${dates.map(row => `<tr><th scope="row">${esc(row.date)}</th><td>${n(row.completed)}</td><td>${esc(textCounts(row.completedByType))}</td><td>${n(row.approved)}</td><td>${esc(textCounts(row.approvedByType))}</td></tr>`).join('') || '<tr><td colspan="5">No first completion or approval events in this range.</td></tr>'}</tbody></table></div></details>
    </section></div>`;
}
