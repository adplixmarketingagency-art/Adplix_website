import { database, readState, mutate, session, issueSession, revokeUser, throttle } from './store.mjs'
import { normalizeEmail, validPassword, publicUser, tokenHash, cookie, clearCookie, sameOrigin } from './auth.mjs'
import { hashPortalPassword, verifyPortalPassword } from './password-service.mjs'
import { businessDate, dailyUpdateStatus, transitionTask, decorateTask, loginRecordFor } from './domain.mjs'
import { buildAnalytics } from './analytics.mjs'
import { analyticsWorkbook } from './excel.mjs'
import { sendBroadcastPush } from './notifications.mjs'
import { validateProfilePhoto } from './profile-photo.mjs'

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status })
}
const required = (v, max = 500) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail('Invalid or missing field.')
  return v.trim()
}
const email = (v) => {
  const e = normalizeEmail(v)
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('Invalid email.')
  return e
}
const id = () => crypto.randomUUID()
const iso = () => new Date().toISOString()
const admin = (user) => {
  if (user.role !== 'Admin') fail('Not permitted.', 403)
}
const active = (state, value, field = 'id') => state.users.find((u) => u[field] === value && u.active)
const currentActor = (state, userId, credentialVersion) => {
  const actor = active(state, userId)
  if (!actor || (actor.credentialVersion || 0) !== credentialVersion) fail('Session expired.', 401)
  return actor
}
const response = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })
const json = async (request) => {
  if (Number(request.headers.get('content-length')) > 20000) fail('Request too large.', 413)
  const text = await request.text()
  if (text.length > 20000) fail('Request too large.', 413)
  try {
    const value = JSON.parse(text)
    if (!value || Array.isArray(value) || typeof value !== 'object') fail('Invalid JSON.')
    return value
  } catch (e) {
    if (e.status) throw e
    fail('Invalid JSON.')
  }
}
const date = (value) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail('Invalid date.')
  return value
}
const timestamp = (value) => {
  if (typeof value !== 'string' || !/Z$|[+-]\d\d:\d\d$/.test(value) || Number.isNaN(Date.parse(value)))
    fail('Invalid timestamp.')
  return new Date(value).toISOString()
}
const recipients = (state, values) => {
  if (!Array.isArray(values) || values.length > 100 || values.some((v) => typeof v !== 'string' || !active(state, v)))
    fail('Invalid recipients.')
  return [...new Set(values)]
}
const notify = (state, employeeId, title, text, metadata = {}) => {
  state.notifications ||= []
  state.notifications.push({ id: id(), employeeId, title, text, ...metadata, createdAt: iso(), readAt: null })
}
const jobFunctions = (v) => {
  if (!Array.isArray(v) || v.length > 16 || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 80))
    fail('Invalid job functions.')
  return [...new Set(v.map((x) => x.trim()))]
}
const designation = (value, fallback) => (value === undefined ? fallback : required(value, 120))
const serviceType = (value, fallback) => {
  if (value === undefined) return fallback
  if (!['videos', 'posters', 'both'].includes(value)) fail('Invalid service type.')
  return value
}
const eventTime = (value) => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Invalid event time.')
  return value
}
const eventDescription = (value) => {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > 1000) fail('Invalid event description.')
  return value.trim()
}
const pushForEmployees = (state, ids) => {
  const eligible = new Set(
    state.users
      .filter((u) => u.active && u.role === 'Employee' && (!ids.length || ids.includes(u.id)))
      .map((u) => u.id),
  )
  return (state.subscriptions || []).filter((x) => eligible.has(x.employeeId))
}
// No passwords, free-form content, endpoint URLs, or request payloads belong in audit records.
const audit = (state, actorId, action, subjectId = null) =>
  (state.audit ||= []).push({ id: id(), actorId, action, at: iso(), subjectId })
// Fixed work-factor for unknown accounts; this hash does not correspond to a provisioned user.
const DUMMY_PASSWORD_HASH =
  'scrypt-v1$32768$8$3$000000000000000000000000000000000000000000000000$1813bc929d4e4c36f4af9f60a856cd8f8b9ceaa91712765a73926b1cba497501'
