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

// Device alerts deliberately contain no inbox content or caller-supplied copy.
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

export async function sendBroadcastPush(env, subscriptions = [], { kind } = {}) {
  const counts = {
    sent: 0,
    failed: 0,
    skipped: 0,
    expiredEndpoints: [],
    diagnostics: { configuration: 0, preparation: 0, network: 0, timeout: 0, httpStatuses: {} },
  }
  if (!Array.isArray(subscriptions)) throw new TypeError('Subscriptions must be an array')
  const config = pushConfiguration(env)
  if (!config.configured) {
    counts.skipped = subscriptions.length
    counts.diagnostics.configuration = subscriptions.length
    return counts
  }
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
  const safeKind = (value) => (typeof value === 'string' && Object.hasOwn(ALERTS, value) ? value : null)
  // Five concurrent sends avoid 20 sequential provider timeouts outliving waitUntil.
  // The total is bounded for the small portal's Worker/subrequest budget.
  const send = async (entry) => {
    const envelope = entry && typeof entry === 'object' && Object.hasOwn(entry, 'subscription')
    const subscription = envelope ? entry.subscription : entry
    const selectedKind = (envelope && safeKind(entry.kind)) || safeKind(kind) || 'workspace'
    if (!trustedEndpoint(subscription?.endpoint)) {
      counts.skipped++
      return
    }
    let payload
    try {
      payload = await buildPushPayload(
        {
          data: JSON.stringify({ kind: selectedKind, ...ALERTS[selectedKind] }),
          options: { ttl: 3600 },
        },
        subscription,
        vapid,
      )
    } catch {
      counts.failed++
      counts.diagnostics.preparation++
      return
    }
    let response
    let signal
    try {
      signal = AbortSignal.timeout(5000)
      response = await fetch(subscription.endpoint, {
        ...payload,
        // workerd does not support redirect:error. Manual keeps signed requests
        // on the allowlisted provider; redirects are failures, never followed.
        redirect: 'manual',
        signal,
      })
    } catch (error) {
      counts.failed++
      counts.diagnostics[signal?.aborted || error?.name === 'TimeoutError' ? 'timeout' : 'network']++
      return
    }
    if (response.ok) counts.sent++
    else {
      counts.failed++
      // Only integer HTTP codes enter diagnostics; provider response bodies and headers never do.
      const status =
        Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
          ? String(response.status)
          : 'other'
      counts.diagnostics.httpStatuses[status] = (counts.diagnostics.httpStatuses[status] || 0) + 1
      if (response.status === 404 || response.status === 410) counts.expiredEndpoints.push(subscription.endpoint)
    }
  }
  for (let index = 0; index < Math.min(subscriptions.length, 20); index += 5)
    await Promise.all(subscriptions.slice(index, Math.min(index + 5, 20)).map(send))
  counts.expiredEndpoints.sort()
  counts.skipped += Math.max(0, subscriptions.length - 20)
  return counts
}
