import fsp from 'node:fs/promises'
import path from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { toCompositionAssets } from '#/composition/assets'
import { buildSchedule } from '#/composition/schedule'
import { stage } from '#/composition/theme'
import type { ProjectDoc } from '#/lib/project'
import { listAssets } from '#/server/assets.server'
import { captureFrames } from '#/server/capture.server'
import { mediaDir } from '#/server/config.server'
import { renders } from '#/server/db/schema'
import type { RenderRow } from '#/server/db/schema'
import type { Db } from '#/server/db/client.server'
import { spawnFfmpeg } from '#/server/ffmpeg.server'
import { buildAudioMix } from '#/server/mix.server'

// Video export. A render copies the project doc, waits its turn in a serial
// queue, then headless Chrome steps the composition frame by frame into a
// single ffmpeg process that also mixes the audio. Output goes to
// <media>/<projectId>/renders/<renderId>.mp4.

const abs = (relative: string) => path.join(mediaDir(), relative)
const renderPath = (projectId: string, id: string) =>
  path.posix.join(projectId, 'renders', `${id}.mp4`)

// How often to write progress to the database, in frames.
const PROGRESS_EVERY = stage.fps

export function insertRender(db: Db, projectId: string, doc: ProjectDoc) {
  return db
    .insert(renders)
    .values({ id: crypto.randomUUID(), projectId, doc })
    .returning()
    .get()
}

export function findRender(db: Db, id: string): RenderRow | undefined {
  return db.select().from(renders).where(eq(renders.id, id)).get()
}

export function listRenders(db: Db, projectId: string) {
  return db
    .select()
    .from(renders)
    .where(eq(renders.projectId, projectId))
    .orderBy(desc(renders.createdAt))
    .all()
}

// Deletes the render and its file. A render in progress is stopped first.
export async function removeRender(db: Db, id: string) {
  const deleted = db
    .delete(renders)
    .where(eq(renders.id, id))
    .returning({ projectId: renders.projectId })
    .get()
  if (!deleted) return false
  const file = abs(renderPath(deleted.projectId, id))
  await fsp.rm(file, { force: true })
  await fsp.rm(`${file}.part`, { force: true })
  return true
}

function update(db: Db, id: string, fields: Partial<RenderRow>) {
  db.update(renders).set(fields).where(eq(renders.id, id)).run()
}

// Renders one queued job. `baseUrl` is where this server can reach its own
// render page.
export async function runRender(db: Db, id: string, baseUrl: string) {
  const render = findRender(db, id)
  if (render?.status !== 'queued') return
  update(db, id, { status: 'rendering', progress: 0, error: null })

  const output = renderPath(render.projectId, id)
  const partial = `${abs(output)}.part`
  // Stops work if the render is deleted while it runs.
  const gone = () => !findRender(db, id)
  let ffmpeg: ReturnType<typeof spawnFfmpeg> | undefined

  try {
    const assetRows = listAssets(db, render.projectId)
    const assets = toCompositionAssets(assetRows)
    const schedule = buildSchedule(render.doc, assets)
    const frameCount = Math.round(schedule.duration * stage.fps)
    if (frameCount === 0) throw new Error('The video is empty: add a scene')

    const files = new Map(
      assetRows
        .filter((a) => a.status === 'ready')
        .map((a) => [a.id, abs(a.path)]),
    )
    const mix = buildAudioMix(schedule, files, 1)
    await fsp.mkdir(path.dirname(partial), { recursive: true })
    ffmpeg = spawnFfmpeg([
      // Video: PNG frames on stdin.
      '-f', 'image2pipe', '-framerate', String(stage.fps), '-c:v', 'png',
      '-i', 'pipe:0',
      ...mix.inputArgs,
      '-filter_complex', mix.filter,
      '-map', '0:v', '-map', mix.output,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-frames:v', String(frameCount),
      '-c:a', 'aac', '-b:a', '192k',
      '-t', String(schedule.duration),
      '-movflags', '+faststart',
      '-f', 'mp4', partial,
    ]) // prettier-ignore

    await captureFrames({
      url: `${baseUrl}/render/${render.projectId}?render=${id}`,
      frameCount,
      out: ffmpeg.stdin,
      cancelled: gone,
      onFrame: (frame) => {
        if ((frame + 1) % PROGRESS_EVERY === 0) {
          update(db, id, { progress: (frame + 1) / frameCount })
        }
      },
    })
    if (gone()) throw new Error('Render deleted')
    ffmpeg.stdin.end()
    await ffmpeg.done

    await fsp.rename(partial, abs(output))
    const { size } = await fsp.stat(abs(output))
    if (gone()) {
      await fsp.rm(abs(output), { force: true })
      return
    }
    update(db, id, {
      status: 'done',
      progress: 1,
      path: output,
      sizeBytes: size,
      duration: schedule.duration,
      finishedAt: new Date(),
    })
  } catch (error) {
    ffmpeg?.kill()
    await fsp.rm(partial, { force: true })
    update(db, id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date(),
    })
  }
}

// One render at a time: Chrome and ffmpeg already use the whole machine.
let queue: Promise<void> = Promise.resolve()

export function enqueueRender(db: Db, id: string, baseUrl: string) {
  const job = queue.then(() => runRender(db, id, baseUrl))
  queue = job.catch(() => {})
  return job
}

let resumed = false

// Re-queues renders left unfinished by a server restart. Runs once.
export function resumeInterruptedRenders(db: Db, baseUrl: string) {
  if (resumed) return
  resumed = true
  const pending = db
    .select({ id: renders.id })
    .from(renders)
    .where(inArray(renders.status, ['queued', 'rendering']))
    .orderBy(renders.createdAt)
    .all()
  for (const { id } of pending) {
    db.update(renders)
      .set({ status: 'queued', progress: 0 })
      .where(and(eq(renders.id, id), eq(renders.status, 'rendering')))
      .run()
    void enqueueRender(db, id, baseUrl)
  }
}
