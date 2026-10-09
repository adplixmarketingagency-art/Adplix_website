import { gsap } from 'gsap'
import '@fontsource-variable/geist/wght.css'
import './styles.css'
import './brand.css'
import './analytics-charts.css'
import './ui.css'
import { portalBrand } from './brand.mjs'
import { employeeChart, trendChart as renderTrendChart } from './analytics-charts.mjs'
import { analyticsPresetFilters } from './analytics-filters.mjs'
import { parseJsonResponse } from './http.mjs'
import { dailyStatusDisplay } from './daily-status.mjs'
import { sortTasks, taskStateClass } from './task-presentation.mjs'
import { PHOTO_SIZES, preparePhoto, savedPhotoFile } from './photo.mjs'
import { serverOffset, todayLoginExpired } from './today-login.mjs'

const root = document.querySelector('#app')
const API = '/api/portal'
const state = {
  user: null,
  csrf: '',
  snapshot: null,
  view: '',
  calendarMonth: null,
  busy: false,
  drawer: false,
  navScrollTop: 0,
  photo: undefined,
  photoFile: null,
  photoSize: 128,
  photoNotice: '',
  photoBusy: false,
  photoToken: 0,
  analytics: null,
  analyticsSequence: 0,
  analyticsQuickRange: '',
  serverOffset: 0,
  filters: {},
  push: null,
  message: '',
  error: '',
}
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )
const arr = (value) => (Array.isArray(value) ? value : [])
const admin = () => state.user?.role === 'Admin'
const adminViews = ['team', 'clients', 'admin-tasks', 'reviews', 'notes', 'analytics']
const permittedView = (name) => (!admin() && adminViews.includes(name) ? 'dashboard' : name)
const svgIcon = (name) =>
  name === 'menu'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>'
const kolkataISO = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a valid Asia/Kolkata date and time.')
  const iso = new Date(`${value}:00+05:30`)
  if (Number.isNaN(iso.getTime())) throw new Error('Enter a valid Asia/Kolkata date and time.')
  return iso.toISOString()
}
const kolkataInput = (value) =>
  value
    ? new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(new Date(value))
        .replace(' ', 'T')
    : ''
const date = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value))
    : '—'
const duration = (value) =>
  `${Math.floor((Number(value) || 0) / 3600)}h ${Math.floor(((Number(value) || 0) % 3600) / 60)}m`
const serviceTypeLabel = (value) =>
  ({ videos: 'Videos', posters: 'Posters', both: 'Videos + posters', video: 'Videos', poster: 'Posters' })[value] ||
  'Videos + posters'
let fieldSequence = 0
const field = (title, control) => {
  const id = `portal-field-${++fieldSequence}`
  return `<div class="field"><label for="${id}">${esc(title)}</label>${control.replace(/^<(input|textarea|select)\b/, `<$1 id="${id}"`)}</div>`
}
const input = (name, title, type = 'text', value = '', extra = '') =>
  field(title, `<input name="${name}" type="${type}" value="${esc(value)}" ${extra}>`)
const area = (name, title, value = '', extra = '') =>
  field(title, `<textarea name="${name}" ${extra}>${esc(value)}</textarea>`)
