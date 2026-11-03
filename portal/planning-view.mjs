import {
  calendarItems,
  deadlineDate,
  filterCalendarTasks,
  groupTasksByMonth,
  monthLabel,
  planningSummary,
} from './planning.mjs'
import { sortTasks, taskStateClass } from './task-presentation.mjs'

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  )
const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`
const dateLabel = (date) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
const control = (label, action, id = '', extra = '') =>
  `<button type="button" class="small" data-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`
const monthArrow = (forward) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${forward ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'}"/></svg>`
const select = (name, label, choices, value) =>
  `<label class="field"><span>${label}</span><select data-calendar-filter="${name}" aria-label="${label}">${choices
    .map(([id, text]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(text)}</option>`)
    .join('')}</select></label>`

function taskStatus(task) {
  return task.overdue && ['Assigned', 'In-progress'].includes(task.state) ? `Overdue · ${task.state}` : task.state
}

function taskRow(task, snapshot) {
  const person = [...(snapshot.profileGlimpses || []), ...(snapshot.employees || [])].find(
    (person) => person.id === task.assigneeId,
  )
  const client = (snapshot.clients || []).find((client) => client.id === task.clientId)
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(task.deadline))
  return `<button type="button" class="planning-task-row ${taskStateClass(task)}" data-action="calendar-task" data-id="${esc(task.id)}"><span class="planning-row-time">${esc(dateLabel(deadlineDate(task.deadline)))} · ${esc(time)}</span><strong>${esc(task.title)}</strong><span class="planning-row-meta">${esc(client?.name || 'No client')} · ${esc(person?.name || 'Team member')}</span><span class="planning-row-meta"><span class="planning-status">${esc(taskStatus(task))}</span> · ${esc(task.priority || 'Normal')} priority</span></button>`
}

function eventRow(event, isAdmin) {
  return `<article class="planning-event-row"><span class="planning-row-time">${esc(event.time || 'All day')} · Shared event</span><h3>${esc(event.title)}</h3>${event.description ? `<p>${esc(event.description)}</p>` : ''}${isAdmin ? `<div class="actions">${control('Edit', 'event-edit', event.id)}${control('Delete', 'event-delete', event.id)}</div>` : ''}</article>`
}

export function renderCalendar({ snapshot, user, month, selectedDate, filters = {}, summaryView = '' }) {
  const isAdmin = user.role === 'Admin'
  const scope = filters.scope || (isAdmin ? 'all' : 'mine')
  const tasks = filterCalendarTasks(snapshot.tasks || [], user, filters)
  const items = calendarItems(tasks, snapshot.calendarEvents || [])
  const summary = planningSummary(tasks, snapshot.today)
  const monthItems = items.filter((item) => item.date.startsWith(`${month}-`))
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const offset = (first.getUTCDay() + 6) % 7
  const itemMap = new Map()
  for (const item of monthItems) {
    if (!itemMap.has(item.date)) itemMap.set(item.date, [])
    itemMap.get(item.date).push(item)
  }
  const cells = [...Array(offset).fill(''), ...Array.from({ length: days }, (_, i) => String(i + 1))]
    .map((day) => {
      if (!day) return '<span class="planning-day-blank" aria-hidden="true"></span>'
      const date = `${month}-${day.padStart(2, '0')}`
      const entries = itemMap.get(date) || []
      const taskCount = entries.filter((item) => item.type === 'task').length
      const eventCount = entries.length - taskCount
      const counts = [taskCount ? countLabel(taskCount, 'task') : '', eventCount ? countLabel(eventCount, 'event') : '']
        .filter(Boolean)
        .join(', ')
      const selected = date === selectedDate && !summaryView
      const tones = [
        ...new Set(entries.map((item) => (item.type === 'task' ? taskStateClass(item.task) : 'planning-shared-event'))),
      ]
      return `<button type="button" class="planning-day ${date === snapshot.today ? 'is-today' : ''} ${selected ? 'is-selected' : ''}" data-action="calendar-day" data-id="${date}" aria-label="${esc(dateLabel(date))}${counts ? `, ${counts}` : ', no deadlines or events'}" aria-pressed="${selected}" ${date === snapshot.today ? 'aria-current="date"' : ''}><span class="planning-day-number">${day}</span>${counts ? `<span class="planning-day-count">${esc(counts)}</span>` : ''}<span class="planning-day-entries">${entries
        .slice(0, 2)
        .map(
          (item) =>
            `<span class="planning-day-entry ${item.type === 'task' ? taskStateClass(item.task) : 'planning-shared-event'}"><span aria-hidden="true" class="planning-dot"></span>${esc(item.title)}</span>`,
        )
        .join(
          '',
        )}${entries.length > 2 ? `<span class="planning-more">+${entries.length - 2} more</span>` : ''}</span><span class="planning-day-signals" aria-hidden="true">${tones.map((tone) => `<span class="planning-dot ${tone}"></span>`).join('')}</span></button>`
    })
    .join('')
  const summaryLabels = { overdue: 'Overdue', today: 'Due today', next: 'Next 7 days' }
  const agendaItems = summaryView
    ? (summary[summaryView] || []).map((task) => ({ type: 'task', task }))
    : items.filter((item) => item.date === selectedDate)
  const agendaTitle = summaryView ? summaryLabels[summaryView] : dateLabel(selectedDate)
  const summaryHtml = Object.entries(summaryLabels)
    .map(
      ([key, label]) =>
        `<button type="button" class="planning-summary ${key === 'overdue' && summary[key].length ? 'has-overdue' : ''}" data-action="calendar-summary" data-id="${key}" aria-pressed="${summaryView === key}"><span>${label}</span><strong>${summary[key].length}</strong><small>${key === 'next' ? 'Tomorrow through the next 7 days' : key === 'overdue' ? 'Unfinished tasks, including past months' : 'Unfinished tasks due today'}</small></button>`,
    )
    .join('')
  const statuses = [
    ['all', 'All statuses'],
    ['active', 'Unfinished'],
    ['overdue', 'Overdue'],
    ['In-progress', 'In-progress'],
    ['Assigned', 'Assigned'],
    ['Completed', 'Completed'],
    ['Approved', 'Approved'],
  ]
  const filtersHtml =
    select(
      'scope',
      'Task visibility',
      [
        ['mine', 'My tasks'],
        ['all', 'All team tasks'],
      ],
      scope,
    ) +
    select('status', 'Task status', statuses, filters.status || 'all') +
    select(
      'clientId',
      'Client',
      [['', 'All clients'], ...(snapshot.clients || []).map((client) => [client.id, client.name])],
      filters.clientId || '',
    ) +
    (isAdmin
      ? select(
          'assigneeId',
          'Assignee',
          [['', 'All assignees'], ...(snapshot.employees || []).map((person) => [person.id, person.name])],
          filters.assigneeId || '',
        )
      : '')
  const monthTaskCount = monthItems.filter((item) => item.type === 'task').length
  return `<div class="planning-summary-grid" aria-label="Deadline overview">${summaryHtml}</div><div class="planning-filters">${filtersHtml}</div><div class="planning-layout"><section class="calendar-month planning-month" aria-label="Deadline calendar"><div class="calendar-month-head"><div><h2>${monthLabel(month)}</h2><p class="fine">${countLabel(monthTaskCount, 'deadline')} · Times in IST</p></div><div class="actions">${control(monthArrow(false), 'calendar-prev', '', 'aria-label="Previous month"')}${control('Today', 'calendar-today')}${control(monthArrow(true), 'calendar-next', '', 'aria-label="Next month"')}</div></div><div class="calendar-weekdays">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<span>${day}</span>`).join('')}</div><div class="planning-days">${cells}</div><div class="planning-legend" aria-label="Calendar legend">${[
    ['task-state--overdue', 'Overdue'],
    ['task-state--in-progress', 'In-progress'],
    ['task-state--assigned', 'Assigned'],
    ['task-state--completed', 'Completed'],
    ['task-state--approved', 'Approved'],
    ['planning-shared-event', 'Event'],
  ]
    .map(
      ([tone, label]) => `<span class="${tone}"><span class="planning-dot" aria-hidden="true"></span>${label}</span>`,
    )
    .join(
      '',
    )}</div></section><section class="panel planning-agenda" aria-label="Selected day agenda"><div class="panel-head"><h2>${summaryView ? '' : 'Agenda · '}${esc(agendaTitle)}</h2><span class="fine">${countLabel(agendaItems.length, 'item')}</span></div>${summaryView ? `<p class="fine">Across all deadline months · IST</p>` : '<p class="fine">Deadlines and shared events · IST</p>'}<div class="planning-agenda-list">${
    agendaItems
      .map((item) => (item.type === 'task' ? taskRow(item.task, snapshot) : eventRow(item.event, isAdmin)))
      .join('') ||
    `<p class="empty">${summaryView ? 'No unfinished tasks in this group.' : 'No deadlines or events on this date.'}</p>`
  }</div><p class="fine planning-agenda-help">Select a date to plan your day. Open a task for details and available actions.${!isAdmin && scope === 'all' ? ' Colleagues’ tasks are read-only.' : ''}</p></section></div>`
}

export function renderAssignmentGroups(snapshot, month, renderCard, button) {
  const groups = groupTasksByMonth(snapshot.tasks || [], snapshot.today, sortTasks)
  const visible = month === 'all' ? groups : groups.filter((group) => group.month === month)
  return (
    visible
      .map(
        (group) =>
          `<section class="assignment-month" data-assignment-month="${esc(group.month)}"><div class="assignment-month-heading"><h3>${esc(group.label)}</h3><span class="fine">${countLabel(group.tasks.length, 'task')}${group.month === snapshot.today.slice(0, 7) ? ' · Current month' : ''}</span></div><div class="assignment-month-tasks">${group.tasks
            .map(
              (task) =>
                `<div>${renderCard(task)}<div class="actions deadline-action">${button('Adjust deadline', 'deadline', task.id, 'small')}${snapshot.user?.role === 'Admin' ? button('Delete task', 'task-delete', task.id, 'small danger') : ''}</div></div>`,
            )
            .join('')}</div></section>`,
      )
      .join('') || '<p class="empty">No tasks assigned for this month.</p>'
  )
}
