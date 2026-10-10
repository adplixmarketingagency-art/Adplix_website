# Adplix Employee Portal — Requirements and Implementation Plan

Document date: 7 October 2026. Business timezone: Asia/Kolkata.

## 1. Scope and requirement status

This document consolidates the user's portal requirements and latest clarifications. A local implementation now exists; see DELIVERY.md for verified functionality and outstanding production setup. This remains the requirements baseline, not proof that every optional or proposed feature is delivered. The public website is a Vite/vanilla JavaScript/CSS site with a Cloudflare Worker and static assets.

**Confirmed** means explicitly requested by the user. **Proposed default** means a recommended interpretation, not a further user-approved requirement. Open decisions are listed at the end.

The company shoots, edits, and posts Instagram reels; creates Canva posters; and develops and maintains websites for selected clients. The portal coordinates employees, clients, assignments, work updates, approvals, absences, and performance reporting.

### Confirmed scope

- Add an Employee Portal button to the public website's desktop and mobile navigation.
- Exactly two access roles: Admin and Employee. Users may request registration; only Admin approval grants Employee access. This supersedes the original no-public-registration requirement.
- Admin creates accounts using name, employee ID, personal email address, and a portal password; Admin controls allowed emails and can edit/reset credentials.
- Admin assigns tasks by employee job function, views all tasks, approves/rejects work, manages employees and clients, posts notes, and sends browser-notification broadcasts.
- Employees manage only their own task states, see colleagues' tasks read-only, and provide daily work updates.
- Concurrent tasks are allowed. Overdue task surfaces on the employee dashboard are red themed.
- Track task time using Monday–Saturday, 10:00–13:00 and 14:00–19:00. Exclude Sunday, lunch, and approved leave/permission.
- Employees request leave and hourly permission; Admin approves or rejects requests.
- Admin receives team and individual performance graphs and an Excel download.

## 2. Accounts and authentication

### Admin-managed employee creation

Required fields: employee name, unique employee ID, unique allowed email address, and initial portal password. This supersedes the earlier name-and-ID-only account creation requirement.

The employee uses their personal email address as their login identifier. Their portal password is separate from their personal mailbox password. Google sign-in/magic-link registration is not the selected login flow.

Only Admin can provision an account or change its allowed login email. Employees can complete their own remaining profile information after login; additional profile fields must be optional unless a future requirement makes them necessary.

### Self-registration with approval (latest requirement)

Applicants provide name, email, and their chosen portal password. Store requests separately with Pending/Approved/Rejected status; registration grants no session or workspace access. Only an existing authenticated Admin can review requests and approve with a unique employee ID/job functions, or reject. Approval creates an Employee, never an Admin. Pending applicants are absent from employee task views and analytics. Admin-created accounts retain the original four required fields and initial password change; self-chosen passwords do not require an additional forced change after approval.

Accepting an email string does not verify mailbox ownership. Admin must confirm the applicant's identity/address through a trusted channel until email verification delivery is implemented.

### Security requirements

- Public registration requests are permitted, but no self-assigned Admin role or automatic account activation. Only Admin review grants access.
- Passwords are salted and hashed using a vetted password implementation; no plaintext storage, logging, export, or readable password recovery.
- Admin can set a replacement password or initiate reset, but cannot view an existing password.
- Proposed default: temporary initial/reset passwords require change on next login; employees can change their own password after confirming their current one.
- Normalize email identifiers consistently without provider-specific assumptions such as stripping Gmail dots.
- Rate-limit login/reset attempts and return generic authentication failures.
- Use secure, HttpOnly, appropriately SameSite cookies with expiry and session revocation; avoid persistent browser-storage bearer tokens.
- Credential changes and employee deactivation invalidate existing sessions.
- Initial Admin bootstrap is a controlled deployment operation, never a public registration form. Recommend MFA for Admin.

## 3. Roles, job functions, and privacy

Job functions are assignment categories, not extra login roles. Suggested categories: shooting/production, video editing, Canva design, Instagram publishing, website development, website maintenance. An employee may have several functions.

