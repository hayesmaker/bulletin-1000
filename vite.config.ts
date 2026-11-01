import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      handlers: [
        {
          route: '/media/:assetId/:variant',
          method: 'GET',
          handler: './src/server/media.handler.ts',
        },
        {
          route: '/renders/:renderId/file',
          method: 'GET',
          handler: './src/server/render-file.handler.ts',
        },
        {
          route: '/audio/jingle-1989',
          method: 'GET',
          handler: './src/server/jingle.handler.ts',
        },
      ],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
