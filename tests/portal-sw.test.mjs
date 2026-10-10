import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

test('browser push uses whitelisted type copy, generic legacy fallback, and opens the inbox', async () => {
  const listeners = new Map()
  const shown = []
  const opened = []
  const messages = []
  let activated = 0
  let claimed = 0
  const source = await readFile(new URL('../portal/sw.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    self: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      registration: { showNotification: async (title, options) => shown.push({ title, options }) },
      skipWaiting: async () => activated++,
    },
    URL,
    clients: {
      claim: async () => claimed++,
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
  listeners.get('install')({ waitUntil: (work) => (pending = work) })
  await pending
  listeners.get('activate')({ waitUntil: (work) => (pending = work) })
  await pending
  assert.equal(activated, 1)
  assert.equal(claimed, 1)
  const deliver = async (text) => {
    listeners.get('push')({ data: text === null ? null : { text: () => text }, waitUntil: (work) => (pending = work) })
    await pending
    return shown.at(-1)
  }
  for (const [kind, title, body] of [
    ['note', 'Note', 'You have a new note. Sign in to view it.'],
    ['broadcast', 'Broadcast', 'You have a new broadcast. Sign in to view it.'],
    ['task-assigned', 'New task assigned', 'A new task was assigned to you. Sign in to view it.'],
    ['task-updated', 'Task updated', 'A task was updated. Sign in to view it.'],
    ['absence-updated', 'Time-off request updated', 'A time-off request was updated. Sign in to view it.'],
    ['leave-requested', 'New leave request', 'A new leave request needs review. Sign in to view it.'],
    ['permission-requested', 'New permission request', 'A new permission request needs review. Sign in to view it.'],
    ['leave-approved', 'Your leave request approved', 'Your leave request was approved. Sign in to view it.'],
    ['leave-rejected', 'Your leave request rejected', 'Your leave request was rejected. Sign in to view it.'],
    [
      'permission-approved',
      'Your permission request approved',
      'Your permission request was approved. Sign in to view it.',
    ],
    [
      'permission-rejected',
      'Your permission request rejected',
      'Your permission request was rejected. Sign in to view it.',
    ],
    ['task-completed', 'Task completed', 'A task was completed and needs review. Sign in to view it.'],
    ['task-approved', 'Your task approved', 'Your task was approved. Sign in to view it.'],
    ['task-revision', 'Task needs revision', 'Your task needs revision. Sign in to view it.'],
    ['task-deadline', 'Task deadline changed', 'A task deadline changed. Sign in to view it.'],
    ['workspace', 'Adplix workspace', 'You have a new workspace update. Sign in to view it.'],
    ['test', 'Test notification', 'This is a test device notification from Adplix.'],
  ]) {
    const alert = await deliver(JSON.stringify({ kind, title: 'Private title', body: 'Private note and credentials' }))
    assert.equal(alert.title, title)
    assert.equal(alert.options.body, body)
  }
  for (const text of [
    null,
    'Private note and credentials',
    '{invalid',
    JSON.stringify({ kind: '__proto__', body: 'Private body' }),
  ]) {
    const alert = await deliver(text)
    assert.equal(alert.title, 'Adplix workspace')
  }
  assert.equal(shown[0].options.data.url, '/portal/#notifications')
  assert.equal(JSON.stringify(shown).includes('Private note and credentials'), false)
  assert.equal(JSON.stringify(shown).includes('Private title'), false)
  assert.equal(messages.length, shown.length)
  assert.equal(messages[0].type, 'portal-inbox-update')
  assert.equal(JSON.stringify(messages).includes('Private note'), false)
  listeners.get('notificationclick')({
    notification: { close() {}, data: shown[0].options.data },
    waitUntil: (work) => (pending = work),
  })
  await pending
  assert.deepEqual(opened, ['/portal/#notifications'])
})
