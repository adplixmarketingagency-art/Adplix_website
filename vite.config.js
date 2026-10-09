import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

const portalProxy = {
  target: 'http://127.0.0.1:8787',
  changeOrigin: false,
  configure(proxy) {
    proxy.on('error', (_error, _request, response) => {
      if (typeof response.writeHead !== 'function' || response.headersSent || response.writableEnded) return
      response.writeHead(503, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(JSON.stringify({ error: 'Portal API unavailable.' }))
    })
  },
}

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  plugins: [react(), {
    name: 'portal-service-worker',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'portal/sw.js', source: readFileSync(new URL('./portal/sw.js', import.meta.url), 'utf8') })
    },
  }],
  server: {
    port: 3000,
    host: '127.0.0.1',
    allowedHosts: [],
    cors: false,
    open: true,
    proxy: { '/api/portal': portalProxy },
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '.dev.vars', '.dev.vars.*', '**/.opencode/**', '**/.claude/**', '**/.git/**', '**/.portal-local/**', '*.log']
    }
  },
  preview: {
    host: '127.0.0.1',
    allowedHosts: [],
    cors: false,
    proxy: { '/api/portal': portalProxy },
  },
  build: {
    outDir: '.worker-dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: { site: resolve(import.meta.dirname, 'index.html'), portal: resolve(import.meta.dirname, 'portal/index.html') }
    }
  }
})
