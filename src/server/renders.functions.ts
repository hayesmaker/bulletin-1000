import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { z } from 'zod'
import { scenesNeedingVoice } from '#/lib/project'
import { getDb } from '#/server/db/client.server'
import { findProject } from '#/server/projects.server'
import {
  enqueueRender,
  findRender,
  insertRender,
  listRenders,
  removeRender,
  resumeInterruptedRenders,
} from '#/server/renders.server'

// No auth yet (see projects.functions.ts).

// Where the export browser reaches this server's render page. Defaults to
// the origin of the current request; set RENDER_BASE_URL when that isn't
// reachable from the server itself (e.g. behind a proxy).
function baseUrl() {
  return process.env.RENDER_BASE_URL ?? new URL(getRequestUrl()).origin
}

function renderQueue() {
  const db = getDb()
  resumeInterruptedRenders(db, baseUrl())
  return db
}

// Renders the project as last saved.
export const startRender = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.uuid() }))
  .handler(async ({ data }) => {
    const db = renderQueue()
    const project = findProject(db, data.projectId)
    if (!project) throw notFound()
    const stale = scenesNeedingVoice(project.doc).length
    if (stale > 0) {
      throw new Error(
        `${stale} voice ${stale === 1 ? 'line needs' : 'lines need'} generating before export`,
      )
    }
    const render = insertRender(db, project.id, project.doc)
    void enqueueRender(db, render.id, baseUrl())
    return render
  })

export const getRenders = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.uuid() }))
  .handler(async ({ data }) => listRenders(renderQueue(), data.projectId))

// The doc a render was made from, for the render page.
export const getRenderDoc = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const render = findRender(getDb(), data.id)
    if (!render) throw notFound()
    return render.doc
  })

export const deleteRender = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    if (!(await removeRender(getDb(), data.id))) throw notFound()
    return { id: data.id }
  })
