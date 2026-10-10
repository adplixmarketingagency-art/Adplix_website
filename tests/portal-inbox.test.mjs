import test from 'node:test'
import assert from 'node:assert/strict'
import { createInboxTracker } from '../portal/inbox.mjs'

test('inbox pop-ups baseline historical unread items and announce each new unread arrival once', () => {
  const tracker = createInboxTracker()
  const old = { id: 'old', readAt: null }
  const note = { id: 'note', readAt: null }
  assert.deepEqual(tracker.observe([old]), [])
  assert.deepEqual(tracker.observe([old, note]), [note])
  assert.deepEqual(tracker.observe([old, note]), [])
  assert.deepEqual(tracker.observe([{ ...note, readAt: '2026-10-10' }]), [])
  assert.deepEqual(tracker.observe([old, note, { id: 'read', readAt: '2026-10-10' }]), [])
  tracker.reset()
  assert.deepEqual(tracker.observe([old, note]), [])
  assert.deepEqual(tracker.observe([old, note, { id: 'new', readAt: null }]), [{ id: 'new', readAt: null }])
})

test('inbox tracker handles empty and malformed snapshots without announcing unknown IDs', () => {
  const tracker = createInboxTracker()
  assert.deepEqual(tracker.observe(null), [])
  assert.deepEqual(tracker.observe([{ title: 'Unknown' }]), [])
  assert.deepEqual(tracker.observe([{ id: 'first' }]), [{ id: 'first' }])
})
