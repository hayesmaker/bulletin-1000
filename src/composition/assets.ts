import { mediaUrl } from '#/lib/assets'
import type { AssetRow } from '#/server/db/schema'
import type { CompositionAsset } from './scenes'

// The ready assets of a project, as the composition needs them.
export function toCompositionAssets(assets: AssetRow[]): CompositionAsset[] {
  return assets
    .filter((a) => a.status === 'ready')
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      duration: a.metadata.duration,
      hasAudio: a.metadata.hasAudio,
      url: mediaUrl(a.id),
    }))
}
