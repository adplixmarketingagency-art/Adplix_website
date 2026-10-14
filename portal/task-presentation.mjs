export function taskStateClass(task) {
  if (task?.overdue && (task.state === 'Assigned' || task.state === 'In-progress')) return 'task-state--overdue'
  return `task-state--${{ Assigned: 'assigned', 'In-progress': 'in-progress', Completed: 'completed', Approved: 'approved' }[task?.state] || 'other'}`
}

export function tasksForView(tasks, user, teamView) {
  return tasks.filter((task) =>
    teamView ? user.role === 'Admin' || task.assigneeId !== user.id : task.assigneeId === user.id,
  )
}

const priorityOrder = {
  'In-progress': 1,
  Assigned: 2,
  Completed: 3,
  Approved: 4,
}

export function sortTasks(tasks) {
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const aOverdue = Boolean(taskStateClass(a.task) === 'task-state--overdue')
      const bOverdue = Boolean(taskStateClass(b.task) === 'task-state--overdue')
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      const aRank = priorityOrder[a.task.state] ?? 5
      const bRank = priorityOrder[b.task.state] ?? 5
      if (aRank !== bRank) return aRank - bRank
      const first = Date.parse(a.task.createdAt),
        second = Date.parse(b.task.createdAt)
      if (Number.isFinite(first) && Number.isFinite(second) && first !== second) return second - first
      if (Number.isFinite(first) !== Number.isFinite(second)) return Number.isFinite(second) ? 1 : -1
      return a.index - b.index
    })
    .map(({ task }) => task)
}
