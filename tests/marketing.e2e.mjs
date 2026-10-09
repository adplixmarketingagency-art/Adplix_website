import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { preview } from 'vite'
import { chromium } from 'playwright'
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { securityHeaders } from '../src/security-headers.mjs'

// Verify the real production build. All form input is synthetic and external
// requests are blocked so this check cannot send enquiries or subscriptions.
const server = await preview({
  logLevel: 'warn',
  preview: { host: '127.0.0.1', port: Number(process.env.MARKETING_E2E_PORT || 4174), strictPort: true, open: false },
})
const base = `http://127.0.0.1:${server.httpServer.address().port}`
server.httpServer.prependListener('request', (request, response) => {
  if (!request.url.startsWith('/portal') && !request.url.startsWith('/api/portal')) {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value)
  }
})
let browser
const errors = []

async function openPage(viewport, reducedMotion = 'reduce') {
  const context = await browser.newContext({ viewport, reducedMotion })
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/Content Security Policy|violates.*directive|Refused to/.test(message.text())) errors.push(message.text())
  })
  await page.goto(base)
  await expect(page.locator('h1')).toHaveText(/We make brands\s+unmissable\./)
  await page.evaluate(() => document.fonts.ready)
  return page
}

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'No horizontal document overflow')
}

async function screenshot(page, name) {
  if (process.env.MARKETING_E2E_SCREENSHOTS) {
    await page.screenshot({ path: resolve(process.env.MARKETING_E2E_SCREENSHOTS, `${name}.png`) })
  }
}

async function alignedFounders(page) {
  const founders = page.locator('.cc-founder')
  const first = await founders.nth(0).boundingBox()
  const second = await founders.nth(1).boundingBox()
  assert.ok(first && second, 'Both Founder cards render')
  assert.ok(Math.abs(first.y - second.y) <= 1, 'Founder cards start at the same level')
  assert.ok(Math.abs(first.height - second.height) <= 1, 'Founder cards have equal height')
  const portraits = page.locator('.cc-portrait-frame')
  const firstPortrait = await portraits.nth(0).boundingBox()
  const secondPortrait = await portraits.nth(1).boundingBox()
  assert.ok(Math.abs(firstPortrait.height - secondPortrait.height) <= 1, 'Portraits have matching proportions')
  assert.ok(firstPortrait.height / firstPortrait.width < 1.2, 'Portrait proportions are slightly shorter')
}

