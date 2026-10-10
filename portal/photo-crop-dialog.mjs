import { cropBounds, imageFormat, validatePhotoFile } from './photo.mjs'

const INITIAL_CROP = { zoom: 1, x: 0.5, y: 0.5 }
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function geometry(width, height, crop) {
  const bounds = cropBounds(width, height, crop)
  return { ...bounds, xRange: width - bounds.side, yRange: height - bounds.side }
}

// Screen motion moves the image; the selected source rectangle moves oppositely.
export function panCrop(crop, width, height, dx, dy, frameSize) {
  const bounds = geometry(width, height, crop)
  if (![dx, dy, frameSize].every(Number.isFinite) || frameSize <= 0) throw new Error('Choose a valid photo crop.')
  return {
    zoom: crop.zoom ?? 1,
    x: bounds.xRange ? clamp((bounds.left - (dx * bounds.side) / frameSize) / bounds.xRange, 0, 1) : 0.5,
    y: bounds.yRange ? clamp((bounds.top - (dy * bounds.side) / frameSize) / bounds.yRange, 0, 1) : 0.5,
  }
}

// Coordinates are fractions of the frame. destination enables centroid motion during a pinch.
export function zoomCrop(crop, width, height, zoom, anchor = { x: 0.5, y: 0.5 }, destination = anchor) {
  const old = geometry(width, height, crop)
  if (![anchor.x, anchor.y, destination.x, destination.y, zoom].every(Number.isFinite) || zoom < 1 || zoom > 4)
    throw new Error('Choose a valid photo crop.')
  const next = geometry(width, height, { zoom, x: 0.5, y: 0.5 })
  return {
    zoom,
    x: next.xRange ? clamp((old.left + anchor.x * old.side - destination.x * next.side) / next.xRange, 0, 1) : 0.5,
    y: next.yRange ? clamp((old.top + anchor.y * old.side - destination.y * next.side) / next.yRange, 0, 1) : 0.5,
  }
}

let activeCrop = null