| Capability | Admin | Employee |
| --- | --- | --- |
| Create, assign, edit, and schedule tasks | Yes | No |
| View team tasks | Yes | Read-only |
| Start/complete/reopen own unapproved task | Proposed operational override | Yes |
| Approve/reject completed work | Yes | No |
| Manage employees and clients | Yes | No |
| Broadcast messages and dashboard notes | Yes | No |
| Submit own daily update | Not required by employee rule | Yes |
| Request own leave/hourly permission | Optional if Admin is also staff | Yes |
| Approve/reject absence requests | Yes | No |
| View full analytics and Excel export | Yes | No |
| Edit own optional profile fields | Yes | Yes |
| Provision/change allowed login emails | Yes | No |

All permissions must be checked server-side on every operation. Employee team-task access must not expose colleagues' login email, private notes, leave reasons, credentials, or unrelated profile information. Do not assume that every task attachment is safe to share merely because task summaries are visible.

## 4. Employee and client records

### Employees

Admin can add/remove employees. Proposed default: removal deactivates access, revokes sessions, and archives the employee rather than deleting task and analytics history. Admin must be warned about unfinished assignments requiring reassignment.

### Clients

Only client name and service provided are required. Suggested services reflect the business described above; support multiple services if useful. No address, contact email, phone, or billing details are required.

Proposed default: removal archives the client while retaining historical tasks. Do not delete completed work as a side effect.

## 5. Tasks and state transitions

The four canonical states are **Assigned → In-progress → Completed → Approved**.

Proposed task fields: title, assigned employee, job function/task type, client, deadline, description, priority, and deliverable link. Title/assignee/deadline are necessary for assignment and overdue behaviour; which remaining fields are mandatory should be settled before implementation. Link related shooting/editing/posting tasks rather than assigning one indivisible task to multiple owners.

| Operation | Actor | Transition | Time effect |
| --- | --- | --- | --- |
| Assign | Admin | New → Assigned | No active time |
| Start | Assigned employee | Assigned → In-progress | Open active interval |
| Complete | Assigned employee | In-progress → Completed | Close interval |
| Reopen accidental completion | Assigned employee | Completed → In-progress | Open new interval; preserve previous time |
| Approve | Admin only | Completed → Approved | No time added; lock employee transitions |
| Reject | Admin only | Completed → In-progress (proposed default) | Resume eligible time from rejection |

Rejection is confirmed; its mapping back to In-progress, mandatory feedback, and immediate timer resumption are proposed defaults. Record a rejection event with feedback and notify the employee without creating a fifth canonical state.

Employees cannot change another employee's task or approve their own work. Approved tasks are locked to employees. Admin unlocking an already approved task is not part of the confirmed scope.

Every change stores actor, server timestamp, previous/new state, and task version. Use transactional validation and idempotency to prevent double-clicks, duplicate intervals, and completion/rejection races.

### Concurrent tasks and overdue display

- Multiple tasks may be In-progress for the same employee.
- Each has its own state history and calculated working duration.
- After its deadline, an unfinished task's dashboard card/row uses a red theme with an Overdue label and readable contrast; colour alone is insufficient.
- Proposed default: only Assigned/In-progress tasks show the active overdue warning. Completed work shows Awaiting approval; retain whether completion was late in analytics.
- Rejected work becomes actively overdue again when its unchanged deadline has passed.
- Approved absence reduces measured time but does not automatically extend task deadlines (proposed default). Admin can explicitly change deadlines after seeing affected work.

## 6. Working-time calculation

Confirmed calendar: Monday–Saturday, Asia/Kolkata, 10:00–13:00 and 14:00–19:00. A full working day is **8 hours**. Sunday, lunch, and hours outside these windows contribute zero.

Store timestamps in UTC; derive business dates and working windows in Asia/Kolkata, independently of the browser timezone. For each task:

`counted duration = measure((union of In-progress intervals ∩ working windows) − union of approved employee absence intervals)`

Use half-open intervals [start, end). Intersect intervals before subtracting absence to avoid negative durations or double deductions. Running totals use server time for the open interval. Store duration in seconds and round only for display/export.

