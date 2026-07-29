import { defineConfig } from 'vite'

export default defineConfig({
  // host: true so the glasses / companion app can reach the dev server over LAN.
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
})
