const OFFSET = 330 * 60_000;
const DAY = 86_400_000;
const STATES = ['Assigned', 'In-progress', 'Completed', 'Approved'];

function instant(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid timestamp');
  return date.getTime();
}

function dateStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Invalid business date');
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new RangeError('Invalid business date');
  return ms - OFFSET;
}

export function businessDate(now = new Date()) {
  return new Date(instant(now) + OFFSET).toISOString().slice(0, 10);
}

export function loginSeconds(record, now = new Date()) {
  if (!record || typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return 0;
  try {
    const start = instant(record.firstLoginAt);
    const cutoff = dateStart(record.date) + 17.5 * 3_600_000;
    return Math.max(0, Math.floor((Math.min(instant(now), cutoff) - start) / 1000));
  } catch { return 0; }
}

// The attendance record for the current business day, visible only until cutoff.
export function currentLoginRecord(records, employeeId, now = new Date()) {
  if (!Array.isArray(records) || typeof employeeId !== 'string') return null;
  const current = instant(now);
  const date = businessDate(current);
  const cutoff = dateStart(date) + 17.5 * 3_600_000;
  if (current >= cutoff) return null;
  return records.find(record => {
    if (!record || record.employeeId !== employeeId || record.date !== date || typeof record.firstLoginAt !== 'string') return false;
    return Number.isFinite(Date.parse(record.firstLoginAt));
  }) || null;
}

export function loginRecordFor(records, employeeId, date, at = new Date()) {
  if (!Array.isArray(records) || typeof employeeId !== 'string' || typeof date !== 'string') return;
  if (!records.some(r => r && r.employeeId === employeeId && r.date === date)) records.push({ id: crypto.randomUUID(), employeeId, date, firstLoginAt: new Date(instant(at)).toISOString() });
}

function union(ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of ranges) {
    if (end <= start) continue;
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function absenceRanges(absences, from, to) {
  if (!Array.isArray(absences)) throw new TypeError('Absences must be an array');
  const result = [];
  for (const absence of absences) {
    if (absence.status !== 'Approved') continue;
    if (absence.kind === 'leave') {
      const start = dateStart(absence.start);
      const end = dateStart(absence.end) + DAY;
      if (end <= start) throw new RangeError('Invalid leave range');
      result.push([Math.max(from, start), Math.min(to, end)]);
    } else if (absence.kind === 'permission') {
      const start = instant(absence.start);
      const end = instant(absence.end);
      if (end <= start) throw new RangeError('Invalid permission range');
      result.push([Math.max(from, start), Math.min(to, end)]);
    } else throw new RangeError('Invalid absence kind');
  }
  return union(result);
}

function windows(from, to) {
  const result = [];
  const first = Math.floor((from + OFFSET) / DAY) * DAY - OFFSET;
  for (let date = first; date < to; date += DAY) {
    if (new Date(date + OFFSET).getUTCDay() === 0) continue;
    for (const [start, end] of [[10, 13], [14, 17.5]]) {
      const left = Math.max(from, date + start * 3_600_000);
      const right = Math.min(to, date + end * 3_600_000);
      if (right > left) result.push([left, right]);
    }
  }
  return result;
}

export function workingSeconds(intervals, absences = [], now = new Date()) {
  if (!Array.isArray(intervals)) throw new TypeError('Intervals must be an array');
  if (intervals.length > 10000 || !Array.isArray(absences) || absences.length > 10000) throw new RangeError('Too many time records');
  const current = instant(now);
  const active = union(intervals.map(interval => {
    const start = instant(interval.start);
    const end = interval.end == null ? current : instant(interval.end);
    if (end < start) throw new RangeError('Invalid work interval');
    return [start, end];
  }));
  if (!active.length) return 0;
  const from = active[0][0], to = active.at(-1)[1];
  if (to - from > 100 * 366 * DAY) throw new RangeError('Time range too large');
  const away = absenceRanges(absences, from, to);
  let total = 0;
  for (const [start, end] of active) for (const [left, right] of windows(start, end)) {
    let duration = right - left;
    for (const [awayStart, awayEnd] of away) {
      duration -= Math.max(0, Math.min(right, awayEnd) - Math.max(left, awayStart));
    }
    total += duration;
  }
  return Math.max(0, Math.floor(total / 1000));
}

export function dailyUpdateStatus(employeeId, updates = [], absences = [], now = new Date(), employee = null) {
  const current = instant(now);
  const today = businessDate(current);
  const day = dateStart(today);
  const deadline = day + 11 * 3_600_000;
  const submitted = updates.filter(u => u.employeeId === employeeId && u.date === today)
    .map(u => instant(u.submittedAt)).sort((a, b) => a - b)[0];
  const result = (status, due = deadline) => ({ status, deadline: new Date(due).toISOString(), ...(submitted === undefined ? {} : { submittedAt: new Date(submitted).toISOString() }) });
  // Creation/deactivation instants mark first/last business dates of employment.
  if (employee?.createdAt && day < dateStart(businessDate(employee.createdAt))) return result('exempt');
  if (employee?.deactivatedAt && day > dateStart(businessDate(employee.deactivatedAt))) return result('exempt');
  if (new Date(day + OFFSET).getUTCDay() === 0) return result('exempt');
  const own = absences.filter(a => a.employeeId === employeeId);
  if (own.some(a => a.status === 'Approved' && a.kind === 'leave' && dateStart(a.start) <= day && dateStart(a.end) >= day)) return result('exempt');
  const away = absenceRanges(own, day, day + DAY);
  let due = deadline;
  if (away.some(([start, end]) => start <= deadline && end > deadline)) {
    const available = windows(deadline, day + DAY);
    due = available.map(([start, end]) => {
      let candidate = start;
      for (const [a, b] of away) if (a <= candidate && b > candidate) candidate = b;
      return candidate < end ? candidate : Infinity;
    }).find(value => Number.isFinite(value)) ?? Infinity;
    if (!Number.isFinite(due)) return result('exempt');
  }
  if (submitted !== undefined) return result(submitted < due ? 'on-time' : 'late', due);
  return result(current < due ? 'pending' : 'overdue', due);
}

function denied(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function transitionTask(task, actor, nextState, now = new Date(), reason = '', rating, ratingNote = '') {
  if (!task || !actor || !STATES.includes(task.state) || !STATES.includes(nextState)) denied('Invalid task transition', 400);
  const at = new Date(instant(now)).toISOString();
  const admin = actor.role === 'Admin';
  const owner = actor.id === task.assigneeId;
  let kind = 'transition';
  if (admin) {
    const canWork = owner && ((task.state === 'Assigned' && nextState === 'In-progress') || (task.state === 'In-progress' && nextState === 'Completed') || (task.state === 'Completed' && nextState === 'In-progress'));
    if (canWork) {
      kind = task.state === 'Completed' ? 'reopen' : 'transition';
    } else if (task.state !== 'Completed' || !['Approved', 'In-progress'].includes(nextState)) denied('Transition not permitted');
    else if (nextState === 'In-progress') {
      if (typeof reason !== 'string' || !reason.trim()) denied('Rejection reason required', 400);
      kind = 'rejection';
    } else {
      if (rating !== undefined && (!Number.isSafeInteger(rating) || rating < 1 || rating > 5)) denied('Invalid rating', 400);
      if (typeof ratingNote !== 'string' || ratingNote.length > 1000) denied('Invalid rating note', 400);
      if (rating === undefined) denied('Rating required', 400);
      kind = 'approval';
    }
  } else if (!owner || !(
    (task.state === 'Assigned' && nextState === 'In-progress') ||
    (task.state === 'In-progress' && nextState === 'Completed') ||
    (task.state === 'Completed' && nextState === 'In-progress')
  )) denied('Transition not permitted');
  else if (task.state === 'Completed') kind = 'reopen';

  const intervals = (task.intervals || []).map(i => ({ ...i }));
  if (task.state === 'In-progress') {
    const last = intervals.at(-1);
    if (!last || last.end != null || instant(last.start) > instant(at)) denied('Invalid open interval', 409);
    last.end = at;
  }
  if (nextState === 'In-progress') {
    if (intervals.some(i => i.end == null)) denied('Task already running', 409);
    intervals.push({ start: at, end: null });
  }
  return {
    ...task, state: nextState, intervals,
    events: [...(task.events || []), { actorId: actor.id, from: task.state, to: nextState, at, kind, ...(kind === 'rejection' ? { reason: reason.trim() } : {}) }],
    updatedAt: at, completedAt: nextState === 'Completed' ? at : (nextState === 'In-progress' ? null : task.completedAt),
    approvedAt: nextState === 'Approved' ? at : task.approvedAt,
    ...(nextState === 'Approved' ? { rating, ratingNote: ratingNote.trim(), ratedAt: at, ratedBy: actor.id } : {}),
    version: (task.version ?? 0) + 1,
  };
}

export function decorateTask(task, absences = [], now = new Date()) {
  const current = instant(now);
  return {
    ...task,
    workSeconds: workingSeconds(task.intervals || [], absences.filter(a => a.employeeId === task.assigneeId), current),
    overdue: ['Assigned', 'In-progress'].includes(task.state) && instant(task.deadline) < current,
  };
}