- Browser closure or logout does not stop an In-progress task's eligible elapsed time.
- Starting before 10:00 counts from 10:00; starting during lunch counts from 14:00; starting after 19:00 counts from the next working window.
- Completing freezes elapsed time; reopening adds another active interval without counting the completed gap.
- Approved employee absence is excluded from every applicable concurrent task.
- Pending/rejected absence has no time effect.
- Retroactively approved absence recalculates affected totals, preserving decision and task audit history.
- Concurrent task totals may overlap. Their sum is not attendance, unique hours worked, or proof of hands-on productivity.

### Worked examples

| Scenario (no leave unless stated) | Counted time |
| --- | --- |
| Monday 10:00 → Monday 19:00 | 8h |
| Monday 12:30 → Monday 14:30 | 1h |
| Monday 14:00 → Tuesday 12:00 | 7h |
| Saturday 12:00 → Monday 15:00 | 10h |
| Monday 10:00 → 19:00, approved permission 15:00–16:00 | 7h |
| Monday 10:00 → 19:00, approved permission 12:30–14:30 | 7h |
| Complete 12:00, reopen 15:00, complete 16:00 | Add 1h to time accumulated before noon |
| Same active day, approved permission 15:00–16:00 and 15:30–16:30 | Deduct combined 1h 30m, not 2h |

Public holidays, company closures, and changes to historical calendars are not specified; do not silently add a holiday calendar.

## 7. Daily work updates

Employees provide a sentence about their work every working day. The normal deadline is **before 11:00 Asia/Kolkata**. At 11:00 without submission, show a red **Update overdue** badge, including text rather than colour alone. Polling updates the badge without clearing unsaved text. Sunday and approved absence exemptions must not show overdue.

Record one daily update per employee/business date, its first submission timestamp, content edits, and current status: pending, on-time, overdue, late, or leave-exempt. An edit does not change the original submission time. Admin can view today's team updates and historical records.

Proposed absence handling:

- Full-day approved leave exempts that day's update.
- No requirement on Sundays, before joining, or after deactivation.
- If approved hourly permission covers 11:00, move the update deadline to the employee's next available working instant that day and display it explicitly. Confirm whether a grace period after return is needed.
- Retroactive approval must recompute any applicable exemption without erasing the original submission/audit timestamps.

## 8. Leave and hourly permissions

### Leave requests

Employee submits start date, end date, and reason. Full-day and multiple-day leave are included. Admin approves/rejects and can leave a decision note. Statuses: Pending, Approved, Rejected. Cancellation, half-day leave, balances, paid/unpaid classification, and HR payroll are not included unless separately agreed.

Approved leave removes covered working windows from that employee's active tasks. Sunday was already excluded. Admin sees the employee's affected unfinished tasks before deciding.

### Hourly permission requests

Employee submits date, start/end time, and reason. Require end after start; proposed initial scope is same-day requests. Admin approves/rejects with an optional decision note.

Deduct only overlap with working windows and active task intervals. Merge approved intervals so overlapping permission, full-day leave, and lunch cannot be deducted twice. Pending/rejected requests do not pause timers. Server validates ownership and prevents self-approval.

Only the employee and Admin see request reasons. A team availability indicator may show absence without private reasons. Notify employee of the decision and maintain a decision audit trail.

## 9. Notes and notifications

Admin can publish a shared dashboard note, an individual employee note, or notes to selected recipients (proposed convenience). Store author, recipients, timestamp, and read state. Render note text safely; do not accept executable HTML.

Admin can send broadcast announcements through browser notifications. The implementation must include an in-app inbox so messages remain available when permission is denied or delivery fails.

Proposed notification events: assignment, rejection feedback, approval, overdue reminder, daily-update reminder, absence decision, and broadcasts.

Browser push requires HTTPS, an explicit permission request after user interaction, a service worker, push subscription storage, and server-side sending. Notifications API alone cannot deliver to closed tabs. Browser/OS support varies, and some mobile platforms require a home-screen installation. Do not promise guaranteed delivery.

Use generic lock-screen text and authenticate when opening the relevant record. Treat push subscription endpoints as private capability data. Remove invalid/revoked subscriptions and disable subscriptions for deactivated employees.

