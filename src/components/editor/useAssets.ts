import { useCallback, useEffect, useState } from 'react'
import { getAssets } from '#/server/assets.functions'
import type { AssetRow } from '#/server/db/schema'

const POLL_INTERVAL = 1500

// The project's assets, polled while any are still processing.
export function useAssets(projectId: string, initial: AssetRow[]) {
  const [assets, setAssets] = useState(initial)

  const refresh = useCallback(
    () => getAssets({ data: { projectId } }).then(setAssets, () => undefined),
    [projectId],
  )

  const processing = assets.some((a) => a.status === 'processing')
  useEffect(() => {
    if (!processing) return
    const timer = setInterval(() => void refresh(), POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [processing, refresh])

  const added = useCallback(
    (asset: AssetRow) => setAssets((list) => [...list, asset]),
    [],
  )
  const removed = useCallback(
    (id: string) => setAssets((list) => list.filter((a) => a.id !== id)),
    [],
  )

  return { assets, refresh, added, removed }
}
