import { businessDate, dailyUpdateStatus, decorateTask, loginSeconds, currentLoginRecord } from './domain.mjs'
import { TASK_CATEGORIES, taskCategory } from './task-categories.mjs'

// Date filters select task counts by creation business date; trend dates select event business dates.
// Durations are per-task and can overlap across concurrent tasks, never attendance.
function invalid(message) {
  const error = new RangeError(message)
  error.status = 400
  throw error
}

export function buildAnalytics(snapshot, filters = {}, now = new Date()) {
  const current = new Date(now)
  if (!Number.isFinite(current.getTime())) invalid('Invalid timestamp')
  const { month, year, employeeId, clientId, jobFunction, state } = filters
  let { from, to } = filters
  if (month !== undefined && (typeof month !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)))
    invalid('Invalid month filter')
  if (year !== undefined && (typeof year !== 'string' || !/^(?!0000)\d{4}$/.test(year))) invalid('Invalid year filter')
  if (employeeId !== undefined && (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 100))
    invalid('Invalid employee filter')
  if ((month && year && month.slice(0, 4) !== year) || ((month || year) && (from !== undefined || to !== undefined)))
    invalid('Conflicting date filters')
  if (month) {
    from = `${month}-01`
    const last = new Date(`${month}-01T00:00:00Z`)
    last.setUTCMonth(last.getUTCMonth() + 1)
    last.setUTCDate(0)
    to = last.toISOString().slice(0, 10)
  } else if (year) {
    from = `${year}-01-01`
    to = `${year}-12-31`
  }
  const validDate = (date) =>
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  for (const date of [from, to]) if (date !== undefined && !validDate(date)) invalid('Invalid date filter')
  if (from && to && from > to) invalid('Invalid date range')
  const today = businessDate(current)
  const anchor = to && to < today ? to : today
  const minDate = new Date(Date.parse(`${anchor}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10)
  if (from && Date.parse(`${to || anchor}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86_400_000)
    invalid('Reporting range too large')
  const inRange = (date) => (!from || date >= from) && (!to || date <= to)
  const absences = snapshot.absences || []
  const scopedTasks = (snapshot.tasks || []).filter(
    (task) =>
      (!employeeId || task.assigneeId === employeeId) &&
      (!clientId || task.clientId === clientId) &&
      (!jobFunction || task.jobFunction === jobFunction) &&
      (!state || task.state === state),
  )
  const tasks = scopedTasks
    .filter((task) => inRange(businessDate(task.createdAt)))
    .map((task) => decorateTask(task, absences, current))
  const completions = (task) =>
    (task.events || []).filter((e) => e.to === 'Completed' && e.from !== e.to && e.kind !== 'deadline').length
  const stats = (group) => {
    const completed = group.filter((t) => t.completedAt)
    const onTime = completed.filter((t) => new Date(t.completedAt).getTime() <= new Date(t.deadline).getTime()).length
    const seconds = completed.map((t) => t.workSeconds).sort((a, b) => a - b)
    const mid = Math.floor(seconds.length / 2)
    const rework = (t) => (t.events || []).some((e) => e.kind === 'rejection' || e.kind === 'reopen')
    const active = group.filter((t) => t.state === 'Assigned' || t.state === 'In-progress')
    const rated = group.filter((t) => Number.isInteger(t.rating) && t.rating >= 1 && t.rating <= 5)
    const taskTypes = TASK_CATEGORIES.map((category) => {
      const matching = group.filter((t) => taskCategory(t.jobFunction).key === category.key)
      return {
        key: category.key,
        label: category.label,
        total: matching.length,
        assigned: matching.filter((t) => t.state === 'Assigned').length,
        inProgress: matching.filter((t) => t.state === 'In-progress').length,
        completed: matching.filter((t) => t.state === 'Completed').length,
        approved: matching.filter((t) => t.state === 'Approved').length,
      }
    }).filter((category) => category.total)
    return {
      taskTypes,
      assigned: group.filter((t) => t.state === 'Assigned').length,
      inProgress: group.filter((t) => t.state === 'In-progress').length,
      completed: group.filter((t) => t.state === 'Completed').length,
      approved: group.filter((t) => t.state === 'Approved').length,
      activeWork: active.filter((t) => !rework(t)).length,
      activeRework: active.filter(rework).length,
      averageRating: rated.length ? rated.reduce((sum, t) => sum + t.rating, 0) / rated.length : 0,
      ratingCount: rated.length,
      overdue: group.filter((t) => t.overdue).length,
      onTimeRate: completed.length ? onTime / completed.length : 0,
      workCount: group.reduce((n, t) => n + completions(t), 0),
      reworkCount: group.reduce((n, t) => n + Math.max(0, completions(t) - 1), 0),
      workSeconds: group.reduce((sum, t) => sum + t.workSeconds, 0),
      medianWorkSeconds: seconds.length ? (seconds[mid] + seconds[Math.floor((seconds.length - 1) / 2)]) / 2 : 0,
    }
  }
  const trend = new Map()
  const breakdown = new Map()
  // Trend counts represent unique task presence, rather than work iterations.
  // Choose the first transition across the task's full history before applying
  // the date filter, so a reopened task cannot reappear as a new completion in
  // a later reporting window.
  for (const task of scopedTasks) {
    const firstByTransition = new Map()
    for (const event of task.events || []) {
      if (
        !(event.to === 'Completed' || event.to === 'Approved') ||
        event.from === event.to ||
        event.kind === 'deadline' ||
        firstByTransition.has(event.to)
      )
        continue
      firstByTransition.set(event.to, { event, date: businessDate(event.at) })
    }
    for (const [transition, { date }] of firstByTransition) {
      if (!inRange(date)) continue
      const bucket = trend.get(date) || { date, completed: 0, approved: 0 }
      bucket[transition === 'Completed' ? 'completed' : 'approved']++
      trend.set(date, bucket)
      const categories = breakdown.get(date) || { date, completedByType: new Map(), approvedByType: new Map() }
      const byType = transition === 'Completed' ? categories.completedByType : categories.approvedByType
      const key = taskCategory(task.jobFunction).key
      byType.set(key, (byType.get(key) || 0) + 1)
      breakdown.set(date, categories)
    }
  }
  const scopedIds = new Set(tasks.map((t) => t.assigneeId))
  const employees = (snapshot.employees || [])
    .filter((e) => (!employeeId || e.id === employeeId) && (!(clientId || jobFunction || state) || scopedIds.has(e.id)))
    .map((e) => {
      const group = tasks.filter((t) => t.assigneeId === e.id)
      const role = e.role === 'Admin' ? 'Admin' : 'Employee'
      const updates =
        role === 'Employee' ? (snapshot.updates || []).filter((u) => u.employeeId === e.id && inRange(u.date)) : []
      const counts = { updateOnTime: 0, updateLate: 0, updateMissing: 0, updateExempt: 0 }
      if (role === 'Employee') {
        const firstKnown =
          [e.createdAt && businessDate(e.createdAt), ...updates.map((u) => u.date)].filter(Boolean).sort()[0] || anchor
        const start = from || (firstKnown > minDate ? firstKnown : minDate)
        const end = anchor
        const first = Date.parse(`${start}T00:00:00Z`),
          last = Date.parse(`${end}T00:00:00Z`)
        if ((last - first) / 86_400_000 > 366) invalid('Reporting range too large')
        for (let day = first; day <= last; day += 86_400_000) {
          const date = new Date(day).toISOString().slice(0, 10)
          const at = date === today ? current : `${date}T19:00:00+05:30`
          const status = dailyUpdateStatus(e.id, updates, absences, at, e).status
          if (status === 'on-time') counts.updateOnTime++
          else if (status === 'late') counts.updateLate++
          else if (status === 'exempt') counts.updateExempt++
          else if (status === 'overdue') counts.updateMissing++
        }
      }
      const records = (snapshot.loginRecords || []).filter((r) => r && r.employeeId === e.id && inRange(r.date))
      const loginDays = records.length
      const loginTotal = records.reduce((sum, r) => sum + loginSeconds(r, current), 0)
      const firstLoginAt =
        records
          .map((r) => r.firstLoginAt)
          .filter(Boolean)
          .sort()[0] || null
      const todayRecord = currentLoginRecord(snapshot.loginRecords || [], e.id, current)
      return {
        id: e.id,
        name: e.name,
        role,
        firstLoginAt,
        loginSeconds: loginTotal,
        loginDays,
        todayFirstLoginAt: todayRecord?.firstLoginAt || null,
        todayLoginSeconds: todayRecord ? loginSeconds(todayRecord, current) : 0,
        ...stats(group),
        rejections: group.reduce((n, t) => n + (t.events || []).filter((v) => v.kind === 'rejection').length, 0),
        ...counts,
      }
    })
  const summaryLogins = employees.reduce(
    (a, e) => ({ loginSeconds: a.loginSeconds + e.loginSeconds, loginDays: a.loginDays + e.loginDays }),
    { loginSeconds: 0, loginDays: 0 },
  )
  const sortedTrend = [...trend.values()].sort((a, b) => a.date.localeCompare(b.date))
  const assignmentGroups = new Map()
  for (const task of tasks) {
    const date = businessDate(task.createdAt)
    if (!assignmentGroups.has(date)) assignmentGroups.set(date, [])
    assignmentGroups.get(date).push(task)
  }
  const assignmentTrend = [...assignmentGroups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const { assigned, inProgress, completed, approved, taskTypes } = stats(group)
      return { date, total: group.length, assigned, inProgress, completed, approved, taskTypes }
    })
  const typedRows = (map) =>
    TASK_CATEGORIES.filter((category) => map.has(category.key)).map((category) => ({
      key: category.key,
      label: category.label,
      count: map.get(category.key),
    }))
  return {
    summary: { total: tasks.length, ...stats(tasks), ...summaryLogins },
    employees,
    trend: sortedTrend,
    assignmentTrend,
    trendBreakdown: sortedTrend.map(({ date }) => ({
      date,
      completedByType: typedRows(breakdown.get(date).completedByType),
      approvedByType: typedRows(breakdown.get(date).approvedByType),
    })),
    tasks,
    filters: { ...filters, from: from || null, to: to || null },
  }
}
