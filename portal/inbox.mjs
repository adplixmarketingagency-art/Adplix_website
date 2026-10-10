// Seed from the first snapshot: historical unread messages belong in the badge,
// not a burst of pop-ups on sign-in. Later unread arrivals are announced once.
export function createInboxTracker() {
  let seen = null
  return {
    reset() {
      seen = null
    },
    observe(items) {
      const list = Array.isArray(items) ? items : []
      const arrivals = seen
        ? list.filter((item) => typeof item.id === 'string' && !seen.has(item.id) && !item.readAt)
        : []
      seen ||= new Set()
      for (const item of list) if (typeof item.id === 'string') seen.add(item.id)
      return arrivals
    },
  }
}
