import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { resolve } from 'node:path'
import { verifyProfileGlimpse } from './portal-profile-glimpse-browser.mjs'

// All photos and accounts are synthetic; this flow runs only in the isolated E2E D1.
export async function verifyProfilePhoto(page, screenshots, label) {
  const navigate = (name) =>
    page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name, exact: true }).click()
  await navigate('Profile')
  const upload = page.getByLabel('Choose a profile photo', { exact: true })
  const status = page.locator('#profile-photo-status')
  const save = page.getByRole('button', { name: 'Save photo', exact: true })
  const cancel = page.getByRole('button', { name: 'Cancel changes', exact: true })
  const edit = page.getByRole('button', { name: 'Edit photo', exact: true })
  const photo = page.locator('.profile-photo-preview img')
  const dialog = page.getByRole('dialog', { name: 'Crop profile photo' })
  const frame = dialog.locator('.photo-crop-frame')
  const snapshot = async () => {
    const response = await page.request.get(new URL('/api/portal/snapshot', page.url()).href)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const savedPhoto = async () => (await snapshot()).user.profile?.photoDataUrl
  const dimensions = async () => {
    await expect
      .poll(() => photo.evaluate((image) => (image.complete ? [image.naturalWidth, image.naturalHeight] : [])))
      .toEqual([512, 512])
  }
  const layout = async () => {
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      'Profile must fit viewport',
    )
    const bounds = await page.locator('.profile-photo').evaluate((row) => {
      const rect = (selector) => {
        const { x, y, right, bottom, width, height } = row.querySelector(selector).getBoundingClientRect()
        return { x, y, right, bottom, width, height }
      }
      const image = row.querySelector('.profile-photo-preview img')
      const wrapper = row.querySelector('.profile-photo-preview')
      return {
        preview: rect('.profile-photo-preview'),
        image: image && rect('.profile-photo-preview img'),
        controls: rect('.photo-controls'),
        clipped: getComputedStyle(wrapper).overflow,
        fit: image && getComputedStyle(image).objectFit,
      }
    })
    assert.equal(bounds.clipped, 'hidden')
    if (bounds.image) {
      assert.equal(bounds.fit, 'cover')
      assert.equal(bounds.image.width, bounds.preview.width, 'Image fits circular wrapper')
      assert.equal(bounds.image.height, bounds.preview.height, 'Image height is bounded')
    }
    assert.ok(
      bounds.controls.x >= bounds.preview.right || bounds.controls.y >= bounds.preview.bottom,
      'Controls never overlap preview',
    )
  }
  await expect(save).toBeDisabled()
  await expect(edit).toBeDisabled()
  await expect(page.locator('.photo-controls input[type="range"], #profile-photo-size')).toHaveCount(0)
  const synthetic = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 420
    canvas.height = 210
    const context = canvas.getContext('2d')
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 420, 210)
    context.fillStyle = '#00aa00'
    context.fillRect(105, 0, 105, 210)
    context.fillStyle = '#0055ee'
    context.fillRect(210, 0, 105, 210)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const choose = () =>
    upload.setInputFiles({
      name: 'synthetic-wide-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(synthetic, 'base64'),
    })
  await choose()
  await expect(dialog).toBeVisible()
  await expect(frame.locator('canvas')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(save).toBeDisabled()
  await expect(photo).toHaveCount(0)
  assert.ok(!(await savedPhoto()), 'Cancelling an upload does not persist or stage it')

  const bio = page.getByLabel('About (optional)', { exact: true })
  await bio.fill('Unsaved profile details stay intact')
  await choose()
  await expect(dialog).toBeVisible()
  const centered = await frame.locator('canvas').evaluate((canvas) => canvas.toDataURL())
  await dialog.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-zoom'))).toBeGreaterThan(1)
  const zoomed = Number(await frame.getAttribute('data-crop-zoom'))
  await dialog.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-zoom'))).toBeLessThan(zoomed)
  await dialog.getByRole('button', { name: 'Zoom in' }).focus()
  await page.keyboard.press('Space')
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-zoom'))).toBeGreaterThan(1)
  const box = await frame.boundingBox()
  assert.ok(box)
  const beforeWheelZoom = Number(await frame.getAttribute('data-crop-zoom'))
  const beforeWheel = await frame.locator('canvas').evaluate((canvas) => canvas.toDataURL())
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -340)
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-zoom'))).toBeGreaterThan(beforeWheelZoom)
  assert.notEqual(await frame.locator('canvas').evaluate((canvas) => canvas.toDataURL()), beforeWheel)
  const beforeDrag = await frame.locator('canvas').evaluate((canvas) => canvas.toDataURL())
  const xBefore = Number(await frame.getAttribute('data-crop-x'))
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - Math.min(65, box.width / 4), box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-x'))).not.toBe(xBefore)
  assert.notEqual(await frame.locator('canvas').evaluate((canvas) => canvas.toDataURL()), beforeDrag)
  await dialog.getByRole('button', { name: 'Reset' }).click()
  await expect(frame).toHaveAttribute('data-crop-zoom', '1')
  await expect(frame).toHaveAttribute('data-crop-x', '0.5')
  await expect(frame).toHaveAttribute('data-crop-y', '0.5')
  assert.equal(await frame.locator('canvas').evaluate((canvas) => canvas.toDataURL()), centered)
  await frame.focus()
  await page.keyboard.press('+')
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-zoom'))).toBeGreaterThan(1)
  await dialog.getByRole('button', { name: 'Reset' }).click()
  // Exercise the two-pointer gesture handlers; native touch-device QA is separate.
  await frame.evaluate((target) => {
    const { x, y, width } = target.getBoundingClientRect()
    const originalSet = target.setPointerCapture
    target.setPointerCapture = () => {}
    const pointer = (type, id, offset) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType: 'touch',
          pointerId: id,
          clientX: x + width / 2 + offset,
          clientY: y + width / 2,
        }),
      )
    try {
      pointer('pointerdown', 10, -30)
      pointer('pointerdown', 11, 30)
      pointer('pointermove', 10, -60)
      pointer('pointermove', 11, 60)
      pointer('pointerup', 10, -60)
      pointer('pointerup', 11, 60)
    } finally {
      target.setPointerCapture = originalSet
    }
  })
  await expect(frame).toHaveAttribute('data-crop-zoom', '2')
  await dialog.getByRole('button', { name: 'Reset' }).click()
  await dialog.getByRole('button', { name: 'Zoom in' }).click()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -340)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - Math.min(65, box.width / 4), box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  assert.ok(!(await savedPhoto()), 'Gestures do not save until explicitly requested')
  await dialog.getByRole('button', { name: 'Use photo' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(status).toContainText('Preview: 512 × 512 px. Not saved yet.')
  await dimensions()
  const staged = await photo.getAttribute('src')
  await expect(save).toBeEnabled()
  await expect(edit).toBeEnabled()
  assert.ok(!(await savedPhoto()), 'Use photo stages locally without saving')
  await expect(bio).toHaveValue('Unsaved profile details stay intact')
  await choose()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(photo).toHaveAttribute('src', staged)
  await expect(save).toBeEnabled()
  await expect(bio).toHaveValue('Unsaved profile details stay intact')
  await edit.click()
  await expect(dialog).toBeVisible()
  await expect.poll(async () => Number(await frame.getAttribute('data-crop-zoom'))).toBeGreaterThan(1)
  await dialog.getByRole('button', { name: 'Reset' }).click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(photo).toHaveAttribute('src', staged)
  await expect(bio).toHaveValue('Unsaved profile details stay intact')
  await layout()
  await save.click()
  await expect(status).toHaveText('Profile photo saved.')
  const persisted128 = await savedPhoto()
  assert.equal(persisted128, staged)
  await expect(page.locator('.identity-avatar img')).toHaveAttribute('src', persisted128)
  const person = (await snapshot()).user
  await verifyProfileGlimpse(
    page,
    page.locator('.identity button[data-profile-id]'),
    person.name,
    persisted128,
    screenshots,
    label,
  )
  await expect(bio).toHaveValue('Unsaved profile details stay intact')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await dimensions()
  await expect(save).toBeDisabled()
  await edit.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Zoom in' }).click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(photo).toHaveAttribute('src', persisted128)
  assert.equal(await savedPhoto(), persisted128, 'Cancelling crop of saved photo preserves it')
  await edit.click()
  await dialog.getByRole('button', { name: 'Zoom in' }).click()
  await dialog.getByRole('button', { name: 'Use photo' }).click()
  await dimensions()
  await expect(photo).not.toHaveAttribute('src', persisted128)
  const revised = await photo.getAttribute('src')
  assert.equal(await savedPhoto(), persisted128, 'Cropping saved photo is still only a preview')
  await cancel.click()
  await expect(photo).toHaveAttribute('src', persisted128)
  await expect(save).toBeDisabled()
  await edit.click()
  await dialog.getByRole('button', { name: 'Zoom in' }).click()
  await dialog.getByRole('button', { name: 'Use photo' }).click()
  await expect(page.locator('.photo-controls')).toHaveAttribute('aria-busy', 'false')
  await expect(photo).toHaveAttribute('src', revised)
  await save.click()
  await expect(status).toHaveText('Profile photo saved.')
  const persistedCrop = await savedPhoto()
  assert.equal(persistedCrop, revised)
  await page.reload()
  await dimensions()
  await expect(photo).toHaveAttribute('src', persistedCrop)
  await upload.setInputFiles({ name: 'not-an-image.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') })
  await expect(status).toContainText('not a valid')
  await expect(photo).toHaveAttribute('src', persistedCrop)
  await expect(save).toBeDisabled()
  await edit.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Zoom in' }).click()
  await dialog.getByRole('button', { name: 'Use photo' }).click()
  await expect(save).toBeEnabled()
  const failedPending = await photo.getAttribute('src')
  await page.route('**/api/portal/actions', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Synthetic save failure. Please retry.' }),
    }),
  )
  await save.click()
  await expect(status).toContainText('Synthetic save failure')
  await expect(save).toBeEnabled()
  await expect(photo).toHaveAttribute('src', failedPending)
  assert.equal(await savedPhoto(), persistedCrop, 'Failed save retains the pending preview and saved photo')
  await page.unroute('**/api/portal/actions')
  await save.click()
  await expect(status).toHaveText('Profile photo saved.')
  await page.reload()
  await dimensions()
  assert.equal(await savedPhoto(), failedPending)
  await layout()
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport)
    await layout()
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await edit.click()
  await expect(dialog).toBeVisible()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    'Crop dialog must fit the mobile viewport',
  )
  await expect(dialog.getByRole('button', { name: 'Use photo' })).toBeVisible()
  const cropAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  assert.deepEqual(
    cropAxe.violations.map((v) => v.id),
    [],
    'Gesture crop dialog accessibility',
  )
  await page.screenshot({ path: resolve(screenshots, `${label}-gesture-crop-mobile.png`), fullPage: true })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  assert.deepEqual(
    violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    [],
    'Profile photo controls pass accessibility check',
  )
  await page.screenshot({ path: resolve(screenshots, `${label}-profile-photo-mobile.png`), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: resolve(screenshots, `${label}-profile-photo.png`), fullPage: true })
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click()
  await expect(status).toHaveText('Profile photo removed.')
  await expect(photo).toHaveCount(0)
  await expect(edit).toBeDisabled()
  assert.equal(await savedPhoto(), null)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await expect(photo).toHaveCount(0)
  await expect(page.locator('.identity-avatar img')).toHaveCount(0)
  await page.locator('.identity button[data-profile-id]').click()
  const emptyCard = page.getByRole('dialog', { name: `Profile of ${person.name}`, exact: true })
  await expect(emptyCard.locator('.profile-glimpse__initials')).toBeVisible()
  await expect(emptyCard.getByRole('button', { name: 'View profile photo' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(emptyCard).toHaveCount(0)
  await navigate('Overview')
}
