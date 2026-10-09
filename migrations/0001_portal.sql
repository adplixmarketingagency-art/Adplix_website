CREATE TABLE IF NOT EXISTS portal_state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portal_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, credential_version INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS portal_sessions_user ON portal_sessions(user_id);
CREATE TABLE IF NOT EXISTS portal_login_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL, blocked_until INTEGER NOT NULL);
-- Bounded JSON state, revision CAS; account credentials share business state revision.
INSERT OR IGNORE INTO portal_state (id, revision, document) VALUES (1, 0, '{"schema":1,"users":[],"clients":[],"tasks":[],"updates":[],"absences":[],"notes":[],"notifications":[],"subscriptions":[],"audit":[]}');