const REGISTRATION_MESSAGE = 'Registration request received. An administrator must approve access.'
const registrationPublic = ({ id, name, email, designation, status, createdAt, decidedAt, employeeId }) => ({
  id,
  name,
  email,
  designation: designation || 'Employee',
  status,
  createdAt,
  decidedAt,
  employeeId: employeeId || null,
})
const validateSubscription = (sub) => {
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048)
    fail('Invalid subscription.')
  let url
  try {
    url = new URL(sub.endpoint)
  } catch {
    fail('Invalid subscription.')
  }
  const host = url.hostname.toLowerCase()
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/.test(
      host,
    )
  )
    fail('Invalid subscription endpoint.')
  if (
    !sub.keys ||
    !/^[A-Za-z0-9_-]{80,120}$/.test(sub.keys.p256dh || '') ||
    !/^[A-Za-z0-9_-]{16,32}$/.test(sub.keys.auth || '')
  )
    fail('Invalid subscription keys.')
  return { endpoint: url.href, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }
}
const snapshot = (state, user, now = new Date()) => {
  const isAdmin = user.role === 'Admin'
  const visibleEmployees = state.users.filter((u) => (u.active || isAdmin) && (isAdmin || u.role === 'Employee'))
  return {
    user: publicUser(user),
    employees: visibleEmployees.map((u) =>
      isAdmin
        ? { ...publicUser(u), updateStatus: dailyUpdateStatus(u.id, state.updates, state.absences, now, u) }
        : {
            id: u.id,
            name: u.name,
            employeeId: u.employeeId,
            designation: u.designation || '',
            role: u.role,
            jobFunctions: u.jobFunctions,
            active: u.active,
            createdAt: u.createdAt || null,
            deactivatedAt: u.deactivatedAt || null,
          },
    ),
    ...(isAdmin
      ? {
          admins: state.users.filter((u) => (u.active || isAdmin) && u.role === 'Admin').map(publicUser),
          registrations: (state.registrations || []).map(registrationPublic),
        }
      : {}),
    clients: state.clients.filter((c) => c.active || isAdmin),
    calendarEvents: state.calendarEvents || [],
    targets: state.targets || [],
    tasks: (state.tasks || []).map((t) => {
      const decorated = decorateTask(t, state.absences || [], now)
      if (isAdmin || t.assigneeId === user.id) return decorated
      const {
        id,
        title,
        assigneeId,
        clientId,
        jobFunction,
        deadline,
        priority,
        state: taskState,
        createdAt,
        updatedAt,
        completedAt,
        approvedAt,
        version,
        workSeconds,
        overdue,
        rating,
        ratingNote,
        ratedAt,
        ratedBy,
      } = decorated
      return {
        id,
        title,
        assigneeId,
        clientId,
        jobFunction,
        deadline,
        priority,
        state: taskState,
        createdAt,
        updatedAt,
        completedAt,
        approvedAt,
        version,
        workSeconds,
        overdue,
        rating,
        ratingNote,
        ratedAt,
        ratedBy,
      }
    }),
    updates: state.updates.filter((x) => isAdmin || x.employeeId === user.id),
    absences: state.absences.filter((x) => isAdmin || x.employeeId === user.id),
    notes: state.notes.filter((x) => isAdmin || !x.recipientIds.length || x.recipientIds.includes(user.id)),
    notifications: (state.notifications || []).filter((x) => x.employeeId === user.id),
    serverNow: now.toISOString(),
    today: businessDate(now),
    updateStatus: dailyUpdateStatus(user.id, state.updates, state.absences, now, user),
  }
}
const filters = (url) => {
  const result = {}
  for (const key of ['from', 'to', 'month', 'year', 'employeeId', 'clientId', 'jobFunction']) {
    const values = url.searchParams.getAll(key)
    if (values.length > 1) fail('Duplicate filter.')
    if (values.length) result[key] = key === 'from' || key === 'to' ? date(values[0]) : required(values[0], 100)
  }
  if (result.from && result.to && result.from > result.to) fail('Invalid date range.')
  return result
}

