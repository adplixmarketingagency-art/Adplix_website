self.addEventListener('push', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.showNotification('Adplix workspace', {
        body: 'You have a new workspace update. Sign in to view it.',
        icon: '/images/adplix-logo.jpeg',
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