const options = (items, selected = '', placeholder = 'Choose…') =>
  `<option value="">${esc(placeholder)}</option>${items.map((x) => `<option value="${esc(x.id)}" ${String(x.id) === String(selected) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`
const select = (name, title, items, selected = '', required = true) =>
  field(title, `<select name="${name}" ${required ? 'required' : ''}>${options(items, selected)}</select>`)
const btn = (text, action, id = '', cls = '') =>
  `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`
const taskButton = (text, action, task, nextState, cls = '') =>
  btn(text, action, task.id, cls).replace(
    '<button ',
    `<button data-next-state="${esc(nextState)}" data-version="${task.version}" `,
  )
const empty = (text) => `<p class="empty">${esc(text)}</p>`
const fmtDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(
        new Date(value),
      )
    : '—'
const jobFunctions = [
  'shooting/production',
  'video editing',
  'Canva design',
  'Instagram publishing',
  'website development',
  'website maintenance',
]
const analyticsQuickPresets = [
  ['24h', '24 hours'],
  ['3d', '3 days'],
  ['5d', '5 days'],
  ['7d', '7 days'],
  ['month', '1 month'],
]
const statusTag = (value) => `<span class="tag">${esc(value || 'Pending')}</span>`
const photoAvatar = (user, className, alt = '') => {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const photo = user.profile?.photoDataUrl
  return photo
    ? `<span class="${className}"><img src="${esc(photo)}" alt="${esc(alt)}"></span>`
    : `<span class="${className}" ${alt ? `role="img" aria-label="${esc(alt)}"` : 'aria-hidden="true"'}>${esc(initials)}</span>`
}
const clearPendingPhoto = () => {
  state.photo = undefined
  state.photoFile = null
  state.photoSize = 128
  state.photoNotice = ''
  state.photoBusy = false
  state.photoToken++
}
function updateDailyTag(tag, status) {
  if (!tag) return
  const display = dailyStatusDisplay(status)
  if (tag.className !== `tag ${display.className}`) tag.className = `tag ${display.className}`
  if (tag.textContent !== display.label) tag.textContent = display.label
}
const section = (title, body, extra = '') =>
  `<section class="panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`

async function request(path, options = {}) {
  let response
  const csrfAtStart = state.csrf
  try {
    response = await fetch(API + path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Cannot reach the portal. Check your connection and try again.')
  }
  if (!response.ok) {
    let error
    try {
      await parseJsonResponse(response)
    } catch (caught) {
      error = caught
    }
    if (
      response.status === 401 &&
      csrfAtStart === state.csrf &&
      path !== '/login' &&
      path !== '/session' &&
      path !== '/register'
    ) {
      clearPendingPhoto()
      state.user = null
      state.csrf = ''
      state.snapshot = null
      state.analytics = null
      state.analyticsSequence++
      state.error = 'Your session expired. Please sign in again.'
      login()
      error.sessionExpired = true
    }
    throw error
  }
  return response
}
const json = async (path, options) => parseJsonResponse(await request(path, options))
const post = (path, body) => json(path, { method: 'POST', body: JSON.stringify(body) })
async function load() {
  const user = state.user?.id,
    csrf = state.csrf
  const snapshot = await json('/snapshot')
  if (state.user?.id !== user || state.csrf !== csrf) return false
  state.snapshot = snapshot
  state.user = snapshot.user
  state.serverOffset = serverOffset(snapshot.serverNow)
  return true
}
function flash(text, failure = false) {
  if (!state.user && document.querySelector('.auth') && state.error === 'Your session expired. Please sign in again.')
    return
  state.message = failure ? '' : text
  state.error = failure ? text : ''
  const node = document.querySelector('#modal:open #modal-feedback') || document.querySelector('#feedback')
  if (node) {
    node.textContent = text
    node.className = failure ? 'feedback error' : 'feedback success'
    node.focus()
  }
}
function scene() {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
    gsap.from('.panel, .hero', {
      opacity: 0,
      y: 9,
      duration: 0.28,
      stagger: 0.035,
      ease: 'power1.out',
      clearProps: 'all',
    })
}

function login() {
  root.innerHTML = `<main class="auth"><div class="auth-card">${portalBrand()}<p class="eyebrow">Private workspace</p><h1>Welcome back.</h1><p class="muted">Sign in with your approved email address.</p><div id="feedback" class="feedback ${state.error ? 'error' : ''}" role="alert" tabindex="-1">${esc(state.error)}</div><form data-form="login">${input('email', 'Email address', 'email', '', 'required autocomplete="username"')}${input('password', 'Portal password', 'password', '', 'required autocomplete="current-password"')}<button class="show-pass" type="button" data-action="show-password" aria-label="Show password" aria-pressed="false">Show password</button><button class="primary full" type="submit">Sign in</button></form><button class="text-button" type="button" data-action="register">Register / request access</button><p class="fine">New accounts require administrator approval before sign-in.</p></div></main>`
}
function register() {
  state.error = ''
  root.innerHTML = `<main class="auth"><div class="auth-card">${portalBrand()}<p class="eyebrow">Request access</p><h1>Register for the workspace</h1><p class="muted">An administrator will review your request before you can sign in.</p><div id="feedback" class="feedback" role="alert" tabindex="-1"></div><form data-form="register">${input('name', 'Full name', 'text', '', 'required autocomplete="name"')}${input('designation', 'Designation', 'text', '', 'required')}${input('email', 'Email address', 'email', '', 'required autocomplete="email"')}${input('password', 'Password (at least 12 characters)', 'password', '', 'required minlength="12" autocomplete="new-password"')}${input('confirmation', 'Confirm password', 'password', '', 'required minlength="12" autocomplete="new-password"')}<button class="primary full" type="submit">Request access</button></form><button class="text-button" type="button" data-action="sign-in">Back to sign in</button></div></main>`
  root.querySelector('[name="name"]')?.focus()
}
function registrationConfirmation(message) {
  root.innerHTML = `<main class="auth"><div class="auth-card">${portalBrand()}<p class="eyebrow">Request sent</p><h1 tabindex="-1">Wait for administrator approval</h1><p class="muted">${esc(message || 'Your registration request was received. You can sign in after an administrator approves it.')}</p><button class="text-button" type="button" data-action="sign-in">Back to sign in</button></div></main>`
  root.querySelector('h1')?.focus()
}
function changePassword() {
  root.innerHTML = `<main class="auth"><div class="auth-card">${portalBrand()}<p class="eyebrow">Account security</p><h1>Set a new password</h1><p class="muted">Your temporary password must be changed before opening the workspace. Current password means the temporary password you used to sign in.</p><div id="feedback" class="feedback" role="alert" tabindex="-1"></div><form data-form="password">${input('currentPassword', 'Current password', 'password', '', 'required autocomplete="current-password"')}${input('newPassword', 'New password', 'password', '', 'required minlength="12" autocomplete="new-password"')}<button class="primary full" type="submit">Update password</button></form><button class="text-button" type="button" data-action="logout">Sign out</button></div></main>`
}
function navigation() {
  const nav = [
    ['dashboard', 'Overview'],
    ['tasks', 'My tasks'],
    ['team-tasks', 'Team tasks'],
    ['calendar', 'Calendar'],
    ['requests', 'Time off'],
    ['notifications', 'Inbox'],
    ['profile', 'Profile'],
    ...(admin()
      ? [
          ['team', 'Team'],
          ['clients', 'Clients'],
          ['admin-tasks', 'Assignments'],
          ['reviews', 'Review queue'],
          ['notes', 'Notes & broadcasts'],
          ['analytics', 'Analytics'],
        ]
      : []),
  ]
  return `<aside class="sidebar ${state.drawer ? 'open' : ''}" id="sidebar" aria-label="Workspace menu"><div class="side-brand">${portalBrand('sidebar')}<button class="side-close" type="button" data-action="drawer" aria-label="Close menu">${svgIcon('close')}</button></div><nav aria-label="Workspace">${nav.map(([key, title]) => `<a href="#${key}" class="${state.view === key ? 'active' : ''}" ${state.view === key ? 'aria-current="page"' : ''}>${title}</a>`).join('')}</nav><div class="side-foot"><span>${esc(state.user.name)}</span><small>${esc(state.user.role)}</small>${btn('Sign out', 'logout', '', 'quiet')}</div></aside>`
}
function shell() {
  const previousNav = document.querySelector('#sidebar nav')
  if (previousNav) state.navScrollTop = previousNav.scrollTop
  let content
  const views = {
    dashboard,
    tasks: () => tasks(false),
    'team-tasks': () => tasks(true),
    calendar,
    requests,
    notifications,
    profile,
    team,
    clients,
    'admin-tasks': adminTasks,
    reviews,
    notes,
    analytics: analyticsView,
  }
  content = (views[state.view] || dashboard)()
  root.innerHTML = `<a class="skip-link" href="#main">Skip to content</a><div class="layout">${navigation()}<div class="scrim ${state.drawer ? 'visible' : ''}" data-action="drawer"></div><div class="work"><header class="topbar"><button type="button" class="menu" data-action="drawer" aria-controls="sidebar" aria-label="Open menu" aria-expanded="${state.drawer}">${svgIcon('menu')}</button><div class="topbar-context"><span class="eyebrow">Adplix Media / ${esc(state.view.replaceAll('-', ' '))}</span><p>${esc(state.snapshot?.today || '')}</p></div><div class="identity">${photoAvatar(state.user, 'identity-avatar')}<div class="identity-copy"><strong>${esc(state.user.name)}</strong><div class="identity-meta"><span>${esc(state.user.role)}</span><span>${esc(state.user.designation || 'Unassigned')}</span></div></div></div>${btn('Refresh', 'refresh', '', 'refresh-control')}</header><main id="main" class="content" tabindex="-1"><div id="feedback" class="feedback ${state.error ? 'error' : state.message ? 'success' : ''}" role="alert" tabindex="-1">${esc(state.error || state.message)}</div>${content}</main></div></div><dialog id="modal" aria-labelledby="modal-title"><div id="modal-body"></div><button class="dialog-close" type="button" data-action="close-modal" aria-label="Close dialog">${svgIcon('close')}</button></dialog>`
  syncDailyStatuses(state.snapshot)
  const sidebar = document.querySelector('#sidebar')
  sidebar.querySelector('nav').scrollTop = state.navScrollTop
  document.querySelectorAll('label.field > select').forEach((control) => {
    control.setAttribute('aria-label', control.parentElement.querySelector('span').textContent)
  })
  document.querySelectorAll('.table-wrap').forEach((region) => {
    region.tabIndex = 0
    region.setAttribute('role', 'region')
    region.setAttribute('aria-label', region.querySelector('caption')?.textContent || 'Report data')
  })
  if (matchMedia('(max-width: 900px)').matches) {
    sidebar.inert = !state.drawer
    if (state.drawer) document.querySelector('.work').inert = true
  }
  syncTodayAttendance()
  scene()
}
function taskCard(task, readonly = false) {
  const person = arr(state.snapshot.employees).find((e) => e.id === task.assigneeId)
  const client = arr(state.snapshot.clients).find((c) => c.id === task.clientId)
  const overdue = task.overdue && ['Assigned', 'In-progress'].includes(task.state)
  const mine = task.assigneeId === state.user.id
  let actions = ''
  if (!readonly && mine && (!admin() || task.assigneeId === state.user.id)) {
    const next = { Assigned: 'In-progress', 'In-progress': 'Completed', Completed: 'In-progress' }[task.state]
    if (next)
      actions = taskButton(
        { Assigned: 'Start task', 'In-progress': 'Complete task', Completed: 'Reopen task' }[task.state],
        'transition',
        task,
        next,
        'small',
      )
  }
  if (admin() && !readonly && task.state === 'Completed')
    actions = `${taskButton('Approve', 'approve', task, 'Approved', 'small primary')}${btn('Reject', 'reject', task.id, 'small')}${mine ? taskButton('Reopen', 'transition', task, 'In-progress', 'small') : ''}`
  const rating = task.rating
    ? `<div class="task-rating" aria-label="Rating ${esc(task.rating)} out of 5">★ ${esc(task.rating)}/5${task.ratingNote ? ` · ${esc(task.ratingNote)}` : ''}</div>`
    : ''
  const tone = taskStateClass(task)
  return `<article class="task-card ${tone} ${overdue ? 'overdue' : ''}" data-task-id="${esc(task.id)}"><div class="task-top"><span class="eyebrow">${esc(task.jobFunction || 'Task')} · ${esc(client?.name || 'No client')}</span><span class="tag ${tone}">${esc(task.state || 'Pending')}</span></div><h3>${esc(task.title)}</h3>${task.description ? `<p>${esc(task.description)}</p>` : ''}<div class="task-meta"><span><strong class="overdue-label" ${overdue ? '' : 'hidden'}>Overdue · </strong>Due ${fmtDateTime(task.deadline)}</span><span class="task-duration">Working time ${duration(task.workSeconds)}</span>${readonly || admin() ? `<span>${esc(person?.name || 'Former employee')}</span>` : ''}</div>${rating}${actions ? `<div class="actions">${actions}</div>` : ''}</article>`
}
function dashboard() {
  const s = state.snapshot,
    own = sortTasks(arr(s.tasks).filter((t) => t.assigneeId === state.user.id)),
    active = own.filter((t) => t.state !== 'Approved')
  const all = sortTasks(arr(s.tasks)),
    review = all.filter((t) => t.state === 'Completed'),
    overdue = all.filter((t) => t.overdue)
  const update = s.updateStatus || {},
    today = arr(s.updates).find((u) => u.employeeId === state.user.id && u.date === s.today)
  return `<div class="hero"><div><p class="eyebrow">${admin() ? 'Team operations' : 'Your workspace'}</p><h1>${admin() ? 'Keep work moving.' : 'Today’s work, in focus.'}</h1><p class="muted">${admin() ? 'Assignments, approvals and updates in one place.' : 'Your tasks and daily check-in, without the noise.'}</p></div></div><div class="metrics">${(admin()
    ? [
        ['Active tasks', all.filter((t) => ['Assigned', 'In-progress'].includes(t.state)).length],
        ['Awaiting review', review.length],
        ['Overdue', overdue.length],
      ]
    : [
        ['Open tasks', active.length],
        ['Overdue', active.filter((t) => t.overdue).length],
        ['Working today', s.today || '—'],
      ]
  )
    .map(([k, v]) => `<div class="metric"><span>${k}</span><strong>${esc(v)}</strong></div>`)
    .join('')}</div><div class="grid"><div>${section(
    admin() ? 'Review queue' : 'My current tasks',
    (admin() ? review : active)
      .slice(0, 6)
      .map((t) => taskCard(t))
      .join('') || empty('Nothing needs attention right now.'),
    `<a class="inline-link" href="#${admin() ? 'reviews' : 'tasks'}">View all →</a>`,
  )}</div><div>${
    !admin()
      ? section(
          'Daily update',
          `<p class="muted" id="daily-status">${statusTag(update.status)} ${update.deadline ? `Due ${fmtDateTime(update.deadline)}` : ''}</p><form data-form="update">${area('text', 'What are you working on today?', today?.text || '', 'required maxlength="2000" rows="4"')}<button class="primary" type="submit">${today ? 'Save update' : 'Submit update'}</button></form>`,
        )
      : section(
          'Team updates today',
          arr(s.employees)
            .filter((e) => e.active && e.role === 'Employee')
            .map((e) => {
              const u = arr(s.updates).find((x) => x.date === s.today && x.employeeId === e.id)
              return `<div class="list-item" data-update-employee="${esc(e.id)}"><div class="split"><strong>${esc(e.name)}</strong>${statusTag(e.updateStatus?.status || (u ? 'Submitted' : 'Pending'))}</div><p class="update-text">${u ? esc(u.text) : 'No update submitted yet.'}</p></div>`
            })
            .join('') || empty('No active employees.'),
        )
  }${section(
    'Notes',
    arr(s.notes)
      .slice(0, 5)
      .map((n) => `<div class="list-item"><p>${esc(n.text)}</p><small>${date(n.createdAt)}</small></div>`)
      .join('') || empty('No notes yet.'),
  )}</div></div>`
}
function targetProgress() {
  const month = state.snapshot.today.slice(0, 7),
    targets = arr(state.snapshot.targets).filter((t) => t.month === month)
  if (!targets.length) return empty('No monthly client targets have been set.')
  return targets
    .map((target) => {
      const client = arr(state.snapshot.clients).find((c) => c.id === target.clientId)
      return `<div class="list-item"><div class="split"><strong>${esc(client?.name || 'Client')}</strong><span class="tag">${esc(serviceTypeLabel(target.contentType || client?.serviceType))}</span></div><p>${esc(target.postedCount)} of ${esc(target.requiredCount)} posted</p></div>`
    })
    .join('')
}
function tasks(teamView) {
  const list = sortTasks(
    arr(state.snapshot.tasks).filter((t) =>
      teamView ? t.assigneeId !== state.user.id : t.assigneeId === state.user.id,
    ),
  )
  return `<div class="page-heading"><div><p class="eyebrow">${teamView ? 'Shared visibility' : 'Assignments'}</p><h1>${teamView ? 'Team tasks' : 'My tasks'}</h1><p class="muted">${teamView ? 'Colleagues’ assignments are read-only.' : 'Working duration follows business hours and excludes approved absences.'}</p></div></div>${teamView ? section('Monthly client targets', targetProgress()) : ''}<div class="task-list">${list.map((t) => taskCard(t, teamView)).join('') || empty('No tasks to show.')}</div>`
}
function requests() {
  const s = state.snapshot
  return `<div class="page-heading"><div><p class="eyebrow">Availability</p><h1>Time off & permissions</h1></div></div><div class="grid"><div>${section(
    'Requests',
    arr(s.absences)
      .map(
        (a) =>
          `<div class="list-item"><div class="split"><strong>${esc(a.kind === 'leave' ? 'Leave' : 'Hourly permission')} · ${esc(arr(s.employees).find((e) => e.id === a.employeeId)?.name || 'You')}</strong>${statusTag(a.status)}</div><p>${esc(a.kind === 'leave' ? `${a.start} — ${a.end}` : `${fmtDateTime(a.start)} — ${fmtDateTime(a.end)}`)}</p><p>${esc(a.reason)}</p>${a.decisionNote ? `<p class="muted">Decision: ${esc(a.decisionNote)}</p>` : ''}${admin() && a.status === 'Pending' ? `<div class="actions">${btn('Approve', 'absence-approve', a.id, 'small primary')}${btn('Reject', 'absence-reject', a.id, 'small')}</div>` : ''}</div>`,
      )
      .join('') || empty('No requests yet.'),
  )}</div><div>${!admin() ? section('Request leave', `<form data-form="absence-leave">${input('start', 'First day', 'date', '', 'required')}${input('end', 'Last day', 'date', '', 'required')}${area('reason', 'Reason', '', 'required rows="3"')}<button class="primary" type="submit">Send leave request</button></form>`) + section('Request hourly permission', `<form data-form="absence-permission">${input('date', 'Date', 'date', '', 'required')}${input('startTime', 'From', 'time', '', 'required')}${input('endTime', 'To', 'time', '', 'required')}${area('reason', 'Reason', '', 'required rows="3"')}<button class="primary" type="submit">Send permission request</button></form>`) : section('Decisions', '<p class="muted">Approvals update eligible task working time. Deadlines change only when adjusted explicitly.</p>')}</div></div>`
}
function notifications() {
  const list = arr(state.snapshot.notifications)
  return `<div class="page-heading"><div><p class="eyebrow">Messages</p><h1>Inbox</h1></div></div>${section('Notifications', list.map((n) => `<div class="list-item ${n.readAt ? '' : 'unread'}"><div class="split"><strong>${esc(n.title)}</strong><small>${fmtDateTime(n.createdAt)}</small></div><p>${esc(n.text)}</p>${!n.readAt ? btn('Mark as read', 'notification-read', n.id, 'small') : ''}</div>`).join('') || empty('Your inbox is clear.'))}${section('Browser notifications', `<p class="muted">The inbox works even if browser notifications are unavailable or denied. Delivery to a closed tab depends on browser and device support.</p><p id="push-status" role="status">${esc(state.push?.message || 'Checking browser support…')}</p>${btn('Enable notifications', 'push-enable', '', 'primary')}${state.push?.enabled ? btn('Disable notifications', 'push-disable') : ''}`)}`
}
function calendar() {
  const events = arr(state.snapshot.calendarEvents)
  const monthKey = state.calendarMonth || state.snapshot.today.slice(0, 7),
    [year, monthNumber] = monthKey.split('-').map(Number),
    month = monthNumber - 1,
    first = new Date(Date.UTC(year, month, 1)),
    days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    offset = (first.getUTCDay() + 6) % 7
  const eventDays = new Set(
    events.filter((e) => e.date?.startsWith(`${monthKey}-`)).map((e) => Number(e.date.slice(-2))),
  )
  const cells = [...Array(offset).fill(''), ...Array.from({ length: days }, (_, i) => String(i + 1))]
    .map((day) =>
      day
        ? `<span class="calendar-day ${eventDays.has(Number(day)) ? 'has-event' : ''} ${`${monthKey}-${day.padStart(2, '0')}` === state.snapshot.today ? 'today' : ''}">${day}</span>`
        : '<span class="calendar-day blank" aria-hidden="true"></span>',
    )
    .join('')
  const todays = events.filter((e) => e.date === state.snapshot.today)
  const eventRow = (e) =>
    `<div class="list-item"><div class="split"><strong>${esc(e.title)}</strong><small>${esc(e.date)} · ${e.time ? esc(e.time) : 'All day'}</small></div><p>${esc(e.description || '')}</p>${admin() ? `<div class="actions">${btn('Edit', 'event-edit', e.id, 'small')}${btn('Delete', 'event-delete', e.id, 'small danger')}</div>` : ''}</div>`
  return `<div class="page-heading"><div><p class="eyebrow">Planning</p><h1>Calendar</h1><p class="muted">Shared events and today’s schedule.</p></div>${admin() ? btn('Add event', 'event-new', '', 'primary') : ''}</div><div class="calendar-month"><div class="calendar-month-head"><h2>${new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first)}</h2><div class="actions">${btn('Previous month', 'calendar-prev', '', 'small')}${btn('Next month', 'calendar-next', '', 'small')}</div></div><div class="calendar-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="calendar-days">${cells}</div></div>${section("Today's events", todays.map(eventRow).join('') || empty('No events today.'))}${section(
    'All events',
    events
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(eventRow)
      .join('') || empty('No events yet.'),
  )}`
}
function eventForm(event) {
  return `<form data-form="event" data-id="${esc(event?.id || '')}"><div class="form-grid">${input('title', 'Event title', 'text', event?.title || '', 'required maxlength="200"')}${input('date', 'Date', 'date', event?.date || state.snapshot.today, 'required')}${input('time', 'Time (optional)', 'time', event?.time || '')}</div>${area('description', 'Details', event?.description || '', 'maxlength="1000" rows="3"')}<button class="primary" type="submit">${event ? 'Save event' : 'Add event'}</button></form>`
}
function profile() {
  const p = state.user.profile || {}
  const displayed = state.photo === undefined ? p.photoDataUrl : state.photo
  const preview = photoAvatar(
    { ...state.user, profile: { ...p, photoDataUrl: displayed } },
    'profile-photo-preview',
    `Profile photo of ${state.user.name}`,
  )
  const controls = `<div class="profile-photo">${preview}<div class="photo-controls">
    <label for="profile-photo-input">Choose a profile photo</label>
    <input id="profile-photo-input" type="file" accept="image/png,image/jpeg,image/webp" ${state.photoBusy ? 'disabled' : ''} aria-describedby="profile-photo-hint">
    <p class="fine" id="profile-photo-hint">PNG, JPEG or WebP, up to 5 MiB. Photos are centre-cropped to a square and displayed in a circle.</p>
    <div class="photo-resize-field"><label for="profile-photo-size">Resize to</label>
      <select id="profile-photo-size" ${state.photoBusy ? 'disabled' : ''} aria-describedby="profile-photo-size-hint"><option value="" disabled ${state.photo === undefined && displayed ? 'selected' : ''}>Choose a size</option>${PHOTO_SIZES.map((size) => `<option value="${size}" ${!(state.photo === undefined && displayed) && state.photoSize === size ? 'selected' : ''}>${size} × ${size} px${size === 128 ? ' (recommended)' : ''}</option>`).join('')}</select>
      <p class="fine" id="profile-photo-size-hint">Choose the saved image size. Preview changes here, then select Save photo to apply.</p>
    </div>
    <p class="fine" id="profile-photo-status" role="status" aria-live="polite">${esc(photoStatus())}</p>
    <div class="actions">${btn('Save photo', 'photo-save', '', 'small primary').replace('<button ', `<button ${state.photo === undefined || state.photoBusy ? 'disabled' : ''} `)}${btn('Remove photo', 'photo-remove', '', 'small').replace('<button ', `<button ${!displayed || state.photoBusy ? 'disabled' : ''} `)}${btn('Cancel changes', 'photo-cancel', '', 'small').replace('<button ', `<button ${state.photo === undefined || state.photoBusy ? 'disabled' : ''} `)}</div>
  </div></div>`
  return `<div class="page-heading"><div><p class="eyebrow">Account</p><h1>My profile</h1><p class="muted">${esc(state.user.name)} · ${esc(state.user.employeeId)} · ${esc(state.user.email)}</p></div></div><div class="grid"><div>${section('Photo', controls)}${section('Details', `<form data-form="profile">${input('designation', 'Designation', 'text', state.user.designation || '', 'required')}${input('phone', 'Phone (optional)', 'tel', p.phone || '')}${area('bio', 'About (optional)', p.bio || '', 'rows="4"')}<button class="primary" type="submit">Save profile</button></form>`)}</div><div>${section('Password', `<form data-form="password">${input('currentPassword', 'Current password', 'password', '', 'required autocomplete="current-password"')}${input('newPassword', 'New password', 'password', '', 'required minlength="12" autocomplete="new-password"')}<button type="submit">Change password</button></form>`)}</div></div>`
}
function photoStatus() {
  if (state.photoNotice) return state.photoNotice
  if (state.photo !== undefined) return `Preview: ${state.photoSize} × ${state.photoSize} px. Not saved yet.`
  return state.user?.profile?.photoDataUrl
    ? 'Saved photo. Choose a size to prepare a resized copy.'
    : 'No photo selected yet.'
}
function syncPhotoControls() {
  const controls = document.querySelector('.photo-controls')
  if (!controls || state.view !== 'profile') return
  const busy = state.photoBusy || state.busy
  controls.setAttribute('aria-busy', String(busy))
  controls.querySelectorAll('input,select').forEach((control) => {
    control.disabled = busy
  })
  controls.querySelector('#profile-photo-size').value =
    state.photo === undefined && state.user.profile?.photoDataUrl ? '' : String(state.photoSize)
  controls.querySelector('[data-action="photo-save"]').disabled = busy || state.photo === undefined
  controls.querySelector('[data-action="photo-cancel"]').disabled = busy || state.photo === undefined
  controls.querySelector('[data-action="photo-remove"]').disabled =
    busy || !(state.photo === undefined ? state.user.profile?.photoDataUrl : state.photo)
  controls.querySelector('#profile-photo-status').textContent = photoStatus()
  const preview = document.querySelector('.profile-photo-preview')
  const photo = state.photo === undefined ? state.user.profile?.photoDataUrl : state.photo
  if (preview)
    preview.outerHTML = photoAvatar(
      { ...state.user, profile: { ...state.user.profile, photoDataUrl: photo } },
      'profile-photo-preview',
      `Profile photo of ${state.user.name}`,
    )
}
async function stagePhoto(file, size) {
  if (state.view !== 'profile' || state.photoBusy || state.busy) return
  const token = ++state.photoToken,
    user = state.user.id,
    csrf = state.csrf
  const focused = document.querySelector('.photo-controls')?.contains(document.activeElement)
    ? document.activeElement.id
    : ''
  const isCurrent = () =>
    state.photoToken === token && state.user?.id === user && state.csrf === csrf && state.view === 'profile'
  state.photoBusy = true
  state.photoNotice = 'Preparing photo…'
  syncPhotoControls()
  try {
    const photo = await preparePhoto(file, size)
    if (!isCurrent()) return
    state.photo = photo
    // Keep the original input so switching sizes never compounds JPEG loss.
    state.photoFile = file
    state.photoSize = size
    state.photoNotice = `Preview: ${size} × ${size} px. Not saved yet.`
  } catch (error) {
    if (isCurrent()) state.photoNotice = error.message
  } finally {
    if (isCurrent()) {
      state.photoBusy = false
      const input = document.querySelector('#profile-photo-input')
      if (input) input.value = ''
      syncPhotoControls()
      if (focused && document.activeElement === document.body)
        document.getElementById(focused)?.focus({ preventScroll: true })
    }
  }
}
function employeeForm(person) {
  const editing = Boolean(person)
  return `<form data-form="employee" data-id="${esc(person?.id || '')}"><div class="form-grid">${input('name', 'Name', 'text', person?.name, 'required')}${input('designation', 'Designation', 'text', person?.designation || 'Employee', 'required')}${input('employeeId', 'Employee ID', 'text', person?.employeeId, 'required')}${input('email', 'Allowed personal email', 'email', person?.email, 'required autocomplete="off"')}${!editing ? input('password', 'Temporary portal password', 'password', '', 'required minlength="12" autocomplete="new-password"') : ''}</div><fieldset><legend>Job functions</legend><div class="check-grid">${jobFunctions.map((j) => `<label class="check"><input type="checkbox" name="jobFunctions" value="${esc(j)}" ${arr(person?.jobFunctions).includes(j) ? 'checked' : ''}><span>${esc(j)}</span></label>`).join('')}</div></fieldset><button class="primary" type="submit">${editing ? 'Save employee' : 'Add employee'}</button></form>`
}
function adminForm() {
  return `<form data-form="admin"><div class="form-grid">${input('name', 'Name', 'text', '', 'required autocomplete="name"')}${input('designation', 'Designation', 'text', 'Admin', 'required')}${input('employeeId', 'Employee ID', 'text', '', 'required autocomplete="off"')}${input('email', 'Email address', 'email', '', 'required autocomplete="email"')}${input('password', 'Temporary portal password', 'password', '', 'required minlength="12" autocomplete="new-password"')}</div><p class="fine admin-account-note">The temporary password is used only for first sign-in and is never shown in the account list.</p><button class="primary" type="submit">Add admin</button></form>`
}
function adminAccounts() {
  if (!admin()) return ''
  const accounts = arr(state.snapshot.employees).filter((e) => e.role === 'Admin')
  return section(
    'Admin accounts',
    `<p class="muted admin-account-note">Manage administrator access separately from employee job functions. The server prevents deactivating the final active Admin.</p>${adminForm()}<div class="admin-account-list">${accounts.map((account) => `<div class="list-item"><div class="split"><div><strong>${esc(account.name)}</strong><p>${esc(account.designation || 'Admin')} · ${esc(account.employeeId)} · ${esc(account.email || 'Email private')}</p></div>${statusTag(account.active ? 'Active' : 'Inactive')}</div>${account.active ? `<div class="actions">${btn('Edit designation', 'designation-edit', account.id, 'small')}${btn('Deactivate', 'admin-deactivate', account.id, 'small danger')}</div>` : ''}</div>`).join('') || empty('No admin accounts yet.')}</div>`,
  )
}
function team() {
  if (!admin()) return ''
  const registrations = arr(state.snapshot.registrations)
  return `<div class="page-heading"><div><p class="eyebrow">People</p><h1>Team</h1></div></div>${section('Registration requests', registrations.map((r) => `<div class="list-item"><div class="split"><div><strong>${esc(r.name)}</strong><p>${esc(r.designation || 'Employee')} · ${esc(r.email)}</p><small>Requested ${fmtDateTime(r.createdAt)}${r.decidedAt ? ` · Reviewed ${fmtDateTime(r.decidedAt)}` : ''}</small></div>${statusTag(r.status)}</div>${r.status === 'Pending' ? `<div class="actions">${btn('Approve', 'registration-approve', r.id, 'small primary')}${btn('Reject', 'registration-reject', r.id, 'small')}</div>` : ''}</div>`).join('') || empty('No registration requests yet.'))}${section('Add employee', employeeForm())}${section(
    'Employees',
    arr(state.snapshot.employees)
      .filter((e) => e.role !== 'Admin')
      .map(
        (e) =>
          `<div class="list-item"><div class="split"><div><strong>${esc(e.name)}</strong><p>${esc(e.designation || 'Employee')} · ${esc(e.employeeId)} · ${esc(e.email || 'Email private')}</p><small>${esc(arr(e.jobFunctions).join(' · ') || 'No job functions')}</small></div>${statusTag(e.active ? 'Active' : 'Inactive')}</div>${e.active ? `<div class="actions">${btn('Edit', 'employee-edit', e.id, 'small')}${btn('Reset password', 'employee-reset', e.id, 'small')}${btn('Deactivate', 'employee-deactivate', e.id, 'small danger')}</div>` : ''}</div>`,
      )
      .join('') || empty('No employees yet.'),
  )}${adminAccounts()}`
}
function clientForm(client) {
  return `<form data-form="client" data-id="${esc(client?.id || '')}"><div class="form-grid">${input('name', 'Client name', 'text', client?.name, 'required')}${input('service', 'Service provided', 'text', client?.service, 'required')}<label class="field"><span>Service type</span><select name="serviceType" required><option value="videos" ${client?.serviceType === 'videos' ? 'selected' : ''}>Videos</option><option value="posters" ${client?.serviceType === 'posters' ? 'selected' : ''}>Posters</option><option value="both" ${!client?.serviceType || client?.serviceType === 'both' ? 'selected' : ''}>Both</option></select></label></div><button class="primary" type="submit">${client ? 'Save client' : 'Add client'}</button></form>`
}
function targetForm(client, target) {
  const month = target?.month || state.snapshot.today.slice(0, 7),
    type = target?.contentType || client.serviceType || 'both'
  return `<form data-form="target" data-client-id="${esc(client.id)}"><div class="form-grid">${input('month', 'Month', 'month', month, 'required')}<label class="field"><span>Content type</span><select name="contentType" required><option value="videos" ${type === 'videos' ? 'selected' : ''}>Videos</option><option value="posters" ${type === 'posters' ? 'selected' : ''}>Posters</option><option value="both" ${type === 'both' ? 'selected' : ''}>Both</option></select></label>${input('requiredCount', 'Monthly target', 'number', target?.requiredCount ?? 0, 'required min="0" max="100000"')}${input('postedCount', 'Posted so far', 'number', target?.postedCount ?? 0, 'required min="0" max="100000"')}</div><button class="small" type="submit">Save monthly target</button></form>`
}
function clients() {
  const targets = arr(state.snapshot.targets),
    month = state.snapshot.today.slice(0, 7)
  return `<div class="page-heading"><div><p class="eyebrow">Accounts</p><h1>Clients</h1><p class="muted">Set monthly delivery targets by content type. The same clients are available when assigning work.</p></div></div>${section('Add client', clientForm())}${section(
    'Clients',
    arr(state.snapshot.clients)
      .map((c) => {
        const target = targets.find((t) => t.clientId === c.id && t.month === month)
        const progress = target ? `${target.postedCount}/${target.requiredCount} posted` : 'No target set'
        return `<div class="list-item"><div class="split"><div><strong>${esc(c.name)}</strong><p>${esc(serviceTypeLabel(c.serviceType))} · ${esc(c.service)}</p><small>${esc(progress)}</small></div>${statusTag(c.active ? 'Active' : 'Archived')}</div>${c.active ? `<div class="actions">${btn('Edit', 'client-edit', c.id, 'small')}${btn('Set target', 'target-edit', c.id, 'small')}${btn('Archive', 'client-archive', c.id, 'small danger')}</div>` : ''}${c.active ? `<div class="target-editor">${targetForm(c, target)}</div>` : ''}</div>`
      })
      .join('') || empty('No clients yet.'),
  )}`
}
function adminTasks() {
  const s = state.snapshot
  const active = arr(s.employees).filter((e) => e.active && (e.role === 'Employee' || e.role === 'Admin'))
  const clients = arr(s.clients).filter((c) => c.active)
  const clientOptions = clients.map((c) => ({ ...c, name: `${c.name} · ${serviceTypeLabel(c.serviceType)}` }))
  return `<div class="page-heading"><div><p class="eyebrow">Work management</p><h1>Assignments</h1></div></div>${section('Assign a task', `<form data-form="task"><div class="form-grid">${input('title', 'Task title', 'text', '', 'required maxlength="200"')}${select('assigneeId', 'Assigned employee / admin', active)}${select('clientId', 'Client', clientOptions)}<label class="field"><span>Job function</span><select name="jobFunction" required disabled><option value="">Select an assignee first</option></select><small id="function-help" class="fine">Every active employee and admin can receive any work type.</small></label>${input('deadline', 'Deadline · Asia/Kolkata (IST)', 'datetime-local', '', 'required')}<label class="field"><span>Priority</span><select name="priority"><option>Normal</option><option>High</option><option>Low</option></select></label></div>${area('description', 'Description', '', 'rows="3"')}<button class="primary" type="submit">Create task</button></form>`)}${section(
    'All tasks',
    sortTasks(arr(s.tasks))
      .map(
        (t) =>
          `<div>${taskCard(t)}<div class="deadline-action">${btn('Adjust deadline', 'deadline', t.id, 'small')}</div></div>`,
      )
      .join('') || empty('No tasks assigned yet.'),
  )}`
}
function reviews() {
  return `<div class="page-heading"><div><p class="eyebrow">Quality control</p><h1>Review queue</h1></div></div>${section(
    'Awaiting approval',
    sortTasks(arr(state.snapshot.tasks).filter((t) => t.state === 'Completed'))
      .map((t) => taskCard(t))
      .join('') || empty('No completed tasks awaiting review.'),
  )}`
}
function notes() {
  const recipients = arr(state.snapshot.employees).filter((e) => e.active && e.role === 'Employee')
  const recipientFields = `<fieldset><legend>Recipients</legend><p class="muted">Leave unselected to send to everyone.</p><div class="check-grid">${recipients.map((e) => `<label class="check"><input type="checkbox" name="recipientIds" value="${esc(e.id)}"><span>${esc(e.name)}</span></label>`).join('')}</div></fieldset>`
  return `<div class="page-heading"><div><p class="eyebrow">Communication</p><h1>Notes & broadcasts</h1></div></div><div class="grid"><div>${section('Post a note', `<form data-form="note">${area('text', 'Note', '', 'required rows="4"')}${recipientFields}<button class="primary" type="submit">Publish note</button></form>`)}</div><div>${section('Send announcement', `<form data-form="broadcast">${input('title', 'Title', 'text', '', 'required')}${area('text', 'Message', '', 'required rows="4"')}${recipientFields}<button class="primary" type="submit">Send to inbox</button></form><p class="fine">Browser push is optional; every announcement stays in the inbox.</p>`)}</div></div>${section(
    'Published notes',
    arr(state.snapshot.notes)
      .map(
        (n) =>
          `<div class="list-item"><p>${esc(n.text)}</p><small>${fmtDateTime(n.createdAt)} · ${n.recipientIds?.length ? `${n.recipientIds.length} selected` : 'Everyone'}</small><div class="actions">${btn('Delete note', 'note-delete', n.id, 'small danger')}</div></div>`,
      )
      .join('') || empty('No notes yet.'),
  )}`
}
function normalizeAnalytics(data) {
  return {
    ...data,
    summary: { ...data.summary, onTimeRate: (Number(data.summary?.onTimeRate) || 0) * 100 },
    employees: arr(data.employees).map((e) => ({ ...e, onTimeRate: (Number(e.onTimeRate) || 0) * 100 })),
  }
}
function trendChart(rows) {
  return renderTrendChart(rows, arr(state.analytics?.trendBreakdown), arr(state.analytics?.assignmentTrend))
}
function analyticsQuickFilters() {
  const selected = state.analyticsQuickRange
  return `<div class="analytics-quick-filters" role="group" aria-label="Quick chart date filters"><span class="analytics-quick-label">Chart range</span><div class="analytics-quick-options">${analyticsQuickPresets.map(([id, label]) => `<button type="button" class="analytics-quick-filter${selected === id ? ' is-active' : ''}" data-action="analytics-quick-filter" data-preset="${id}" aria-pressed="${selected === id}">${label}</button>`).join('')}</div><span class="fine">24 hours uses today’s Asia/Kolkata business date.</span></div>`
}
function analyticsView() {
  const a = state.analytics,
    f = state.filters,
    emp = arr(state.snapshot.employees),
    cli = arr(state.snapshot.clients)
  const period = f.period || 'all'
  const label =
    period === 'month'
      ? `Month: ${f.month || '—'}`
      : period === 'year'
        ? `Year: ${f.year || '—'}`
        : period === 'custom'
          ? `Custom range: ${f.from || '—'} to ${f.to || '—'}`
          : 'All time'
  const scope = [
    f.employeeId && `Employee: ${emp.find((e) => String(e.id) === String(f.employeeId))?.name || f.employeeId}`,
    f.clientId && `Client: ${cli.find((c) => String(c.id) === String(f.clientId))?.name || f.clientId}`,
    f.jobFunction && `Function: ${f.jobFunction}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const hasTimeline = arr(a?.trend).length || arr(a?.assignmentTrend).length
  return `<div class="page-heading"><div><p class="eyebrow">Reporting</p><h1>Performance</h1><p class="muted">Saved records for the selected period; historical reports can change as records are updated.</p></div></div>${section(
    'Filters',
    `<form data-form="filters"><div class="form-grid"><label class="field"><span>Reporting period</span><select name="period"><option value="all" ${period === 'all' ? 'selected' : ''}>All time</option><option value="month" ${period === 'month' ? 'selected' : ''}>Month</option><option value="year" ${period === 'year' ? 'selected' : ''}>Year</option><option value="custom" ${period === 'custom' ? 'selected' : ''}>Custom date range</option></select></label>${input('month', 'Month', 'month', f.month || '')}${input('year', 'Year', 'number', f.year || '', 'min="2000" max="2100"')}${input('from', 'From', 'date', f.from || '')}${input('to', 'To', 'date', f.to || '')}${select('employeeId', 'Employee', emp, f.employeeId, false)}${select('clientId', 'Client', cli, f.clientId, false)}<label class="field"><span>Job function</span><select name="jobFunction">${options(
      jobFunctions.map((j) => ({ id: j, name: j })),
      f.jobFunction,
      'All functions',
    )}</select></label></div><p class="fine" aria-live="polite">${esc(label)}${scope ? ` · ${esc(scope)}` : ''}</p><div class="actions"><button class="primary" type="submit">Apply filters</button>${btn('Download Excel', 'export', '', 'small')}</div></form>`,
  )}${
    a
      ? section(
          'Team summary',
          `<div class="metrics analytics-kpis">${[
            ['workCount', 'Work'],
            ['reworkCount', 'Rework'],
            ['completed', 'Completed'],
            ['approved', 'Approved'],
          ]
            .map(([k, v]) => `<div class="metric"><span>${v}</span><strong>${esc(a.summary?.[k] ?? 0)}</strong></div>`)
            .join('')}</div>`,
        )
      : empty('No report loaded yet. Apply filters to view saved records.')
  }${a ? section('Completed work over time', `${analyticsQuickFilters()}${hasTimeline ? trendChart(arr(a.trend)) : empty('No completions in this range.')}`) : ''}${a ? section('Employees', arr(a.employees).length ? employeeChart(a.employees) : empty('No employee records for these filters.')) : ''}`
}

let priorFocus
let drawerFocus
function setDrawer(open, restore = true) {
  if (open && !matchMedia('(max-width: 900px)').matches) return
  if (open) drawerFocus = document.activeElement
  state.drawer = open
  const sidebar = document.querySelector('#sidebar')
  if (!sidebar) return
  sidebar.classList.toggle('open', open)
  sidebar.inert = !open && matchMedia('(max-width: 900px)').matches
  document.querySelector('.work').inert = open
  document.querySelector('.scrim').classList.toggle('visible', open)
  document.querySelector('.menu').setAttribute('aria-expanded', String(open))
  if (open) sidebar.querySelector('.side-close').focus({ preventScroll: true })
  else if (restore) drawerFocus?.focus({ preventScroll: true })
}
const loginClock = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—'
function clearTodayAttendance() {
  document.querySelectorAll('[data-today-login]').forEach((node) => {
    const value = node.querySelector('strong')
    if (value) value.textContent = '—'
  })
  document.querySelectorAll('[data-today-duration]').forEach((node) => {
    node.textContent = node.textContent.replace(/^\d+h \d+m/, '0h 0m')
  })
}
function syncTodayAttendance() {
  if (state.snapshot?.serverNow && todayLoginExpired(state.snapshot.serverNow, Date.now() + state.serverOffset))
    clearTodayAttendance()
}
function syncLiveAttendance() {
  if (state.view !== 'analytics' || !state.analytics) return
  const people = new Map(arr(state.analytics.employees).map((person) => [String(person.id), person]))
  document.querySelectorAll('[data-today-login]').forEach((node) => {
    const person = people.get(node.dataset.todayLogin)
    if (person) {
      const value = node.querySelector('strong')
      if (value) value.textContent = loginClock(person.todayFirstLoginAt)
    }
  })
  document.querySelectorAll('[data-today-duration]').forEach((node) => {
    const person = people.get(node.dataset.todayDuration)
    if (person)
      node.textContent = node.textContent.replace(
        /^\d+h \d+m/,
        duration(Math.min(Number(person.todayLoginSeconds) || 0, 17.5 * 3600)),
      )
  })
  syncTodayAttendance()
}
async function loadAnalytics({ liveOnly = false } = {}) {
  if (liveOnly && !state.analytics) return
  const sequence = ++state.analyticsSequence,
    user = state.user?.id,
    csrf = state.csrf,
    day = state.snapshot?.today
  const filters = { ...state.filters }
  try {
    const report = normalizeAnalytics(await json(`/analytics?${new URLSearchParams(filters)}`))
    if (
      state.user?.id !== user ||
      state.csrf !== csrf ||
      state.view !== 'analytics' ||
      sequence !== state.analyticsSequence ||
      day !== state.snapshot?.today ||
      JSON.stringify(filters) !== JSON.stringify(state.filters)
    )
      return
    state.analytics = report
    if (liveOnly) {
      syncLiveAttendance()
      return
    }
    const previous = document.querySelector('form[data-form="filters"]')
    const fields = previous ? [...previous.elements].filter((el) => el.name).map((el) => [el.name, el.value]) : []
    const focused = previous?.contains(document.activeElement) ? document.activeElement.name : null
    shell()
    const current = document.querySelector('form[data-form="filters"]')
    for (const [name, value] of fields) if (current?.elements[name]) current.elements[name].value = value
    if (focused) current?.elements[focused]?.focus({ preventScroll: true })
  } catch (err) {
    if (!err.sessionExpired && state.user?.id === user) flash(err.message, true)
  }
}
async function applyAnalyticsFilters(filters, button, quickRange = '') {
  state.busy = true
  button.disabled = true
  const user = state.user.id,
    csrf = state.csrf,
    sequence = ++state.analyticsSequence
  try {
    const result = normalizeAnalytics(await json(`/analytics?${new URLSearchParams(filters)}`))
    if (
      state.user?.id !== user ||
      state.csrf !== csrf ||
      state.view !== 'analytics' ||
      sequence !== state.analyticsSequence
    )
      return
    state.filters = filters
    state.analyticsQuickRange = quickRange
    state.analytics = result
    state.error = ''
    shell()
  } catch (err) {
    if (!err.sessionExpired && state.user?.id === user) {
      flash(err.message, true)
      button.disabled = false
    }
  } finally {
    state.busy = false
  }
}
// Refresh live values without replacing forms, moving focus, or discarding unsaved input.
function syncDailyStatuses(snapshot) {
  const daily = document.querySelector('#daily-status')
  if (daily) {
    daily.setAttribute('aria-live', 'polite')
    daily.setAttribute('aria-atomic', 'true')
    updateDailyTag(daily.querySelector('.tag'), snapshot.updateStatus?.status)
    let detail = daily.querySelector('.tag').nextSibling
    if (!detail) detail = daily.appendChild(document.createTextNode(''))
    const due =
      snapshot.updateStatus?.status !== 'exempt' && snapshot.updateStatus?.deadline
        ? ` Due ${fmtDateTime(snapshot.updateStatus.deadline)}`
        : ''
    if (detail.textContent !== due) detail.textContent = due
  }
  document.querySelectorAll('[data-update-employee]').forEach((row) => {
    const employee = arr(snapshot.employees).find((e) => String(e.id) === row.dataset.updateEmployee)
    if (!employee) return
    const update = arr(snapshot.updates).find(
      (u) => String(u.employeeId) === String(employee.id) && u.date === snapshot.today,
    )
    const tag = row.querySelector('.tag')
    tag.setAttribute('aria-live', 'polite')
    updateDailyTag(tag, employee.updateStatus?.status || (update ? 'submitted' : 'pending'))
    row.querySelector('.update-text').textContent = update?.text || 'No update submitted yet.'
  })
}
async function pollSnapshot() {
  if (
    !state.user ||
    !state.snapshot ||
    state.user.mustChangePassword ||
    state.busy ||
    state.drawer ||
    document.hidden ||
    document.querySelector('#modal:open')
  )
    return
  const user = state.user.id,
    csrf = state.csrf
  try {
    const snapshot = await json('/snapshot')
    if (state.user?.id !== user || state.csrf !== csrf) return
    const previousDay = state.snapshot.today
    state.snapshot = snapshot
    state.user = snapshot.user
    state.serverOffset = serverOffset(snapshot.serverNow)
    if (snapshot.today !== previousDay) clearTodayAttendance()
    const taskMap = new Map(arr(snapshot.tasks).map((task) => [String(task.id), task]))
    document.querySelectorAll('[data-task-id]').forEach((card) => {
      const task = taskMap.get(card.dataset.taskId)
      if (!task) return
      if (card.querySelector('.task-top .tag')?.textContent !== task.state && !card.contains(document.activeElement)) {
        const template = document.createElement('template')
        template.innerHTML = taskCard(task, state.view === 'team-tasks')
        card.replaceWith(template.content.firstElementChild)
        return
      }
      const overdue = Boolean(task.overdue && ['Assigned', 'In-progress'].includes(task.state))
      card.classList.toggle('overdue', overdue)
      const tone = taskStateClass(task)
      for (const name of [
        'task-state--assigned',
        'task-state--in-progress',
        'task-state--completed',
        'task-state--approved',
        'task-state--overdue',
        'task-state--other',
      ])
        card.classList.toggle(name, name === tone)
      const indicator = card.querySelector('.overdue-label')
      if (indicator) indicator.hidden = !overdue
      const timer = card.querySelector('.task-duration')
      if (timer) timer.textContent = `Working time ${duration(task.workSeconds)}`
      const tag = card.querySelector('.task-top .tag')
      if (tag) {
        tag.textContent = task.state
        tag.className = `tag ${tone}`
      }
    })
    syncTaskOrder(snapshot)
    syncDailyStatuses(snapshot)
    syncTodayAttendance()
    if (state.view === 'analytics' && !state.busy && !document.querySelector('#modal:open'))
      loadAnalytics({ liveOnly: true })
  } catch (err) {
    if (err.sessionExpired) return /* Keep existing values until explicit refresh. */
  }
}
function syncTaskOrder(snapshot) {
  let container,
    tasks,
    nodeFor,
    anchor = null
  if (state.view === 'tasks' || state.view === 'team-tasks') {
    container = document.querySelector('.task-list')
    tasks = arr(snapshot.tasks).filter((t) =>
      state.view === 'tasks' ? t.assigneeId === state.user.id : t.assigneeId !== state.user.id,
    )
    nodeFor = (card) => card
  } else if (state.view === 'dashboard' || state.view === 'reviews' || state.view === 'admin-tasks') {
    const heading =
      state.view === 'dashboard'
        ? admin()
          ? 'Review queue'
          : 'My current tasks'
        : state.view === 'reviews'
          ? 'Awaiting approval'
          : 'All tasks'
    container = [...document.querySelectorAll('.panel')].find(
      (panel) => panel.querySelector('.panel-head h2')?.textContent === heading,
    )
    tasks =
      state.view === 'dashboard'
        ? sortTasks(
            admin()
              ? arr(snapshot.tasks).filter((t) => t.state === 'Completed')
              : arr(snapshot.tasks).filter((t) => t.assigneeId === state.user.id && t.state !== 'Approved'),
          ).slice(0, 6)
        : state.view === 'reviews'
          ? arr(snapshot.tasks).filter((t) => t.state === 'Completed')
          : arr(snapshot.tasks)
    nodeFor = (card) => (state.view === 'admin-tasks' ? card.parentElement : card)
    anchor = container?.querySelector('.panel-head')
  } else return
  if (!container || container.contains(document.activeElement)) return
  const sorted = sortTasks(tasks)
  const existing = new Map(
    [...container.querySelectorAll('[data-task-id]')].map((card) => [card.dataset.taskId, nodeFor(card)]),
  )
  const keep = new Set(sorted.map((task) => String(task.id)))
  for (const [id, node] of existing) if (!keep.has(id)) node.remove()
  container.querySelector('.empty')?.remove()
  for (let index = sorted.length - 1; index >= 0; index--) {
    const task = sorted[index]
    const id = String(task.id)
    let node = existing.get(id)
    if (!node) {
      const template = document.createElement('template')
      template.innerHTML =
        state.view === 'admin-tasks'
          ? `<div>${taskCard(task)}<div class="deadline-action">${btn('Adjust deadline', 'deadline', task.id, 'small')}</div></div>`
          : taskCard(task, state.view === 'team-tasks')
      node = template.content.firstElementChild
    }
    const next = index + 1 < sorted.length ? existing.get(String(sorted[index + 1].id)) : null
    container.insertBefore(node, next || (anchor ? anchor.nextSibling : null))
    existing.set(id, node)
  }
  if (!sorted.length && !container.querySelector('.empty'))
    container.insertAdjacentHTML(
      'beforeend',
      empty(state.view === 'reviews' ? 'No completed tasks awaiting review.' : 'No tasks to show.'),
    )
}
function modal(title, body) {
  priorFocus = document.activeElement
  const d = document.querySelector('#modal')
  document.querySelector('#modal-body').innerHTML =
    `<h2 id="modal-title">${esc(title)}</h2><div id="modal-feedback" class="feedback" role="alert" tabindex="-1"></div>${body}`
  d.showModal()
  d.querySelector('input,textarea,button')?.focus()
}
function closeModal() {
  const d = document.querySelector('#modal')
  if (d?.open) d.close()
  priorFocus?.focus()
}
async function refresh(message) {
  if (!(await load())) return
  state.message = message || ''
  state.error = ''
  shell()
  if (!state.push) await checkPush()
}
async function runWrite(payload, button, message, close = false) {
  if (state.busy) return
  const user = state.user?.id,
    csrf = state.csrf
  state.busy = true
  button.disabled = true
  state.message = 'Saving…'
  state.error = ''
  const pending = document.querySelector('#modal:open #modal-feedback') || document.querySelector('#feedback')
  if (pending) {
    pending.textContent = 'Saving…'
    pending.className = 'feedback'
  }
  try {
    await post('/actions', payload)
    if (state.user?.id !== user || state.csrf !== csrf) return
    if (close) closeModal()
    await refresh(message)
  } catch (err) {
    if (!err.sessionExpired && state.user?.id === user && state.csrf === csrf) {
      flash(err.message, true)
      button.disabled = false
    }
  } finally {
    state.busy = false
  }
}
const values = (form) => Object.fromEntries(new FormData(form).entries())
const recipients = (form) => new FormData(form).getAll('recipientIds')
function confirmModal(title, message, action, id) {
  modal(
    title,
    `<p>${esc(message)}</p><div class="actions">${btn('Cancel', 'close-modal')}${btn('Confirm', 'confirm-' + action, id, 'primary')}</div>`,
  )
}
async function handleAction(button) {
  const action = button.dataset.action,
    id = button.dataset.id
  if (action === 'register') {
    if (!state.user) register()
    return
  }
  if (action === 'photo-cancel') {
    if (state.view !== 'profile' || state.photoBusy || state.busy) return
    clearPendingPhoto()
    state.photoNotice = 'Changes cancelled. Your saved photo has not changed.'
    syncPhotoControls()
    document.querySelector('#profile-photo-input')?.focus()
    return
  }
  if (action === 'photo-remove' || action === 'photo-save') {
    if (state.view !== 'profile' || state.photoBusy || state.busy) return
    const photo = action === 'photo-remove' ? null : state.photo
    if (photo === undefined || (photo === null && action !== 'photo-remove')) return
    const user = state.user.id,
      csrf = state.csrf,
      token = state.photoToken
    const isCurrent = () =>
      state.user?.id === user && state.csrf === csrf && state.photoToken === token && state.view === 'profile'
    state.photoBusy = true
    state.photoNotice = action === 'photo-remove' ? 'Removing photo…' : 'Saving photo…'
    syncPhotoControls()
    try {
      await post('/actions', { type: 'profile.photo', photo })
      if (!isCurrent()) return
      state.user.profile = { ...state.user.profile, photoDataUrl: photo }
      if (state.snapshot?.user) state.snapshot.user.profile = state.user.profile
      clearPendingPhoto()
      state.photoNotice = action === 'photo-remove' ? 'Profile photo removed.' : 'Profile photo saved.'
      syncPhotoControls()
      const avatar = document.querySelector('.identity-avatar')
      if (avatar) avatar.outerHTML = photoAvatar(state.user, 'identity-avatar')
      document.querySelector('#profile-photo-input')?.focus()
    } catch (err) {
      if (isCurrent() && !err.sessionExpired) state.photoNotice = err.message
    } finally {
      if (isCurrent()) {
        state.photoBusy = false
        syncPhotoControls()
      }
    }
    return
  }
  if (action === 'sign-in') {
    if (!state.user) {
      state.error = ''
      login()
      root.querySelector('[name="email"]')?.focus()
    }
    return
  }
  if (action === 'drawer') {
    setDrawer(!state.drawer)
    return
  }
  if (action === 'refresh') {
    button.disabled = true
    try {
      await refresh('Workspace refreshed.')
      if (state.view === 'analytics') await loadAnalytics()
    } catch (err) {
      flash(err.message, true)
      button.disabled = false
    }
    return
  }
  if (action === 'analytics-quick-filter') {
    if (state.view !== 'analytics' || state.busy) return
    const preset = button.dataset.preset
    try {
      const quick = analyticsPresetFilters(preset, state.snapshot?.today)
      const filters = Object.fromEntries(
        Object.entries({
          ...quick,
          employeeId: state.filters.employeeId,
          clientId: state.filters.clientId,
          jobFunction: state.filters.jobFunction,
        }).filter(([, value]) => value),
      )
      await applyAnalyticsFilters(filters, button, preset)
    } catch (err) {
      flash(err.message, true)
    }
    return
  }
  if (action === 'close-modal') {
    closeModal()
    return
  }
  if (action === 'show-password') {
    const field = document.querySelector('[name="password"]')
    if (field) {
      field.type = field.type === 'password' ? 'text' : 'password'
      button.textContent = field.type === 'password' ? 'Show password' : 'Hide password'
      button.setAttribute('aria-pressed', field.type !== 'password')
    }
    return
  }
  if (action === 'logout') {
    button.disabled = true
    try {
      await post('/logout', {})
      clearPendingPhoto()
      state.user = null
      state.csrf = ''
      state.snapshot = null
      state.analytics = null
      state.analyticsQuickRange = ''
      state.analyticsSequence++
      state.error = ''
      login()
    } catch (err) {
      flash(err.message, true)
      button.disabled = false
    }
    return
  }
  if (action === 'employee-edit') {
    const person = arr(state.snapshot.employees).find((e) => e.id === id)
    if (person) modal('Edit employee', employeeForm(person))
    return
  }
  if (action === 'designation-edit') {
    const person = arr(state.snapshot.employees).find((e) => e.id === id)
    if (admin() && person)
      modal(
        'Edit designation',
        `<form data-form="designation" data-id="${esc(id)}">${input('designation', 'Designation', 'text', person.designation || 'Admin', 'required')}<button class="primary" type="submit">Save designation</button></form>`,
      )
    return
  }
  if (action === 'registration-approve' || action === 'registration-reject') {
    if (!admin()) return
    const registration = arr(state.snapshot.registrations).find((r) => String(r.id) === id && r.status === 'Pending')
    if (!registration) return
    if (action === 'registration-reject') {
      confirmModal(
        'Reject registration',
        `Reject the request from ${registration.name} (${registration.email})?`,
        'registration-reject',
        id,
      )
      return
    }
    modal(
      'Approve registration',
      `<p class="muted">Approve ${esc(registration.name)} (${esc(registration.email)}) and assign employee details.</p><form data-form="registration-approve" data-id="${esc(id)}">${input('employeeId', 'Employee ID', 'text', '', 'required')}<fieldset><legend>Job functions</legend><div class="check-grid">${jobFunctions.map((j) => `<label class="check"><input type="checkbox" name="jobFunctions" value="${esc(j)}"><span>${esc(j)}</span></label>`).join('')}</div></fieldset><button class="primary" type="submit">Approve registration</button></form>`,
    )
    return
  }
  if (action === 'confirm-registration-reject') {
    if (admin() && arr(state.snapshot.registrations).some((r) => String(r.id) === id && r.status === 'Pending'))
      await runWrite({ type: 'registration.reject', id }, button, 'Registration rejected.', true)
    return
  }
  if (action === 'client-edit') {
    const client = arr(state.snapshot.clients).find((c) => c.id === id)
    if (client) modal('Edit client', clientForm(client))
    return
  }
  if (action === 'calendar-prev' || action === 'calendar-next') {
    const base = new Date(`${state.calendarMonth || state.snapshot.today.slice(0, 7)}-01T00:00:00Z`)
    base.setUTCMonth(base.getUTCMonth() + (action === 'calendar-next' ? 1 : -1))
    state.calendarMonth = base.toISOString().slice(0, 7)
    shell()
    return
  }
  if (action === 'target-edit') {
    const client = arr(state.snapshot.clients).find((c) => c.id === id)
    const target = arr(state.snapshot.targets).find(
      (t) => t.clientId === id && t.month === state.snapshot.today.slice(0, 7),
    )
    if (admin() && client) modal('Set monthly target', targetForm(client, target))
    return
  }
  if (action === 'event-new') {
    if (admin()) modal('Add calendar event', eventForm())
    return
  }
  if (action === 'event-edit') {
    const event = arr(state.snapshot.calendarEvents).find((e) => e.id === id)
    if (admin() && event) modal('Edit calendar event', eventForm(event))
    return
  }
  if (action === 'event-delete') {
    if (admin()) confirmModal('Delete calendar event', 'This event will be removed for everyone.', 'event-delete', id)
    return
  }
  if (action === 'note-delete') {
    if (admin())
      confirmModal(
        'Delete note',
        'This removes the published note. Existing notifications stay in employee inboxes.',
        'note-delete',
        id,
      )
    return
  }
  if (action === 'employee-reset') {
    modal(
      'Reset portal password',
      `<p class="muted">This revokes existing sessions and requires a password change on next sign-in.</p><form data-form="reset" data-id="${esc(id)}">${input('password', 'Replacement temporary password', 'password', '', 'required minlength="12" autocomplete="new-password"')}<button class="primary" type="submit">Reset password</button></form>`,
    )
    return
  }
  if (action === 'employee-deactivate') {
    confirmModal(
      'Deactivate employee',
      'Access will be revoked. Review unfinished assignments before continuing. Historical records remain available.',
      'deactivate',
      id,
    )
    return
  }
  if (action === 'admin-deactivate') {
    if (!admin() || !arr(state.snapshot.employees).some((e) => String(e.id) === id && e.role === 'Admin' && e.active))
      return
    confirmModal(
      'Deactivate admin account',
      'Access will be revoked and the account will become inactive. If this is the final active Admin, the server will keep the account active.',
      'admin-deactivate',
      id,
    )
    return
  }
  if (action === 'client-archive') {
    confirmModal('Archive client', 'The client will be archived while historical tasks remain.', 'archive', id)
    return
  }
  if (action === 'confirm-deactivate') {
    await runWrite({ type: 'employee.deactivate', id }, button, 'Employee deactivated.', true)
    return
  }
  if (action === 'confirm-admin-deactivate') {
    await runWrite({ type: 'employee.deactivate', id }, button, 'Admin account deactivated.', true)
    return
  }
  if (action === 'confirm-archive') {
    await runWrite({ type: 'client.archive', id }, button, 'Client archived.', true)
    return
  }
  if (action === 'confirm-event-delete') {
    await runWrite({ type: 'event.delete', id }, button, 'Calendar event deleted.', true)
    return
  }
  if (action === 'confirm-note-delete') {
    await runWrite({ type: 'note.delete', id }, button, 'Note deleted.', true)
    return
  }
  if (action === 'deadline') {
    const t = arr(state.snapshot.tasks).find((x) => x.id === id)
    if (t)
      modal(
        'Adjust deadline',
        `<form data-form="deadline" data-id="${esc(id)}">${input('deadline', 'New deadline · Asia/Kolkata (IST)', 'datetime-local', kolkataInput(t.deadline), 'required')}<p class="fine">Current: ${fmtDateTime(t.deadline)} IST</p><button class="primary" type="submit">Save deadline</button></form>`,
      )
    return
  }
  if (action === 'reject') {
    modal(
      'Reject completed work',
      `<form data-form="reject" data-id="${esc(id)}">${area('reason', 'Feedback (required)', '', 'required rows="4"')}<button class="primary" type="submit">Reject and resume task</button></form>`,
    )
    return
  }
  if (action.startsWith('absence-')) {
    modal(
      `${action.endsWith('approve') ? 'Approve' : 'Reject'} request`,
      `<form data-form="absence-decision" data-id="${esc(id)}" data-status="${action.endsWith('approve') ? 'Approved' : 'Rejected'}">${area('decisionNote', 'Decision note (optional)', '', 'rows="3"')}<button class="primary" type="submit">Confirm decision</button></form>`,
    )
    return
  }
  if (action === 'approve') {
    const t = arr(state.snapshot.tasks).find((x) => x.id === id)
    if (!t) return
    modal(
      'Approve completed work',
      `<form data-form="approve" data-id="${esc(id)}"><label class="field"><span>Rating (1–5)</span><input name="rating" type="number" min="1" max="5" step="1" required></label>${area('ratingNote', 'Rating note (optional)', '', 'maxlength="1000" rows="3"')}<button class="primary" type="submit">Approve task</button></form>`,
    )
    return
  }
  if (action === 'transition') {
    const t = arr(state.snapshot.tasks).find((x) => x.id === id)
    if (!t) return
    const next = button.dataset.nextState
    await runWrite(
      { type: 'task.transition', id, state: next, version: Number(button.dataset.version) },
      button,
      `Task moved to ${next}.`,
    )
    return
  }
  if (action === 'notification-read') {
    await runWrite({ type: 'notification.read', id }, button, 'Notification marked as read.')
    return
  }
  if (action === 'export') {
    try {
      const params = new URLSearchParams(Object.entries(state.filters).filter(([, v]) => v))
      const response = await request(`/export?${params}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'adplix-performance.xlsx'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      flash('Excel report downloaded.')
    } catch (err) {
      flash(err.message, true)
    }
    return
  }
  if (action === 'push-enable' || action === 'push-disable') await configurePush(action === 'push-enable', button)
}
async function configurePush(enable, button) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    flash('Browser push is unavailable here. Your inbox still works.', true)
    return
  }
  if (!state.push?.key) {
    flash('Browser push is not configured on this server. Your inbox still works.', true)
    return
  }
  button.disabled = true
  try {
    const registration = await navigator.serviceWorker.register('/portal/sw.js', { scope: '/portal/' })
    const existing = await registration.pushManager.getSubscription()
    if (!enable) {
      await post('/push-subscription', { subscription: null })
      await existing?.unsubscribe()
      state.push.enabled = false
      flash('Browser notifications disabled.')
    } else {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications were not enabled. Your inbox still works.')
      const raw = atob(
        state.push.key
          .replace(/-/g, '+')
          .replace(/_/g, '/')
          .padEnd(Math.ceil(state.push.key.length / 4) * 4, '='),
      )
      const key = Uint8Array.from(raw, (x) => x.charCodeAt(0))
      const sub =
        existing || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }))
      const data = sub.toJSON()
      await post('/push-subscription', { subscription: { endpoint: data.endpoint, keys: data.keys } })
      state.push.enabled = true
      flash('Browser notifications enabled. Your inbox remains the source of record.')
    }
    const status = document.querySelector('#push-status')
    if (status) status.textContent = state.push.enabled ? 'Enabled on this browser.' : 'Disabled on this browser.'
  } catch (err) {
    flash(err.message, true)
  } finally {
    button.disabled = false
  }
}
async function checkPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    state.push = { message: 'This browser does not support push notifications.' }
    return
  }
  try {
    const { publicKey } = await json('/push-key')
    state.push = {
      key: publicKey,
      message: publicKey
        ? Notification.permission === 'denied'
          ? 'Permission is blocked in browser settings.'
          : 'Optional notifications can be enabled here.'
        : 'Push is not configured on this server.',
    }
    if (publicKey) {
      const reg = await navigator.serviceWorker.getRegistration('/portal/')
      state.push.enabled = Boolean(await reg?.pushManager.getSubscription())
    }
  } catch {
    state.push = { message: 'Push configuration is currently unavailable. The inbox still works.' }
  }
  const status = document.querySelector('#push-status')
  if (status) status.textContent = state.push.message
}
async function handleForm(form, button) {
  const v = values(form),
    kind = form.dataset.form
  if (state.busy || (state.view === 'profile' && state.photoBusy)) return
  if (kind === 'login') {
    state.busy = true
    button.disabled = true
    try {
      const result = await post('/login', { email: v.email, password: v.password })
      if (!form.isConnected) return
      state.user = result.user
      state.csrf = result.csrfToken
      state.error = ''
      if (state.user.mustChangePassword) changePassword()
      else {
        if (!(await load())) return
        state.view = permittedView(location.hash.slice(1) || 'dashboard')
        shell()
        checkPush()
        if (state.view === 'analytics') loadAnalytics()
      }
    } catch (err) {
      if (!err.sessionExpired && form.isConnected) {
        flash(err.message, true)
        button.disabled = false
      }
    } finally {
      state.busy = false
    }
    return
  }
  if (kind === 'register') {
    if (state.user) return
    if (v.password !== v.confirmation) {
      flash('Passwords do not match. Please check both fields.', true)
      form.elements.confirmation.focus()
      return
    }
    state.busy = true
    button.disabled = true
    try {
      const result = await post('/register', {
        name: v.name,
        designation: v.designation,
        email: v.email,
        password: v.password,
      })
      state.error = ''
      registrationConfirmation(result.message)
    } catch (err) {
      flash(err.message, true)
      button.disabled = false
    } finally {
      state.busy = false
    }
    return
  }
  if (kind === 'filters') {
    const period = v.period || 'all'
    const next = { period, employeeId: v.employeeId, clientId: v.clientId, jobFunction: v.jobFunction }
    if (period === 'month') next.month = v.month
    else if (period === 'year') next.year = v.year
    else if (period === 'custom') {
      next.from = v.from
      next.to = v.to
    }
    const filters = Object.fromEntries(Object.entries(next).filter(([, value]) => value))
    if (period === 'month' && !/^\d{4}-\d{2}$/.test(v.month)) {
      flash('Choose a valid reporting month.', true)
      return
    }
    if (period === 'year' && !/^\d{4}$/.test(v.year)) {
      flash('Choose a valid reporting year.', true)
      return
    }
    if (period === 'custom' && (!v.from || !v.to || v.from > v.to)) {
      flash('Enter a valid custom date range.', true)
      return
    }
    await applyAnalyticsFilters(filters, button)
    return
  }
  if (kind === 'password') {
    const user = state.user?.id,
      csrf = state.csrf
    let changed = false
    state.busy = true
    button.disabled = true
    try {
      const result = await post('/password', v)
      if (state.user?.id !== user || state.csrf !== csrf) return
      state.user = result.user
      state.csrf = result.csrfToken
      changed = true
      state.error = ''
      state.message = ''
      state.view = permittedView(location.hash.slice(1) || 'dashboard')
      await refresh('Password changed.')
    } catch (err) {
      if (!err.sessionExpired && changed && state.user?.id === user && form.isConnected) {
        flash('Password changed, but the workspace could not load. Reload this page to try again.', true)
      } else if (!err.sessionExpired && state.user?.id === user && state.csrf === csrf && form.isConnected) {
        const incorrectCurrent = err.status === 400 && err.code === 'CURRENT_PASSWORD_INCORRECT'
        flash(
          incorrectCurrent ? 'Current password is incorrect. Enter the password you used to sign in.' : err.message,
          true,
        )
        if (incorrectCurrent) {
          const current = form.elements.currentPassword
          current.setAttribute('aria-invalid', 'true')
          current.setAttribute('aria-describedby', 'feedback')
          current.focus()
          current.select()
        }
        button.disabled = false
      }
    } finally {
      state.busy = false
    }
    return
  }
  let payload
  if (kind === 'registration-approve') {
    if (
      !admin() ||
      !arr(state.snapshot.registrations).some((r) => String(r.id) === form.dataset.id && r.status === 'Pending')
    )
      return
    payload = {
      type: 'registration.approve',
      id: form.dataset.id,
      employeeId: v.employeeId,
      jobFunctions: new FormData(form).getAll('jobFunctions'),
    }
  }
  if (kind === 'employee')
    payload = {
      type: form.dataset.id ? 'employee.update' : 'employee.create',
      ...v,
      jobFunctions: new FormData(form).getAll('jobFunctions'),
    }
  if (kind === 'admin') {
    if (!admin()) return
    payload = {
      type: 'admin.create',
      name: v.name,
      designation: v.designation,
      employeeId: v.employeeId,
      email: v.email,
      password: v.password,
    }
  }
  if (kind === 'client') payload = { type: form.dataset.id ? 'client.update' : 'client.create', ...v }
  if (kind === 'designation') payload = { type: 'designation.update', id: form.dataset.id, designation: v.designation }
  if (kind === 'event') payload = { type: form.dataset.id ? 'event.update' : 'event.create', ...v }
  if (kind === 'target')
    payload = {
      type: 'client.target.upsert',
      clientId: form.dataset.clientId,
      month: v.month,
      contentType: v.contentType,
      requiredCount: Number(v.requiredCount),
      postedCount: Number(v.postedCount),
    }
  if (kind === 'task') {
    const assignee = arr(state.snapshot.employees).find(
      (e) => e.id === v.assigneeId && e.active && (e.role === 'Employee' || e.role === 'Admin'),
    )
    if (!assignee) {
      flash('Select an active employee or admin.', true)
      return
    }
    if (assignee.role === 'Employee' && !v.jobFunction) {
      flash('Select a job function for this employee.', true)
      return
    }
    payload = { type: 'task.create', ...v, jobFunction: v.jobFunction || '', deadline: kolkataISO(v.deadline) }
  }
  if (kind === 'update') payload = { type: 'update.submit', text: v.text }
  if (kind === 'profile')
    payload = { type: 'profile.update', designation: v.designation, profile: { phone: v.phone, bio: v.bio } }
  if (kind === 'reset') payload = { type: 'employee.resetPassword', id: form.dataset.id, password: v.password }
  if (kind === 'deadline') {
    const task = arr(state.snapshot.tasks).find((t) => t.id === form.dataset.id)
    payload = { type: 'task.deadline', id: form.dataset.id, deadline: kolkataISO(v.deadline), version: task.version }
  }
  if (kind === 'reject') {
    const task = arr(state.snapshot.tasks).find((t) => t.id === form.dataset.id)
    payload = {
      type: 'task.transition',
      id: form.dataset.id,
      state: 'In-progress',
      version: task.version,
      reason: v.reason,
    }
  }
  if (kind === 'approve') {
    const task = arr(state.snapshot.tasks).find((t) => t.id === form.dataset.id)
    const rating = Number(v.rating)
    if (!task || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      flash('Rating must be a whole number from 1 to 5.', true)
      return
    }
    payload = {
      type: 'task.transition',
      id: form.dataset.id,
      state: 'Approved',
      rating,
      ratingNote: v.ratingNote || '',
      version: task.version,
    }
  }
  if (kind === 'absence-decision')
    payload = { type: 'absence.decide', id: form.dataset.id, status: form.dataset.status, decisionNote: v.decisionNote }
  if (kind === 'note' || kind === 'broadcast')
    payload = { type: `${kind}.create`, ...v, recipientIds: recipients(form) }
  if (kind === 'absence-leave')
    payload = { type: 'absence.request', kind: 'leave', start: v.start, end: v.end, reason: v.reason }
  if (kind === 'absence-permission') {
    if (v.endTime <= v.startTime) {
      flash('End time must be after start time.', true)
      return
    }
    payload = {
      type: 'absence.request',
      kind: 'permission',
      start: new Date(`${v.date}T${v.startTime}:00+05:30`).toISOString(),
      end: new Date(`${v.date}T${v.endTime}:00+05:30`).toISOString(),
      reason: v.reason,
    }
  }
  if (!payload) return
  if (form.dataset.id) payload.id = form.dataset.id
  await runWrite(
    payload,
    button,
    kind === 'admin' ? 'Admin account created.' : 'Saved successfully.',
    Boolean(form.closest('dialog')),
  )
}
root.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]')
  if (!form) return
  e.preventDefault()
  handleForm(form, e.submitter || form.querySelector('button[type="submit"]')).catch((error) =>
    flash(error.message, true),
  )
})
root.addEventListener('input', (e) => {
  if (e.target.matches('form[data-form="password"] [name="currentPassword"]')) {
    e.target.removeAttribute('aria-invalid')
    e.target.removeAttribute('aria-describedby')
  }
})
root.addEventListener('click', (e) => {
  if (e.target.closest('.skip-link')) {
    e.preventDefault()
    document.querySelector('#main')?.focus()
    return
  }
  const button = e.target.closest('[data-action]')
  if (button) {
    e.preventDefault()
    handleAction(button).catch((error) => flash(error.message, true))
  }
})
root.addEventListener('change', (e) => {
  if (e.target.id === 'profile-photo-input') {
    const file = e.target.files?.[0]
    if (file) stagePhoto(file, state.photoSize)
    return
  }
  if (e.target.id === 'profile-photo-size') {
    if (state.view !== 'profile' || state.photoBusy || state.busy) return
    const size = Number(e.target.value)
    if (!PHOTO_SIZES.includes(size)) return
    try {
      const source =
        state.photoFile || (state.user.profile?.photoDataUrl ? savedPhotoFile(state.user.profile.photoDataUrl) : null)
      if (source) stagePhoto(source, size)
      else {
        state.photoSize = size
        state.photoNotice = `Choose a photo to resize to ${size} × ${size} px.`
        syncPhotoControls()
      }
    } catch (error) {
      state.photoNotice = error.message
      syncPhotoControls()
    }
    return
  }
  if (e.target.matches('form[data-form="task"] [name="assigneeId"]')) {
    const form = e.target.form,
      job = form.elements.jobFunction
    const employee = arr(state.snapshot.employees).find(
      (p) => String(p.id) === e.target.value && p.active && (p.role === 'Employee' || p.role === 'Admin'),
    )
    job.replaceChildren(new Option(employee ? 'Choose a job function…' : 'Select an employee first', ''))
    jobFunctions.forEach((j) => job.add(new Option(j, j)))
    job.disabled = !employee
    job.required = employee?.role !== 'Admin'
    form.querySelector('#function-help').textContent = employee
      ? employee.role === 'Admin'
        ? 'Optional for Admin assignees; any work type may be selected.'
        : `Any work type is available for ${employee.name}, regardless of designation.`
      : 'Choose an assignee to show the full work list.'
  }
})
root.addEventListener('keydown', (e) => {
  if (!state.drawer) return
  if (e.key === 'Escape') {
    e.preventDefault()
    setDrawer(false)
    return
  }
  if (e.key !== 'Tab') return
  const items = [...document.querySelectorAll('#sidebar a, #sidebar button')].filter(
    (el) => !el.disabled && el.getClientRects().length,
  )
  if (!items.length) return
  const first = items[0],
    last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
})
root.addEventListener(
  'close',
  (e) => {
    if (e.target.id === 'modal') priorFocus?.focus()
  },
  true,
)
window.addEventListener('hashchange', () => {
  if (!state.user || state.user.mustChangePassword || !state.snapshot) return
  const view = permittedView(location.hash.slice(1) || 'dashboard')
  if (state.drawer) setDrawer(false, false)
  clearPendingPhoto()
  state.analyticsSequence++
  state.view = view
  state.message = ''
  state.error = ''
  shell()
  document.querySelector('#main')?.focus({ preventScroll: true })
  if (view === 'analytics') loadAnalytics()
  if (view === 'notifications' && !state.push) checkPush()
})
async function start() {
  let sessionUser, sessionCsrf
  try {
    const session = await json('/session')
    if (state.user || state.csrf) return
    state.user = session.user
    state.csrf = session.csrfToken
    sessionUser = state.user?.id
    sessionCsrf = state.csrf
    if (state.user.mustChangePassword) {
      changePassword()
      return
    }
    if (!(await load())) return
    state.view = permittedView(location.hash.slice(1) || 'dashboard')
    shell()
    checkPush()
    if (state.view === 'analytics') loadAnalytics()
  } catch (err) {
    if (
      err.sessionExpired ||
      (sessionCsrf ? state.user?.id !== sessionUser || state.csrf !== sessionCsrf : state.user || state.csrf)
    )
      return
    state.error = err.status === 401 ? '' : err.message
    login()
  }
}
start()
setTimeout(
  () => {
    pollSnapshot()
    setInterval(pollSnapshot, 60_000)
  },
  60_000 - (Date.now() % 60_000) + 1_000,
)
setInterval(syncTodayAttendance, 15_000)
window.addEventListener('focus', () => {
  pollSnapshot()
  if (state.view === 'analytics' && state.user && !state.busy) loadAnalytics({ liveOnly: true })
})
window.addEventListener('resize', () => {
  if (!state.user) return
  if (!matchMedia('(max-width: 900px)').matches && state.drawer) setDrawer(false)
  const sidebar = document.querySelector('#sidebar')
  if (sidebar) sidebar.inert = matchMedia('(max-width: 900px)').matches && !state.drawer
})