## 10. Admin analytics and Excel

The dashboard must present both **team performance and each employee's performance as graphs**, with filters and downloadable `.xlsx` data.

Recommended metrics:

- Assigned/In-progress/Completed/Approved counts and current workload.
- Completion and approval trends over time.
- Overdue active tasks, late completions, and on-time completion rate.
- Median completed-task working duration by employee and task type, after approved absence exclusion.
- Rejection/rework event counts, distinguished from accidental employee reopening.
- Daily-update compliance: on-time, late, missing, exempt.
- Approved leave days and permission hours, reported separately from task duration.
- Tasks awaiting Admin review and review turnaround.

Define whether a metric uses assignment, completion, approval, or daily-update dates. Avoid an unexplained composite employee score; different task types have different effort and complexity.

Reporting filters: All time, a particular month (`YYYY-MM`), a particular year (`YYYY`), or a custom date range, plus employee, client, job function, and state where applicable. Historical reporting must preserve archived employee/client identities without granting them current access. Reports are rebuilt from persisted task/state events, work intervals, daily updates, absences, and login records; they are live views of saved records rather than immutable snapshots.

Excel workbook sheets: Summary, Employee Performance, Tasks, Daily Updates, Absence Summary, Metric Definitions. Exports match active dashboard filters, include business timezone and generation time, and contain numeric durations suitable for calculation. Export untrusted text as text, never executable formulas; restrict downloads to Admin and exclude passwords, push subscriptions, and unnecessary profile/leave details.

## 11. Screens and visual direction

Proposed routes: `/portal/login`, `/portal/dashboard`, `/portal/tasks`, `/portal/profile`, `/portal/requests`; Admin additionally uses `/portal/team`, `/portal/clients`, `/portal/analytics`, and request approval views. Route names are proposals, not existing pages.

Employee dashboard: own assignments and overdue cards, daily update, Admin notes, notification inbox, and leave/permission request status. Team tasks are a separate read-only view.

Admin dashboard: team workload, review queue, overdue work, daily updates, absence queue, and analytics. Forms for employee/client management require only the agreed fields.

Design guidance requested by the user: gpt-taste. Keep Adplix branding with restrained red accents, accessible contrast, clear hierarchy, a proposed Geist font for the portal, mobile-friendly task lists, and compact functional dashboards. Any animation respects reduced motion, keyboard access, and focus visibility.

Do not redesign the public site as part of the portal. Before writing future UI code, perform the skill's design pre-flight and deterministic layout selection; treat this document's typography/layout as proposals until then. Cinematic marketing sections, AIDA, scroll pinning, and excessive whitespace should not obstruct task-management workflows. No placeholder button should suggest a functioning login before deployment.

## 12. Proposed architecture and data model

Preserve the current Vite/Cloudflare deployment. A separate portal bundle/routes may be added to this repository when authorised. Proposed backend: Cloudflare Worker API + D1 relational database, with a vetted server-side email/password authentication solution. Any provider must support Admin-moderated activation and revocable sessions; applicants cannot activate themselves.

Initial deliverables can be external Canva/Drive/Instagram/site links; uploads and file-storage infrastructure are optional scope. Validate link schemes and do not render arbitrary HTML. Database backups and recovery must be configured before production portal data exists.

Suggested entities:

| Entity | Purpose |
| --- | --- |
| User / Session / Credential | Login identity, role, lifecycle, revocation; credentials isolated |
| Employee / Job Function | Name, employee ID, optional profile, assignment categories |
| Client / Service | Minimal client records and provided services |
| Task / State Event / Active Interval | Ownership, deadline, workflow, time calculation |
| Daily Update | Employee/business-date record and original submission time |
| Absence Request / Decision | Leave or hourly permission and approval history |
| Note / Recipient | Shared and private dashboard messages |
| Notification / Push Subscription | Inbox records and optional push delivery |
| Audit Event | Administrative changes, resets, decisions, transitions, exports |

