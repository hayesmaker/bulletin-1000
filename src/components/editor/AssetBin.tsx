import { useState } from 'react'
import { App, Button, Dropdown, Popconfirm, Tag, Tooltip, Upload } from 'antd'
import type { MenuProps, UploadFile } from 'antd'
import {
  CustomerServiceOutlined,
  DeleteOutlined,
  InboxOutlined,
  PlusOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import {
  acceptedExtensions,
  assetUploadUrl,
  kindFromFilename,
} from '#/lib/assets'
import type { SceneType } from '#/lib/project'
import type { AssetRow } from '#/server/db/schema'
import { formatSeconds, sceneLabels, thumbUrl } from './labels'

export type AssetUse = 'box-art' | 'music'

interface Props {
  projectId: string
  assets: AssetRow[]
  onUploaded: (asset: AssetRow) => void
  onAddScene: (type: SceneType, asset: AssetRow) => void
  onUse: (use: AssetUse, asset: AssetRow) => void
  onDelete: (asset: AssetRow) => void
}

const accept = Object.values(acceptedExtensions)
  .flat()
  .map((ext) => `.${ext}`)
  .join(',')

// Sends the raw file, reporting progress. Resolves with the new asset row.
function uploadFile(
  projectId: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<AssetRow>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', assetUploadUrl(projectId, file.name))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || '{}') as
        AssetRow | { error?: string }
      if (xhr.status === 201) resolve(body as AssetRow)
      else {
        reject(
          new Error(
            ('error' in body && body.error) || `Upload failed (${xhr.status})`,
          ),
        )
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(file)
  })
}

function actionsFor(asset: AssetRow): MenuProps['items'] {
  const scene = (type: SceneType) => ({
    key: `scene:${type}`,
    label: `Add as ${sceneLabels[type].toLowerCase()} scene`,
  })
  switch (asset.kind) {
    case 'video':
      return [
        scene('gameplay'),
        ...(asset.metadata.hasAudio
          ? [{ key: 'use:music', label: 'Use its audio as the music' }]
          : []),
      ]
    case 'image':
      return [
        scene('screenshot'),
        scene('title-screen'),
        scene('publisher-logo'),
        { key: 'use:box-art', label: 'Use as box art' },
      ]
    case 'audio':
      return [{ key: 'use:music', label: 'Use as the music' }]
  }
}

export function AssetBin({
  projectId,
  assets,
  onUploaded,
  onAddScene,
  onUse,
  onDelete,
}: Props) {
  const { message } = App.useApp()
  const [uploads, setUploads] = useState<UploadFile[]>([])

  return (
    <div className="flex flex-col gap-4">
      <Upload.Dragger
        multiple
        accept={accept}
        fileList={uploads}
        onChange={({ fileList }) =>
          setUploads(fileList.filter((f) => f.status !== 'done'))
        }
        beforeUpload={(file) => {
          if (kindFromFilename(file.name)) return true
          void message.error(`${file.name}: unsupported file type`)
          return Upload.LIST_IGNORE
        }}
        customRequest={({ file, onProgress, onSuccess, onError }) => {
          uploadFile(projectId, file as File, (percent) =>
            onProgress?.({ percent }),
          ).then(
            (asset) => {
              onUploaded(asset)
              onSuccess?.(asset)
            },
            (error: Error) => {
              void message.error(`${(file as File).name}: ${error.message}`)
              onError?.(error)
            },
          )
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Drop files here or click to upload</p>
        <p className="ant-upload-hint">
          Gameplay clips (up to 2 min), images and music
        </p>
      </Upload.Dragger>

      <div className="grid grid-cols-2 gap-3">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onAction={(key) => {
              const [what, arg] = key.split(':')
              if (what === 'scene') onAddScene(arg as SceneType, asset)
              else onUse(arg as AssetUse, asset)
            }}
            onDelete={() => onDelete(asset)}
          />
        ))}
      </div>
    </div>
  )
}

function AssetCard({
  asset,
  onAction,
  onDelete,
}: {
  asset: AssetRow
  onAction: (key: string) => void
  onDelete: () => void
}) {
  const thumb = thumbUrl(asset)
  const ready = asset.status === 'ready'
  return (
    <div className="overflow-hidden rounded border border-neutral-200">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-neutral-900 text-2xl text-neutral-400">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : asset.kind === 'audio' ? (
          <CustomerServiceOutlined />
        ) : (
          <VideoCameraOutlined />
        )}
        {asset.status !== 'ready' && (
          <Tooltip title={asset.error}>
            <Tag
              className="absolute! top-1 left-1"
              color={asset.status === 'failed' ? 'error' : 'processing'}
            >
              {asset.status === 'failed' ? 'Failed' : 'Processing…'}
            </Tag>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-1 p-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs" title={asset.originalName}>
            {asset.originalName}
          </div>
          <div className="text-xs text-neutral-500">
            {asset.kind}
            {asset.metadata.duration !== undefined &&
              ` · ${formatSeconds(asset.metadata.duration)}`}
          </div>
        </div>
        <Dropdown
          disabled={!ready}
          trigger={['click']}
          menu={{
            items: actionsFor(asset),
            onClick: ({ key }) => onAction(key),
          }}
        >
          <Button
            size="small"
            type="text"
            aria-label="Use"
            icon={<PlusOutlined />}
          />
        </Dropdown>
        <Popconfirm
          title="Delete this asset?"
          description="Scenes using it will show a placeholder."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button
            size="small"
            type="text"
            aria-label="Delete"
            icon={<DeleteOutlined />}
          />
        </Popconfirm>
      </div>
    </div>
  )
}
