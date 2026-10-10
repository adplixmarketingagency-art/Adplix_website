import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

test('optional browser push stays generic and opens the inbox without carrying message content', async () => {
  const listeners = new Map()
  const shown = []
  const opened = []
  const messages = []
  const source = await readFile(new URL('../portal/sw.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    self: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    },
    URL,
    clients: {
      openWindow: async (url) => opened.push(url),
      matchAll: async () => [
        { url: 'https://portal.test/portal/', postMessage: (message) => messages.push(message) },
        {
          url: 'https://portal.test/',
          postMessage: () => assert.fail('Public pages should not receive inbox updates'),
        },
      ],
    },
  })
  let pending
  listeners.get('push')({ data: { text: () => 'Private note and credentials' }, waitUntil: (work) => (pending = work) })
  await pending
  assert.equal(shown.length, 1)
  assert.equal(shown[0].options.data.url, '/portal/#notifications')
  assert.equal(JSON.stringify(shown).includes('Private note and credentials'), false)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].type, 'portal-inbox-update')
  assert.equal(JSON.stringify(messages).includes('Private note'), false)
  listeners.get('notificationclick')({
    notification: { close() {}, data: shown[0].options.data },
    waitUntil: (work) => (pending = work),
  })
  await pending
  assert.deepEqual(opened, ['/portal/#notifications'])
})
