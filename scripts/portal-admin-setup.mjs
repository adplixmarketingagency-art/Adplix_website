// Run by the operator in a private terminal. Never pass passwords as CLI arguments.
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { validPassword } from '../src/portal/auth.mjs'

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('Run npm run portal:admin:setup in an interactive terminal.')
}

let muted = false
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk)
    done()
  },
})
const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 })
terminal.on('SIGINT', () => {
  terminal.close()
  process.stdout.write('\nSetup cancelled.\n')
  process.exit(130)
})

try {
  const name = (await terminal.question('Admin display name: ')).trim()
  const employeeId = (await terminal.question('Admin employee ID (e.g. ADMIN-001): ')).trim()
  const email = (await terminal.question('Admin email: ')).trim()
  process.stdout.write('Temporary password (at least 12 characters; hidden): ')
  muted = true
  const password = await terminal.question('')
  muted = false
  process.stdout.write('\n')
  if (!validPassword(password)) throw new Error('Password must be 12–256 characters. No SQL was created.')
  process.stdout.write('Confirm temporary password (hidden): ')
  muted = true
  const confirmation = await terminal.question('')
  muted = false
  process.stdout.write('\n')
  if (confirmation !== password) throw new Error('Passwords did not match. No SQL was created.')
  terminal.close()
  const result = spawnSync(process.execPath, ['scripts/portal-bootstrap.mjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORTAL_ADMIN_NAME: name,
      PORTAL_ADMIN_EMPLOYEE_ID: employeeId,
      PORTAL_ADMIN_EMAIL: email,
      PORTAL_ADMIN_PASSWORD: password,
    },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.info(
    'Next: npm exec wrangler -- d1 execute adplix-portal --remote --config wrangler.toml --file .portal-local/admin-bootstrap.sql',
  )
  console.info(
    'Verify exactly one changed row. Existing accounts are never overwritten. Change the temporary password at first login.',
  )
} finally {
  muted = false
  terminal.close()
}
