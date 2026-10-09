// Test-only namespace: exercise the Worker/DO request boundary without local production fallback.
import { PortalPasswordHasher } from '../../src/portal/password-object.mjs'

export function fakePortalPasswords() {
  const calls = { hash: 0, verify: 0 }
  const object = new PortalPasswordHasher()
  return {
    calls,
    idFromName(name) {
      if (name !== 'passwords-v1') throw new Error('Unexpected password object name')
      return name
    },
    get(id) {
      if (id !== 'passwords-v1') throw new Error('Unexpected password object ID')
      return {
        async fetch(input, init) {
          const request = new Request(input, init)
          const url = new URL(request.url)
          if (request.method !== 'POST' || url.origin !== 'https://passwords.internal')
            throw new Error('Unexpected password object request')
          if (url.pathname === '/hash') {
            calls.hash++
            return object.fetch(request)
          }
          if (url.pathname === '/verify') {
            calls.verify++
            return object.fetch(request)
          }
          throw new Error('Unexpected password object path')
        },
      }
    },
  }
}
