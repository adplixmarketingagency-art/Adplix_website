import test from 'node:test'
import assert from 'node:assert/strict'
import { sortTasks, taskStateClass } from '../portal/task-presentation.mjs'
import { MAX_JPEG_BYTES, jpegSize, validatePhotoFile, imageFormat } from '../portal/photo.mjs'
import { serverOffset, todayLoginExpired } from '../portal/today-login.mjs'

test('task groups stay in work order and newest tasks lead each group', () => {
  const tasks = [
    { id: 'approved', state: 'Approved', createdAt: '2026-10-10T00:00:00Z' },
    { id: 'older', state: 'Assigned', createdAt: '2026-10-08T00:00:00Z' },
    { id: 'completed', state: 'Completed', createdAt: '2026-10-09T00:00:00Z' },
    { id: 'newer', state: 'Assigned', createdAt: '2026-10-09T00:00:00Z' },
    { id: 'progress', state: 'In-progress', createdAt: '2026-10-10T00:00:00Z' },
  ]
  assert.deepEqual(
    sortTasks(tasks).map((task) => task.id),
    ['newer', 'older', 'progress', 'completed', 'approved'],
  )
  assert.equal(tasks[0].id, 'approved')
})

test('bad timestamps and ties preserve input order; overdue wins only for active work', () => {
  assert.deepEqual(
    sortTasks([
      { id: 1, state: 'Assigned', createdAt: 'broken' },
      { id: 2, state: 'Assigned', createdAt: 'broken' },
      { id: 3, state: 'Assigned', createdAt: '2026-10-09' },
    ]).map((t) => t.id),
    [3, 1, 2],
  )
  assert.equal(taskStateClass({ state: 'Assigned', overdue: true }), 'task-state--overdue')
  assert.equal(taskStateClass({ state: 'In-progress', overdue: true }), 'task-state--overdue')
  assert.equal(taskStateClass({ state: 'Completed', overdue: true }), 'task-state--completed')
  assert.equal(taskStateClass({ state: 'Approved', overdue: true }), 'task-state--approved')
})

test('photo validation accepts only allowed image types under 5 MiB and exact-size JPEG payload', () => {
  assert.doesNotThrow(() => validatePhotoFile({ type: 'image/webp', size: 5 * 1024 * 1024 }))
  assert.throws(() => validatePhotoFile({ type: 'image/svg+xml', size: 500 }), /PNG, JPEG or WebP/)
  assert.throws(() => validatePhotoFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }), /5 MiB/)
  const url = `data:image/jpeg;base64,${Buffer.alloc(MAX_JPEG_BYTES).toString('base64')}`
  assert.equal(jpegSize(url), MAX_JPEG_BYTES)
  assert.equal(jpegSize('data:image/svg+xml;base64,YQ=='), Infinity)
  assert.equal(jpegSize('data:image/jpeg;base64,not valid'), Infinity)
  assert.equal(imageFormat(Uint8Array.from([60, 115, 118, 103, 62])), null)
  assert.equal(imageFormat(Uint8Array.from([255, 216, 255, 0])), 'image/jpeg')
  assert.equal(imageFormat(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png')
})

test('server-clock offset expires attendance at 17:30 Kolkata and on day rollover', () => {
  const snapshot = '2026-10-09T11:59:00Z' // 17:29 IST
  const offset = serverOffset(snapshot, Date.parse('2026-10-09T11:58:55Z'))
  assert.equal(offset, 5000)
  assert.equal(todayLoginExpired(snapshot, Date.parse('2026-10-09T11:59:59Z')), false)
  assert.equal(todayLoginExpired(snapshot, Date.parse('2026-10-09T12:00:00Z')), true)
  assert.equal(todayLoginExpired(snapshot, Date.parse('2026-10-09T18:30:00Z')), true)
})
