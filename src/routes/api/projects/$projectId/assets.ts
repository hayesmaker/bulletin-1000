import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  UploadError,
  resumeInterruptedProcessing,
  saveUpload,
} from '#/server/assets.server'
import { getDb } from '#/server/db/client.server'

// POST /api/projects/:projectId/assets?name=<filename>
// The request body is the raw file. Responds 201 with the asset row, which
// starts as 'processing'; poll getAssets until it is 'ready' or 'failed'.
export const Route = createFileRoute('/api/projects/$projectId/assets')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const projectId = z.uuid().safeParse(params.projectId)
        const name = new URL(request.url).searchParams.get('name')
        if (!projectId.success || !name || !request.body) {
          return Response.json(
            { error: 'Expected a project id, a ?name= and a file body' },
            { status: 400 },
          )
        }
        const db = getDb()
        resumeInterruptedProcessing(db)
        try {
          const asset = await saveUpload(db, {
            projectId: projectId.data,
            filename: name,
            body: request.body,
            contentLength:
              Number(request.headers.get('content-length')) || undefined,
          })
          return Response.json(asset, { status: 201 })
        } catch (error) {
          if (error instanceof UploadError) {
            return Response.json(
              { error: error.message },
              { status: error.status },
            )
          }
          throw error
        }
      },
    },
  },
})
