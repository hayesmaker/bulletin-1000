import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import compositionCss from '#/composition/composition.css?url'
import { toCompositionAssets } from '#/composition/assets'
import { CompositionPlayer } from '#/components/CompositionPlayer'
import { getAssets } from '#/server/assets.functions'
import { getProject } from '#/server/projects.functions'

// Standalone preview of a project's video. The editor (step 4) will embed
// the same player.
export const Route = createFileRoute('/projects/$projectId/preview')({
  loader: async ({ params }) => {
    const [project, assets] = await Promise.all([
      getProject({ data: { id: params.projectId } }),
      getAssets({ data: { projectId: params.projectId } }),
    ])
    return { project, assets }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.project.title ?? 'Preview'} – Bulletin 1000` },
    ],
    links: [{ rel: 'stylesheet', href: compositionCss }],
  }),
  component: Preview,
})

function Preview() {
  const { project, assets } = Route.useLoaderData()
  const compositionAssets = useMemo(() => toCompositionAssets(assets), [assets])

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{project.title}</h1>
      <CompositionPlayer doc={project.doc} assets={compositionAssets} />
    </main>
  )
}
