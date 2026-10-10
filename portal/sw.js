const ALERTS = Object.freeze({
  note: { title: 'Note', body: 'You have a new note. Sign in to view it.' },
  broadcast: { title: 'Broadcast', body: 'You have a new broadcast. Sign in to view it.' },
  'task-assigned': { title: 'New task assigned', body: 'A new task was assigned to you. Sign in to view it.' },
  'task-updated': { title: 'Task updated', body: 'A task was updated. Sign in to view it.' },
  'absence-updated': { title: 'Time-off request updated', body: 'A time-off request was updated. Sign in to view it.' },
  'leave-requested': { title: 'New leave request', body: 'A new leave request needs review. Sign in to view it.' },
  'permission-requested': {
    title: 'New permission request',
    body: 'A new permission request needs review. Sign in to view it.',
  },
  'leave-approved': {
    title: 'Your leave request approved',
    body: 'Your leave request was approved. Sign in to view it.',
  },
  'leave-rejected': {
    title: 'Your leave request rejected',
    body: 'Your leave request was rejected. Sign in to view it.',
  },
  'permission-approved': {
    title: 'Your permission request approved',
    body: 'Your permission request was approved. Sign in to view it.',
  },
  'permission-rejected': {
    title: 'Your permission request rejected',
    body: 'Your permission request was rejected. Sign in to view it.',
  },
  'task-completed': { title: 'Task completed', body: 'A task was completed and needs review. Sign in to view it.' },
  'task-approved': { title: 'Your task approved', body: 'Your task was approved. Sign in to view it.' },
  'task-revision': { title: 'Task needs revision', body: 'Your task needs revision. Sign in to view it.' },
  'task-deadline': { title: 'Task deadline changed', body: 'A task deadline changed. Sign in to view it.' },
  workspace: { title: 'Adplix workspace', body: 'You have a new workspace update. Sign in to view it.' },
  test: { title: 'Test notification', body: 'This is a test device notification from Adplix.' },
})

// Replace the older generic-alert worker promptly; no private responses are cached.
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()))

self.addEventListener('push', (event) => {
  let kind
  try {
    kind = JSON.parse(event.data?.text() || '{}')?.kind
  } catch {
    // Legacy or malformed payloads show only generic copy.
  }
  const alert = ALERTS[typeof kind === 'string' && Object.hasOwn(ALERTS, kind) ? kind : 'workspace']
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(alert.title, {
        body: alert.body,
        icon: '/portal/icon-192.png',
        data: { url: '/portal/#notifications' },
      }),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((pages) => {
        for (const page of pages)
          if (new URL(page.url).pathname.startsWith('/portal/')) {
            page.postMessage({ type: 'portal-inbox-update' })
          }
      }),
    ]),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/portal/#notifications'))
})
