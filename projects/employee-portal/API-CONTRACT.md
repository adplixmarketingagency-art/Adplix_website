# Portal integration contract

Implementation contract, not a claim of production deployment. JSON fields are camelCase; timestamps ISO UTC. Business timezone Asia/Kolkata.

## HTTP

- `POST /api/portal/login` `{email,password}` → `{user,csrfToken}` plus HttpOnly cookie.
- `POST /api/portal/register` `{name,email,password}` → generic 202 `{ok:true,message}` without a session. Request is Pending until Admin approval; duplicate submissions do not replace stored credentials. Correct pending credentials at login return approval-required 403; rejected/wrong credentials return generic 401.
- `GET /api/portal/session` → `{user,csrfToken}` or 401. User: `{id,name,employeeId,email,role,jobFunctions,profile,mustChangePassword,active}`.
- `POST /api/portal/logout` → `{ok:true}`.
- `POST /api/portal/password` `{currentPassword,newPassword}` → fresh `{user,csrfToken}` after revocation.
- `GET /api/portal/snapshot` → snapshot below.
- `POST /api/portal/actions` → `{ok:true}`. Header `X-CSRF-Token` mandatory, matching Origin on state changes.
- `GET /api/portal/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&employeeId=&clientId=&jobFunction=` → analytics (Admin only).
- `GET /api/portal/export` with same filters → `.xlsx` (Admin only).
- `GET /api/portal/push-key` → `{publicKey:null|string,configured,missing,message,deviceSubscribed}`; no private VAPID key or device endpoint is exposed. `deviceSubscribed` verifies the signed-in account's subscription bound to this browser's HttpOnly device cookie.
- `POST /api/portal/push-subscription` `{subscription:{endpoint,keys:{p256dh,auth}}}` → `{ok:true}` plus a device-binding cookie; upsert by endpoint, preserving other devices (five per account). Revoke only this endpoint with `{subscription:null,endpoint}`; if the browser has no local endpoint, the device cookie revokes only its bound account/device. A shared endpoint is transferred to the signed-in account; login/logout clear prior-account subscriptions on that known device.
- `POST /api/portal/push-test` `{}` → `{sent,failed,skipped,diagnostics:{configuration,preparation,network,timeout,httpStatuses}}`; authenticated, CSRF/origin protected and rate-limited. Diagnostics are bounded category counters and validated HTTP status counts, never endpoints, keys, raw exceptions, response bodies or Authorization details. Sends only to the account's active subscribed devices. Provider acceptance is not proof of device display.

All errors `{error:humanReadableMessage,code?:string}` with appropriate 400/401/403/409/429/503. Never return passwords, hashes, session tokens or SQL errors. API is private/no-store. Login and password support password managers/paste. `/register` is a moderated request, never automatic login or an Admin bootstrap.

Bootstrap is a local/explicit operator script producing a D1 insert with a password hash, never a public bootstrap endpoint or built-in default account. No actual account credentials go into repo docs.

## Snapshot

`{user,employees,profileGlimpses,clients,tasks,updates,absences,notes,notifications,serverNow,today,updateStatus}`

Admin snapshots additionally contain `registrations:[{id,name,email,status,createdAt,decidedAt,employeeId}]`. No password hashes; Employee snapshots omit this field entirely. Legacy states without registrations remain compatible.