async function action(db, actorId, credentialVersion, a, env) {
  let revoke = null,
    push = null
  await mutate(db, async (s) => {
    const actor = active(s, actorId)
    if (!actor || (actor.credentialVersion || 0) !== credentialVersion) fail('Session expired.', 401)
    if (actor.mustChangePassword) fail('Change your password first.', 403)
    let u,
      c,
      t,
      item,
      subjectId = null
    switch (a.type) {
      case 'registration.approve': {
        admin(actor)
        item = (s.registrations || []).find((x) => x.id === required(a.id, 100))
        if (!item || item.status !== 'Pending') fail('Registration unavailable.', 409)
        const employeeId = required(a.employeeId, 80),
          funcs = jobFunctions(a.jobFunctions)
        if (s.users.some((x) => x.email === item.email || x.employeeId === employeeId))
          fail('Employee ID or email already exists.', 409)
        const at = iso()
        subjectId = id()
        s.users.push({
          id: subjectId,
          name: item.name,
          employeeId,
          email: item.email,
          designation: item.designation || 'Employee',
          passwordHash: item.passwordHash,
          role: 'Employee',
          jobFunctions: funcs,
          profile: {},
          mustChangePassword: false,
          active: true,
          credentialVersion: 0,
          createdAt: at,
          deactivatedAt: null,
        })
        item.status = 'Approved'
        item.decidedAt = at
        item.employeeId = employeeId
        delete item.passwordHash
        break
      }
      case 'registration.reject':
        admin(actor)
        item = (s.registrations || []).find((x) => x.id === required(a.id, 100))
        if (!item || item.status !== 'Pending') fail('Registration unavailable.', 409)
        item.status = 'Rejected'
        item.decidedAt = iso()
        delete item.passwordHash
        subjectId = item.id
        break
      case 'employee.create': {
        admin(actor)
        const name = required(a.name, 120),
          employeeId = required(a.employeeId, 80),
          mail = email(a.email),
          funcs = jobFunctions(a.jobFunctions),
          passwordHash = await hashPortalPassword(a.password, env)
        if (s.users.some((x) => x.email === mail || x.employeeId === employeeId))
          fail('Employee ID or email already exists.', 409)
        subjectId = id()
        s.users.push({
          id: subjectId,
          name,
          employeeId,
          email: mail,
          passwordHash,
          designation: designation(a.designation, 'Employee'),
          role: 'Employee',
          jobFunctions: funcs,
          profile: {},
          mustChangePassword: true,
          active: true,
          credentialVersion: 0,
          createdAt: iso(),
          deactivatedAt: null,
        })
        break
      }
      case 'admin.create': {
        admin(actor)
        const name = required(a.name, 120),
          employeeId = required(a.employeeId, 80),
          mail = email(a.email),
          funcs = a.jobFunctions === undefined ? [] : jobFunctions(a.jobFunctions),
          passwordHash = await hashPortalPassword(a.password, env)
        if (s.users.some((x) => x.email === mail || x.employeeId === employeeId))
          fail('Employee ID or email already exists.', 409)
        subjectId = id()
        s.users.push({
          id: subjectId,
          name,
          employeeId,
          email: mail,
          passwordHash,
          designation: designation(a.designation, 'Admin'),
          role: 'Admin',
          jobFunctions: funcs,
          profile: {},
          mustChangePassword: true,
          active: true,
          credentialVersion: 0,
          createdAt: iso(),
          deactivatedAt: null,
        })
        break
      }
      case 'employee.update':
        admin(actor)
        u = active(s, a.id)
        if (!u || u.role !== 'Employee') fail('Employee unavailable.', 404)
        {
          const name = required(a.name, 120),
            employeeId = required(a.employeeId, 80),
            mail = email(a.email),
            funcs = jobFunctions(a.jobFunctions)
          if (s.users.some((x) => x.id !== u.id && (x.email === mail || x.employeeId === employeeId)))
            fail('Employee ID or email already exists.', 409)
          const previousEmail = u.email
          Object.assign(u, {
            name,
            employeeId,
            email: mail,
            designation: designation(a.designation, u.designation || 'Employee'),
            jobFunctions: funcs,
          })
          if (mail !== previousEmail) {
            u.credentialVersion = (u.credentialVersion || 0) + 1
            revoke = u.id
          }
          subjectId = u.id
        }
        break
      case 'employee.deactivate':
        admin(actor)
        u = active(s, a.id)
        if (!u) fail('Employee unavailable.', 404)
        if (u.role === 'Admin' && s.users.filter((x) => x.active && x.role === 'Admin').length <= 1)
          fail('Cannot deactivate final Admin.', 409)
        u.active = false
        u.deactivatedAt = iso()
        u.credentialVersion = (u.credentialVersion || 0) + 1
        revoke = u.id
        subjectId = u.id
        s.subscriptions = s.subscriptions.filter((x) => x.employeeId !== u.id)
        break
      case 'employee.resetPassword':
        admin(actor)
        u = active(s, a.id)
        if (!u || u.role !== 'Employee') fail('Employee unavailable.', 404)
        u.passwordHash = await hashPortalPassword(a.password, env)
        u.mustChangePassword = true
        u.credentialVersion = (u.credentialVersion || 0) + 1
        revoke = u.id
        subjectId = u.id
        break
      case 'designation.update':
        if (actor.role === 'Employee') {
          if (a.id && a.id !== actor.id) fail('Not permitted.', 403)
          actor.designation = required(a.designation, 120)
          subjectId = actor.id
        } else {
          u = active(s, required(a.id, 80))
          if (!u) fail('User unavailable.', 404)
          u.designation = required(a.designation, 120)
          subjectId = u.id
        }
        break
      case 'profile.update': {
        if (
          !a.profile ||
          typeof a.profile !== 'object' ||
          Array.isArray(a.profile) ||
          Object.keys(a.profile).some((key) => !['phone', 'bio'].includes(key))
        )
          fail('Invalid profile.')
        const phone = a.profile.phone ? required(a.profile.phone, 40) : '',
          bio = a.profile.bio ? required(a.profile.bio, 500) : ''
        if (a.designation !== undefined) actor.designation = required(a.designation, 120)
        const photo = actor.profile?.photoDataUrl
        actor.profile = { phone, bio }
        if (typeof photo === 'string') {
          try {
            actor.profile.photoDataUrl = validateProfilePhoto(photo)
          } catch {
            /* Ignore invalid legacy data. */
          }
        }
        subjectId = actor.id
        break
      }
      case 'profile.photo':
        if (!['Admin', 'Employee'].includes(actor.role)) fail('Not permitted.', 403)
        if (a.id !== undefined && a.id !== actor.id) fail('Not permitted.', 403)
        if (a.photo !== null) validateProfilePhoto(a.photo)
        actor.profile = {
          ...(actor.profile && typeof actor.profile === 'object' && !Array.isArray(actor.profile) ? actor.profile : {}),
          photoDataUrl: a.photo,
        }
        subjectId = actor.id
        break
      case 'client.create':
        admin(actor)
        subjectId = id()
        s.clients.push({
          id: subjectId,
          name: required(a.name, 120),
          service: required(a.service, 160),
          serviceType: serviceType(a.serviceType, 'both'),
          active: true,
        })
        break
      case 'client.update':
        admin(actor)
        c = s.clients.find((x) => x.id === a.id && x.active)
        if (!c) fail('Client unavailable.', 404)
        c.name = required(a.name, 120)
        c.service = required(a.service, 160)
        c.serviceType = serviceType(a.serviceType, c.serviceType || 'both')
        subjectId = c.id
        break
      case 'client.target.upsert': {
        admin(actor)
        const targetClient = s.clients.find((x) => x.id === required(a.clientId, 80) && x.active)
        if (!targetClient) fail('Client unavailable.', 404)
        const month = required(a.month, 7),
          contentType = serviceType(a.contentType, targetClient.serviceType || 'both')
        if (
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
          !Number.isSafeInteger(a.requiredCount) ||
          a.requiredCount < 0 ||
          a.requiredCount > 100000 ||
          !Number.isSafeInteger(a.postedCount) ||
          a.postedCount < 0 ||
          a.postedCount > 100000
        )
          fail('Invalid target.')
        s.targets ||= []
        item = s.targets.find((x) => x.clientId === targetClient.id && x.month === month)
        if (item) Object.assign(item, { requiredCount: a.requiredCount, postedCount: a.postedCount, contentType })
        else
          s.targets.push({
            id: id(),
            clientId: targetClient.id,
            month,
            requiredCount: a.requiredCount,
            postedCount: a.postedCount,
            contentType,
          })
        subjectId = targetClient.id
        break
      }
      case 'event.create': {
        admin(actor)
        s.calendarEvents ||= []
        subjectId = id()
        s.calendarEvents.push({
          id: subjectId,
          title: required(a.title, 200),
          date: date(a.date),
          time: eventTime(a.time),
          description: eventDescription(a.description),
        })
        break
      }
      case 'event.update': {
        admin(actor)
        item = (s.calendarEvents || []).find((x) => x.id === required(a.id, 100))
        if (!item) fail('Event unavailable.', 404)
        Object.assign(item, {
          title: required(a.title, 200),
          date: date(a.date),
          time: eventTime(a.time),
          description: eventDescription(a.description),
        })
        subjectId = item.id
        break
      }
      case 'event.delete':
        admin(actor)
        {
          const eventId = required(a.id, 100)
          s.calendarEvents ||= []
          item = s.calendarEvents.find((x) => x.id === eventId)
          if (!item) fail('Event unavailable.', 404)
          s.calendarEvents = s.calendarEvents.filter((x) => x.id !== eventId)
          subjectId = eventId
        }
        break
      case 'client.archive':
        admin(actor)
        c = s.clients.find((x) => x.id === a.id && x.active)
        if (!c) fail('Client unavailable.', 404)
        c.active = false
        subjectId = c.id
        break
      case 'task.create': {
        admin(actor)
        u = active(s, a.assigneeId)
        c = s.clients.find((x) => x.id === a.clientId && x.active)
        const jobFunction = a.jobFunction === undefined || a.jobFunction === '' ? '' : required(a.jobFunction, 80),
          deadline = timestamp(a.deadline)
        if (!u || !c || (u.role === 'Employee' ? !jobFunction : u.id !== actor.id && u.role !== 'Admin'))
          fail('Invalid assignment.')
        const at = iso()
        const task = {
          id: id(),
          title: required(a.title, 200),
          description: typeof a.description === 'string' && a.description.length <= 3000 ? a.description : '',
          assigneeId: u.id,
          clientId: c.id,
          jobFunction,
          deadline,
          priority: ['Low', 'Normal', 'High', 'Urgent'].includes(a.priority) ? a.priority : 'Normal',
          state: 'Assigned',
          createdAt: at,
          updatedAt: at,
          completedAt: null,
          approvedAt: null,
          version: 1,
          intervals: [],
          events: [{ actorId: actor.id, from: null, to: 'Assigned', at, kind: 'assignment' }],
        }
        s.tasks ||= []
        s.tasks.push(task)
        if (u.role === 'Employee') notify(s, u.id, 'New assignment', task.title)
        subjectId = task.id
        break
      }
      case 'task.transition': {
        t = s.tasks.find((x) => x.id === a.id)
        if (!t) fail('Task unavailable.', 404)
        if (!Number.isSafeInteger(a.version) || a.version !== t.version) fail('Task changed; refresh and retry.', 409)
        if (actor.role !== 'Admin' && t.assigneeId !== actor.id) fail('Not permitted.', 403)
        if (a.state === 'Approved' && actor.role !== 'Admin') fail('Not permitted.', 403)
        const previousState = t.state,
          previousVersion = t.version
        s.tasks[s.tasks.indexOf(t)] = transitionTask(
          t,
          actor,
          a.state,
          new Date(),
          a.reason || '',
          a.rating,
          a.ratingNote === undefined ? '' : a.ratingNote,
        )
        if (actor.role === 'Employee' && previousState !== 'Completed' && a.state === 'Completed') {
          s.notifications ||= []
          const title = `Task completed: ${t.title}`
          const text = 'This task is completed and waiting for approval.'
          for (const recipient of s.users.filter((x) => x.active && x.role === 'Admin')) {
            if (
              !s.notifications.some(
                (n) => n.employeeId === recipient.id && n.taskId === t.id && n.transitionVersion === previousVersion,
              )
            ) {
              notify(s, recipient.id, title, text, { taskId: t.id, transitionVersion: previousVersion })
            }
          }
        }
        if (actor.role === 'Admin' && !(actor.id === t.assigneeId && ['In-progress', 'Completed'].includes(a.state)))
          notify(
            s,
            t.assigneeId,
            a.state === 'Approved' ? 'Task approved' : 'Task needs revision',
            a.state === 'Approved' ? t.title : required(a.reason, 1000),
          )
        subjectId = t.id
        break
      }
      case 'task.deadline':
        admin(actor)
        t = s.tasks.find((x) => x.id === a.id)
        if (!t) fail('Task unavailable.', 404)
        if (t.version !== a.version) fail('Task changed; refresh and retry.', 409)
        t.events.push({
          actorId: actor.id,
          from: t.state,
          to: t.state,
          at: iso(),
          kind: 'deadline',
          reason: `Deadline changed from ${t.deadline} to ${timestamp(a.deadline)}`,
        })
        t.deadline = timestamp(a.deadline)
        t.updatedAt = iso()
        t.version++
        subjectId = t.id
        break
      case 'update.submit': {
        if (actor.role !== 'Employee') fail('Not permitted.', 403)
        const today = businessDate(new Date()),
          text = required(a.text, 2000)
        item = s.updates.find((x) => x.employeeId === actor.id && x.date === today)
        if (item) {
          item.text = text
          item.editedAt = iso()
        } else {
          item = { id: id(), employeeId: actor.id, date: today, text, submittedAt: iso(), editedAt: null }
          s.updates.push(item)
        }
        subjectId = item.id
        break
      }
      case 'absence.request': {
        if (actor.role !== 'Employee') fail('Not permitted.', 403)
        const kind = a.kind
        if (!['leave', 'permission'].includes(kind)) fail('Invalid absence kind.')
        const start = kind === 'leave' ? date(a.start) : timestamp(a.start),
          end = kind === 'leave' ? date(a.end) : timestamp(a.end)
        if (
          end < start ||
          (kind === 'permission' && (end === start || businessDate(new Date(start)) !== businessDate(new Date(end))))
        )
          fail('Invalid absence interval.')
        subjectId = id()
        s.absences.push({
          id: subjectId,
          employeeId: actor.id,
          kind,
          start,
          end,
          reason: required(a.reason, 1000),
          status: 'Pending',
          createdAt: iso(),
          decidedAt: null,
          decisionNote: '',
        })
        break
      }
      case 'absence.decide':
        admin(actor)
        item = s.absences.find((x) => x.id === a.id)
        if (
          !item ||
          item.status !== 'Pending' ||
          !['Approved', 'Rejected'].includes(a.status) ||
          item.employeeId === actor.id
        )
          fail('Request unavailable.', 409)
        item.status = a.status
        item.decidedAt = iso()
        item.decisionNote = typeof a.decisionNote === 'string' && a.decisionNote.length <= 1000 ? a.decisionNote : ''
        notify(
          s,
          item.employeeId,
          'Absence request ' + a.status.toLowerCase(),
          item.decisionNote || 'Your request has been reviewed.',
        )
        subjectId = item.id
        break
      case 'note.create': {
        admin(actor)
        const rids = recipients(s, a.recipientIds),
          text = required(a.text, 3000)
        subjectId = id()
        s.notes.push({ id: subjectId, text, recipientIds: rids, authorId: actor.id, createdAt: iso() })
        for (const e of s.users.filter(
          (x) => x.active && x.role === 'Employee' && (!rids.length || rids.includes(x.id)),
        ))
          notify(s, e.id, 'New note', text)
        push = pushForEmployees(s, rids)
        break
      }
      case 'note.delete':
        admin(actor)
        {
          const noteId = required(a.id, 100)
          item = s.notes.find((x) => x.id === noteId)
          if (!item) fail('Note unavailable.', 404)
          s.notes = s.notes.filter((x) => x.id !== noteId)
          subjectId = noteId
        }
        break
      case 'broadcast.create':
        admin(actor)
        {
          const title = required(a.title, 160),
            text = required(a.text, 2000),
            ids = recipients(s, a.recipientIds)
          for (const u of s.users.filter(
            (x) => x.active && x.role === 'Employee' && (!ids.length || ids.includes(x.id)),
          ))
            notify(s, u.id, title, text)
          push = pushForEmployees(s, ids)
        }
        break
      case 'notification.read':
        item = s.notifications.find((x) => x.id === a.id && x.employeeId === actor.id)
        if (!item) fail('Notification unavailable.', 404)
        item.readAt ||= iso()
        subjectId = item.id
        break
      default:
        fail('Unknown action.')
    }
    audit(s, actor.id, a.type, subjectId)
  })
  if (revoke) await revokeUser(db, revoke)
  return push
}

