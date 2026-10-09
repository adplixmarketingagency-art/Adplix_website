import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePortalApi } from '../src/portal/api.mjs'
import { tokenHash } from '../src/portal/auth.mjs'
import { validateProfilePhoto, MAX_PROFILE_PHOTO_BYTES } from '../src/portal/profile-photo.mjs'

const jpegSegment = (marker, data) => [255, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data]
// A synthetic 1x1 grayscale baseline JPEG: one quant table and minimal DC/AC
// Huffman tables encode zero DC difference and EOB, yielding a neutral pixel.
function jpeg(width = 1, height = 1, extra = []) {
  const huffman = (kind) => [kind, 1, ...Array(15).fill(0), 0]
  const bits = Math.ceil(width / 8) * Math.ceil(height / 8) * 2
  const entropy = Array(Math.floor(bits / 8)).fill(0)
  if (bits % 8) entropy.push((1 << (8 - (bits % 8))) - 1)
  return Uint8Array.from([
    255,
    216,
    ...jpegSegment(0xe0, extra),
    ...jpegSegment(0xdb, [0, ...Array(64).fill(1)]),
    ...jpegSegment(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
    ...jpegSegment(0xc4, [...huffman(0), ...huffman(0x10)]),
    ...jpegSegment(0xda, [1, 1, 0, 0, 63, 0]),
    ...entropy,
    255,
    217,
  ])
}
const dataUrl = (bytes) => 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64')
const photo = dataUrl(jpeg(128, 128))
const err = (value) => assert.throws(() => validateProfilePhoto(value), { status: 400 })

test('bounded baseline raster is accepted; spoofed signatures, URLs, SVG, bad base64 and malformed JPEG are refused', () => {
  assert.equal(validateProfilePhoto(photo), photo)
  assert.equal(validateProfilePhoto(dataUrl(jpeg(1, 1))), dataUrl(jpeg(1, 1)))
  const maximum = dataUrl(jpeg(1, 1, Array(MAX_PROFILE_PHOTO_BYTES - jpeg().length).fill(0)))
  assert.equal(validateProfilePhoto(maximum), maximum)
  for (const value of [
    null,
    'https://example.test/pic.jpg',
    'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'),
    'data:text/html;base64,' + Buffer.from('<script/>').toString('base64'),
    photo.replace('image/jpeg', 'image/png'),
    photo + ' ',
    photo.slice(0, -3) + '%3D',
    'data:image/jpeg;base64,/x==',
    dataUrl([255, 216, 255, 217]),
    dataUrl([...jpeg().slice(0, -2), 0, 0]),
    dataUrl([...jpeg(), 1]),
    dataUrl([...jpeg().slice(0, -3), 255, 217]),
  ])
    err(value)
  err(dataUrl(jpeg(129, 128)))
  err(dataUrl(jpeg(128, 129)))
  err(dataUrl(jpeg(0, 1)))
  err(dataUrl(jpeg(1, 0)))
  err(dataUrl(jpeg(1, 1, Array(MAX_PROFILE_PHOTO_BYTES).fill(42))))
  err(dataUrl(jpeg(1, 1, Array(MAX_PROFILE_PHOTO_BYTES - jpeg().length + 1).fill(0))))
  const spoofed = jpeg()
  spoofed[spoofed.indexOf(0xc0) + 5] = 0 // zero-height SOF
  err(dataUrl(spoofed))
  const badQuant = jpeg()
  badQuant[badQuant.indexOf(0xdb) + 3] = 0x40 // invalid table identifier
  err(dataUrl(badQuant))
  const badHuffman = jpeg()
  badHuffman[badHuffman.indexOf(0xc4) + 5] = 250 // symbol count exceeds segment
  err(dataUrl(badHuffman))
  const noScan = jpeg()
  noScan.set([255, 217], noScan.length - 3) // no scan entropy, EOI followed by bytes
  err(dataUrl(noScan))
})