- employee `{id,name,employeeId,email?,role,jobFunctions:[],active,profile?}`; employee-visible list excludes private fields.
- profile glimpse `{id,name,role,designation,jobFunctions:[],active,photoDataUrl:null|string}`. This dedicated whitelist is derived only from the existing visible employee list: Admins can preview their permitted Admin/Employee accounts, including inactive accounts; Employees can preview active Employees only. It contains no email, employee identifier, phone, bio, password hash, credential version or full profile object. Only structurally valid stored baseline JPEGs are returned; absent/malformed legacy photos are null. No public profile lookup endpoint is added.
- client `{id,name,service,active}`.
- task `{id,title,description,assigneeId,clientId,jobFunction,deadline,priority,state,createdAt,updatedAt,completedAt,approvedAt,version,intervals:[{start,end:null|string}],events:[{actorId,from,to,at,reason?,kind}],workSeconds,overdue}`. State labels exactly `Assigned`, `In-progress`, `Completed`, `Approved`.
- update `{id,employeeId,date,text,submittedAt,editedAt}`; Admin sees team updates; Employee sees own.
- absence `{id,employeeId,kind:'leave'|'permission',start,end,reason,status:'Pending'|'Approved'|'Rejected',createdAt,decidedAt,decisionNote}`. Leave start/end date strings inclusive; permission ISO instants. Employee sees own requests.
- note `{id,text,recipientIds:[] (empty = all),authorId,createdAt,author:null|{id,name,role}}`. Visible only to intended recipients and Admin. Author attribution also works for legacy notes; it does not grant access to the author's private profile or contact fields.
- notification `{id,title,text,kind,createdAt,readAt,sender:null|{id,name,role},taskId?,transitionVersion?}`; own inbox only. `kind` is a whitelisted workflow type, never free-form notification copy. New workflow messages persist sender IDs; legacy rows only infer recognized types and do not invent missing senders. The sidebar count is the number of own notifications with no `readAt`; note alerts count once, not again as separate notes.
- today business date; updateStatus `{status:'pending'|'overdue'|'on-time'|'late'|'exempt',deadline,submittedAt?}` for logged-in user.

## Action payloads (flat object including type)

- `registration.approve` `{id,employeeId,jobFunctions:[]}`; Admin only, Pending only, unique employee ID/email, creates Employee from the stored name and password hash. No applicant role override.
- `registration.reject` `{id}`; Admin only, Pending only; purges pending password hash and does not create an account. Both decisions are audited and conflict-safe.
- `employee.create` `{name,employeeId,email,password,jobFunctions:[]}`; creates Employee only.
- `employee.update` `{id,name,employeeId,email,jobFunctions:[]}`; Admin cannot change role.
- `employee.deactivate` `{id}`; Admin only, historical records retained, sessions/device subscriptions revoked, last active Admin protected. Saves bounded inactive business-date periods.
- `employee.reactivate` / `admin.reactivate` `{id}`; Admin only, corresponding disabled role only. Same account/role/history retained; credential version increments and stale sessions/device subscriptions are removed. Clears `deactivatedAt`, closes the saved inactive period and preserves existing password-change requirements. Complete intervening inactive dates remain exempt from missing daily updates.
- `employee.resetPassword` / `admin.resetPassword` `{id,password}`; Admin only, role checked, active or disabled targets. Existing password hashing/policy, mandatory first-sign-in rotation, credential-version bump, session/device revocation. Resetting does not reactivate an account. Admin self-reset is refused; use own current-password Change password flow.
- `profile.update` `{profile:{phone?,bio?}}`; own optional fields only.
- `client.create` `{name,service}` / `client.update` `{id,name,service}` / `client.archive` `{id}`.
- `task.create` `{title,description,assigneeId,clientId,jobFunction,deadline,priority}`; initial Assigned.
- `task.transition` `{id,state,version,reason?}`. Employee own permitted transitions; Admin approval/rejection; rejection Completed→In-progress requires reason. Optimistic version conflict =409.
- `task.deadline` `{id,deadline,version}`; Admin, audited explicit adjustment.
- `update.submit` `{text}`; today's record, original submission preserved.
- `absence.request` `{kind,start,end,reason}`; Employee own request, Pending. Notifies active Admins of a new leave/permission request.
- `absence.decide` `{id,status:'Approved'|'Rejected',decisionNote}`; Admin only, Pending only. Notifies only the requester with the specific leave/permission approval or rejection.
- `note.create` `{text,recipientIds:[]}`; Admin sender; recipient IDs may select active Admins and/or Employees, empty means all active team roles. Admin management access to published notes is unchanged.
- `broadcast.create` `{title,text,recipientIds:[]}`; same active-team recipient rules; each recipient receives their own inbox record and optional device push.
- `notification.read` `{id}`; own only.

