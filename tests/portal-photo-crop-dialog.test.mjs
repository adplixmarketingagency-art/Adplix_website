import test from 'node:test'
import assert from 'node:assert/strict'
import { cropPhoto, panCrop, zoomCrop } from '../portal/photo-crop-dialog.mjs'
import { cropBounds } from '../portal/photo.mjs'

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`)

test('dragging moves the image and clamps the square crop for wide, tall, and square photos', () => {
  for (const [width, height] of [
    [400, 200],
    [200, 400],
    [200, 200],
  ]) {
    const start = { zoom: 2, x: 0.5, y: 0.5 }
    const before = cropBounds(width, height, start)
    const after = cropBounds(width, height, panCrop(start, width, height, 32, -48, 320))
    closeTo(after.left, before.left - before.side * 0.1)
    closeTo(after.top, before.top + before.side * 0.15)

    const corner = panCrop(start, width, height, 10000, -10000, 320)
    assert.equal(corner.x, 0)
    assert.equal(corner.y, 1)
    assert.deepEqual(cropBounds(width, height, corner), {
      left: 0,
      top: height - before.side,
      side: before.side,
    })
  }
  assert.deepEqual(panCrop({ zoom: 1, x: 0.5, y: 0.5 }, 200, 200, 50, 50, 320), {
    zoom: 1,
    x: 0.5,
    y: 0.5,
  })
})

test('zoom retains the same source point under a wheel anchor or moving pinch centroid', () => {
  for (const [width, height] of [
    [400, 200],
    [200, 400],
    [200, 200],
  ]) {
    const before = { zoom: 1.5, x: 0.4, y: 0.6 }
    const from = { x: 0.35, y: 0.65 }
    const to = { x: 0.45, y: 0.55 }
    const next = zoomCrop(before, width, height, 2, from, to)
    const oldBounds = cropBounds(width, height, before)
    const newBounds = cropBounds(width, height, next)
    closeTo(oldBounds.left + from.x * oldBounds.side, newBounds.left + to.x * newBounds.side)
    closeTo(oldBounds.top + from.y * oldBounds.side, newBounds.top + to.y * newBounds.side)
    assert.equal(next.zoom, 2)
  }
  const limit = zoomCrop({ zoom: 2, x: 0, y: 0 }, 400, 200, 1, { x: 0, y: 0 })
  assert.deepEqual(limit, { zoom: 1, x: 0, y: 0.5 })
})

test('geometry and initial crop reject malformed data before image decoding', async () => {
  assert.throws(() => panCrop({ zoom: 0 }, 200, 200, 1, 1, 320), /valid photo crop/)
  assert.throws(() => panCrop({ zoom: 2 }, 200, 200, 1, 1, 0), /valid photo crop/)
  assert.throws(() => zoomCrop({ zoom: 2 }, 200, 200, 5), /valid photo crop/)
  assert.throws(() => zoomCrop({ zoom: 2 }, 200, 200, 3, { x: NaN, y: 0 }), /valid photo crop/)
  const image = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })
  await assert.rejects(cropPhoto(image, { crop: { zoom: 5 } }), /valid photo crop/)
  await assert.rejects(cropPhoto(new Blob(['bad'], { type: 'image/svg+xml' })), /PNG, JPEG or WebP/)
  await assert.rejects(cropPhoto(new Blob(['bad'], { type: 'image/jpeg' })), /not a valid PNG/)
  assert.equal(await cropPhoto(image, { signal: AbortSignal.abort() }), null)
})

test('abort while decoding resolves immediately and disposes a late bitmap', async () => {
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    createImageBitmap: globalThis.createImageBitmap,
  }
  const events = new EventTarget()
  globalThis.window = events
  globalThis.document = { activeElement: null }
  let release
  let closed = 0
  globalThis.createImageBitmap = () =>
    new Promise((resolve) => {
      release = resolve
    })
  try {
    const controller = new AbortController()
    const file = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })
    const pending = cropPhoto(file, { signal: controller.signal })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(typeof release, 'function')
    controller.abort()
    assert.equal(await pending, null)
    release({
      close() {
        closed++
      },
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(closed, 1)
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})
