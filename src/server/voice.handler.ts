import path from 'node:path'
import { defineHandler, getRouterParams } from 'nitro/h3'
import { voiceClipIdSchema } from '#/lib/project'
import { dataDir } from '#/server/config.server'
import { getDb } from '#/server/db/client.server'
import { serveFile } from '#/server/media.server'
import { findVoiceClip } from '#/server/tts.server'

// GET /voice/:clipId: a generated narration clip. A Nitro handler for the
// same reason as media.handler.ts. Clips never change, so they cache well.
export default defineHandler((event) => {
  const parsed = voiceClipIdSchema.safeParse(getRouterParams(event).clipId)
  const clip = parsed.success ? findVoiceClip(getDb(), parsed.data) : undefined
  if (!clip) return new Response('Not found', { status: 404 })
  return serveFile(path.join(dataDir(), clip.path), event.req, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
  })
})
