import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { resolve } from 'node:path'

// Synthetic accounts/photos only, called from the isolated local portal browser flow.
export async function verifyProfileGlimpse(page, trigger, name, photo, screenshots, label) {
  const card = page.getByRole('dialog', { name: `Profile of ${name}`, exact: true })
  const viewer = page.getByRole('dialog', { name: `Photo of ${name}`, exact: true })
  await trigger.hover()
  await expect(card).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(card.locator('.profile-glimpse__name')).toHaveText(name)
  await expect(card).not.toContainText('@example.test')
  await expect(card).not.toContainText('Unsaved profile details')
  await card.hover()
  await page.waitForTimeout(250)
  await expect(card).toBeVisible()
  await expect(card.locator('img')).toHaveAttribute('src', photo)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  assert.deepEqual(
    violations.map((v) => v.id),
    [],
    'Profile card accessibility',
  )
  await page.screenshot({ path: resolve(screenshots, `${label}-profile-glimpse.png`), fullPage: true })
  await card.getByRole('button', { name: 'View profile photo', exact: true }).click()
  await expect(viewer).toBeVisible()
  await page.waitForTimeout(300)
  await expect(viewer).toBeVisible()
  await expect(viewer.locator('img')).toHaveAttribute('src', photo)
  assert.equal(await viewer.locator('img').evaluate((img) => getComputedStyle(img).objectFit), 'contain')
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'View profile photo' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Tab')
  await trigger.focus()
  await expect(card).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: 'View profile photo' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(viewer).toBeVisible()
  await viewer.getByRole('button', { name: 'Close profile photo' }).click()
  await expect(card).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: 'Close profile card' })).toBeFocused()
  await card.getByRole('button', { name: 'Close profile card' }).click()
  await expect(card).toHaveCount(0)

  for (const viewport of [
    { width: 320, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport)
    await trigger.click()
    await expect(card).toBeVisible()
    const rect = await card.boundingBox()
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1)
    assert.ok(rect.y + rect.height <= viewport.height + 1, 'Card fits mobile/landscape viewport')
    await card.getByRole('button', { name: 'View profile photo' }).click()
    await expect(viewer).toBeVisible()
    await viewer.getByRole('button', { name: 'Close profile photo' }).click()
    await card.getByRole('button', { name: 'Close profile card' }).click()
    await expect(card).toHaveCount(0)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const touchContext = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    })
  try {
    // Reuse only this isolated test user's cookie; never read production credentials.
    await touchContext.addCookies(await page.context().cookies())
    const touch = await touchContext.newPage()
    await touch.goto(page.url())
    await touch.locator('.identity button[data-profile-id]').tap()
    const touchCard = touch.getByRole('dialog', { name: `Profile of ${name}`, exact: true })
    await expect(touchCard).toBeVisible()
    await touchCard.getByRole('button', { name: 'View profile photo' }).tap()
    const touchViewer = touch.getByRole('dialog', { name: `Photo of ${name}`, exact: true })
    await expect(touchViewer).toBeVisible()
    await touchViewer.getByRole('button', { name: 'Close profile photo' }).tap()
    await touchCard.getByRole('button', { name: 'Close profile card' }).tap()
    await expect(touchCard).toHaveCount(0)
  } finally {
    await touchContext.close()
  }
}
