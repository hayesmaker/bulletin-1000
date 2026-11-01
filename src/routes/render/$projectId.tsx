import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import compositionCss from '#/composition/composition.css?url'
import { createComposition } from '#/composition/composition'
import type { Composition } from '#/composition/composition'
import { toCompositionAssets } from '#/composition/assets'
import { getAssets } from '#/server/assets.functions'
import { getProject } from '#/server/projects.functions'

declare global {
  interface Window {
    // Set once the composition is ready; the exporter drives it through
    // renderFrame() and screenshots the stage.
    composition?: Composition
  }
}

// Bare, full-size (1440×1080) stage for the headless exporter.
export const Route = createFileRoute('/render/$projectId')({
  loader: async ({ params }) => {
    const [project, assets] = await Promise.all([
      getProject({ data: { id: params.projectId } }),
      getAssets({ data: { projectId: params.projectId } }),
    ])
    return { project, assets }
  },
  head: () => ({ links: [{ rel: 'stylesheet', href: compositionCss }] }),
  component: Render,
})

function Render() {
  const { project, assets } = Route.useLoaderData()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const composition = createComposition(
      hostRef.current,
      project.doc,
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
  }, [project, assets])

  return <div ref={hostRef} id="stage" style={{ width: 'fit-content' }} />
}
