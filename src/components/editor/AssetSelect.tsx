import { Select } from 'antd'
import type { AssetRow } from '#/server/db/schema'
import type { AssetKind } from '#/lib/assets'
import { thumbUrl } from './labels'

interface Props {
  assets: AssetRow[]
  kind: AssetKind
  value: string | null
  onChange: (assetId: string | null) => void
  placeholder?: string
}

// Picks one of the project's ready assets of a kind.
export function AssetSelect({
  assets,
  kind,
  value,
  onChange,
  placeholder = 'Choose…',
}: Props) {
  const options = assets
    .filter((a) => a.kind === kind && a.status === 'ready')
    .map((a) => ({
      value: a.id,
      label: (
        <span className="flex items-center gap-2">
          {thumbUrl(a) && (
            <img src={thumbUrl(a)} alt="" className="h-5 w-7 object-cover" />
          )}
          <span className="truncate">{a.originalName}</span>
        </span>
      ),
    }))
  return (
    <Select
      className="w-full"
      allowClear
      placeholder={placeholder}
      value={value}
      options={options}
      onChange={(v: string | undefined) => onChange(v ?? null)}
    />
  )
}
