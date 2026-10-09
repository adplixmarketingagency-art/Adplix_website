// Photos live in the bounded portal state document, so accept only small baseline JPEGs.
export const MAX_PROFILE_PHOTO_BYTES = 12 * 1024
const PREFIX = 'data:image/jpeg;base64,'
const invalid = () => {
  throw Object.assign(new Error('Invalid profile photo.'), { status: 400 })
}

export function validateProfilePhoto(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) invalid()
  const encoded = value.slice(PREFIX.length)
  if (
    !encoded ||
    encoded.length > Math.ceil(MAX_PROFILE_PHOTO_BYTES / 3) * 4 ||
    encoded.length % 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    invalid()
  let binary
  try {
    binary = atob(encoded)
  } catch {
    invalid()
  }
  if (!binary.length || binary.length > MAX_PROFILE_PHOTO_BYTES || btoa(binary) !== encoded) invalid()
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid()

  let offset = 2,
    frame = null,
    sawScan = false,
    quant = new Set(),
    dc = new Set(),
    ac = new Set(),
    restart = false
  const word = (at) => (bytes[at] << 8) | bytes[at + 1]
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalid()
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) invalid()
    const marker = bytes[offset++]
    if (marker === 0xd9) {
      if (!sawScan || offset !== bytes.length) invalid()
      return value
    }
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      sawScan ||
      offset + 2 > bytes.length
    )
      invalid()
    const size = word(offset)
    if (size < 2 || offset + size > bytes.length) invalid()
    const start = offset + 2,
      end = offset + size
    if (marker === 0xc0) {
      if (frame || end - start < 9 || bytes[start] !== 8) invalid()
      const height = word(start + 1),
        width = word(start + 3),
        count = bytes[start + 5]
      if (!width || !height || width > 128 || height > 128 || ![1, 3].includes(count) || end - start !== 6 + 3 * count)
        invalid()
      const components = new Set(),
        tables = []
      for (let pos = start + 6; pos < end; pos += 3) {
        const component = bytes[pos],
          sampling = bytes[pos + 1],
          table = bytes[pos + 2]
        if (!component || components.has(component) || !((sampling >> 4) & 15) || !(sampling & 15) || table > 3)
          invalid()
        components.add(component)
        tables.push(table)
      }
      frame = { components, tables }
    } else if (marker === 0xdb) {
      for (let pos = start; pos < end;) {
        const spec = bytes[pos++],
          precision = spec >> 4,
          table = spec & 15
        if (precision > 1 || table > 3 || pos + 64 * (precision + 1) > end) invalid()
        quant.add(table)
        pos += 64 * (precision + 1)
      }
    } else if (marker === 0xc4) {
      for (let pos = start; pos < end;) {
        if (pos + 17 > end) invalid()
        const spec = bytes[pos++],
          kind = spec >> 4,
          table = spec & 15
        if (kind > 1 || table > 3) invalid()
        let count = 0
        for (let i = 0; i < 16; i++) count += bytes[pos++]
        if (!count || pos + count > end) invalid()
        ;(kind ? ac : dc).add(table)
        pos += count
      }
    } else if (marker === 0xdd) {
      if (end - start !== 2) invalid()
      restart = word(start) > 0
    } else if (marker === 0xda) {
      if (!frame || sawScan || end - start < 6) invalid()
      const count = bytes[start]
      if (
        count !== frame.components.size ||
        end - start !== 1 + 2 * count + 3 ||
        bytes[end - 3] !== 0 ||
        bytes[end - 2] !== 63 ||
        bytes[end - 1] !== 0 ||
        frame.tables.some((table) => !quant.has(table))
      )
        invalid()
      const scanned = new Set()
      for (let pos = start + 1; pos < end - 3; pos += 2) {
        const component = bytes[pos],
          selector = bytes[pos + 1]
        if (
          !frame.components.has(component) ||
          scanned.has(component) ||
          !dc.has(selector >> 4) ||
          !ac.has(selector & 15)
        )
          invalid()
        scanned.add(component)
      }
      sawScan = true
      offset = end
      let entropyBytes = 0
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          entropyBytes++
          offset++
          continue
        }
        let next = offset + 1
        while (next < bytes.length && bytes[next] === 0xff) next++
        if (next >= bytes.length) invalid()
        const code = bytes[next]
        if (code === 0x00 || (restart && code >= 0xd0 && code <= 0xd7)) {
          entropyBytes++
          offset = next + 1
          continue
        }
        if (code !== 0xd9 || !entropyBytes) invalid()
        break
      }
    } else if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) invalid()
    if (!sawScan) offset = end
  }
  invalid()
}
