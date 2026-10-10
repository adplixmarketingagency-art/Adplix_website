import test from 'node:test'
import assert from 'node:assert/strict'
import { profileName, profileGlimpsePosition, safeProfilePhoto } from '../portal/profile-glimpse.mjs'

test('inline profile trigger escapes both its attribute and its visible label', () => {
  assert.equal(
    profileName('id" onmouseover="alert(1)&', '<img src=x onerror=alert(1)>\'"'),
    '<button type="button" class="profile-name" data-profile-id="id&quot; onmouseover=&quot;alert(1)&amp;" aria-haspopup="dialog" aria-expanded="false">&lt;img src=x onerror=alert(1)&gt;&#39;&quot;</button>',
  )
  assert.equal(
    profileName(42, 'Ada & Ben'),
    '<button type="button" class="profile-name" data-profile-id="42" aria-haspopup="dialog" aria-expanded="false">Ada &amp; Ben</button>',
  )
})

test('card stays in viewport and flips above when there is more space', () => {
  assert.deepEqual(profileGlimpsePosition({ left: 120, top: 20, bottom: 44 }, 320, 200, 1000, 700), {
    left: 120,
    top: 52,
  })
  assert.deepEqual(profileGlimpsePosition({ left: 950, top: 600, bottom: 630 }, 320, 200, 1000, 700), {
    left: 672,
    top: 392,
  })
  assert.deepEqual(profileGlimpsePosition({ left: -20, top: 40, bottom: 62 }, 304, 250, 320, 300), {
    left: 8,
    top: 42,
  })
})

const segment = (marker, data) => [255, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data]
const huffman = (kind) => [kind, 1, ...Array(15).fill(0), 0]
const jpeg = Uint8Array.from([
  255,
  216,
  ...segment(0xdb, [0, ...Array(64).fill(1)]),
  ...segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
  ...segment(0xc4, [...huffman(0), ...huffman(0x10)]),
  ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  0x3f,
  255,
  217,
])

test('photo gate allows bounded local JPEGs and rejects untrusted or malformed sources', () => {
  const valid = `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`
  assert.equal(safeProfilePhoto(valid), valid)
  for (const value of [
    'https://example.com/photo.jpg',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/jpeg;base64,' + Buffer.alloc(13 * 1024).toString('base64'),
    `data:image/jpeg;base64,${Buffer.from(jpeg.slice(0, -2)).toString('base64')}`,
    null,
  ]) {
    assert.equal(safeProfilePhoto(value), null)
  }
})
