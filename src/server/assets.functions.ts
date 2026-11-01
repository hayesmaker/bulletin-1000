import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  listAssets,
  removeAsset,
  resumeInterruptedProcessing,
} from '#/server/assets.server'
import { getDb } from '#/server/db/client.server'

// Uploads go through the /api/projects/$projectId/assets server route, since
// they stream a raw request body. No auth yet (see projects.functions.ts).

export const getAssets = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.uuid() }))
  .handler(async ({ data }) => {
    const db = getDb()
    resumeInterruptedProcessing(db)
    return listAssets(db, data.projectId)
  })

export const deleteAsset = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    if (!(await removeAsset(getDb(), data.id))) throw notFound()
    return { id: data.id }
  })
