import { spawn } from 'node:child_process'

const children = [
  spawn('npm', ['run', 'portal:dev'], { stdio: 'inherit', shell: false }),
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: false }),
]

let stopping = false
function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(exitCode), 500)
}

for (const child of children)
  child.once('exit', (code) => {
    if (!stopping && code) stop(code)
  })
process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))
