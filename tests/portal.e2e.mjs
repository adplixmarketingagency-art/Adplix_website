import assert from 'node:assert/strict'
import { promisify } from 'node:util'
import { execFile, spawn } from 'node:child_process'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { strFromU8, unzipSync } from 'fflate'
import { hashPassword } from '../src/portal/auth.mjs'
import { businessDate } from '../src/portal/domain.mjs'
import { analyticsPresetFilters } from '../portal/analytics-filters.mjs'
import { verifyProfilePhoto } from './portal-photo-browser.mjs'

// Isolated synthetic accounts and a private local D1 instance. Never use production credentials here.
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Run browser verification with Node 22+')
const cli = resolve('node_modules/wrangler/bin/wrangler.js')
const folder = resolve('.portal-local', 'e2e-' + crypto.randomUUID())
const statePath = resolve(folder, 'state')
const base = 'http://127.0.0.1:' + (process.env.PORTAL_E2E_PORT || '8790')
const syntheticPassword = 'Synthetic-browser-temporary-123!'
const changedPassword = 'Synthetic-browser-replacement-456!'
const run = promisify(execFile)
const command = (...args) =>
  run(process.execPath, [cli, ...args], {
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    timeout: 120000,
  })
let worker,
  browser,
  output = ''
const errors = []
const screenshots = resolve('.portal-local/previews')
async function navigate(page, name) {
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name, exact: true }).click()
}
async function submit(form, name) {
  await form.getByRole('button', { name, exact: true }).click()
}
async function saved(page) {
  await expect(page.locator('#feedback')).toContainText('Saved successfully.')
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    'Document must not overflow horizontally',
  )
}
async function branding(page, variant) {
  const brand = page.locator(`.portal-brand--${variant}`)
  await expect(brand).toBeVisible()
  await expect(brand.locator('.portal-brand-name')).toHaveText('Adplix Media')
  assert.ok(
    await brand.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0),
    'Genuine logo asset must load',
  )
  assert.equal(await brand.locator('img').evaluate((image) => getComputedStyle(image).borderRadius), '50%')
}
const taskCard = (page, title) =>
  page.locator('.task-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
const editorProgress = (page) =>
  page
    .locator('.employee-row')
    .filter({ has: page.locator('.employee-label > span').filter({ hasText: /^Test Editor Employee$/ }) })
async function checkProgress(page, done) {
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  const row = editorProgress(page)
  await expect(row.locator('.employee-label strong')).toHaveText(
    `${done} of 3 completed (${Math.round((done / 3) * 100)}%)`,
  )
  await expect(row.locator('.assignment-slot.filled')).toHaveCount(done)
  await expect(row.locator('.assignment-slot.pending')).toHaveCount(3 - done)
}
async function accessibility(page, name) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  assert.deepEqual(
    violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) })),
    [],
    `${name}: accessibility violations`,
  )
}
function track(page) {
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/Content Security Policy|violates.*directive|Refused to/.test(message.text())) errors.push(message.text())
  })
}
async function login(page, email, change = false) {
  await page.goto(base + '/portal/')
  const form = page.locator('[data-form="login"]')
  await branding(page, 'auth')
  await form.getByLabel('Email address').fill(email)
  await form.getByLabel('Portal password').fill(syntheticPassword)
  await submit(form, 'Sign in')
  if (change) {
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await branding(page, 'auth')
    const password = page.locator('[data-form="password"]')
    const currentPassword = password.getByLabel('Current password')
    const newPassword = password.getByLabel('New password')
    await currentPassword.fill('Synthetic-incorrect-current-password-789!')
    await newPassword.fill(changedPassword)
    const rejectedChange = page.waitForResponse((response) => response.url().endsWith('/api/portal/password'))
    await submit(password, 'Update password')
    assert.equal((await rejectedChange).status(), 400, 'Incorrect current password is validation, not session expiry')
    await expect(page.locator('#feedback')).toContainText('Current password is incorrect.')
    await expect(password).toBeVisible()
    await expect(page.locator('[data-form="login"]')).toHaveCount(0)
    await expect(currentPassword).toBeFocused()
    await expect(currentPassword).toHaveAttribute('aria-invalid', 'true')
    await expect(newPassword).toHaveValue(changedPassword)
    const stillAuthenticated = await page.request.get(base + '/api/portal/session')
    assert.equal(stillAuthenticated.status(), 200, 'Validation failure retains authenticated session')
    assert.equal((await stillAuthenticated.json()).user.mustChangePassword, true)
    await currentPassword.fill(syntheticPassword)
    await password.getByLabel('New password').fill(changedPassword)
    await submit(password, 'Update password')
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible()
    await expect(page.locator('#feedback')).toHaveText('Password changed.')
    const savedSession = await page.request.get(base + '/api/portal/session')
    assert.equal(savedSession.status(), 200)
    assert.equal((await savedSession.json()).user.mustChangePassword, false)
    await page.reload()
    await expect(page.locator('[data-form="login"], .auth [data-form="password"]')).toHaveCount(0)
  }
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible()
  await branding(page, 'sidebar')
}

