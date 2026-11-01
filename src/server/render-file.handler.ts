import { defineHandler, getQuery, getRouterParams } from 'nitro/h3'
import { z } from 'zod'
import { getDb } from '#/server/db/client.server'
import { serveRenderFile } from '#/server/media.server'

// GET /renders/:renderId/file[?download]: a finished export. A Nitro
// handler for the same reason as media.handler.ts.
const params = z.object({ renderId: z.uuid() })

export default defineHandler((event) => {
  const parsed = params.safeParse(getRouterParams(event))
  if (!parsed.success) return new Response('Not found', { status: 404 })
  const download = getQuery(event).download !== undefined
  return serveRenderFile(getDb(), parsed.data.renderId, event.req, download)
})
