import { defineHandler } from 'nitro/h3'
import { builtInJinglePath } from '#/server/jingle.server'
import { serveFile } from '#/server/media.server'

// GET /audio/jingle-1989: the built-in splash jingle, generated on first
// request. A Nitro handler for the same reason as media.handler.ts.
export default defineHandler(async (event) =>
  serveFile(await builtInJinglePath(), event.req, {
    'Content-Type': 'audio/wav',
    'Cache-Control': 'public, max-age=86400',
  }),
)
