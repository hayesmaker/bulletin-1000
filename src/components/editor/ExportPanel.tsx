import { useCallback, useEffect, useState } from 'react'
import { Alert, App, Button, Popconfirm, Progress, Tag } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import { renderFileUrl } from '#/lib/assets'
import type { RenderRow } from '#/server/db/schema'
import {
  deleteRender,
  getRenders,
  startRender,
} from '#/server/renders.functions'
import { formatSeconds } from './labels'

interface Props {
  projectId: string
  // False while the doc has unsaved changes: renders use the saved doc.
  saved: boolean
  // Voice lines that must be generated before an export.
  voiceLinesToGenerate: number
  generatingVoice: boolean
  onGenerateVoice: () => void
}

const POLL_INTERVAL = 1000

const statusTags: Record<
  RenderRow['status'],
  { color: string; label: string }
> = {
  queued: { color: 'default', label: 'Queued' },
  rendering: { color: 'processing', label: 'Rendering' },
  done: { color: 'success', label: 'Done' },
  failed: { color: 'error', label: 'Failed' },
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Renders the project to MP4 and lists its exports.
export function ExportPanel({
  projectId,
  saved,
  voiceLinesToGenerate,
  generatingVoice,
  onGenerateVoice,
}: Props) {
  const { message } = App.useApp()
  const [renders, setRenders] = useState<RenderRow[]>([])
  const [starting, setStarting] = useState(false)
  const [watching, setWatching] = useState<string>()

  const refresh = useCallback(
    () => getRenders({ data: { projectId } }).then(setRenders, () => undefined),
    [projectId],
  )
  useEffect(() => void refresh(), [refresh])

  const active = renders.some(
    (r) => r.status === 'queued' || r.status === 'rendering',
  )
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void refresh(), POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [active, refresh])

  const start = async () => {
    setStarting(true)
    try {
      await startRender({ data: { projectId } })
      await refresh()
    } catch (e) {
      void message.error(
        e instanceof Error ? e.message : 'Couldn’t start the render',
      )
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {voiceLinesToGenerate > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${voiceLinesToGenerate} voice ${voiceLinesToGenerate === 1 ? 'line needs' : 'lines need'} generating before you can export.`}
          action={
            <Button
              size="small"
              loading={generatingVoice}
              onClick={onGenerateVoice}
            >
              Generate
            </Button>
          }
        />
      )}
      <div>
        <Button
          type="primary"
          loading={starting}
          disabled={!saved || voiceLinesToGenerate > 0}
          onClick={() => void start()}
        >
          Render video
        </Button>
        <p className="mt-2 mb-0 text-xs text-neutral-500">
          {saved
            ? 'Renders the project as it is now: 1440×1080, 25fps MP4.'
            : 'Waiting for your changes to save.'}
        </p>
      </div>

      {renders.length === 0 && (
        <p className="m-0 text-neutral-500">No renders yet.</p>
      )}
      {renders.map((r) => {
        const tag = statusTags[r.status]
        return (
          <div key={r.id} className="rounded border border-neutral-200 p-3">
            <div className="flex items-center gap-2">
              <Tag color={tag.color}>{tag.label}</Tag>
              <span className="flex-1 text-xs text-neutral-500">
                {r.createdAt.toLocaleString()}
              </span>
              <Popconfirm
                title="Delete this render?"
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={async () => {
                  await deleteRender({ data: { id: r.id } })
                  await refresh()
                }}
              >
                <Button
                  size="small"
                  type="text"
                  aria-label="Delete render"
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>
            </div>
            {r.status === 'rendering' && (
              <Progress percent={Math.round(r.progress * 100)} size="small" />
            )}
            {r.status === 'failed' && (
              <p className="mt-2 mb-0 text-xs break-words text-red-600">
                {r.error}
              </p>
            )}
            {r.status === 'done' && (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 text-xs text-neutral-500">
                    {r.duration !== null && formatSeconds(r.duration)}
                    {r.sizeBytes !== null && ` · ${megabytes(r.sizeBytes)}`}
                  </span>
                  <Button
                    size="small"
                    icon={<PlayCircleOutlined />}
                    onClick={() =>
                      setWatching((id) => (id === r.id ? undefined : r.id))
                    }
                  >
                    Watch
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<DownloadOutlined />}
                    href={renderFileUrl(r.id, true)}
                  >
                    Download
                  </Button>
                </div>
                {watching === r.id && (
                  <video
                    className="mt-2 w-full bg-black"
                    src={renderFileUrl(r.id)}
                    controls
                    autoPlay
                  />
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
