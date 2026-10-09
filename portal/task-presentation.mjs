const order = { Assigned: 0, 'In-progress': 1, Completed: 2, Approved: 3 }

export function taskStateClass(task) {
  if (task?.overdue && (task.state === 'Assigned' || task.state === 'In-progress')) return 'task-state--overdue'
  return `task-state--${{ Assigned: 'assigned', 'In-progress': 'in-progress', Completed: 'completed', Approved: 'approved' }[task?.state] || 'other'}`
}

export function sortTasks(tasks) {
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const status = (order[a.task.state] ?? 4) - (order[b.task.state] ?? 4)
      if (status) return status
      const first = Date.parse(a.task.createdAt),
        second = Date.parse(b.task.createdAt)
      if (Number.isFinite(first) && Number.isFinite(second) && first !== second) return second - first
      if (Number.isFinite(first) !== Number.isFinite(second)) return Number.isFinite(second) ? 1 : -1
      return a.index - b.index
    })
    .map(({ task }) => task)
}
