import { buildPushPayload } from '@block65/webcrypto-web-push'

const TRUSTED = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^.*\.push\.apple\.com$/,
  /^.*\.notify\.windows\.com$/,
]

const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']

export function pushConfiguration(env) {
  const missing = VAPID_KEYS.filter((key) => typeof env?.[key] !== 'string' || !env[key].trim())
  return {
    configured: missing.length === 0,
    missing,
    message: missing.length
      ? `Push is not configured on this server. Set ${missing.join(', ')} in the production Worker secrets.`
      : 'Optional notifications can be enabled here.',
  }
}

function trustedEndpoint(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      TRUSTED.some((re) => re.test(url.hostname))
    )
  } catch {
    return false
  }
}

export async function sendBroadcastPush(env, subscriptions = []) {
  const counts = { sent: 0, failed: 0, skipped: 0, expiredEndpoints: [] }
  if (!Array.isArray(subscriptions)) throw new TypeError('Subscriptions must be an array')
  const config = pushConfiguration(env)
  if (!config.configured) {
    counts.skipped = subscriptions.length
    return counts
  }
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
  // Five concurrent sends avoid 20 sequential provider timeouts outliving waitUntil.
  // The total is bounded for the small portal's Worker/subrequest budget.
  const send = async (subscription) => {
    if (!trustedEndpoint(subscription?.endpoint)) {
      counts.skipped++
      return
    }
    try {
      const payload = await buildPushPayload(
        {
          data: JSON.stringify({ title: 'Adplix Portal', body: 'You have a new notification.' }),
          options: { ttl: 3600 },
        },
        subscription,
        vapid,
      )
      const response = await fetch(subscription.endpoint, {
        ...payload,
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) counts.sent++
      else {
        counts.failed++
        if (response.status === 404 || response.status === 410) counts.expiredEndpoints.push(subscription.endpoint)
      }
    } catch {
      counts.failed++
    }
  }
  for (let index = 0; index < Math.min(subscriptions.length, 20); index += 5)
    await Promise.all(subscriptions.slice(index, Math.min(index + 5, 20)).map(send))
  counts.expiredEndpoints.sort()
  counts.skipped += Math.max(0, subscriptions.length - 20)
  return counts
}
