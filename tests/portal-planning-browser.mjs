import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { deadlineDate, groupTasksByMonth } from '../portal/planning.mjs'
import { sortTasks } from '../portal/task-presentation.mjs'

// Uses only the isolated browser suite's synthetic users and private local D1.
export async function verifyPlanning({ adminPage, employeePage, navigate, accessibility, noOverflow }) {
  const base = new URL(adminPage.url()).origin
  const read = async (page = adminPage) => {
    const response = await page.request.get(`${base}/api/portal/snapshot`)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const act = async (data, page = adminPage) => {
    const session = await (await page.request.get(`${base}/api/portal/session`)).json()
    const response = await page.request.post(`${base}/api/portal/actions`, {
      headers: { Origin: base, 'X-CSRF-Token': session.csrfToken },
      data,
    })
    assert.equal(response.status(), 200, `Planning action ${data.type}: ${await response.text()}`)
  }
  // Exercise the same update trigger as incoming portal notifications, without waiting 15 seconds.
  const poll = (page) =>
    page.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'portal-inbox-update' } })),
    )
  const dateButton = (page, date) => page.locator(`[data-action="calendar-day"][data-id="${date}"]`)
  const row = (page, id) => page.locator(`.planning-task-row[data-id="${id}"]`)
  const dismissPopup = async (page) => {
    const popup = page.locator('#inbox-popup')
    if (await popup.count()) {
      await popup.getByRole('button', { name: 'Dismiss', exact: true }).click()
      await expect(popup).toHaveCount(0)
    }
  }
  const evidence = process.env.PORTAL_PLANNING_PREVIEWS || '/tmp/adplix-portal-planning'
  await mkdir(evidence, { recursive: true })
  const before = await read()
  const employee = (await read(employeePage)).user
  const existing = before.tasks.find((task) => task.assigneeId === employee.id && task.state === 'Completed')
  const colleague = before.tasks.find((task) => task.assigneeId !== employee.id)
  assert.ok(existing && colleague, 'Synthetic own completed and colleague tasks are available')
  const tomorrow = new Date(`${before.today}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const nextDate = tomorrow.toISOString().slice(0, 10)
  const boundaryDeadline = new Date(tomorrow.getTime() - 330 * 60_000 + 15 * 60_000).toISOString()
  const taskTitle = 'Planning midnight deadline <img src=x>'
  await act({
    type: 'task.create',
    title: taskTitle,
    assigneeId: employee.id,
    clientId: existing.clientId,
    jobFunction: existing.jobFunction,
    deadline: boundaryDeadline,
    priority: 'High',
    description: 'Private synthetic task details',
  })
  const task = (await read()).tasks.find((item) => item.title === taskTitle)
  assert.ok(task)
  await navigate(employeePage, 'Calendar')
  await employeePage.getByRole('button', { name: 'Refresh', exact: true }).click()
  assert.match(employeePage.url(), /\/portal\/#calendar$/)
  assert.ok(await employeePage.title())
  await expect(employeePage.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible()
  await expect(employeePage.locator('vite-error-overlay')).toHaveCount(0)
  await expect(employeePage.getByLabel('Task visibility')).toHaveValue('mine')
  await expect(employeePage.getByLabel('Assignee', { exact: true })).toHaveCount(0)
  await expect(employeePage.getByRole('button', { name: 'Add event', exact: true })).toHaveCount(0)
  if (nextDate.slice(0, 7) !== before.today.slice(0, 7))
    await employeePage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(employeePage, nextDate).click()
  await expect(dateButton(employeePage, nextDate)).toHaveAttribute('aria-pressed', 'true')
  await expect(row(employeePage, task.id)).toContainText('12:15 am')
  await expect(row(employeePage, task.id)).toContainText('High priority')
  await expect(row(employeePage, task.id)).toContainText(taskTitle)
  await expect(employeePage.locator('.planning-agenda img')).toHaveCount(0)
  await row(employeePage, task.id).click()
  const dialog = employeePage.getByRole('dialog', { name: 'Task details', exact: true })
  await expect(dialog).toContainText('Private synthetic task details')
  await expect(dialog.getByRole('button', { name: 'Adjust deadline', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Start task', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(row(employeePage, task.id)).toContainText('In-progress')
  await expect(row(employeePage, task.id)).toBeFocused()
  await row(employeePage, task.id).click()
  await dialog.getByRole('button', { name: 'Complete task', exact: true }).click()
  await expect(row(employeePage, task.id)).toContainText('Completed')

  await employeePage.getByLabel('Task visibility').selectOption('all')
  const peerDate = deadlineDate(colleague.deadline)
  if (peerDate.slice(0, 7) !== nextDate.slice(0, 7))
    await employeePage.getByRole('button', { name: 'Previous month', exact: true }).click()
  await dateButton(employeePage, peerDate).click()
  await row(employeePage, colleague.id).click()
  await expect(dialog).toContainText('Read-only team task')
  await expect(
    dialog.locator('[data-action="transition"], [data-action="approve"], [data-action="deadline"]'),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(row(employeePage, colleague.id)).toBeFocused()
  await employeePage.getByLabel('Task visibility').selectOption('mine')
  if (peerDate.slice(0, 7) !== nextDate.slice(0, 7))
    await employeePage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(employeePage, nextDate).click()
  await employeePage.getByLabel('Task status').selectOption('Completed')
  await employeePage.getByLabel('Task status').focus()
  const eventTitle = 'Planning shared review'
  await act({
    type: 'event.create',
    title: eventTitle,
    date: nextDate,
    time: '',
    description: 'All-day planning event',
  })
  await poll(employeePage)
  await expect(employeePage.locator('.planning-agenda')).toContainText(eventTitle)
  await expect(employeePage.getByLabel('Task status')).toHaveValue('Completed')
  await expect(employeePage.getByLabel('Task status')).toBeFocused()
  await expect(dateButton(employeePage, nextDate)).toHaveAttribute('aria-pressed', 'true')
  await expect(employeePage.locator('.planning-agenda-list > :first-child')).toHaveClass('planning-event-row')
  await expect(employeePage.locator('.planning-event-row [data-action="event-edit"]')).toHaveCount(0)

  await navigate(adminPage, 'Calendar')
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(adminPage.getByLabel('Task visibility')).toHaveValue('all')
  await adminPage.getByLabel('Assignee', { exact: true }).selectOption(employee.id)
  await adminPage.getByLabel('Client', { exact: true }).selectOption(task.clientId)
  if (nextDate.slice(0, 7) !== before.today.slice(0, 7))
    await adminPage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(adminPage, nextDate).click()
  await row(adminPage, task.id).click()
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Adjust deadline', exact: true }).click()
  const newMonth = new Date(`${nextDate.slice(0, 7)}-01T00:00:00Z`)
  newMonth.setUTCMonth(newMonth.getUTCMonth() + 1)
  const movedDate = `${newMonth.toISOString().slice(0, 7)}-02`
  await adminPage.getByLabel('New deadline · Asia/Kolkata (IST)').fill(`${movedDate}T09:00`)
  await adminPage.getByRole('button', { name: 'Save deadline', exact: true }).click()
  await expect(adminPage.getByRole('dialog')).not.toBeVisible()
  await expect(row(adminPage, task.id)).toHaveCount(0)
  await poll(employeePage)
  await expect(row(employeePage, task.id)).toHaveCount(0)
  await expect(employeePage.getByLabel('Task status')).toHaveValue('Completed')
  await expect(dateButton(employeePage, nextDate)).toHaveAttribute('aria-pressed', 'true')
  await adminPage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(adminPage, movedDate).click()
  await expect(row(adminPage, task.id)).toContainText('9:00 am')
  await expect(adminPage.getByLabel('Assignee', { exact: true })).toHaveValue(employee.id)

  await navigate(adminPage, 'Assignments')
  const afterMove = await read()
  const groups = groupTasksByMonth(afterMove.tasks, afterMove.today, sortTasks)
  assert.deepEqual(
    await adminPage
      .locator('.assignment-month')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.assignmentMonth)),
    groups.map((group) => group.month),
  )
  for (const group of groups) {
    assert.deepEqual(
      await adminPage
        .locator(`.assignment-month[data-assignment-month="${group.month}"] [data-task-id]`)
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.taskId)),
      group.tasks.map((item) => item.id),
    )
  }
  await adminPage.getByLabel('Deadline month · IST', { exact: true }).selectOption(movedDate.slice(0, 7))
  await expect(adminPage.locator('.assignment-month')).toHaveCount(1)
  await expect(adminPage.locator('.assignment-month')).toContainText(taskTitle)
  await adminPage.getByLabel('Deadline month · IST', { exact: true }).focus()
  await act({
    type: 'task.create',
    title: 'Live planning assignment',
    assigneeId: employee.id,
    clientId: task.clientId,
    jobFunction: task.jobFunction,
    deadline: `${movedDate}T08:00:00Z`,
    priority: 'Normal',
    description: '',
  })
  await poll(adminPage)
  await expect(adminPage.locator('.assignment-month')).toContainText('Live planning assignment')
  await expect(adminPage.getByLabel('Deadline month · IST', { exact: true })).toHaveValue(movedDate.slice(0, 7))
  await expect(adminPage.getByLabel('Deadline month · IST', { exact: true })).toBeFocused()
  await accessibility(adminPage, 'month-segregated assignments')
  await dismissPopup(adminPage)
  await adminPage.screenshot({ path: join(evidence, 'assignments-desktop.png'), fullPage: true })
  await adminPage.setViewportSize({ width: 375, height: 812 })
  await noOverflow(adminPage)
  await accessibility(adminPage, 'mobile month-segregated assignments')
  await adminPage.setViewportSize({ width: 1440, height: 1000 })

  await navigate(employeePage, 'Calendar')
  await employeePage.getByLabel('Task status').selectOption('all')
  await employeePage.getByRole('button', { name: 'Today', exact: true }).click()
  const today = dateButton(employeePage, before.today)
  await expect(today).toHaveAttribute('aria-current', 'date')
  await today.focus()
  await employeePage.keyboard.press('ArrowLeft')
  const yesterday = new Date(`${before.today}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  await expect(dateButton(employeePage, yesterday.toISOString().slice(0, 10))).toBeFocused()
  await employeePage.keyboard.press('ArrowRight')
  await expect(today).toBeFocused()
  const first = `${before.today.slice(0, 7)}-01`
  await dateButton(employeePage, first).focus()
  await employeePage.keyboard.press('ArrowLeft')
  const previous = new Date(`${first}T00:00:00Z`)
  previous.setUTCDate(0)
  await expect(dateButton(employeePage, previous.toISOString().slice(0, 10))).toBeFocused()
  await employeePage.getByRole('button', { name: 'Today', exact: true }).click()
  await employeePage.getByRole('button', { name: /^Overdue \d+/ }).click()
  await expect(employeePage.locator('.planning-agenda')).toContainText('Across all deadline months')
  await employeePage.getByRole('button', { name: 'Today', exact: true }).click()
  if (nextDate.slice(0, 7) !== before.today.slice(0, 7))
    await employeePage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(employeePage, nextDate).click()
  await employeePage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(employeePage, movedDate).click()
  await poll(employeePage)
  await expect(row(employeePage, task.id)).toContainText('Completed')
  await expect(employeePage.locator('.planning-agenda')).toContainText('Live planning assignment')
  await accessibility(employeePage, 'employee deadline calendar desktop')
  await noOverflow(employeePage)
  await dismissPopup(employeePage)
  await employeePage.screenshot({ path: join(evidence, 'calendar-desktop.png'), fullPage: true })
  await employeePage.getByRole('button', { name: 'Switch to dark theme', exact: true }).click()
  await expect(employeePage.locator('.planning-agenda')).toHaveCSS('background-color', 'rgb(41, 39, 36)')
  await accessibility(employeePage, 'employee deadline calendar dark')
  await employeePage.setViewportSize({ width: 375, height: 812 })
  await noOverflow(employeePage)
  await accessibility(employeePage, 'employee deadline calendar dark mobile')
  await employeePage.screenshot({ path: join(evidence, 'calendar-mobile-dark.png'), fullPage: true })
  await employeePage.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
  await expect(employeePage.locator('.topbar .profile-name')).toHaveCSS('color', 'rgb(40, 37, 34)')
  await accessibility(employeePage, 'employee deadline calendar mobile')
  await employeePage.setViewportSize({ width: 320, height: 812 })
  await noOverflow(employeePage)
  await employeePage.setViewportSize({ width: 1440, height: 1000 })
  await employeePage.getByRole('button', { name: 'Previous month', exact: true }).click()
  await dateButton(employeePage, nextDate).click()
  await navigate(adminPage, 'Calendar')
  await adminPage.getByRole('button', { name: 'Today', exact: true }).click()
  if (nextDate.slice(0, 7) !== before.today.slice(0, 7))
    await adminPage.getByRole('button', { name: 'Next month', exact: true }).click()
  await dateButton(adminPage, nextDate).click()
  const eventRow = adminPage.locator('.planning-event-row').filter({ hasText: eventTitle })
  await eventRow.getByRole('button', { name: 'Edit', exact: true }).click()
  await adminPage.getByLabel('Event title', { exact: true }).fill('Edited planning shared review')
  await adminPage.getByRole('button', { name: 'Save event', exact: true }).click()
  await expect(adminPage.locator('.planning-agenda')).toContainText('Edited planning shared review')
  await poll(employeePage)
  await expect(employeePage.locator('.planning-agenda')).toContainText('Edited planning shared review')
  await adminPage
    .locator('.planning-event-row')
    .filter({ hasText: 'Edited planning shared review' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(adminPage.locator('.planning-event-row')).toHaveCount(0)
  await poll(employeePage)
  await expect(employeePage.locator('.planning-event-row')).toHaveCount(0)
  console.info(
    `Planning checks passed: deadline sync, IST boundaries, month grouping, scope/permissions, live changes, keyboard, mobile/dark accessibility. Evidence: ${evidence}`,
  )
}
