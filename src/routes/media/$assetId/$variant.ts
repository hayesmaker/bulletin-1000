import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getDb } from '#/server/db/client.server'
import { serveAssetFile } from '#/server/media.server'

// GET /media/<assetId>/file | thumb, with Range support so the browser can
// seek in videos. URLs carry no file extension: Nitro's dev server would
// otherwise treat them as static files and never reach this route.
export const Route = createFileRoute('/media/$assetId/$variant')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const assetId = z.uuid().safeParse(params.assetId)
        const variant = z.enum(['file', 'thumb']).safeParse(params.variant)
        if (!assetId.success || !variant.success) {
          return new Response('Not found', { status: 404 })
        }
        return serveAssetFile(getDb(), assetId.data, variant.data, request)
      },
    },
  },
})