try {
  browser = await chromium.launch({ headless: true })
  const desktop = await openPage({ width: 1440, height: 1000 })
  await expect(desktop.locator('.hero')).not.toContainText(/let['’]s talk/i)
  const navbarContact = desktop.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: "Let's talk", exact: true })
  await expect(navbarContact).toBeVisible()
  await expect(navbarContact).toHaveAttribute('href', '#contact')
  await expect(desktop.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Employee Portal', exact: true })).toHaveAttribute('href', '/portal/')
  await expect(desktop.locator('meta[property="og:title"]')).toHaveAttribute('content', /Adplix/)
  await expect(desktop.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await noOverflow(desktop)
  const layers = await desktop.locator('.hero-space').evaluate(element => {
    const space = element.getBoundingClientRect()
    return ['canvas.hero-starfield', 'svg.shooting-stars'].map(selector => {
      const layer = element.querySelector(selector)
      if (!layer) return { selector, missing: true }
      const bounds = layer.getBoundingClientRect()
      const styles = getComputedStyle(layer)
      return { selector, position: styles.position, pointerEvents: styles.pointerEvents, width: bounds.width, height: bounds.height, spaceWidth: space.width, spaceHeight: space.height }
    })
  })
  for (const layer of layers) {
    assert.equal(layer.position, 'absolute', `${layer.selector} is an overlay`)
    assert.equal(layer.pointerEvents, 'none')
    assert.ok(Math.abs(layer.width - layer.spaceWidth) < 1 && Math.abs(layer.height - layer.spaceHeight) < 1)
  }
  await screenshot(desktop, 'marketing-desktop-hero')
  await navbarContact.click()
  await expect(desktop).toHaveURL(/#contact$/)
  await expect(desktop.locator('#contact h2')).toBeVisible()

  await desktop.getByRole('link', { name: 'Explore our work', exact: true }).click()
  await expect(desktop).toHaveURL(/#work$/)
  await expect(desktop.locator('.ws-project')).toHaveCount(4)
  const workBackground = await desktop.locator('#work').evaluate(element => getComputedStyle(element).backgroundColor)
  assert.equal(workBackground, 'rgb(24, 24, 24)', 'Selected Work uses the lighter charcoal surface')
  for (const title of await desktop.locator('.ws-project-title').all()) {
    const color = await title.evaluate(element => getComputedStyle(element).color.match(/\d+/g).map(Number))
    assert.ok(color[0] > color[1] * 1.8 && color[0] > color[2] * 1.8, 'Each project title is red')
  }
  await screenshot(desktop, 'marketing-desktop-work')
  for (const video of await desktop.locator('.ws-film-video').all()) {
    const poster = await video.getAttribute('poster')
    const response = await desktop.request.get(new URL(poster, base).href, { headers: { Range: 'bytes=0-31' } })
    assert.ok(response.ok(), 'Every project film poster resolves')
    assert.ok(response.headers()['content-type'].startsWith('image/'))
  }

  await desktop.locator('#company').scrollIntoViewIfNeeded()
  await alignedFounders(desktop)
  for (const image of await desktop.locator('.cc-founder img, .cc-testimonial img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true)
  }
  for (const image of await desktop.locator('.cc-testimonial img').all()) {
    await expect(image).toHaveCSS('border-radius', '50%')
    const bounds = await image.boundingBox()
    assert.equal(bounds.width, bounds.height, 'Testimonial logos remain circular')
  }
  await desktop.locator('#company').scrollIntoViewIfNeeded()
  await screenshot(desktop, 'marketing-desktop-founders')
  await expect(desktop.locator('.cc-brand-lockup span')).toHaveCSS('font-size', '20px')
  await expect(desktop.locator('.cc-brand-lockup img')).toHaveCSS('width', '36px')

  const submittedRequests = []
  desktop.on('request', request => { if (request.method() === 'POST') submittedRequests.push(request.url()) })
  const contact = desktop.getByRole('form', { name: 'Growth audit enquiry' })
  await contact.getByRole('button', { name: 'Send message' }).click()
  await expect(contact.getByLabel('Name', { exact: true })).toBeFocused()
  await expect(contact.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await contact.getByLabel('Name', { exact: true }).fill('Synthetic Marketing Test')
  await contact.getByLabel('Email', { exact: true }).fill('marketing@example.test')
  await contact.getByLabel('Phone Number').fill('+91 90000 00000')
  await contact.getByLabel('Message', { exact: true }).fill('Synthetic draft only. Do not send.')
  await contact.getByRole('button', { name: 'Send message' }).click()
  await expect(contact.getByRole('status')).toContainText('Nothing has been sent.')
  await expect(contact.getByRole('link', { name: /Open your email app/ })).toHaveAttribute('href', /^mailto:/)
  await desktop.locator('.cc-newsletter-form').getByLabel('Your email').fill('newsletter@example.test')
  await desktop.getByRole('button', { name: 'Subscribe', exact: true }).click()
  await expect(desktop.locator('.cc-newsletter')).toContainText('You have not been subscribed')
  assert.deepEqual(submittedRequests, [], 'Forms do not send or store input on the server')
  await desktop.getByRole('button', { name: 'Privacy Policy', exact: true }).click()
  const legal = desktop.getByRole('dialog', { name: 'Privacy Policy' })
  await expect(legal).toBeVisible()
  await legal.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(legal).not.toBeVisible()
  await expect(desktop.getByRole('button', { name: 'Privacy Policy', exact: true })).toBeFocused()

  const firstFilm = desktop.locator('.ws-film-video').first()
  await firstFilm.scrollIntoViewIfNeeded()
  await desktop.locator('.ws-play-control').first().click()
  await expect.poll(() => firstFilm.evaluate(element => !element.paused), { timeout: 10000 }).toBe(true)
  await desktop.locator('.ws-play-control').first().click()
  await expect.poll(() => firstFilm.evaluate(element => element.paused)).toBe(true)
  const desktopA11y = await new AxeBuilder({ page: desktop }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  assert.deepEqual(desktopA11y.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })), [], 'Desktop accessibility')

  const mobile = await openPage({ width: 375, height: 812 })
  await noOverflow(mobile)
  const mobileNavbarContact = mobile.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: "Let's talk", exact: true })
  await expect(mobileNavbarContact).toBeVisible()
  await expect(mobile.locator('.hero')).not.toContainText(/let['’]s talk/i)
  await screenshot(mobile, 'marketing-mobile-hero')
  await mobileNavbarContact.click()
  await expect(mobile).toHaveURL(/#contact$/)
  await expect(mobile.locator('#contact h2')).toBeVisible()
  const menu = mobile.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  const mobileNavigation = mobile.getByRole('navigation', { name: 'Mobile navigation' })
  await expect(mobileNavigation).toBeVisible()
  await expect(mobileNavigation.getByRole('link', { name: 'Employee Portal', exact: true })).toHaveAttribute('href', '/portal/')
  await expect(mobileNavigation).not.toContainText(/let['’]s talk/i)
  await mobileNavigation.getByRole('link', { name: 'Company', exact: true }).click()
  await expect(mobile).toHaveURL(/#company$/)
  await expect(mobileNavigation).not.toBeVisible()
  await expect.poll(() => mobile.locator('.cc-founder img').first().evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true)
  await screenshot(mobile, 'marketing-mobile-founders')
  await menu.click()
  await mobile.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await expect(mobileNavigation).not.toBeVisible()
  const mobileA11y = await new AxeBuilder({ page: mobile }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  assert.deepEqual(mobileA11y.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })), [], 'Mobile accessibility')
  for (const viewport of [{ width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 812, height: 375 }]) {
    await mobile.setViewportSize(viewport)
    await noOverflow(mobile)
    if (viewport.width === 768) await alignedFounders(mobile)
  }

  const animated = await openPage({ width: 1440, height: 1000 }, 'no-preference')
  await animated.getByRole('button', { name: 'Pause animations', exact: true }).click()
  await expect(animated.locator('.site')).toHaveClass(/effects-paused/)
  for (const control of await animated.locator('.ws-play-control').all()) await expect(control).toBeDisabled()
  await animated.getByRole('button', { name: 'Resume animations', exact: true }).click()
  await expect(animated.locator('.site')).not.toHaveClass(/effects-paused/)

  await mobile.setViewportSize({ width: 375, height: 812 })
  await menu.click()
  await mobileNavigation.getByRole('link', { name: 'Employee Portal', exact: true }).click()
  await expect(mobile.locator('[data-form="login"]')).toBeVisible()
  await animated.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Employee Portal', exact: true }).click()
  await expect(animated.locator('[data-form="login"]')).toBeVisible()
  await desktop.goto(base + '/portal/')
  await expect(desktop.locator('[data-form="login"]')).toBeVisible()
  await expect(desktop.locator('.site-header, .hero')).toHaveCount(0)
  await noOverflow(desktop)
  const apiResponse = await desktop.request.get(base + '/api/portal/snapshot')
  assert.ok([401, 503].includes(apiResponse.status()), 'Portal API is denied or safely unavailable, never an HTML fallback')
  assert.ok(apiResponse.headers()['content-type'].includes('application/json'))
  assert.deepEqual(errors, [], 'No uncaught JavaScript or CSP errors')
  console.info('Marketing browser checks passed: six visual edits, assets, playback, forms, navigation, animations, accessibility, responsive layouts, and isolated portal entry.')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
