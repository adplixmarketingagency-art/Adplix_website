import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { resolve } from 'node:path'

// All photos and accounts are synthetic; this flow runs only in the isolated E2E D1.
export async function verifyProfilePhoto(page, screenshots, label) {
  const navigate = (name) =>
    page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name, exact: true }).click()
  await navigate('Profile')
  const upload = page.getByLabel('Choose a profile photo', { exact: true })
  const resize = page.getByLabel('Resize to', { exact: true })
  const status = page.locator('#profile-photo-status')
  const save = page.getByRole('button', { name: 'Save photo', exact: true })
  const cancel = page.getByRole('button', { name: 'Cancel changes', exact: true })
  const photo = page.locator('.profile-photo-preview img')
  const snapshot = async () => {
    const response = await page.request.get(new URL('/api/portal/snapshot', page.url()).href)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const savedPhoto = async () => (await snapshot()).user.profile?.photoDataUrl
  const dimensions = async (size) => {
    await expect
      .poll(() => photo.evaluate((image) => (image.complete ? [image.naturalWidth, image.naturalHeight] : [])))
      .toEqual([size, size])
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
        image: rect('.profile-photo-preview img'),
        controls: rect('.photo-controls'),
        clipped: getComputedStyle(wrapper).overflow,
        fit: getComputedStyle(image).objectFit,
      }
    })
    assert.equal(bounds.clipped, 'hidden')
    assert.equal(bounds.fit, 'cover')
    assert.equal(bounds.image.width, bounds.preview.width, 'Image fits circular wrapper')
    assert.equal(bounds.image.height, bounds.preview.height, 'Image height is bounded')
    assert.ok(
      bounds.controls.x >= bounds.preview.right || bounds.controls.y >= bounds.preview.bottom,
      'Controls never overlap preview',
    )
  }
  await expect(save).toBeDisabled()
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
  await upload.setInputFiles({
    name: 'synthetic-wide-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(synthetic, 'base64'),
  })
  await expect(status).toContainText('Preview: 128 × 128 px. Not saved yet.')
  await dimensions(128)
  assert.ok(!(await savedPhoto()), 'Choosing a photo does not save it')
  const initial = await photo.getAttribute('src')
  const bio = page.getByLabel('About (optional)', { exact: true })
  await bio.fill('Unsaved profile details stay intact')
  for (const size of [64, 96, 128]) {
    await resize.focus()
    await resize.selectOption(String(size))
    await expect(status).toContainText(`Preview: ${size} × ${size} px. Not saved yet.`)
    await dimensions(size)
    await expect(resize).toBeFocused()
    const colour = await photo.evaluate((image) => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return [...context.getImageData(Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.5), 1, 1).data]
    })
    assert.ok(colour[2] > 180 && colour[0] < 30, 'Resize draws the full centre crop, not a clipped 128px destination')
  }
  assert.equal(
    await photo.getAttribute('src'),
    initial,
    'Returning to 128 uses original file without accumulated JPEG loss',
  )
  await expect(bio).toHaveValue('Unsaved profile details stay intact')
  await layout()
  await save.click()
  await expect(status).toHaveText('Profile photo saved.')
  const persisted128 = await savedPhoto()
  assert.equal(persisted128, initial)
  await expect(page.locator('.identity-avatar img')).toHaveAttribute('src', persisted128)
  await expect(bio).toHaveValue('Unsaved profile details stay intact')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await dimensions(128)
  await expect(save).toBeDisabled()
  await resize.selectOption('64')
  await dimensions(64)
  await expect(status).toContainText('Not saved yet.')
  assert.equal(await savedPhoto(), persisted128, 'Resize of saved photo requires explicit save')
  await cancel.click()
  await dimensions(128)
  await expect(save).toBeDisabled()
  assert.equal(await savedPhoto(), persisted128, 'Cancel leaves database untouched')
  await resize.selectOption('96')
  await dimensions(96)
  await save.click()
  await expect(status).toHaveText('Profile photo saved.')
  const persisted96 = await savedPhoto()
  assert.notEqual(persisted96, persisted128)
  await page.reload()
  await dimensions(96)
  await expect(photo).toHaveAttribute('src', persisted96)
  await upload.setInputFiles({ name: 'not-an-image.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') })
  await expect(status).toContainText('not a valid')
  await expect(photo).toHaveAttribute('src', persisted96)
  await expect(save).toBeDisabled()
  await expect(resize).toBeEnabled()
  await resize.selectOption('64')
  await dimensions(64)
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
  await expect(resize).toBeEnabled()
  assert.equal(await savedPhoto(), persisted96, 'Failed save must preserve saved photo')
  await page.unroute('**/api/portal/actions')
  await save.click()
  await expect(status).toHaveText('Profile photo saved.')
  await page.reload()
  await dimensions(64)
  await resize.selectOption('96')
  await dimensions(96)
  await expect(status).toContainText('Not saved yet.')
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
  assert.equal(await savedPhoto(), null)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await expect(photo).toHaveCount(0)
  await expect(page.locator('.identity-avatar img')).toHaveCount(0)
  await navigate('Overview')
}
