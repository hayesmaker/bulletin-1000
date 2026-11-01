import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't load the Start/Nitro plugins.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { environment: 'node' },
})
