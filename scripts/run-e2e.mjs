import { spawnSync } from 'node:child_process'

const suites = {
  marketing: { build: 'build', test: 'tests/marketing.e2e.mjs', receipt: 'Marketing browser checks passed:' },
  portal: { build: 'portal:build', test: 'tests/portal.e2e.mjs', receipt: 'Browser delivery check passed:' },
}

const suite = process.argv[2]
if (!Object.hasOwn(suites, suite)) {
  console.error('Usage: node scripts/run-e2e.mjs <marketing|portal>')
  process.exit(2)
}

for (const [command, args] of [
  ['npm', ['run', suites[suite].build]],
  [process.execPath, [suites[suite].test]],
]) {
  const isTest = command === process.execPath
  const result = spawnSync(command, args, {
    stdio: isTest ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: isTest ? 240000 : 120000,
  })
  if (isTest) {
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
  }
  if (result.error) throw result.error
  if (result.signal) {
    process.kill(process.pid, result.signal)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (isTest && !result.stdout.includes(suites[suite].receipt)) {
    throw new Error('Browser suite exited without a completion receipt. Verification did not finish.')
  }
}
