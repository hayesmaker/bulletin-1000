import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mediaDir } from '#/server/config.server'
import { openDb } from '#/server/db/client.server'
import type { Db } from '#/server/db/client.server'
import { insertProject } from '#/server/projects.server'
import {
  UploadError,
  enqueueProcessing,
  listAssets,
  removeAsset,
  saveUpload,
} from './assets.server'
import { serveAssetFile } from './media.server'

// These tests need ffmpeg/ffprobe on the PATH, like the server does.

let tmp: string
let fixtures: string
let db: Db
let projectId: string

const ffmpeg = (...args: string[]) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b1k-assets-'))
  process.env.DATA_DIR = path.join(tmp, 'data')
  fixtures = path.join(tmp, 'fixtures')
  fs.mkdirSync(fixtures)
  const f = (name: string) => path.join(fixtures, name)
  // 50fps PAL-style capture with non-square pixels and audio.
  ffmpeg(
    '-f', 'lavfi', '-i', 'testsrc=size=320x256:rate=50:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-vf', 'setsar=16/15', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac', '-shortest', f('clip.mkv'),
  ) // prettier-ignore
  ffmpeg(
    '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', f('silent.mp4'),
  ) // prettier-ignore
  ffmpeg(
    '-f', 'lavfi', '-i', 'testsrc=size=32x32:rate=5:duration=121',
    '-c:v', 'libx264', '-preset', 'ultrafast', f('long.mp4'),
  ) // prettier-ignore
  ffmpeg('-f', 'lavfi', '-i', 'sine=duration=3', f('tune.wav'))
  ffmpeg(
    '-f', 'lavfi', '-i', 'testsrc=size=400x500:duration=1',
    '-frames:v', '1', f('box.png'),
  ) // prettier-ignore
  fs.writeFileSync(f('broken.mp4'), 'not really a video')
}, 60_000)

afterAll(() => {
  delete process.env.DATA_DIR
  fs.rmSync(tmp, { recursive: true, force: true })
})

beforeEach(() => {
  db = openDb(':memory:')
  projectId = insertProject(db).id
})

const fileBody = (name: string) =>
  Readable.toWeb(
    fs.createReadStream(path.join(fixtures, name)),
  ) as ReadableStream<Uint8Array>

async function upload(filename: string, body = fileBody(filename)) {
  const asset = await saveUpload(db, { projectId, filename, body })
  // The queue is serial, so this resolves after the asset's own job.
  await enqueueProcessing(db, asset.id)
  return { queued: asset, done: listAssets(db, projectId)[0] }
}

async function uploadError(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(UploadError)
  return error as UploadError
}

const onDisk = (relative: string | null) =>
  relative !== null && fs.existsSync(path.join(mediaDir(), relative))