try {
  await readFile('.portal-dist/portal/index.html')
  await mkdir(folder, { recursive: true, mode: 0o700 })
  await mkdir(screenshots, { recursive: true })
  await command(
    'd1',
    'migrations',
    'apply',
    'adplix-portal-local',
    '--local',
    '--config',
    'wrangler.portal.toml',
    '--persist-to',
    statePath,
  )
  const account = {
    id: 'browser-admin',
    name: 'Test Admin',
    employeeId: 'TEST-ADMIN',
    email: 'admin@example.test',
    role: 'Admin',
    jobFunctions: [],
    profile: {},
    active: true,
    mustChangePassword: true,
    credentialVersion: 0,
    passwordHash: await hashPassword(syntheticPassword),
    createdAt: new Date().toISOString(),
  }
  const state = JSON.stringify({
    schema: 1,
    users: [account],
    clients: [],
    tasks: [],
    updates: [],
    absences: [],
    notes: [],
    notifications: [],
    subscriptions: [],
    audit: [],
  })
  const seed = resolve(folder, 'seed.sql')
  await writeFile(
    seed,
    `UPDATE portal_state SET document='${state.replaceAll("'", "''")}',revision=1 WHERE id=1 AND revision=0;`,
    { mode: 0o600 },
  )
  await command(
    'd1',
    'execute',
    'adplix-portal-local',
    '--local',
    '--config',
    'wrangler.portal.toml',
    '--persist-to',
    statePath,
    '--file',
    seed,
  )
  worker = spawn(
    process.execPath,
    [
      cli,
      'dev',
      '--config',
      'wrangler.portal.toml',
      '--local',
      '--port',
      new URL(base).port,
      '--persist-to',
      statePath,
    ],
    { env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  worker.stdout.on('data', (data) => (output += data))
  worker.stderr.on('data', (data) => (output += data))
  let ready = false
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + '/portal/')
      if (r.status === 200) {
        ready = true
        break
      }
    } catch {
      /* Wait for the local Worker within the bounded startup window. */
    }
    await delay(500)
  }
  assert.ok(ready, 'Local Cloudflare runtime failed to start: ' + output)
  browser = await chromium.launch({ headless: true })
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const adminPage = await adminContext.newPage()
  track(adminPage)
  await adminPage.goto(base + '/portal/')
  await expect(adminPage).toHaveTitle('Employee Portal · Adplix Media')
  await branding(adminPage, 'auth')
  await accessibility(adminPage, 'login')
  await adminPage.setViewportSize({ width: 320, height: 812 })
  await branding(adminPage, 'auth')
  await noOverflow(adminPage)
  await adminPage.screenshot({ path: resolve(screenshots, 'portal-login-mobile.png'), fullPage: true })
  await adminPage.setViewportSize({ width: 1440, height: 1000 })
  await login(adminPage, 'admin@example.test', true)
  await verifyProfilePhoto(adminPage, screenshots, 'admin')
  const applicantContext = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
  const applicant = await applicantContext.newPage()
  track(applicant)
  for (const [name, email] of [
    ['New Applicant', 'applicant@example.test'],
    ['Rejected Applicant', 'rejected@example.test'],
  ]) {
    await applicant.goto(base + '/portal/')
    await applicant.getByRole('button', { name: 'Register / request access' }).click()
    await branding(applicant, 'auth')
    const form = applicant.locator('[data-form="register"]')
    await form.getByLabel('Full name').fill(name)
    await form.getByLabel('Designation', { exact: true }).fill('Video Editor')
    await form.getByLabel('Email address').fill(email)
    await form.getByLabel('Password (at least 12 characters)', { exact: true }).fill(syntheticPassword)
    await form.getByLabel('Confirm password', { exact: true }).fill(syntheticPassword)
    await accessibility(applicant, 'registration form')
    await submit(form, 'Request access')
    await expect(applicant.getByRole('heading', { name: 'Wait for administrator approval' })).toBeVisible()
    await branding(applicant, 'auth')
    await expect(applicant.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0)
    await applicant.getByRole('button', { name: 'Back to sign in' }).click()
    const signIn = applicant.locator('[data-form="login"]')
    await signIn.getByLabel('Email address').fill(email)
    await signIn.getByLabel('Portal password').fill(syntheticPassword)
    await submit(signIn, 'Sign in')
    await expect(applicant.locator('#feedback')).toContainText('approval required')
    assert.equal(
      (await applicantContext.cookies()).some((cookie) => cookie.name === 'portal_session'),
      false,
    )
  }
  await navigate(adminPage, 'Team')
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  const pendingSection = adminPage
    .locator('section')
    .filter({ has: adminPage.getByRole('heading', { name: 'Registration requests', exact: true }) })
  const acceptedRow = pendingSection
    .locator('.list-item')
    .filter({ hasText: 'applicant@example.test' })
    .filter({ hasNotText: 'rejected@example.test' })
  await acceptedRow.getByRole('button', { name: 'Approve', exact: true }).click()
  const approval = adminPage.locator('[data-form="registration-approve"]')
  await approval.getByLabel('Employee ID', { exact: true }).fill('TEST-REG-001')
  await approval.getByLabel('video editing', { exact: true }).check()
  await submit(approval, 'Approve registration')
  await saved(adminPage)
  const rejectedRow = pendingSection.locator('.list-item').filter({ hasText: 'rejected@example.test' })
  await rejectedRow.getByRole('button', { name: 'Reject', exact: true }).click()
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(adminPage.locator('#feedback')).toContainText('Registration rejected.')
  await applicant.setViewportSize({ width: 1440, height: 1000 })
  await login(applicant, 'applicant@example.test')
  await expect(applicant.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0)
  await applicant.setViewportSize({ width: 375, height: 812 })
  await accessibility(applicant, 'approved applicant mobile')
  await applicantContext.close()
  for (const [name, employeeId, email, func] of [
    ['Test Editor', 'TEST-001', 'editor@example.test', 'video editing'],
    ['Test Designer', 'TEST-002', 'designer@example.test', 'Canva design'],
  ]) {
    const form = adminPage.locator('[data-form="employee"]')
    await form.getByLabel('Name', { exact: true }).fill(name)
    await form.getByLabel('Employee ID', { exact: true }).fill(employeeId)
    await form.getByLabel('Allowed personal email').fill(email)
    await form.getByLabel('Temporary portal password').fill(syntheticPassword)
    if (name === 'Test Designer') await form.getByLabel(func, { exact: true }).check()
    await submit(form, 'Add employee')
    await saved(adminPage)
  }
  await navigate(adminPage, 'Clients')
  const client = adminPage.locator('[data-form="client"]')
  await client.getByLabel('Client name').fill('Test Client')
  await client.getByLabel('Service provided').fill('Instagram reels and posters')
  await submit(client, 'Add client')
  await saved(adminPage)
  await navigate(adminPage, 'Assignments')
  for (const [title, employeeName, func] of [
    ['Edit launch reel', 'Test Editor', 'video editing'],
    ['Design campaign poster', 'Test Designer', 'Canva design'],
    ['Edit follow-up reel', 'Test Editor', 'video editing'],
    ['Design launch poster', 'Test Editor', 'Canva design'],
    ['Admin website task', 'Test Admin', 'website maintenance'],
  ]) {
    const form = adminPage.locator('[data-form="task"]')
    await form.getByLabel('Task title').fill(title)
    await form.getByLabel('Assigned employee / admin', { exact: true }).selectOption({ label: employeeName })
    await expect(
      form.getByLabel('Job function', { exact: true }).getByRole('option', { name: func, exact: true }),
    ).toHaveCount(1)
    const clientSelection = form.getByLabel('Client', { exact: true })
    const clientOption = clientSelection.getByRole('option', { name: /^Test Client · / })
    await expect(clientOption).toHaveCount(1)
    await clientSelection.selectOption(await clientOption.getAttribute('value'))
    await form.getByLabel('Job function', { exact: true }).selectOption(func)
    await form.getByLabel('Deadline · Asia/Kolkata (IST)').fill(businessDate(Date.now() - 86400000) + 'T17:30')
    await submit(form, 'Create task')
    await saved(adminPage)
  }
  await navigate(adminPage, 'Analytics')
  await checkProgress(adminPage, 0)
  await expect(editorProgress(adminPage)).toContainText("Today's first login")
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-video-editing.pending')).toHaveCount(2)
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-canva-poster.pending')).toHaveCount(1)
  await navigate(adminPage, 'Notes & broadcasts')
  const note = adminPage.locator('[data-form="note"]')
  await note.getByLabel('Note', { exact: true }).fill('Review the brand brief. <img src=x onerror=alert(1)>')
  await note.getByLabel('Test Editor', { exact: true }).check()
  await submit(note, 'Publish note')
  await saved(adminPage)
  const broadcast = adminPage.locator('[data-form="broadcast"]')
  await broadcast.getByLabel('Title', { exact: true }).fill('Production update')
  await broadcast.getByLabel('Message', { exact: true }).fill('Check your assignment before starting work.')
  await submit(broadcast, 'Send to inbox')
  await saved(adminPage)

  const employeeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const employeePage = await employeeContext.newPage()
  track(employeePage)
  await login(employeePage, 'editor@example.test', true)
  await expect(employeePage.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0)
  await expect(employeePage.locator('.task-card.overdue')).toHaveCount(3)
  assert.equal(await employeePage.locator('.list-item img').count(), 0, 'Untrusted note HTML must stay text')
  await accessibility(employeePage, 'employee overview')
  await verifyProfilePhoto(employeePage, screenshots, 'employee')
  const daily = employeePage.locator('#daily-status .tag')
  const dailyStatus = await daily.textContent()
  if (dailyStatus === 'Update overdue') await expect(daily).toHaveClass(/tag--overdue/)
  await employeePage.route('**/api/portal/snapshot', async (route) => {
    const response = await route.fetch()
    const snapshot = await response.json()
    snapshot.updateStatus = { status: 'overdue', deadline: `${snapshot.today}T05:30:00.000Z` }
    await route.fulfill({ response, json: snapshot })
  })
  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(employeePage.locator('#daily-status .tag')).toHaveText('Update overdue')
  await expect(employeePage.locator('#daily-status .tag')).toHaveClass(/tag--overdue/)
  await accessibility(employeePage, 'daily update overdue state')
  await employeePage.unroute('**/api/portal/snapshot')
  const update = employeePage.locator('[data-form="update"]')
  await update.getByLabel('What are you working on today?').fill('Editing the launch reel and reviewing feedback.')
  await submit(update, 'Submit update')
  await saved(employeePage)
  await navigate(employeePage, 'My tasks')
  const launchTask = taskCard(employeePage, 'Edit launch reel')
  await launchTask.getByRole('button', { name: 'Start task', exact: true }).click()
  await expect(employeePage.locator('#feedback')).toContainText('In-progress')
  await launchTask.getByRole('button', { name: 'Complete task', exact: true }).click()
  await expect(employeePage.locator('#feedback')).toContainText('Completed')
  await navigate(adminPage, 'Analytics')
  await expect(editorProgress(adminPage).locator('.employee-label strong')).toHaveText('1 of 3 completed (33%)')
  await checkProgress(adminPage, 1)
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-video-editing.filled')).toHaveCount(1)
  await adminPage.screenshot({ path: resolve(screenshots, 'analytics-partial-progress.png'), fullPage: true })
  await navigate(adminPage, 'Inbox')
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  const completion = adminPage.locator('.list-item').filter({ hasText: 'Task completed: Edit launch reel' })
  await expect(completion).toHaveCount(1)
  await expect(completion).toContainText('waiting for approval')
  await launchTask.getByRole('button', { name: 'Reopen task', exact: true }).click()
  await expect(employeePage.locator('#feedback')).toContainText('In-progress')
  await navigate(adminPage, 'Analytics')
  await checkProgress(adminPage, 0)
  await launchTask.getByRole('button', { name: 'Complete task', exact: true }).click()
  await expect(employeePage.locator('#feedback')).toContainText('Completed')

  await navigate(adminPage, 'Review queue')
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await adminPage.getByRole('button', { name: 'Reject', exact: true }).click()
  const rejection = adminPage.locator('[data-form="reject"]')
  await rejection.getByLabel('Feedback (required)').fill('Tighten the opening cut.')
  await submit(rejection, 'Reject and resume task')
  await saved(adminPage)
  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await launchTask.getByRole('button', { name: 'Complete task', exact: true }).click()
  await expect(employeePage.locator('#feedback')).toContainText('Completed')
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await adminPage.getByRole('button', { name: 'Approve', exact: true }).click()
  const ratingApproval = adminPage.locator('[data-form="approve"]')
  await ratingApproval.getByLabel('Rating (1–5)', { exact: true }).fill('4')
  await ratingApproval.getByLabel('Rating note (optional)', { exact: true }).fill('Synthetic review: clear delivery')
  await submit(ratingApproval, 'Approve task')
  await saved(adminPage)
  await expect(adminPage.getByText('No completed tasks awaiting review.', { exact: true })).toBeVisible()
  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    employeePage
      .locator('.task-card')
      .filter({ has: employeePage.getByRole('heading', { name: 'Edit launch reel', exact: true }) })
      .locator('.tag'),
  ).toHaveText('Approved')
  await expect(employeePage.locator('.task-rating')).toContainText('4/5')
  await expect(employeePage.getByRole('button', { name: 'Reopen task', exact: true })).toHaveCount(0)
  await navigate(adminPage, 'Analytics')
  await checkProgress(adminPage, 1)
  for (const [index, title] of ['Edit follow-up reel', 'Design launch poster'].entries()) {
    const current = taskCard(employeePage, title)
    await current.getByRole('button', { name: 'Start task', exact: true }).click()
    await expect(employeePage.locator('#feedback')).toContainText('In-progress')
    await checkProgress(adminPage, index + 1)
    await current.getByRole('button', { name: 'Complete task', exact: true }).click()
    await expect(employeePage.locator('#feedback')).toContainText('Completed')
    await checkProgress(adminPage, index + 2)
  }
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-video-editing.filled')).toHaveCount(2)
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-canva-poster.filled')).toHaveCount(1)
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-video-editing').first()).toHaveAttribute(
    'title',
    /Video Editing/,
  )
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-canva-poster').first()).toHaveAttribute(
    'title',
    /Canva Poster/,
  )
  const videoFill = await editorProgress(adminPage)
    .locator('.task-type-video-editing.filled')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor)
  const canvaFill = await editorProgress(adminPage)
    .locator('.task-type-canva-poster.filled')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor)
  assert.notEqual(videoFill, canvaFill, 'Video Editing and Canva Poster must use different colours')
  const progressTimeline = adminPage.getByRole('region', {
    name: 'Current assignment-date progress and historical first events by date',
  })
  await expect(progressTimeline.getByRole('img', { name: /Video Editing — 2 completed first event/ })).toBeVisible()
  await expect(progressTimeline.getByRole('img', { name: /Video Editing — 1 approved first event/ })).toBeVisible()
  assert.equal(
    await progressTimeline
      .locator('.progress-segment.task-type-video-editing')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    videoFill,
  )
  assert.equal(
    await progressTimeline
      .locator('.progress-segment.task-type-canva-poster')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    canvaFill,
  )
  await expect(progressTimeline.locator('.progress-segment.task-type-video-editing').first()).toHaveAttribute(
    'title',
    /Video Editing/,
  )
  await expect(progressTimeline.locator('.progress-segment.task-type-canva-poster').first()).toHaveAttribute(
    'title',
    /Canva Poster/,
  )
  await expect(adminPage.locator('.progress-segment.progress-open')).toHaveCount(2)
  await navigate(employeePage, 'Team tasks')
  await expect(employeePage.getByRole('heading', { name: 'Design campaign poster' })).toBeVisible()
  await expect(employeePage.getByRole('button', { name: 'Start task', exact: true })).toHaveCount(0)
  await navigate(employeePage, 'Time off')
  const leave = employeePage.locator('[data-form="absence-leave"]')
  const tomorrow = businessDate(Date.now() + 86400000)
  await leave.getByLabel('First day').fill(tomorrow)
  await leave.getByLabel('Last day').fill(tomorrow)
  await leave.getByLabel('Reason', { exact: true }).fill('Synthetic personal leave')
  await submit(leave, 'Send leave request')
  await saved(employeePage)
  const permission = employeePage.locator('[data-form="absence-permission"]')
  await permission.getByLabel('Date', { exact: true }).fill(businessDate())
  await permission.getByLabel('From', { exact: true }).fill('10:30')
  await permission.getByLabel('To', { exact: true }).fill('11:30')
  await permission.getByLabel('Reason', { exact: true }).fill('Synthetic appointment')
  await submit(permission, 'Send permission request')
  await saved(employeePage)
  await navigate(adminPage, 'Time off')
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  for (let i = 0; i < 2; i++) {
    await adminPage.getByRole('button', { name: 'Approve', exact: true }).first().click()
    await submit(adminPage.locator('[data-form="absence-decision"]'), 'Confirm decision')
    await saved(adminPage)
  }
  await navigate(employeePage, 'Inbox')
  await expect(employeePage.getByText('Production update', { exact: true })).toBeVisible()
  await expect(employeePage.locator('#push-status')).toContainText('not configured')
  await navigate(adminPage, 'Analytics')
  const reportingMonth = businessDate().slice(0, 7)
  const reportingYear = reportingMonth.slice(0, 4)
  const analyticsFilters = adminPage.locator('form[data-form="filters"]')
  await expect(adminPage.getByRole('heading', { name: 'Team summary', exact: true })).toBeVisible()
  await analyticsFilters.getByLabel('Reporting period', { exact: true }).selectOption('month')
  await analyticsFilters.getByLabel('Month', { exact: true }).fill(reportingMonth)
  await analyticsFilters.getByLabel('Team member', { exact: true }).selectOption({ label: 'Test Editor · Employee' })
  const selectedEmployeeId = await analyticsFilters.getByLabel('Team member', { exact: true }).inputValue()
  const monthRequest = adminPage.waitForRequest(
    (request) =>
      request.url().includes('/api/portal/analytics?') &&
      request.url().includes(`month=${reportingMonth}`) &&
      request.url().includes('employeeId='),
  )
  await analyticsFilters.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await monthRequest
  await expect(adminPage.locator('form[data-form="filters"] .fine')).toContainText(`Month: ${reportingMonth}`)
  await expect(adminPage.locator('form[data-form="filters"] .fine')).toContainText('Team member: Test Editor')
  await expect(
    adminPage
      .getByRole('list', { name: 'Current task status and attendance by team member' })
      .locator(':scope > .employee-row'),
  ).toHaveCount(1)
  await expect(
    adminPage.getByRole('list', { name: 'Current task status and attendance by team member' }),
  ).toContainText('Test Editor')
  const [monthDownload, monthExport] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.waitForRequest(
      (request) =>
        request.url().includes('/api/portal/export?') &&
        request.url().includes(`month=${reportingMonth}`) &&
        request.url().includes('employeeId='),
    ),
    adminPage.locator('[data-action="export"]').click(),
  ])
  assert.ok(monthDownload.suggestedFilename().endsWith('.xlsx'))
  assert.equal(new URL(monthExport.url()).searchParams.get('employeeId'), selectedEmployeeId)
  const quickFilters = adminPage.getByRole('group', { name: 'Quick chart date filters' })
  await expect(quickFilters).toBeVisible()
  for (const [preset, label] of [
    ['24h', '24 hours'],
    ['3d', '3 days'],
    ['5d', '5 days'],
    ['7d', '7 days'],
    ['month', '1 month'],
  ]) {
    const quick = analyticsPresetFilters(preset, businessDate())
    const quickRequest = adminPage.waitForRequest((request) => {
      const url = request.url()
      return (
        url.includes('/api/portal/analytics?') &&
        (quick.period === 'month'
          ? url.includes(`month=${quick.month}`)
          : url.includes(`from=${quick.from}`) && url.includes(`to=${quick.to}`)) &&
        url.includes('employeeId=')
      )
    })
    await quickFilters.getByRole('button', { name: label, exact: true }).click()
    await quickRequest
    await expect(quickFilters.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await analyticsFilters.getByLabel('Reporting period', { exact: true }).selectOption('year')
  await analyticsFilters.getByLabel('Year', { exact: true }).fill(reportingYear)
  const yearRequest = adminPage.waitForRequest(
    (request) =>
      request.url().includes('/api/portal/analytics?') &&
      request.url().includes(`year=${reportingYear}`) &&
      !request.url().includes('month='),
  )
  await analyticsFilters.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await yearRequest
  await expect(adminPage.locator('form[data-form="filters"] .fine')).toContainText(`Year: ${reportingYear}`)
  await expect(adminPage.locator('form[data-form="filters"] [name="employeeId"]')).toHaveValue(selectedEmployeeId)
  await expect(adminPage.getByRole('heading', { name: 'Team attendance & work', exact: true })).toBeVisible()
  await expect(
    adminPage
      .getByRole('list', { name: 'Current task status and attendance by team member' })
      .locator(':scope > .employee-row'),
  ).not.toHaveCount(0)
  await expect(editorProgress(adminPage).locator('.employee-label strong')).toHaveText('3 of 3 completed (100%)')
  await analyticsFilters.getByLabel('Job function', { exact: true }).selectOption('video editing')
  await analyticsFilters.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(editorProgress(adminPage).locator('.employee-label strong')).toHaveText('2 of 2 completed (100%)')
  await expect(editorProgress(adminPage).locator('.assignment-slot.task-type-canva-poster')).toHaveCount(0)
  await expect(
    adminPage
      .getByRole('region', { name: 'Current assignment-date progress and historical first events by date' })
      .getByRole('img', { name: /Video Editing — 2 completed first event/ }),
  ).toBeVisible()
  await analyticsFilters.getByLabel('Job function', { exact: true }).selectOption('')
  await analyticsFilters.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(editorProgress(adminPage).locator('.employee-label strong')).toHaveText('3 of 3 completed (100%)')
  await adminPage.getByText('View assignment-date counts', { exact: true }).click()
  await expect(adminPage.getByRole('cell', { name: /Video Editing: 2\/2 · Canva Poster: 1\/1/ })).toBeVisible()
  await accessibility(adminPage, 'Admin analytics')
  const [download] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.getByRole('button', { name: 'Download Excel', exact: true }).click(),
  ])
  await download.saveAs(resolve(folder, 'report.xlsx'))
  const workbook = unzipSync(new Uint8Array(await readFile(resolve(folder, 'report.xlsx'))))
  assert.equal(Object.keys(workbook).filter((p) => /worksheets\/sheet\d.xml$/.test(p)).length, 6)
  assert.match(strFromU8(workbook['xl/worksheets/sheet2.xml']), /<c r="C1"[^>]*>.*?Role<\/t>/)
  await adminPage.screenshot({ path: resolve(screenshots, 'admin-analytics.png'), fullPage: true })
  await adminPage.setViewportSize({ width: 375, height: 812 })
  await noOverflow(adminPage)
  await accessibility(adminPage, 'Admin mobile category analytics')
  await adminPage.screenshot({ path: resolve(screenshots, 'admin-analytics-mobile.png'), fullPage: true })
  await adminPage.setViewportSize({ width: 812, height: 375 })
  await noOverflow(adminPage)
  await adminPage.setViewportSize({ width: 1440, height: 1000 })
  await analyticsFilters.getByLabel('Team member', { exact: true }).selectOption({ label: 'Test Admin · Admin' })
  await analyticsFilters.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(analyticsFilters.locator('.fine')).toContainText('Team member: Test Admin')
  const adminRow = adminPage.getByRole('listitem', { name: 'Test Admin, Admin' })
  await expect(adminRow).toContainText("Today's first login")
  await expect(adminRow).toContainText('logged today')
  const [adminDownload] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.getByRole('button', { name: 'Download Excel', exact: true }).click(),
  ])
  await adminDownload.saveAs(resolve(folder, 'admin-report.xlsx'))
  const adminWorkbook = unzipSync(new Uint8Array(await readFile(resolve(folder, 'admin-report.xlsx'))))
  const adminSheet = strFromU8(adminWorkbook['xl/worksheets/sheet2.xml'])
  assert.match(adminSheet, /<c r="C2"[^>]*>.*?Admin<\/t>/)
  assert.match(adminSheet, /<c r="F2"><v>[1-9]\d*<\/v><\/c>/)
  await navigate(employeePage, 'Overview')
  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await employeePage.screenshot({ path: resolve(screenshots, 'employee-desktop.png'), fullPage: true })
  await employeePage.setViewportSize({ width: 375, height: 812 })
  await noOverflow(employeePage)
  await employeePage.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(employeePage.getByRole('button', { name: 'Close menu' })).toBeVisible()
  await branding(employeePage, 'sidebar')
  assert.ok(
    await employeePage.locator('.side-brand').evaluate((node) => node.scrollWidth <= node.clientWidth),
    'Sidebar branding and close button must fit together',
  )
  await employeePage.keyboard.press('Escape')
  await expect(employeePage.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused()
  await accessibility(employeePage, 'employee mobile')
  await employeePage.screenshot({ path: resolve(screenshots, 'employee-mobile.png'), fullPage: true })
  await employeePage.setViewportSize({ width: 812, height: 375 })
  await noOverflow(employeePage)
  await employeePage.setViewportSize({ width: 768, height: 1024 })
  await noOverflow(employeePage)
  assert.deepEqual(errors, [], 'No uncaught JS or CSP errors')
  const sw = await fetch(base + '/portal/sw.js')
  assert.equal(sw.status, 200)
  assert.ok(sw.headers.get('content-security-policy').includes("worker-src 'self'"))
  console.info(
    'Browser delivery check passed: real local D1, Admin/Employee workflows, Excel, desktop/mobile, accessibility and CSP.',
  )
} finally {
  await browser?.close()
  worker?.kill('SIGTERM')
  if (worker && worker.exitCode === null)
    await Promise.race([new Promise((resolve) => worker.once('exit', resolve)), delay(5000)])
  await rm(folder, { recursive: true, force: true })
}
