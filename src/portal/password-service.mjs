import { validPassword } from './auth.mjs'

const HASH_FORMAT = /^scrypt-v1\$32768\$8\$3\$[a-f0-9]{48}\$[a-f0-9]{64}$/
const MAX_JSON_BYTES = 6000
const encoder = new TextEncoder()
const unavailable = () => Object.assign(new Error('Password service unavailable.'), { status: 503 })

async function readResponse(response) {
  if (
    response.status !== 200 ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('Content-Type') || '')
  )
    throw unavailable()
  const length = response.headers.get('Content-Length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) throw unavailable()
  if (!response.body) throw unavailable()
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_JSON_BYTES) throw unavailable()
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
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

async function call(path, body, env, key, valid) {
  try {
    const namespace = env?.PORTAL_PASSWORDS
    const stub = namespace.get(namespace.idFromName('passwords-v1'))
    const response = await stub.fetch(`https://passwords.internal/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readResponse(response)
    if (
      data === null ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).length !== 1 ||
      !Object.hasOwn(data, key) ||
      !valid(data[key])
    )
      throw unavailable()
    return data[key]
  } catch {
    throw unavailable()
  }
}

export async function hashPortalPassword(value, env) {
  if (!validPassword(value)) throw Object.assign(new Error('Password must be 12–256 characters.'), { status: 400 })
  return call('hash', { password: value }, env, 'hash', (hash) => typeof hash === 'string' && HASH_FORMAT.test(hash))
}

export async function verifyPortalPassword(value, encoded, env) {
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    encoder.encode(value).length > 1024 ||
    typeof encoded !== 'string' ||
    !HASH_FORMAT.test(encoded)
  )
    return false
  return call('verify', { password: value, encoded }, env, 'verified', (verified) => typeof verified === 'boolean')
}
