import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { projectDocSchema } from '#/lib/project'
import { getDb } from '#/server/db/client.server'
import {
  findProject,
  foreignAssetIds,
  insertProject,
  listProjects,
  removeProject,
  saveProjectDoc,
  unknownVoiceClipIds,
} from '#/server/projects.server'

// No auth yet (MVP). Once Clerk lands, every handler here must check the
// project belongs to the signed-in user.

const projectId = z.object({ id: z.uuid() })

export const getProjects = createServerFn({ method: 'GET' }).handler(async () =>
  listProjects(getDb()),
)

export const getProject = createServerFn({ method: 'GET' })
  .validator(projectId)
  .handler(async ({ data }) => {
    const project = findProject(getDb(), data.id)
    if (!project) throw notFound()
    return project
  })

export const createProject = createServerFn({ method: 'POST' })
  .validator(z.object({ title: z.string().max(100).optional() }))
  .handler(async ({ data }) => insertProject(getDb(), data.title))

export const updateProject = createServerFn({ method: 'POST' })
  .validator(projectId.extend({ doc: projectDocSchema }))
  .handler(async ({ data }) => {
    const db = getDb()
    if (foreignAssetIds(db, data.id, data.doc).length > 0) {
      throw new Error('The project refers to assets it does not own')
    }
    if (unknownVoiceClipIds(db, data.doc).length > 0) {
      throw new Error('The project refers to voice clips that don’t exist')
    }
    const project = saveProjectDoc(db, data.id, data.doc)
    if (!project) throw notFound()
    return project
  })

export const deleteProject = createServerFn({ method: 'POST' })
  .validator(projectId)
  .handler(async ({ data }) => {
    if (!(await removeProject(getDb(), data.id))) throw notFound()
    return { id: data.id }
  })
