import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_JPEG_BYTES, PHOTO_SIZES, cropBounds, jpegSize, preparePhoto, savedPhotoFile } from '../portal/photo.mjs'

const jpegHeader = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])
const file = (bytes = jpegHeader) => new Blob([bytes], { type: 'image/jpeg' })
const jpegDataUrl = (bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])) =>
  `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`

function browserMock({ width = 400, height = 200, dataUrl = jpegDataUrl(), context = {} } = {}) {
  const calls = []
  let canvas
  const image = {
    width,
    height,
    close() {
      calls.push(['close'])
    },
  }
  globalThis.createImageBitmap = async () => image
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas')
      canvas = {
        width: 0,
        height: 0,
        getContext() {
          return context
        },
        toDataURL(type, quality) {
          calls.push(['toDataURL', type, quality])
          return typeof dataUrl === 'function' ? dataUrl(type, quality) : dataUrl
        },
      }
      return canvas
    },
  }
  return {
    calls,
    image,
    get canvas() {
      return canvas
    },
  }
}

function restoreBrowser() {
  delete globalThis.createImageBitmap
  delete globalThis.document
}

test('cropBounds preserves the center crop and positions zoomed square crops within wide, tall and square images', () => {
  assert.deepEqual(cropBounds(400, 200), { left: 100, top: 0, side: 200 })
  assert.deepEqual(cropBounds(180, 300, {}), { left: 0, top: 60, side: 180 })
  assert.deepEqual(cropBounds(200, 200), { left: 0, top: 0, side: 200 })
  assert.deepEqual(cropBounds(400, 200, { zoom: 2, x: 0, y: 0 }), { left: 0, top: 0, side: 100 })
  assert.deepEqual(cropBounds(400, 200, { zoom: 2, x: 1, y: 1 }), { left: 300, top: 100, side: 100 })
  assert.deepEqual(cropBounds(180, 300, { zoom: 3, x: 1, y: 0 }), { left: 120, top: 0, side: 60 })
  assert.deepEqual(cropBounds(200, 200, { zoom: 4 }), { left: 75, top: 75, side: 50 })
  assert.deepEqual(cropBounds(200, 200, { zoom: 2, x: 0.25, y: 0.75 }), {
    left: 25,
    top: 75,
    side: 100,
  })
})

test('cropBounds rejects invalid dimensions and malformed crop values without coercion', () => {
  for (const [width, height] of [
    [0, 100],
    [-1, 100],
    [NaN, 100],
    [Infinity, 100],
    ['200', 100],
    [100, 0],
    [100, -1],
    [100, NaN],
    [100, Infinity],
    [100, '200'],
  ]) {
    assert.throws(() => cropBounds(width, height), /valid dimensions/)
  }
  for (const crop of [
    null,
    [],
    'center',
    2,
    { zoom: 0 },
    { zoom: 4.01 },
    { zoom: NaN },
    { zoom: Infinity },
    { zoom: '2' },
    { x: -0.01 },
    { x: 1.01 },
    { x: NaN },
    { x: -Infinity },
    { x: '0.5' },
    { y: -0.01 },
    { y: 1.01 },
    { y: NaN },
    { y: Infinity },
    { y: '0.5' },
    { zoom: null },
    { x: null },
    { y: null },
  ]) {
    assert.throws(() => cropBounds(200, 100, crop), /valid photo crop/)
  }
})

