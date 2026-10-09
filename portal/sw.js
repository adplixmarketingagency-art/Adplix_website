self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Adplix workspace', {
      body: 'You have a new workspace update. Sign in to view it.',
      icon: '/images/adplix-logo.jpeg',
      data: { url: '/portal/' },
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/portal/'))
})
