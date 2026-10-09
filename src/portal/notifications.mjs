import { buildPushPayload } from '@block65/webcrypto-web-push';

const TRUSTED = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^.*\.push\.apple\.com$/,
  /^.*\.notify\.windows\.com$/,
];

function trustedEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.port === '' && !url.username && !url.password && !url.hash && TRUSTED.some(re => re.test(url.hostname));
  } catch { return false; }
}

export async function sendBroadcastPush(env, subscriptions = []) {
  const counts = { sent: 0, failed: 0, skipped: 0, expiredEndpoints: [] };
  if (!Array.isArray(subscriptions)) throw new TypeError('Subscriptions must be an array');
  if (!env?.VAPID_PUBLIC_KEY || !env?.VAPID_PRIVATE_KEY || !env?.VAPID_SUBJECT) {
    counts.skipped = subscriptions.length;
    return counts;
  }
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
  for (const subscription of subscriptions) {
    if (!trustedEndpoint(subscription?.endpoint)) { counts.skipped++; continue; }
    try {
      const payload = await buildPushPayload({ data: JSON.stringify({ title: 'Adplix Portal', body: 'You have a new notification.' }), options: { ttl: 3600 } }, subscription, vapid);
      const response = await fetch(subscription.endpoint, { ...payload, redirect: 'error' });
      if (response.ok) counts.sent++;
      else {
        counts.failed++;
        if (response.status === 404 || response.status === 410) counts.expiredEndpoints.push(subscription.endpoint);
      }
    } catch { counts.failed++; }
  }
  return counts;
}