export async function handlePortalApi(request, env, context) {
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  if (!path.startsWith('/api/portal/')) return response({ error: 'Not found.' }, 404)
  try {
    const db = database(env),
      method = request.method,
      endpoint = path.slice('/api/portal/'.length)
    if (method === 'POST' && !sameOrigin(request)) fail('Invalid request origin.', 403)
    if (endpoint === 'register' && method === 'POST') {
      const body = await json(request),
        name = required(body.name, 120),
        mail = email(body.email)
      if (!validPassword(body.password)) fail('Password must be 12–256 characters.')
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const limitedIp = await throttle(db, 'regIP:' + tokenHash(ip.slice(0, 128)))
      const limitedEmail = await throttle(db, 'regEmail:' + tokenHash(mail))
      if (limitedIp || limitedEmail) fail('Too many attempts. Try again later.', 429)
      const { state } = await readState(db)
      if (!state.users.some((x) => x.active && x.role === 'Admin')) fail('Portal setup required.', 503)
      if (state.users.some((x) => x.email === mail) || (state.registrations || []).some((x) => x.email === mail))
        return response({ ok: true, message: REGISTRATION_MESSAGE }, 202)
      const passwordHash = await hashPortalPassword(body.password, env)
      await mutate(db, (s) => {
        if (!s.users.some((x) => x.active && x.role === 'Admin')) fail('Portal setup required.', 503)
        if (s.users.some((x) => x.email === mail) || (s.registrations || []).some((x) => x.email === mail)) return
        s.registrations ||= []
        // Decided requests are retained for review, then expired before the bounded state fills.
        const cutoff = Date.now() - 30 * 24 * 60 * 60_000
        s.registrations = s.registrations.filter(
          (x) => x.status === 'Pending' || Date.parse(x.decidedAt || x.createdAt) >= cutoff,
        )
        if (s.registrations.filter((x) => x.status === 'Pending').length >= 100 || s.registrations.length >= 500)
          fail('Registration capacity reached. Try again later.', 503)
        s.registrations.push({
          id: id(),
          name,
          email: mail,
          designation: designation(body.designation, 'Employee'),
          passwordHash,
          status: 'Pending',
          createdAt: iso(),
          decidedAt: null,
        })
      })
      return response({ ok: true, message: REGISTRATION_MESSAGE }, 202)
    }
    if (endpoint === 'login' && method === 'POST') {
      const body = await json(request),
        mail = normalizeEmail(body.email),
        ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      if (mail.length > 254 || typeof body.password !== 'string' || body.password.length > 256)
        fail('Invalid credentials.', 401)
      // Both counters are charged for every attempt, successful or not; no account existence leak.
      const limitedIp = await throttle(db, 'ip:' + ip.slice(0, 128))
      const limitedEmail = await throttle(db, 'email:' + tokenHash(mail))
      if (limitedIp || limitedEmail) fail('Too many attempts. Try again later.', 429)
      const { state } = await readState(db),
        user = state.users.find((x) => x.email === mail && x.active)
      const pending = !user && (state.registrations || []).find((x) => x.email === mail && x.status === 'Pending')
      const verified = await verifyPortalPassword(
        body.password,
        user?.passwordHash || pending?.passwordHash || DUMMY_PASSWORD_HASH,
        env,
      )
      if (!verified) fail('Invalid credentials.', 401)
      if (pending) {
        const { state: latest } = await readState(db)
        if (
          (latest.registrations || []).some(
            (x) => x.id === pending.id && x.status === 'Pending' && x.passwordHash === pending.passwordHash,
          )
        )
          fail('Administrator approval required.', 403)
        fail('Invalid credentials.', 401)
      }
      if (!user) fail('Invalid credentials.', 401)
      const { state: latest } = await readState(db),
        current = latest.users.find(
          (x) =>
            x.id === user.id &&
            x.active &&
            x.passwordHash === user.passwordHash &&
            (x.credentialVersion || 0) === (user.credentialVersion || 0),
        )
      if (!current) fail('Invalid credentials.', 401)
      if (current.role === 'Admin' || current.role === 'Employee') {
        const loginAt = new Date()
        await mutate(db, (s) => loginRecordFor((s.loginRecords ||= []), current.id, businessDate(loginAt), loginAt))
      }
      const { state: afterLogin } = await readState(db),
        sessionUser = afterLogin.users.find(
          (x) => x.id === current.id && x.active && x.passwordHash === current.passwordHash,
        )
      if (!sessionUser) fail('Invalid credentials.', 401)
      const { token, csrfToken } = await issueSession(db, sessionUser)
      return response({ user: publicUser(sessionUser), csrfToken }, 200, { 'Set-Cookie': cookie(token, request, env) })
    }
    const auth = await session(db, request)
    if (!auth) fail('Sign in required.', 401)
    const { user, row, token } = auth
    if (method === 'POST') {
      const csrf = request.headers.get('X-CSRF-Token')
      if (!csrf || !/^[a-f0-9]{64}$/.test(csrf) || tokenHash(csrf) !== row.csrf_hash) fail('Invalid CSRF token.', 403)
    }
    if (endpoint === 'session' && method === 'GET')
      return response({ user: publicUser(user), csrfToken: tokenHash('csrf:' + token) })
    if (endpoint === 'logout' && method === 'POST') {
      await db.prepare('DELETE FROM portal_sessions WHERE token_hash=?').bind(tokenHash(token)).run()
      return response({ ok: true }, 200, { 'Set-Cookie': clearCookie(request) })
    }
    if (endpoint === 'password' && method === 'POST') {
      const body = await json(request)
      if (!(await verifyPortalPassword(body.currentPassword, user.passwordHash, env)))
        return response(
          {
            error: 'Current password is incorrect. Enter the password you used to sign in.',
            code: 'CURRENT_PASSWORD_INCORRECT',
          },
          400,
        )
      const passwordHash = await hashPortalPassword(body.newPassword, env)
      await mutate(db, (s) => {
        const current = active(s, user.id)
        if (!current || current.passwordHash !== user.passwordHash) fail('Credentials changed.', 409)
        current.passwordHash = passwordHash
        current.mustChangePassword = false
        current.credentialVersion = (current.credentialVersion || 0) + 1
        audit(s, current.id, 'password.change', current.id)
      })
      await revokeUser(db, user.id)
      const { state } = await readState(db),
        fresh = active(state, user.id)
      if (!fresh || fresh.passwordHash !== passwordHash) fail('Credentials changed.', 409)
      const issued = await issueSession(db, fresh)
      return response({ user: publicUser(fresh), csrfToken: issued.csrfToken }, 200, {
        'Set-Cookie': cookie(issued.token, request, env),
      })
    }
    if (user.mustChangePassword) fail('Change your password first.', 403)
    if (endpoint === 'snapshot' && method === 'GET') {
      const { state } = await readState(db)
      return response(snapshot(state, currentActor(state, user.id, row.credential_version)))
    }
    if (endpoint === 'actions' && method === 'POST') {
      const push = await action(db, user.id, row.credential_version, await json(request), env)
      if (push?.length)
        context?.waitUntil?.(
          sendBroadcastPush(
            env,
            push.map((x) => x.subscription),
          )
            .then(async (result) => {
              if (result.expiredEndpoints?.length)
                await mutate(db, (state) => {
                  state.subscriptions = state.subscriptions.filter(
                    (item) => !result.expiredEndpoints.includes(item.subscription.endpoint),
                  )
                })
            })
            .catch(() => {}),
        )
      return response({ ok: true })
    }
    if ((endpoint === 'analytics' || endpoint === 'export') && method === 'GET') {
      const state = (await readState(db)).state,
        actor = currentActor(state, user.id, row.credential_version)
      admin(actor)
      const now = new Date(),
        filter = filters(new URL(request.url)),
        data = buildAnalytics(
          { ...snapshot(state, actor, now), loginRecords: Array.isArray(state.loginRecords) ? state.loginRecords : [] },
          filter,
          now,
        )
      if (endpoint === 'analytics') return response(data)
      const workbook = analyticsWorkbook(data, snapshot(state, actor, now))
      return new Response(workbook, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="portal-analytics.xlsx"',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    if (endpoint === 'push-key' && method === 'GET') return response({ publicKey: env.VAPID_PUBLIC_KEY || null })
    if (endpoint === 'push-subscription' && method === 'POST') {
      const body = await json(request)
      if (body.subscription !== null && !env.VAPID_PUBLIC_KEY) fail('Push is not configured.', 503)
      const subscription = body.subscription === null ? null : validateSubscription(body.subscription)
      await mutate(db, (s) => {
        const actor = active(s, user.id)
        if (!actor || (actor.credentialVersion || 0) !== row.credential_version) fail('Session expired.', 401)
        if (actor.mustChangePassword) fail('Change your password first.', 403)
        s.subscriptions = s.subscriptions.filter((x) => x.employeeId !== user.id)
        if (subscription) s.subscriptions.push({ employeeId: user.id, subscription })
        audit(s, actor.id, subscription ? 'push.subscribe' : 'push.unsubscribe', actor.id)
      })
      return response({ ok: true })
    }
    return response({ error: 'Not found.' }, 404)
  } catch (error) {
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503
    return response({ error: error.status ? error.message : 'Portal temporarily unavailable.' }, status)
  }
}
export default handlePortalApi
