const DAY = 86_400_000
const IST_OFFSET = 330 * 60_000
const activeStates = new Set(['Assigned', 'In-progress'])

export function deadlineDate(value) {
  if (!value) return ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp + IST_OFFSET).toISOString().slice(0, 10) : ''
}

export function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return 'No deadline'
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  )
}

export function shiftMonth(month, offset) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

export function groupTasksByMonth(tasks, today, sort) {
  const groups = new Map()
  for (const task of tasks) {
    const month = deadlineDate(task.deadline).slice(0, 7)
    if (!groups.has(month)) groups.set(month, [])
    groups.get(month).push(task)
  }
  const currentMonth = today.slice(0, 7)
  return [...groups.keys()]
    .sort((a, b) => {
      if (a === b) return 0
      if (a === currentMonth) return -1
      if (b === currentMonth) return 1
      if (!a || !b) return a ? -1 : 1
      return b.localeCompare(a)
    })
    .map((month) => ({ month, label: monthLabel(month), tasks: sort(groups.get(month)) }))
}

export function filterCalendarTasks(tasks, user, filters = {}) {
  return tasks.filter((task) => {
    if ((filters.scope || (user.role === 'Admin' ? 'all' : 'mine')) === 'mine' && task.assigneeId !== user.id)
      return false
    if (filters.clientId && task.clientId !== filters.clientId) return false
    if (user.role === 'Admin' && filters.assigneeId && task.assigneeId !== filters.assigneeId) return false
    const status = filters.status || 'all'
    if (status === 'overdue') return task.overdue && activeStates.has(task.state)
    if (status === 'active') return activeStates.has(task.state)
    return status === 'all' || task.state === status
  })
}

export function calendarItems(tasks, events) {
  return [
    ...tasks.flatMap((task) => {
      const date = deadlineDate(task.deadline)
      if (!date) return []
      const time = new Date(Date.parse(task.deadline) + IST_OFFSET).toISOString().slice(11, 16)
      return [{ type: 'task', id: task.id, date, time, title: task.title, task }]
    }),
    ...events.map((event) => ({ ...event, type: 'event', time: event.time || '', event })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.title.localeCompare(b.title) ||
      String(a.id).localeCompare(String(b.id)),
  )
}

export function planningSummary(tasks, today) {
  const nextWeek = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * DAY).toISOString().slice(0, 10)
  const active = tasks.filter((task) => activeStates.has(task.state) && deadlineDate(task.deadline))
  const byDeadline = (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline) || String(a.id).localeCompare(b.id)
  return {
    overdue: active.filter((task) => task.overdue).sort(byDeadline),
    today: active.filter((task) => deadlineDate(task.deadline) === today).sort(byDeadline),
    next: active
      .filter((task) => {
        const date = deadlineDate(task.deadline)
        return date > today && date <= nextWeek
      })
      .sort(byDeadline),
  }
}

// Compare only rendered planning data; timers, attendance and inbox changes
// must not redraw these views or interrupt a focused control.
export function planningSignature(snapshot) {
  return JSON.stringify({
    today: snapshot.today,
    tasks: (snapshot.tasks || []).map(
      ({
        id,
        title,
        description,
        assigneeId,
        clientId,
        jobFunction,
        deadline,
        priority,
        state,
        overdue,
        version,
        createdAt,
        rating,
        ratingNote,
      }) => ({
        id,
        title,
        description,
        assigneeId,
        clientId,
        jobFunction,
        deadline,
        priority,
        state,
        overdue,
        version,
        createdAt,
        rating,
        ratingNote,
      }),
    ),
    events: snapshot.calendarEvents,
    clients: (snapshot.clients || []).map(({ id, name }) => ({ id, name })),
    people: (snapshot.profileGlimpses || []).map(({ id, name }) => ({ id, name })),
    employees: (snapshot.employees || []).map(({ id, name }) => ({ id, name })),
  })
}