function fixture(users, padding = '') {
  let revision = 0
  let state = {
    schema: 1,
    users,
    clients: [],
    tasks: [],
    updates: [],
    absences: [],
    notes: [],
    notifications: [],
    subscriptions: [],
    audit: [],
    padding,
  }
  const sessions = new Map()
  const db = {
    prepare(sql) {
      const bound = (values) => ({
        async first() {
          if (sql.includes('FROM portal_state')) return { revision, document: JSON.stringify(state) }
          if (sql.includes('FROM portal_sessions')) return sessions.get(values[0]) || null
          return null
        },
        async run() {
          if (sql.startsWith('UPDATE portal_state')) {
            if (values[1] !== revision) return { meta: { changes: 0 } }
            state = JSON.parse(values[0])
            revision++
          }
          return { meta: { changes: 1 } }
        },
      })
      return {
        bind(...values) {
          return bound(values)
        },
        first() {
          return bound([]).first()
        },
      }
    },
  }
  return {
    db,
    sessions,
    get state() {
      return state
    },
    get revision() {
      return revision
    },
  }
}
function headers(f, user, token = 'a'.repeat(64)) {
  const csrf = tokenHash('csrf:' + token)
  f.sessions.set(tokenHash(token), {
    user_id: user.id,
    csrf_hash: tokenHash(csrf),
    credential_version: user.credentialVersion || 0,
  })
  return {
    Cookie: `portal_session=${token}`,
    Origin: 'https://portal.example',
    'X-CSRF-Token': csrf,
    'Content-Type': 'application/json',
  }
}
const call = (f, endpoint, method, h, body) =>
  handlePortalApi(
    new Request('https://portal.example/api/portal/' + endpoint, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { PORTAL_DB: f.db },
  )
const user = (id, role) => ({
  id,
  role,
  name: id,
  email: `${id}@example.test`,
  employeeId: id,
  active: true,
  credentialVersion: 0,
  profile: { phone: '123', bio: 'About me' },
})

for (const role of ['Admin', 'Employee'])
  test(`${role} updates only own photo, reads persisted state, edits profile, and removes photo`, async () => {
    const self = user('self', role),
      other = user('other', role === 'Admin' ? 'Employee' : 'Admin')
    const f = fixture([self, other])
    const h = headers(f, self)
    const otherBefore = JSON.stringify(f.state.users[1])
    let result = await call(f, 'actions', 'POST', h, { type: 'profile.photo', photo })
    assert.equal(result.status, 200)
    assert.equal(f.state.users[0].profile.photoDataUrl, photo)
    assert.equal(f.state.users[0].profile.phone, '123')
    assert.equal(f.state.users[0].profile.bio, 'About me')
    assert.equal(JSON.stringify(f.state.users[1]), otherBefore)
    let snapshot = await (await call(f, 'snapshot', 'GET', h)).json()
    assert.equal(snapshot.user.profile.photoDataUrl, photo)
    // A separate read loads the JSON document again from the fake D1 row.
    const reloaded = await (await call(f, 'session', 'GET', h)).json()
    assert.equal(reloaded.user.profile.photoDataUrl, photo)
    assert.deepEqual(
      f.state.audit.map(({ actorId, action, subjectId }) => ({ actorId, action, subjectId })),
      [{ actorId: 'self', action: 'profile.photo', subjectId: 'self' }],
    )
    assert.equal(JSON.stringify(f.state.audit).includes(photo), false)

    for (const id of ['other', null]) {
      result = await call(f, 'actions', 'POST', h, { type: 'profile.photo', id, photo: null })
      assert.equal(result.status, 403)
      assert.equal(f.state.users[0].profile.photoDataUrl, photo)
    }
    result = await call(f, 'actions', 'POST', h, { type: 'profile.update', profile: { phone: '456', bio: 'Changed' } })
    assert.equal(result.status, 200)
    assert.deepEqual(f.state.users[0].profile, { phone: '456', bio: 'Changed', photoDataUrl: photo })
    for (const injected of [{ photoDataUrl: null }, { phone: '789', photoDataUrl: dataUrl(jpeg()) }, { photo: null }]) {
      result = await call(f, 'actions', 'POST', h, { type: 'profile.update', profile: injected })
      assert.equal(result.status, 400)
      assert.equal(f.state.users[0].profile.photoDataUrl, photo)
    }
    result = await call(f, 'actions', 'POST', h, { type: 'profile.photo', id: 'self', photo: null })
    assert.equal(result.status, 200)
    snapshot = await (await call(f, 'snapshot', 'GET', h)).json()
    assert.deepEqual(snapshot.user.profile, { phone: '456', bio: 'Changed', photoDataUrl: null })
    assert.equal(JSON.stringify(f.state.users[1]), otherBefore)
  })

test('admin account-detail edit preserves an employee photo', async () => {
  const admin = user('admin', 'Admin'),
    employee = user('employee', 'Employee')
  employee.profile.photoDataUrl = photo
  const f = fixture([admin, employee]),
    h = headers(f, admin)
  const response = await call(f, 'actions', 'POST', h, {
    type: 'employee.update',
    id: 'employee',
    name: 'New name',
    employeeId: 'employee',
    email: 'employee@example.test',
    jobFunctions: [],
  })
  assert.equal(response.status, 200)
  assert.equal(f.state.users[1].profile.photoDataUrl, photo)
})

test('photo mutation enforces origin, CSRF, authentication, active account and password-change requirement', async () => {
  const self = user('self', 'Admin'),
    f = fixture([self]),
    h = headers(f, self),
    body = { type: 'profile.photo', photo }
  const forbidden = [
    { ...h, Origin: 'https://evil.example' },
    { ...h, 'X-CSRF-Token': 'b'.repeat(64) },
    { ...h, Cookie: '' },
  ]
  for (const headers of forbidden)
    assert.equal((await call(f, 'actions', 'POST', headers, body)).status, headers.Cookie ? 403 : 401)
  self.mustChangePassword = true
  assert.equal((await call(f, 'actions', 'POST', h, body)).status, 403)
  self.mustChangePassword = false
  self.active = false
  assert.equal((await call(f, 'actions', 'POST', h, body)).status, 401)
  assert.equal(f.revision, 0)
  assert.deepEqual(f.state.audit, [])
})

test('invalid photo and document budget failure leave persisted state and audit untouched', async () => {
  const self = user('self', 'Employee'),
    f = fixture([self], 'x'.repeat(1_499_800)),
    h = headers(f, self)
  let result = await call(f, 'actions', 'POST', h, { type: 'profile.photo', photo: 'data:image/jpeg;base64,PHN2Zz4=' })
  assert.equal(result.status, 400)
  result = await call(f, 'actions', 'POST', h, { type: 'profile.photo', photo })
  assert.equal(result.status, 409)
  assert.equal((await result.json()).error, 'Portal storage limit reached.')
  assert.equal(f.revision, 0)
  assert.deepEqual(f.state.audit, [])
  assert.equal(f.state.users[0].profile.photoDataUrl, undefined)
})