Authenticated API groups: account/session/profile, team/client management, task creation/transitions, daily updates, absence requests/decisions, notes/notifications, and Admin analytics/exports. Validate every actor, object owner, state transition, timestamp, and pagination bound server-side. Use transactions for updates spanning task state and time intervals.

Portal/API responses must be private and non-cacheable, excluded from public indexing, and inaccessible via static fallback when authenticated data is requested. The current public site's `worker-src 'none'` must be deliberately revised for same-origin portal service workers when push is implemented; do not relax it now for an unbuilt portal.

## 13. Implementation phases (original plan; see DELIVERY.md for current status)

1. Confirm remaining defaults, select auth, bootstrap Admin, create database schema, set up preview environment and recovery.
2. Implement restricted login, sessions, password lifecycle, profile, employee/client management, and server-side permission tests.
3. Build task workflow, concurrency safeguards, working calendar, overdue surfaces, and audit history.
4. Add leave/permission approvals and absence-aware recalculation; then daily updates and exemptions.
5. Add dashboard notes, in-app inbox, broadcasts, optional Web Push, and subscription revocation.
6. Build team/individual graphs, define metrics, and implement safe Excel export.
7. Run security and end-to-end acceptance checks; deploy portal behind restricted accounts, then enable public nav links.

## 14. Acceptance and regression checklist

- [ ] Portal button appears in desktop/mobile nav only when portal routes are functional; public site/contact form remains intact.
- [ ] Applicants can request registration, but cannot log in or access workspace data until Admin approval; only Admin decides employee ID/job functions and the role remains Employee.
- [ ] Employees cannot elevate roles, edit colleagues' tasks, approve tasks, or approve their own absence through direct API calls.
- [ ] Reset/deactivation revokes sessions; existing passwords cannot be retrieved or exported.
- [ ] All allowed and forbidden transitions are tested, including completion/rejection races and repeated clicks.
- [ ] Accidental reopening and rejection preserve previous time, exclude completed gaps, and record distinct events.
- [ ] Working-window boundaries, lunch, Sundays, multiple days, and timezone differences produce correct totals.
- [ ] Concurrent tasks remain independent; their sum is not displayed as attendance.
- [ ] Approved leave and permissions exclude applicable time; rejected/pending requests do not; overlaps deduct once.
- [ ] Retroactive decisions recalculate totals and exports without deleting audit history.
- [ ] Red overdue cards include labels and readable contrast; completion and rejection update their presentation correctly.
- [ ] Daily updates switch to overdue at 11:00, retain original submission time, and apply agreed absence exemptions.
- [ ] Individual notes, private profile fields, and leave reasons are not leaked through team-task APIs.
- [ ] Notification-denied/unsupported-browser cases keep in-app messages usable; closed-tab delivery is tested where supported.
- [ ] Team/individual graph metrics match filtered Excel totals; untrusted export values cannot become formulas.
- [ ] Parameter validation, CSRF/session handling, rate limits, XSS, cache isolation, and role boundaries are tested.
- [ ] Keyboard/mobile/reduced-motion behaviour is verified; backup restoration is rehearsed before production data.

## 15. Open decisions — confirm before portal implementation

1. Authentication implementation/provider and secure initial Admin provisioning; registration requires Admin approval regardless of choice.
2. Rejection: return to In-progress immediately with mandatory feedback, or wait for an explicit employee restart?
3. Are title, client, job function, assignee, deadline mandatory on every task? Deadline extension remains an explicit Admin action by default.
4. Full-day leave/update exemption and shifted 11:00 deadline when hourly permission overlaps it; any grace period after return?
5. Holiday/closure calendar, request cancellation, retrospective approval cutoff, and whether half-day leave is needed.
6. Policy for time attribution if Admin reassigns an In-progress task; preserve per-employee interval ownership rather than rewriting history.
7. Which task details/deliverable links may colleagues see? Access to external client assets must be governed separately.
8. Retention/deletion period for work updates, notes, absence reasons, and audit records; authorised Excel recipients.

Excluded unless requested: payroll, attendance surveillance, Instagram/Canva publishing integrations, public Admin registration, automatic employee activation, employee leaderboards, arbitrary uploads, and automatic deadline extensions.