export async function cropPhoto(file, { crop = INITIAL_CROP, restoreFocus = null, signal } = {}) {
  if (activeCrop) return activeCrop
  validatePhotoFile(file)
  cropBounds(1, 1, crop)
  if (signal?.aborted) return null
  const initialFocus = restoreFocus?.isConnected
    ? restoreFocus
    : typeof document === 'undefined'
      ? null
      : document.activeElement
  if (imageFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer())) !== file.type)
    throw new Error('This file is not a valid PNG, JPEG or WebP image.')
  if (signal?.aborted) return null
  if (activeCrop) return activeCrop

  const pending = new Promise((resolve, reject) => {
    const focusTarget = initialFocus
    const listeners = []
    let settled = false
    let bitmap = null
    let dialog = null
    let current = { zoom: crop.zoom ?? 1, x: crop.x ?? 0.5, y: crop.y ?? 0.5 }

    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options)
      listeners.push(() => target.removeEventListener(type, handler, options))
    }
    const finish = (value, error) => {
      if (settled) return
      settled = true
      for (const remove of listeners) remove()
      if (dialog?.open) dialog.close()
      dialog?.remove()
      bitmap?.close()
      if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') focusTarget.focus()
      if (error) reject(error)
      else resolve(value)
    }
    if (signal) listen(signal, 'abort', () => finish(null))
    listen(window, 'pagehide', () => finish(null))
    if (signal?.aborted) {
      finish(null)
      return
    }

    async function open() {
      try {
        const decoded = await createImageBitmap(file)
        if (settled) {
          decoded.close()
          return
        }
        bitmap = decoded
        if (!bitmap.width || !bitmap.height) throw new Error('This image has no visible pixels.')

        dialog = document.createElement('dialog')
        dialog.className = 'photo-crop-dialog'
        dialog.setAttribute('aria-label', 'Crop profile photo')
        dialog.innerHTML = `
          <h2>Crop profile photo</h2>
          <p class="photo-crop-instructions" id="photo-crop-instructions">Drag to move. Pinch or scroll to zoom. Arrow keys move; + and − zoom.</p>
          <div class="photo-crop-frame" tabindex="0" role="group" aria-label="Photo crop preview" aria-describedby="photo-crop-instructions">
            <canvas aria-hidden="true"></canvas><span class="photo-crop-guide" aria-hidden="true"></span>
          </div>
          <div class="photo-crop-tools">
            <button type="button" data-crop-action="reset">Reset</button>
            <div class="photo-crop-zoom-tools">
              <button type="button" data-crop-action="out" aria-label="Zoom out">−</button>
              <output class="photo-crop-zoom" aria-live="polite">Zoom 100%</output>
              <button type="button" data-crop-action="in" aria-label="Zoom in">+</button>
            </div>
          </div>
          <div class="photo-crop-actions">
            <button type="button" data-crop-action="cancel">Cancel</button>
            <button type="button" class="primary" data-crop-action="use">Use photo</button>
          </div>`
        const frame = dialog.querySelector('.photo-crop-frame')
        const canvas = frame.querySelector('canvas')
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Image processing is unavailable in this browser.')
        const size = 320 * Math.min(window.devicePixelRatio || 1, 3)
        canvas.width = canvas.height = size
        const status = dialog.querySelector('output')
        const render = () => {
          const { left, top, side } = cropBounds(bitmap.width, bitmap.height, current)
          context.clearRect(0, 0, size, size)
          context.drawImage(bitmap, left, top, side, side, 0, 0, size, size)
          frame.dataset.cropZoom = String(current.zoom)
          frame.dataset.cropX = String(current.x)
          frame.dataset.cropY = String(current.y)
          status.textContent = `Zoom ${Math.round(current.zoom * 100)}%`
        }
        const update = (next) => {
          current = next
          render()
        }
        const frameSize = () => frame.getBoundingClientRect().width
        const point = (clientX, clientY) => {
          const rect = frame.getBoundingClientRect()
          return {
            x: clamp((clientX - rect.left) / rect.width, 0, 1),
            y: clamp((clientY - rect.top) / rect.height, 0, 1),
          }
        }
        const zoomBy = (factor, anchor) => {
          const nextZoom = clamp(current.zoom * factor, 1, 4)
          if (nextZoom !== current.zoom) {
            update(zoomCrop(current, bitmap.width, bitmap.height, nextZoom, anchor))
            beginGesture()
          }
        }

        const pointers = new Map()
        let gesture = null
        const beginGesture = () => {
          const positions = [...pointers.values()]
          if (!positions.length) {
            gesture = null
          } else if (positions.length === 1) {
            gesture = { crop: current, x: positions[0].x, y: positions[0].y }
          } else {
            const [a, b] = positions
            gesture = {
              crop: current,
              center: point((a.x + b.x) / 2, (a.y + b.y) / 2),
              distance: Math.hypot(a.x - b.x, a.y - b.y),
            }
          }
        }
        listen(frame, 'pointerdown', (event) => {
          if (pointers.size >= 2) return
          event.preventDefault()
          frame.focus({ preventScroll: true })
          frame.setPointerCapture(event.pointerId)
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
          beginGesture()
        })
        listen(frame, 'pointermove', (event) => {
          if (!pointers.has(event.pointerId)) return
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
          const positions = [...pointers.values()]
          if (positions.length === 1 && gesture && 'x' in gesture) {
            update(
              panCrop(
                gesture.crop,
                bitmap.width,
                bitmap.height,
                positions[0].x - gesture.x,
                positions[0].y - gesture.y,
                frameSize(),
              ),
            )
          } else if (positions.length === 2 && gesture && 'center' in gesture) {
            const [a, b] = positions
            const center = point((a.x + b.x) / 2, (a.y + b.y) / 2)
            const distance = Math.hypot(a.x - b.x, a.y - b.y)
            const zoom = clamp(gesture.crop.zoom * (gesture.distance ? distance / gesture.distance : 1), 1, 4)
            update(zoomCrop(gesture.crop, bitmap.width, bitmap.height, zoom, gesture.center, center))
          }
        })
        const endPointer = (event) => {
          if (!pointers.delete(event.pointerId)) return
          if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId)
          beginGesture()
        }
        listen(frame, 'pointerup', endPointer)
        listen(frame, 'pointercancel', endPointer)
        listen(frame, 'lostpointercapture', endPointer)
        listen(
          frame,
          'wheel',
          (event) => {
            event.preventDefault()
            zoomBy(
              Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.035 : 0.002)),
              point(event.clientX, event.clientY),
            )
          },
          { passive: false },
        )
        listen(dialog, 'keydown', (event) => {
          const arrows = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }
          if (arrows[event.key]) {
            event.preventDefault()
            const [dx, dy] = arrows[event.key]
            update(panCrop(current, bitmap.width, bitmap.height, dx, dy, frameSize()))
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            zoomBy(1.2, { x: 0.5, y: 0.5 })
          } else if (event.key === '-' || event.key === '_') {
            event.preventDefault()
            zoomBy(1 / 1.2, { x: 0.5, y: 0.5 })
          }
        })
        listen(dialog, 'click', (event) => {
          if (event.target === dialog) {
            const rect = dialog.getBoundingClientRect()
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              finish(null)
            return
          }
          const action =
            event.target instanceof Element ? event.target.closest('[data-crop-action]')?.dataset.cropAction : null
          if (action === 'cancel') finish(null)
          else if (action === 'use') finish({ ...current })
          else if (action === 'reset') {
            update({ ...INITIAL_CROP })
            beginGesture()
          } else if (action === 'in') zoomBy(1.2, { x: 0.5, y: 0.5 })
          else if (action === 'out') zoomBy(1 / 1.2, { x: 0.5, y: 0.5 })
        })
        listen(dialog, 'cancel', (event) => {
          event.preventDefault()
          finish(null)
        })
        listen(dialog, 'close', () => finish(null))
        render()
        document.body.append(dialog)
        dialog.showModal()
        frame.focus({ preventScroll: true })
      } catch (error) {
        finish(
          null,
          error instanceof Error && /valid dimensions|visible pixels|processing is unavailable/.test(error.message)
            ? error
            : new Error('This image cannot be opened. Choose another PNG, JPEG or WebP image.'),
        )
      }
    }
    open()
  })
  activeCrop = pending
  try {
    return await pending
  } finally {
    if (activeCrop === pending) activeCrop = null
  }
}
