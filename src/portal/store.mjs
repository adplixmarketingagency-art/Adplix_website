export function database(env) {
  const db = env.PORTAL_DB || env.DB;
  if (!db?.prepare) throw Object.assign(new Error('Portal database unavailable.'), { status: 503 });
  return db;
}
export async function readState(db) {
  const row = await db.prepare('SELECT revision, document FROM portal_state WHERE id = 1').first();
  if (!row) throw Object.assign(new Error('Portal migration required.'), { status: 503 });
  const state = JSON.parse(row.document);
  if (state.schema !== 1) throw Object.assign(new Error('Unsupported portal state.'), { status: 503 });
  return { revision: row.revision, state };
}
export async function mutate(db, callback) {
  for (let retry = 0; retry < 5; retry++) {
    const { revision, state } = await readState(db);
    const result = await callback(state);
    const document = JSON.stringify(state);
    // D1's per-row practical ceiling is 2 MiB; leave headroom for row encoding and metadata.
    if (new TextEncoder().encode(document).byteLength > 1_500_000) throw Object.assign(new Error('Portal storage limit reached.'), { status: 409 });
    const update = await db.prepare('UPDATE portal_state SET revision = revision + 1, document = ? WHERE id = 1 AND revision = ?').bind(document, revision).run();
    if (update.meta.changes === 1) return result;
  }
  throw Object.assign(new Error('Concurrent change; please retry.'), { status: 409 });
}
export async function revokeUser(db, id) { await db.prepare('DELETE FROM portal_sessions WHERE user_id = ?').bind(id).run(); }
export async function session(db, request) {
  const token = /(?:^|;\s*)portal_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
  if (!token) return null;
  const { tokenHash } = await import('./auth.mjs');
  const row = await db.prepare('SELECT * FROM portal_sessions WHERE token_hash = ? AND expires_at > ?').bind(tokenHash(token), Date.now()).first();
  if (!row) return null;
  const { state } = await readState(db);
  const user = state.users.find(u => u.id === row.user_id && u.active && (u.credentialVersion || 0) === row.credential_version);
  return user ? { user, row, token } : null;
}
export async function issueSession(db, user) {
  const { randomToken, tokenHash } = await import('./auth.mjs');
  const token = randomToken(), csrfToken = tokenHash('csrf:' + token);
  await db.prepare('INSERT INTO portal_sessions (token_hash,user_id,csrf_hash,expires_at,created_at,credential_version) VALUES (?,?,?,?,?,?)').bind(tokenHash(token), user.id, tokenHash(csrfToken), Date.now() + 604800000, Date.now(), user.credentialVersion || 0).run();
  return { token, csrfToken };
}
export async function throttle(db, bucket) {
  const now = Date.now(), window = 15 * 60_000;
  await db.prepare(`INSERT INTO portal_login_limits (bucket,attempts,window_start,blocked_until) VALUES (?,1,?,0)
    ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
    window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END,
    blocked_until = CASE WHEN window_start >= ? AND attempts >= 7 THEN ? ELSE blocked_until END`).bind(bucket, now, now-window, now-window, now, now-window, now+window).run();
  const row = await db.prepare('SELECT attempts, blocked_until FROM portal_login_limits WHERE bucket=?').bind(bucket).first();
  return row.blocked_until > now || row.attempts > 8;
}
