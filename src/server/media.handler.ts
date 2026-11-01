import { defineHandler, getRouterParams } from 'nitro/h3'
import { z } from 'zod'
import { getDb } from '#/server/db/client.server'
import { serveAssetFile } from '#/server/media.server'

// GET /media/:assetId/(file|thumb), with Range support so the browser can
// seek in videos.
//
// Registered as a Nitro handler in vite.config.ts rather than a TanStack
// server route: Nitro's dev server treats browser media requests
// (Sec-Fetch-Dest: video/image, or a URL ending in a file extension) as
// static files and only lets them through to Nitro-level routes.
const params = z.object({
  assetId: z.uuid(),
  variant: z.enum(['file', 'thumb']),
})

export default defineHandler((event) => {
  const parsed = params.safeParse(getRouterParams(event))
  if (!parsed.success) return new Response('Not found', { status: 404 })
  const { assetId, variant } = parsed.data
  return serveAssetFile(getDb(), assetId, variant, event.req)
})