## Shared modules (owned by domain agent)

`src/portal/domain.mjs` exports:
- `businessDate(now)` → YYYY-MM-DD.
- `workingSeconds(intervals, absences, now)` → seconds, approved absences only, half-open unions, lunch/Sunday excluded.
- `dailyUpdateStatus(employeeId, updates, absences, now, employee?)` → updateStatus; optional employee lifecycle exempts non-employment dates.
- `transitionTask(task, actor, nextState, now, reason='')` → new task with intervals/events/version; throws Error with status on invalid actor/state.
- `decorateTask(task, absences, now)` → task with workSeconds/overdue, selecting assignee absences.

`src/portal/analytics.mjs`: `buildAnalytics(snapshot, filters={}, now)` returns `{summary:{total,assigned,inProgress,completed,approved,overdue,onTimeRate,workSeconds},employees:[{id,name,assigned,inProgress,completed,approved,overdue,onTimeRate,workSeconds,rejections,updateOnTime,updateLate,updateMissing,updateExempt}],trend:[{date,completed,approved}],tasks,filters}`. Completed summary means state Completed; trend uses completion event dates. Explain filter date meanings and duration overlap.

`src/portal/excel.mjs`: `analyticsWorkbook(analytics,snapshot)` → Uint8Array of valid XLSX, untrusted text always inline strings (no formulas); sheets Summary, Employees, Tasks, Daily Updates, Absences, Definitions.

`src/portal/notifications.mjs`: `pushConfiguration(env)` reports whether all three VAPID values are present and names missing variables without exposing values; `sendBroadcastPush(env,subscriptions)` → delivery counts and expiredEndpoints without secret logs. `env.VAPID_PUBLIC_KEY`, `env.VAPID_PRIVATE_KEY`, `env.VAPID_SUBJECT` are optional, but must be supplied as a complete set for browser push. Store inbox even when push is not configured. Backend removes expired endpoints after delivery.

All newly committed inbox notifications now trigger optional device push to active recipients, including Admin workflow notifications. Read mutations and failed actions do not replay delivery. Delivery is bounded to 20 endpoints per action and five per test; five concurrent provider requests each time out after five seconds. This small-portal limit is not a durable bulk-send queue: larger audiences can receive inbox records without device alerts. Legacy subscriptions without device bindings require re-enabling on that browser to bind ownership safely.

Push requests use `redirect:'manual'` because Cloudflare workerd rejects `redirect:'error'` before sending. Redirect responses are counted as failures and never followed, preserving the endpoint allowlist and keeping VAPID authorization on the original provider. Runtime regression coverage sends with the actual sender in workerd, independently verifies the VAPID signature and decrypts the ciphertext, and checks that a 302 response does not cause a second request.

Device pushes use per-recipient `{subscription,kind}` envelopes for committed actions; test sends use raw owned subscriptions with `kind:'test'`. Only a fixed title/body for the whitelisted kind is encrypted/displayed. Types include note, broadcast, task-assigned, task-completed, task-approved, task-revision, task-deadline, leave/permission-requested, leave/permission-approved and leave/permission-rejected (plus generic legacy/workspace/test fallbacks). Both roles receive task assignments; other active Admins receive task-completion review alerts, while assignees receive decisions/deadline changes. Device alerts never display caller-supplied message text, private task descriptions, absence reasons or decision notes. The service worker activates promptly without caching private responses.

## Defaults for this first implementation

Rejection resumes eligible time immediately with required feedback. Approved absence does not move deadlines. Full-day leave exempts updates; permission covering 11:00 moves deadline to next available working instant. No holiday calendar, payroll or uploads. Employees can see task summaries, but not colleagues' private notes, reasons or profiles. Bulk state changes use D1 revision CAS/transactions; no last-writer-wins data loss.
