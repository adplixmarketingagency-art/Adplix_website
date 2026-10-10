export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_JPEG_BYTES = 32 * 1024
export const PHOTO_SIZES = [64, 96, 128, 512]
export const PROFILE_PHOTO_SIZE = 512
const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function validatePhotoFile(file) {
  if (!file || !allowed.has(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.')
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Choose an image no larger than 5 MiB.')
}

export function imageFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (
    [82, 73, 70, 70].every((byte, index) => bytes[index] === byte) &&
    [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)
  )
    return 'image/webp'
  return null
}

export function jpegSize(dataUrl) {
  if (
    typeof dataUrl !== 'string' ||
    !/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataUrl)
  )
    return Infinity
  const base64 = dataUrl.slice('data:image/jpeg;base64,'.length)
  return (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
}

export function savedPhotoFile(dataUrl) {
  if (jpegSize(dataUrl) > MAX_JPEG_BYTES) throw new Error('This saved photo is not a valid JPEG image.')
  const base64 = dataUrl.slice('data:image/jpeg;base64,'.length)
  let bytes
  try {
    const binary = atob(base64)
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new Error('This saved photo is not a valid JPEG image.')
  }
  if (bytes.length < 5 || imageFormat(bytes) !== 'image/jpeg' || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error('This saved photo is not a valid JPEG image.')
  }
  return new Blob([bytes], { type: 'image/jpeg' })
}

function validateCrop(crop) {
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) throw new Error('Choose a valid photo crop.')
  const { zoom = 1, x = 0.5, y = 0.5 } = crop
  if (
    typeof zoom !== 'number' ||
    !Number.isFinite(zoom) ||
    zoom < 1 ||
    zoom > 4 ||
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    x < 0 ||
    x > 1 ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    y < 0 ||
    y > 1
  )
    throw new Error('Choose a valid photo crop.')
  return { zoom, x, y }
}

export function cropBounds(width, height, crop = { zoom: 1, x: 0.5, y: 0.5 }) {
  const { zoom, x, y } = validateCrop(crop)
  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  )
    throw new Error('Choose an image with valid dimensions.')
  const side = Math.min(width, height) / zoom
  return { left: (width - side) * x, top: (height - side) * y, side }
}

export async function preparePhoto(file, size = PROFILE_PHOTO_SIZE, crop = { zoom: 1, x: 0.5, y: 0.5 }) {
  validatePhotoFile(file)
  if (!Number.isInteger(size) || !PHOTO_SIZES.includes(size)) throw new Error('Choose a supported photo size.')
  validateCrop(crop)
  if (imageFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer())) !== file.type)
    throw new Error('This file is not a valid PNG, JPEG or WebP image.')
  let image
  try {
    image = await createImageBitmap(file)
  } catch {
    throw new Error('This image cannot be opened. Choose another PNG, JPEG or WebP image.')
  }
  try {
    if (!image.width || !image.height) throw new Error('This image has no visible pixels.')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image processing is unavailable in this browser.')
    const { left, top, side } = cropBounds(image.width, image.height, crop)
    context.drawImage(image, left, top, side, side, 0, 0, size, size)
    for (const quality of [0.82, 0.68, 0.52, 0.36, 0.22, 0.12]) {
      const photo = canvas.toDataURL('image/jpeg', quality)
      if (jpegSize(photo) <= MAX_JPEG_BYTES && photo.length - 'data:image/jpeg;base64,'.length <= 48000) return photo
    }
    throw new Error('This image cannot fit the 32 KiB photo limit. Choose a simpler image.')
  } finally {
    image.close()
  }
}
