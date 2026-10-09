import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { request } from 'node:http'
import { createServer, resolveConfig } from 'vite'

test('local dev denies private files, untrusted hosts and cross-origin reads', async () => {
  const config = await resolveConfig({}, 'serve')
  assert.equal(config.server.host, '127.0.0.1')
  assert.equal(config.server.cors, false)
  assert.notEqual(config.server.allowedHosts, true)
  assert.ok(config.server.allowedHosts.every((host) => host === '127.0.0.1' || host === 'localhost'))
  assert.equal(config.preview.host, '127.0.0.1')
  assert.equal(config.preview.cors, false)
  const root = await mkdtemp(join(tmpdir(), 'adplix-security-'))
  let server
  try {
    for (const folder of ['.opencode', '.claude', '.git']) await mkdir(join(root, folder))
    const privateFiles = [
      '.env',
      '.env.local',
      '.dev.vars',
      '.dev.vars.local',
      '.opencode/example.md',
      '.claude/example.md',
      '.git/config',
      'example.log',
      'example.pem',
    ]
    for (const file of privateFiles) await writeFile(join(root, file), 'synthetic-private-fixture')
    await writeFile(join(root, 'public.txt'), 'safe-public-fixture')
    server = await createServer({
      configFile: false,
      root,
      publicDir: false,
      server: {
        ...config.server,
        open: false,
        port: 0,
        fs: { ...config.server.fs, allow: [root] },
      },
      logLevel: 'silent',
    })
    await server.listen()
    const base = `http://127.0.0.1:${server.httpServer.address().port}`
    for (const file of privateFiles) {
      const response = await fetch(`${base}/${file}`)
      assert.equal(response.status, 403, `private file must be denied: ${file}`)
      assert.ok(!(await response.text()).includes('synthetic-private-fixture'))
    }
    const normal = await fetch(`${base}/public.txt`, { headers: { Origin: 'https://untrusted.example' } })
    assert.equal(normal.status, 200)
    assert.equal(await normal.text(), 'safe-public-fixture')
    assert.equal(normal.headers.get('Access-Control-Allow-Origin'), null)
    const untrustedStatus = await new Promise((resolve, reject) => {
      const req = request(`${base}/public.txt`, { headers: { Host: 'untrusted.example' } }, (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      req.on('error', reject)
      req.end()
    })
    assert.equal(untrustedStatus, 403)
  } finally {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  }
})
