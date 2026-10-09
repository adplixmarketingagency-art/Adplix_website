import { hashPassword, validPassword, verifyPassword } from './auth.mjs'

const MAX_JSON_BYTES = 6000
const MAX_PENDING = 4
const HASH_FORMAT = /^scrypt-v1\$32768\$8\$3\$[a-f0-9]{48}\$[a-f0-9]{64}$/
const encoder = new TextEncoder()
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }

// scrypt uses substantial memory. This queue covers all instances in a single isolate.
let busy = false
const pending = []
async function serial(task) {
  if (busy) {
    if (pending.length >= MAX_PENDING) return null
    await new Promise((resolve) => pending.push(resolve))
  } else busy = true
  try {
    return await task()
  } finally {
    const next = pending.shift()
    if (next) next()
    else busy = false
  }
}

const json = (status, value) => new Response(JSON.stringify(value), { status, headers })
const invalid = () => json(400, { error: 'Invalid request.' })
const unavailable = () => json(503, { error: 'Password service unavailable.' })
const ownKeys = (body, keys) =>
  body !== null &&
  typeof body === 'object' &&
  !Array.isArray(body) &&
  Object.keys(body).length === keys.length &&
  keys.every((key) => Object.hasOwn(body, key))

async function readBody(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')) return null
  const length = request.headers.get('Content-Length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_JSON_BYTES) return null
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return null
  }
}

export class PortalPasswordHasher {
  async fetch(request) {
    let path
    try {
      const url = new URL(request.url)
      if (url.search || url.hash) return invalid()
      path = url.pathname
    } catch {
      return invalid()
    }
    if (path !== '/hash' && path !== '/verify') return json(404, { error: 'Not found.' })
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
    try {
      const body = await readBody(request)
      if (path === '/hash') {
        if (!ownKeys(body, ['password']) || !validPassword(body.password)) return invalid()
        const hash = await serial(() => hashPassword(body.password))
        return hash === null ? unavailable() : json(200, { hash })
      }
      if (!ownKeys(body, ['password', 'encoded'])) return invalid()
      if (
        typeof body.password !== 'string' ||
        body.password.length > 256 ||
        encoder.encode(body.password).length > 1024 ||
        typeof body.encoded !== 'string' ||
        !HASH_FORMAT.test(body.encoded)
      )
        return json(200, { verified: false })
      const verified = await serial(() => verifyPassword(body.password, body.encoded))
      return verified === null ? unavailable() : json(200, { verified })
    } catch {
      return unavailable()
    }
  }
}
