import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPassword } from '../src/portal/auth.mjs'

const script = fileURLToPath(new URL('../scripts/portal-bootstrap.mjs', import.meta.url))
const syntheticPassword = 'Synthetic-bootstrap-password-123!'

test('bootstrap uses private guarded SQL, hashes credentials, and refuses overwrite', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'adplix-bootstrap-test-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const env = {
    ...process.env,
    PORTAL_ADMIN_NAME: 'Synthetic Admin',
    PORTAL_ADMIN_EMPLOYEE_ID: 'TEST-ADMIN',
    PORTAL_ADMIN_EMAIL: 'admin@example.test',
    PORTAL_ADMIN_PASSWORD: syntheticPassword,
  }
  const run = () => spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8' })
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.stdout.includes(syntheticPassword) && !result.stderr.includes(syntheticPassword))
  const path = join(cwd, '.portal-local/admin-bootstrap.sql')
  const sql = await readFile(path, 'utf8')
  assert.ok(!sql.includes(syntheticPassword))
  assert.match(sql, /WHERE id = 1 AND revision = 0 AND json_array_length/)
  assert.match(sql, /"mustChangePassword":true/)
  const hash = /"passwordHash":"([^"]+)"/.exec(sql)?.[1]
  assert.ok(await verifyPassword(syntheticPassword, hash))
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600)
  const again = run()
  assert.notEqual(again.status, 0)
  assert.equal(await readFile(path, 'utf8'), sql)
})

test('interactive Admin setup refuses piped or non-terminal credentials', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../scripts/portal-admin-setup.mjs', import.meta.url))],
    {
      input: 'not-a-password',
      encoding: 'utf8',
    },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /interactive terminal/)
  assert.doesNotMatch(result.stderr, /not-a-password/)
})
