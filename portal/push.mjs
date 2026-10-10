const SCOPE = '/portal/'

export function devicePushGuidance({ navigator, window }) {
  const agent = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  if (ios && !installed) {
    return {
      available: false,
      message:
        'On iPhone or iPad (iOS/iPadOS 16.4+), open this portal in Safari, tap Share → Add to Home Screen, then open the installed Adplix Portal icon and enable notifications there.',
    }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return {
      available: false,
      message: ios
        ? 'Web Push requires iOS/iPadOS 16.4+ and an installed Home Screen app. Update your device if needed; your inbox still works.'
        : 'Web Push is unavailable in this browser. Try an up-to-date desktop browser or Chrome on Android; your inbox still works.',
    }
  }
  return {
    available: true,
    message: ios
      ? 'Notifications can arrive when the Home Screen app is closed. Allow the prompt, and check iOS Settings → Notifications if alerts are muted.'
      : /Android/i.test(agent)
        ? 'In Chrome on Android, allow notifications when prompted. Device notification settings and battery restrictions may affect alerts.'
        : 'Allow notifications when prompted. Browser or operating-system notification settings may mute alerts.',
  }
}

export function applicationServerKey(publicKey) {
  if (typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(publicKey)) throw new Error('Invalid server push key.')
  const raw = atob(
    publicKey
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(publicKey.length / 4) * 4, '='),
  )
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0))
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Invalid server push key.')
  return bytes
}

export function matchesApplicationServerKey(subscription, key) {
  const previous = subscription?.options?.applicationServerKey
  if (!previous) return false // Cannot prove the old subscription was created for this VAPID key.
  const bytes = new Uint8Array(previous)
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index])
}

// Called directly from the click handler. Do not await fetch, registration, or any
// other promise before requesting permission: Safari requires transient activation.
export async function enableDevicePush({ navigator, Notification, publicKey, persist }) {
  const key = applicationServerKey(publicKey)
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') return { enabled: false, permission }

  const registration = await navigator.serviceWorker.register('/portal/sw.js', { scope: SCOPE })
  const active = await navigator.serviceWorker.ready
  if (active.scope !== registration.scope || !active.active)
    throw new Error('The portal notification service is not ready. Please try again.')
  let subscription = await active.pushManager.getSubscription()
  if (subscription && !matchesApplicationServerKey(subscription, key)) {
    const removed = await subscription.unsubscribe()
    if (!removed) throw new Error('Could not replace the old device subscription. Please try again.')
    subscription = null
  }
  if (!subscription)
    subscription = await active.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const data = subscription.toJSON()
  if (!data?.endpoint || !data.keys?.p256dh || !data.keys?.auth)
    throw new Error('The browser did not return a complete device subscription.')
  await persist({ subscription: { endpoint: data.endpoint, keys: data.keys } })
  return { enabled: true, permission: 'granted' }
}

export async function disableDevicePush({ navigator, persist }) {
  // Revoke at the server first; a failed write must not appear disabled.
  const registration = await navigator.serviceWorker.getRegistration(SCOPE)
  const subscription = await registration?.pushManager.getSubscription()
  await persist({ subscription: null, ...(subscription?.endpoint ? { endpoint: subscription.endpoint } : {}) })
  try {
    await subscription?.unsubscribe()
  } catch {
    // The server has already stopped sending to this account.
  }
  return { enabled: false }
}

export function pushTestMessage(result) {
  if (result?.status === 'sent' || result?.sent === true || (Number.isInteger(result?.sent) && result.sent > 0))
    return 'Push provider accepted the test for delivery. This does not confirm it appeared on your device; check notification settings and your inbox.'
  if (
    result?.status === 'skipped' ||
    result?.skipped === true ||
    (Number.isInteger(result?.skipped) && result.skipped > 0) ||
    (result?.sent === 0 && result?.failed === 0 && result?.skipped === 0)
  )
    return 'Test notification skipped: no eligible device subscription. Enable notifications on this device and try again.'
  return 'The test notification failed or was not accepted. Check your device settings and try again; your inbox still works.'
}
