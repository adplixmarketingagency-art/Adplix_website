const day = (ms) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms)
const hour = (ms) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms)

export function serverOffset(serverNow, receivedAt = Date.now()) {
  const clock = Date.parse(serverNow)
  return Number.isFinite(clock) ? clock - receivedAt : 0
}

export function todayLoginExpired(serverNow, now = Date.now()) {
  const server = Date.parse(serverNow)
  return Number.isFinite(server) && (day(now) !== day(server) || hour(now) >= '19:00')
}
