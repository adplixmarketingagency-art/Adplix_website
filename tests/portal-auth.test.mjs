import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, tokenHash, cookie, validPassword } from '../src/portal/auth.mjs'

test('scrypt hashes are salted, versioned, and verified against correct password', async () => {
  const first = await hashPassword('correct horse battery staple'),
    second = await hashPassword('correct horse battery staple')
  assert.match(first, /^scrypt-v1\$32768\$8\$3\$[a-f0-9]{48}\$[a-f0-9]{64}$/)
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('correct horse battery staple', first), true)
  assert.equal(await verifyPassword('wrong password', first), false)
  assert.equal(await verifyPassword('correct horse battery staple', 'garbage'), false)
  assert.equal(validPassword('short'), false)
  assert.equal(tokenHash('secret').length, 64)
})
test('cookies require HTTPS except explicitly enabled loopback', () => {
  const https = new Request('https://example.com/api/portal/login')
  assert.match(cookie('abc', https, {}), /Secure;?$/)
  assert.throws(() =>
    cookie('abc', new Request('http://example.com/api/portal/login'), { PORTAL_ALLOW_HTTP_LOCAL: 'true' }),
  )
  assert.doesNotThrow(() =>
    cookie('abc', new Request('http://localhost:8787/api/portal/login'), { PORTAL_ALLOW_HTTP_LOCAL: 'true' }),
  )
})
