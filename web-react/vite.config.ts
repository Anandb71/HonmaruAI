import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// What every client shares (docs/architecture/discord-model-platform-plan.md §11).
const shared = (name: string) => fileURLToPath(new URL(`../packages/${name}/src`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@honmaru/core': shared('core'), '@honmaru/protocol': shared('protocol') },
  },
  server: { port: 3000, fs: { allow: ['..'] } },
  build: {
    // The chunk warning is about a single-page app whose whole code is one
    // route; splitting it would add a request and save nothing.
    chunkSizeWarningLimit: 600,
  },
})