describe('saveUpload + processing', () => {
  it('transcodes a video clip to 25fps H.264 with square pixels', async () => {
    const { queued, done } = await upload('clip.mkv')
    expect(queued.status).toBe('processing')
    expect(queued.metadata.fps).toBe(50)

    expect(done.status).toBe('ready')
    expect(done.kind).toBe('video')
    expect(done.path).toBe(`${projectId}/${done.id}/media.mp4`)
    expect(done.mimeType).toBe('video/mp4')
    expect(done.metadata).toMatchObject({
      fps: 25,
      hasAudio: true,
      width: 342,
      height: 256,
    })
    expect(done.metadata.duration).toBeCloseTo(3, 0)
    expect(onDisk(done.path)).toBe(true)
    expect(onDisk(done.thumbnailPath)).toBe(true)
    expect(onDisk(queued.path)).toBe(false)
  }, 30_000)

  it('handles clips without audio', async () => {
    const { done } = await upload('silent.mp4')
    expect(done.status).toBe('ready')
    expect(done.metadata.hasAudio).toBe(false)
  }, 30_000)

  it('transcodes audio to AAC', async () => {
    const { done } = await upload('tune.wav')
    expect(done.status).toBe('ready')
    expect(done.kind).toBe('audio')
    expect(done.path.endsWith('/audio.m4a')).toBe(true)
    expect(done.thumbnailPath).toBeNull()
    expect(done.metadata.duration).toBeCloseTo(3, 0)
  }, 30_000)

  it('keeps images as uploaded and makes a thumbnail', async () => {
    const { done } = await upload('box.png')
    expect(done.status).toBe('ready')
    expect(done.path.endsWith('/original.png')).toBe(true)
    expect(done.metadata).toMatchObject({ width: 400, height: 500 })
    expect(onDisk(done.path)).toBe(true)
    expect(onDisk(done.thumbnailPath)).toBe(true)
  }, 30_000)

  it('rejects unsupported file types', async () => {
    const error = await uploadError(upload('notes.txt', fileBody('box.png')))
    expect(error.status).toBe(415)
  })

  it('rejects uploads for an unknown project', async () => {
    const error = await uploadError(
      saveUpload(db, {
        projectId: crypto.randomUUID(),
        filename: 'box.png',
        body: fileBody('box.png'),
      }),
    )
    expect(error.status).toBe(404)
  })

  it('rejects files over the size limit, by header or by stream', async () => {
    const byHeader = await uploadError(
      saveUpload(db, {
        projectId,
        filename: 'box.png',
        body: fileBody('box.png'),
        contentLength: 50 * 1024 * 1024,
      }),
    )
    expect(byHeader.status).toBe(413)

    const big = Readable.toWeb(
      Readable.from([Buffer.alloc(21 * 1024 * 1024)]),
    ) as ReadableStream<Uint8Array>
    const byStream = await uploadError(upload('huge.png', big))
    expect(byStream.status).toBe(413)
    expect(fs.readdirSync(path.join(mediaDir(), projectId))).toEqual([])
  })

  it('rejects unreadable and over-long clips', async () => {
    expect((await uploadError(upload('broken.mp4'))).status).toBe(422)
    const long = await uploadError(upload('long.mp4'))
    expect(long.status).toBe(422)
    expect(long.message).toMatch(/120 seconds/)
    expect(listAssets(db, projectId)).toHaveLength(0)
  }, 30_000)

  it('removes an asset and its files', async () => {
    const { done } = await upload('box.png')
    expect(await removeAsset(db, done.id)).toBe(true)
    expect(listAssets(db, projectId)).toHaveLength(0)
    expect(onDisk(`${projectId}/${done.id}`)).toBe(false)
    expect(await removeAsset(db, done.id)).toBe(false)
  })
})

describe('serveMedia', () => {
  const get = (
    assetId: string,
    headers?: HeadersInit,
    variant: 'file' | 'thumb' = 'file',
  ) =>
    serveAssetFile(db, assetId, variant, new Request('http://x', { headers }))

  it('serves whole files and byte ranges', async () => {
    const { done } = await upload('box.png')
    const size = fs.statSync(path.join(mediaDir(), done.path)).size

    const whole = await get(done.id)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('content-type')).toBe('image/png')
    expect((await whole.arrayBuffer()).byteLength).toBe(size)

    const part = await get(done.id, { range: 'bytes=0-99' })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 0-99/${size}`)
    expect((await part.arrayBuffer()).byteLength).toBe(100)

    const tail = await get(done.id, { range: 'bytes=-10' })
    expect((await tail.arrayBuffer()).byteLength).toBe(10)

    expect((await get(done.id, { range: `bytes=${size}-` })).status).toBe(416)
  })

  it('serves thumbnails', async () => {
    const { done } = await upload('box.png')
    const thumb = await get(done.id, undefined, 'thumb')
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get('content-type')).toBe('image/jpeg')
  })

  it('404s for unknown, unprocessed or thumbnail-less assets', async () => {
    expect((await get(crypto.randomUUID())).status).toBe(404)
    const queued = await saveUpload(db, {
      projectId,
      filename: 'tune.wav',
      body: fileBody('tune.wav'),
    })
    expect((await get(queued.id)).status).toBe(404)
    await enqueueProcessing(db, queued.id)
    expect((await get(queued.id)).status).toBe(200)
    expect((await get(queued.id, undefined, 'thumb')).status).toBe(404)
  }, 30_000)
})
