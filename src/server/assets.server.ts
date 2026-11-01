import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { and, asc, eq } from 'drizzle-orm'
import { fileExtension, kindFromFilename, uploadLimits } from '#/lib/assets'
import { removeAssetReferences } from '#/lib/project'
import type { AssetKind } from '#/lib/assets'
import { mediaDir } from '#/server/config.server'
import { assets, projects } from '#/server/db/schema'
import type { AssetMetadata, AssetRow } from '#/server/db/schema'
import type { Db } from '#/server/db/client.server'
import { findProject, saveProjectDoc } from '#/server/projects.server'
import {
  makeThumbnail,
  probe,
  transcodeAudio,
  transcodeVideo,
} from '#/server/ffmpeg.server'
import type { ProbeResult } from '#/server/ffmpeg.server'

// Each asset gets its own folder: <media>/<projectId>/<assetId>/
// holding original.<ext> until processed, then media.mp4 / audio.m4a (or the
// original image) and thumb.jpg. Paths on the row are relative to <media>.

export class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const assetDir = (projectId: string, assetId: string) =>
  path.posix.join(projectId, assetId)
const abs = (relative: string) => path.join(mediaDir(), relative)

function byteLimit(maxBytes: number) {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > maxBytes) callback(new UploadError(413, 'File is too large'))
      else callback(null, chunk)
    },
  })
}

function validate(kind: AssetKind, info: ProbeResult) {
  if (kind === 'image') {
    const { maxDimension } = uploadLimits.image
    if (!info.hasVideo || !info.width || !info.height) {
      return 'Could not read this image'
    }
    if (info.width > maxDimension || info.height > maxDimension) {
      return `Images can be at most ${maxDimension}px on each side`
    }
    return
  }
  const { maxDuration } = uploadLimits[kind]
  if (kind === 'video' && (!info.hasVideo || info.isStill)) {
    return 'Could not find a video stream in this file'
  }
  if (kind === 'audio' && !info.hasAudio) {
    return 'Could not find an audio stream in this file'
  }
  if (!info.duration) return 'Could not read the duration of this file'
  if (info.duration > maxDuration) {
    return `${kind === 'video' ? 'Clips' : 'Audio files'} can be at most ${maxDuration} seconds long`
  }
}

function metadataOf(info: ProbeResult): AssetMetadata {
  const { duration, width, height, fps, hasAudio } = info
  return { duration, width, height, fps, hasAudio }
}

export interface UploadInput {
  projectId: string
  filename: string
  body: ReadableStream<Uint8Array>
  contentLength?: number
}

// Streams an upload to disk, checks it with ffprobe, records it as
// 'processing' and queues it for transcoding. Throws UploadError on rejection.
export async function saveUpload(db: Db, input: UploadInput) {
  const kind = kindFromFilename(input.filename)
  if (!kind) throw new UploadError(415, 'Unsupported file type')
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .get()
  if (!project) throw new UploadError(404, 'Project not found')

  const { maxBytes } = uploadLimits[kind]
  if (input.contentLength && input.contentLength > maxBytes) {
    throw new UploadError(413, 'File is too large')
  }

  const id = crypto.randomUUID()
  const dir = assetDir(input.projectId, id)
  const original = path.posix.join(
    dir,
    `original.${fileExtension(input.filename)}`,
  )
  await fsp.mkdir(abs(dir), { recursive: true })

  try {
    await pipeline(
      Readable.fromWeb(input.body as WebReadableStream<Uint8Array>),
      byteLimit(maxBytes),
      fs.createWriteStream(abs(original)),
    )
    const info = await probe(abs(original)).catch(() => {
      throw new UploadError(422, 'Could not read this file')
    })
    const problem = validate(kind, info)
    if (problem) throw new UploadError(422, problem)

    const row = db
      .insert(assets)
      .values({
        id,
        projectId: input.projectId,
        kind,
        originalName: input.filename.slice(0, 200),
        mimeType:
          mimeTypes[fileExtension(input.filename)] ??
          'application/octet-stream',
        sizeBytes: (await fsp.stat(abs(original))).size,
        path: original,
        metadata: metadataOf(info),
      })
      .returning()
      .get()
    enqueueProcessing(db, id)
    return row
  } catch (error) {
    await fsp.rm(abs(dir), { recursive: true, force: true })
    throw error
  }
}

export const mimeTypes: Partial<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
}

// Transcodes and thumbnails one asset, marking it 'ready' or 'failed'.
export async function processAsset(db: Db, id: string) {
  const asset = db.select().from(assets).where(eq(assets.id, id)).get()
  if (asset?.status !== 'processing') return

  const dir = assetDir(asset.projectId, asset.id)
  const original = asset.path
  try {
    let update: Partial<AssetRow>
    if (asset.kind === 'video') {
      const output = path.posix.join(dir, 'media.mp4')
      const thumb = path.posix.join(dir, 'thumb.jpg')
      await transcodeVideo(abs(original), abs(output))
      const info = await probe(abs(output))
      await makeThumbnail(
        abs(output),
        abs(thumb),
        Math.min(1, (info.duration ?? 0) / 2),
      )
      update = {
        path: output,
        thumbnailPath: thumb,
        mimeType: 'video/mp4',
        metadata: metadataOf(info),
      }
    } else if (asset.kind === 'audio') {
      const output = path.posix.join(dir, 'audio.m4a')
      await transcodeAudio(abs(original), abs(output))
      const info = await probe(abs(output))
      update = {
        path: output,
        mimeType: 'audio/mp4',
        metadata: metadataOf(info),
      }
    } else {
      const thumb = path.posix.join(dir, 'thumb.jpg')
      await makeThumbnail(abs(original), abs(thumb))
      update = { thumbnailPath: thumb }
    }

    const saved = db
      .update(assets)
      .set({ ...update, status: 'ready', error: null })
      .where(and(eq(assets.id, id), eq(assets.status, 'processing')))
      .returning({ id: assets.id })
      .get() as { id: string } | undefined
    if (saved && update.path && update.path !== original) {
      await fsp.rm(abs(original), { force: true })
    }
  } catch (error) {
    // The row may have been deleted mid-process; then this update is a no-op.
    db.update(assets)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(assets.id, id))
      .run()
  }
}

// One job at a time: ffmpeg already uses every core.
let queue: Promise<void> = Promise.resolve()

export function enqueueProcessing(db: Db, id: string) {
  const job = queue.then(() => processAsset(db, id))
  queue = job.catch(() => {})
  return job
}

let resumed = false

// Re-queues assets left 'processing' by a server restart. Runs once.
export function resumeInterruptedProcessing(db: Db) {
  if (resumed) return
  resumed = true
  const pending = db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.status, 'processing'))
    .all()
  for (const { id } of pending) void enqueueProcessing(db, id)
}

export function listAssets(db: Db, projectId: string) {
  return db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(asc(assets.createdAt))
    .all()
}

// Deletes the asset, its files, and any references to it in the project.
export async function removeAsset(db: Db, id: string) {
  const deleted = db
    .delete(assets)
    .where(eq(assets.id, id))
    .returning({ projectId: assets.projectId })
    .get()
  if (deleted) {
    const project = findProject(db, deleted.projectId)
    if (project) {
      saveProjectDoc(db, project.id, removeAssetReferences(project.doc, id))
    }
    await fsp.rm(abs(assetDir(deleted.projectId, id)), {
      recursive: true,
      force: true,
    })
  }
  return Boolean(deleted)
}
