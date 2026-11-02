import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import compositionCss from '#/composition/composition.css?url'
import { createComposition } from '#/composition/composition'
import type { Composition } from '#/composition/composition'
import { toCompositionAssets } from '#/composition/assets'
import { getAssets } from '#/server/assets.functions'
import { getProject } from '#/server/projects.functions'
import { getRenderDoc } from '#/server/renders.functions'

declare global {
  interface Window {
    // Set once the composition is ready; the exporter drives it through
    // renderFrame() and screenshots the stage.
    composition?: Composition
  }
}

// Bare, full-size stage (1440×1080 for 4:3) for the headless exporter.
// With ?render=<id>, shows the doc saved with that render rather than the
// project's current doc.
export const Route = createFileRoute('/render/$projectId')({
  validateSearch: z.object({ render: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ render: search.render }),
  loader: async ({ params, deps }) => {
    const [project, assets, renderDoc] = await Promise.all([
      getProject({ data: { id: params.projectId } }),
      getAssets({ data: { projectId: params.projectId } }),
      deps.render ? getRenderDoc({ data: { id: deps.render } }) : undefined,
    ])
    return { doc: renderDoc ?? project.doc, assets }
  },
  head: () => ({ links: [{ rel: 'stylesheet', href: compositionCss }] }),
  component: Render,
})

function Render() {
  const { doc, assets } = Route.useLoaderData()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const composition = createComposition(
      hostRef.current,
      doc,
      toCompositionAssets(assets),
    )
    let cancelled = false
    void composition.ready.then(() => {
      if (!cancelled) window.composition = composition
    })
    return () => {
      cancelled = true
      delete window.composition
      composition.destroy()
    }
  }, [doc, assets])

  return <div ref={hostRef} id="stage" style={{ width: 'fit-content' }} />
}