test('preparePhoto renders every supported size and center-crops without stretching', async () => {
  const drawCalls = []
  const browser = browserMock({
    context: {
      drawImage(...args) {
        drawCalls.push(args)
      },
    },
  })
  try {
    for (const size of PHOTO_SIZES) {
      const result = await preparePhoto(file(), size)
      assert.equal(result, jpegDataUrl())
      assert.equal(browser.canvas.width, size)
      assert.equal(browser.canvas.height, size)
    }
    assert.deepEqual(
      drawCalls.map((call) => call.slice(1)),
      [
        [100, 0, 200, 200, 0, 0, 64, 64],
        [100, 0, 200, 200, 0, 0, 96, 96],
        [100, 0, 200, 200, 0, 0, 128, 128],
      ],
    )
    assert.equal(browser.calls.filter(([name]) => name === 'close').length, PHOTO_SIZES.length)
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto draws the selected crop at every supported output size', async () => {
  const drawCalls = []
  const browser = browserMock({
    width: 400,
    height: 200,
    context: {
      drawImage(...args) {
        drawCalls.push(args)
      },
    },
  })
  try {
    for (const size of PHOTO_SIZES) {
      assert.equal(await preparePhoto(file(), size, { zoom: 2, x: 1, y: 1 }), jpegDataUrl())
      assert.deepEqual([browser.canvas.width, browser.canvas.height], [size, size])
    }
    assert.deepEqual(
      drawCalls.map((call) => call.slice(1)),
      PHOTO_SIZES.map((size) => [300, 100, 100, 100, 0, 0, size, size]),
    )
    assert.equal(browser.calls.filter(([name]) => name === 'close').length, PHOTO_SIZES.length)
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto defaults to 128 and center-crops tall images', async () => {
  const drawCalls = []
  const browser = browserMock({
    width: 180,
    height: 300,
    context: {
      drawImage(...args) {
        drawCalls.push(args)
      },
    },
  })
  try {
    await preparePhoto(file())
    assert.deepEqual(drawCalls[0], [browser.image, 0, 60, 180, 180, 0, 0, 128, 128])
    assert.deepEqual([browser.canvas.width, browser.canvas.height], [128, 128])
    assert.deepEqual(
      browser.calls.filter(([name]) => name === 'close'),
      [['close']],
    )
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto closes a bitmap when canvas processing fails', async () => {
  const browser = browserMock({ context: null })
  try {
    await assert.rejects(preparePhoto(file()), /Image processing is unavailable/)
    assert.deepEqual(browser.calls, [['close']])
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto closes a bitmap if drawing fails', async () => {
  const browser = browserMock({
    context: {
      drawImage() {
        throw new Error('Canvas failed')
      },
    },
  })
  try {
    await assert.rejects(preparePhoto(file(), 96, { zoom: 2, x: 1, y: 0 }), /Canvas failed/)
    assert.deepEqual(browser.calls, [['close']])
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto rejects invalid crop before reading or decoding the image', async () => {
  const browser = browserMock({ context: { drawImage() {} } })
  let reads = 0
  let decodes = 0
  const image = file()
  const slice = image.slice.bind(image)
  image.slice = (...args) => {
    reads++
    return slice(...args)
  }
  globalThis.createImageBitmap = async () => {
    decodes++
    throw new Error('Should not decode')
  }
  try {
    for (const crop of [
      null,
      [],
      { zoom: 0 },
      { zoom: 5 },
      { zoom: NaN },
      { zoom: '2' },
      { x: -1 },
      { x: Infinity },
      { x: '0.5' },
      { y: 2 },
      { y: -Infinity },
      { y: null },
    ]) {
      await assert.rejects(preparePhoto(image, 128, crop), /valid photo crop/)
    }
    assert.equal(reads, 0)
    assert.equal(decodes, 0)
    assert.equal(browser.canvas, undefined)
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto closes a bitmap when no quality fits the JPEG cap', async () => {
  const oversized = jpegDataUrl(new Uint8Array(MAX_JPEG_BYTES + 1).fill(42))
  const browser = browserMock({ dataUrl: oversized, context: { drawImage() {} } })
  try {
    await assert.rejects(preparePhoto(file()), /12 KiB photo limit/)
    assert.deepEqual(
      browser.calls.filter(([name]) => name === 'close'),
      [['close']],
    )
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto tries smaller quality until output fits the 12 KiB JPEG cap', async () => {
  const large = jpegDataUrl(new Uint8Array(MAX_JPEG_BYTES + 1).fill(42))
  const valid = jpegDataUrl(new Uint8Array(MAX_JPEG_BYTES).fill(42))
  let attempts = 0
  const browser = browserMock({
    context: { drawImage() {} },
    dataUrl() {
      attempts++
      return attempts === 1 ? large : valid
    },
  })
  try {
    assert.equal(await preparePhoto(file(), 96), valid)
    assert.equal(attempts, 2)
    assert.deepEqual(
      browser.calls.filter(([name]) => name === 'toDataURL').map(([, type, quality]) => [type, quality]),
      [
        ['image/jpeg', 0.82],
        ['image/jpeg', 0.68],
      ],
    )
    assert.deepEqual(
      browser.calls.filter(([name]) => name === 'close'),
      [['close']],
    )
  } finally {
    restoreBrowser()
  }
})

test('preparePhoto rejects invalid files and sizes before opening a bitmap', async () => {
  const browser = browserMock({ context: { drawImage() {} } })
  try {
    await assert.rejects(preparePhoto(new Blob([jpegHeader], { type: 'image/svg+xml' })), /PNG, JPEG or WebP/)
    await assert.rejects(preparePhoto(file(), 100), /supported photo size/)
    await assert.rejects(preparePhoto(file(), 96.5), /supported photo size/)
    await assert.rejects(preparePhoto(file(), '96'), /supported photo size/)
    await assert.rejects(preparePhoto(file(new Uint8Array(5 * 1024 * 1024 + 1))), /5 MiB/)
    await assert.rejects(preparePhoto(file(Uint8Array.from([60, 115, 118, 103, 62]))), /not a valid PNG/)
    assert.equal(browser.calls.length, 0)
  } finally {
    restoreBrowser()
  }
})

test('savedPhotoFile decodes only bounded, signature-valid JPEG data URLs', async () => {
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])
  const blob = savedPhotoFile(jpegDataUrl(bytes))
  assert.equal(blob.type, 'image/jpeg')
  assert.equal(blob.size, bytes.length)
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)

  const invalid = [
    null,
    'https://example.test/photo.jpg',
    'data:image/png;base64,' + Buffer.from(bytes).toString('base64'),
    jpegDataUrl(Uint8Array.from([1, 2, 3])),
    jpegDataUrl(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])),
    jpegDataUrl(new Uint8Array(MAX_JPEG_BYTES + 1).fill(42)),
    'data:image/jpeg;base64,not-valid',
  ]
  for (const value of invalid) assert.throws(() => savedPhotoFile(value), /valid JPEG/)
  assert.equal(jpegSize(jpegDataUrl(bytes)), bytes.length)
})
