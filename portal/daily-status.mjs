// The server determines eligibility and deadlines (including leave and Sundays).
// Keep this mapping purely presentational so a client clock cannot invent overdue work.
export function dailyStatusDisplay(status) {
  switch (status) {
    case 'overdue':
      return { label: 'Update overdue', className: 'tag--overdue' }
    case 'late':
      return { label: 'Late update', className: 'tag--late' }
    case 'on-time':
      return { label: 'On-time update', className: 'tag--on-time' }
    case 'exempt':
      return { label: 'No update required', className: 'tag--exempt' }
    case 'pending':
      return { label: 'Pending update', className: 'tag--pending' }
    case 'submitted':
      return { label: 'Submitted update', className: 'tag--on-time' }
    default:
      return { label: 'Pending update', className: 'tag--pending' }
  }
}
