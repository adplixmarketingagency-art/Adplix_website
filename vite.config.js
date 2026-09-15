import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: '.worker-dist',
    emptyOutDir: true,
    assetsDir: 'assets'
  }
})
