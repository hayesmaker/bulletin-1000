import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import type { MediaVariant } from '#/lib/assets'
import { mediaDir } from '#/server/config.server'
import { assets, renders } from '#/server/db/schema'
import type { Db } from '#/server/db/client.server'

const notFound = () => new Response('Not found', { status: 404 })

function parseRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return
  const [, startText, endText] = match
  if (!startText && !endText) return
  // "bytes=-500" means the last 500 bytes.
  const start = startText
    ? Number(startText)
    : Math.max(0, size - Number(endText))
  const end =
    startText && endText ? Math.min(Number(endText), size - 1) : size - 1
  if (start > end || start >= size) return
  return { start, end }
}

const toWeb = (stream: fs.ReadStream) =>
  Readable.toWeb(stream) as ReadableStream<Uint8Array>

// No auth yet: once Clerk lands, check the asset's project belongs to the
// signed-in user before serving.
export async function serveAssetFile(
  db: Db,
  assetId: string,
  variant: MediaVariant,
  request: Request,
) {
  const asset = db.select().from(assets).where(eq(assets.id, assetId)).get()
  // Until processing finishes, `path` is the unconverted original.
  if (asset?.status !== 'ready') return notFound()
  const relative = variant === 'thumb' ? asset.thumbnailPath : asset.path
  if (!relative) return notFound()

  return serveFile(path.join(mediaDir(), relative), request, {
    'Content-Type': variant === 'thumb' ? 'image/jpeg' : asset.mimeType,
    // A ready asset's files never change; new uploads get new ids.
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
}

// A finished render's MP4. `download` asks the browser to save it as a file
// named after the game.
export async function serveRenderFile(
  db: Db,
  renderId: string,
  request: Request,
  download: boolean,
) {
  const render = db.select().from(renders).where(eq(renders.id, renderId)).get()
  if (render?.status !== 'done' || !render.path) return notFound()
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'private, max-age=31536000, immutable',
  }
  if (download) {
    const name = render.doc.title.replace(/[^\w\- ]+/g, '').trim() || 'video'
    headers['Content-Disposition'] = `attachment; filename="${name}.mp4"`
  }
  return serveFile(path.join(mediaDir(), render.path), request, headers)
}

// Serves a file from disk with Range support, so browsers can seek.
async function serveFile(
  file: string,
  request: Request,
  extraHeaders: Record<string, string>,
) {
  const stat = await fsp.stat(file).catch(() => undefined)
  if (!stat?.isFile()) return notFound()

  const headers = new Headers({ ...extraHeaders, 'Accept-Ranges': 'bytes' })

  const rangeHeader = request.headers.get('range')
  if (!rangeHeader) {
    headers.set('Content-Length', String(stat.size))
    return new Response(toWeb(fs.createReadStream(file)), { headers })
  }
  const range = parseRange(rangeHeader, stat.size)
  if (!range) {
    headers.set('Content-Range', `bytes */${stat.size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`)
  headers.set('Content-Length', String(range.end - range.start + 1))
  return new Response(toWeb(fs.createReadStream(file, range)), {
    status: 206,
    headers,
  })
}
