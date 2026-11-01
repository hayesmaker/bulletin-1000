import { Button, Input, Slider } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { Caption } from '#/lib/project'
import { snap } from '#/composition/schedule'
import { stage } from '#/composition/theme'
import { formatTime } from './labels'

interface Props {
  captions: Caption[]
  // The scene's length; caption times are relative to the scene start.
  length: number
  onChange: (captions: Caption[]) => void
}

const FRAME = 1 / stage.fps
const DEFAULT_CAPTION_LENGTH = 2.5

// Selling-point captions shown over the scene.
export function CaptionEditor({ captions, length, onChange }: Props) {
  const set = (id: string, fields: Partial<Caption>) =>
    onChange(captions.map((c) => (c.id === id ? { ...c, ...fields } : c)))

  const add = () => {
    const start = snap(Math.min(captions.at(-1)?.end ?? 0.5, length - FRAME))
    const end = snap(Math.min(start + DEFAULT_CAPTION_LENGTH, length))
    onChange([
      ...captions,
      {
        id: crypto.randomUUID(),
        text: '',
        start,
        end: Math.max(end, start + FRAME),
      },
    ])
  }

  return (
    <div className="flex flex-col gap-3">
      {captions.map((c) => (
        <div key={c.id} className="rounded border border-neutral-200 p-2">
          <div className="flex items-start gap-2">
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 3 }}
              placeholder="Superb graphics"
              maxLength={200}
              value={c.text}
              onChange={(e) => set(c.id, { text: e.target.value })}
            />
            <Button
              type="text"
              aria-label="Remove caption"
              icon={<DeleteOutlined />}
              onClick={() => onChange(captions.filter((x) => x.id !== c.id))}
            />
          </div>
          <Slider
            range
            min={0}
            max={Math.max(length, c.end)}
            step={FRAME}
            value={[c.start, c.end]}
            tooltip={{ formatter: (v) => formatTime(v ?? 0) }}
            onChange={([start, end]) =>
              set(c.id, {
                start: snap(start),
                end: snap(Math.max(end, start + FRAME)),
              })
            }
          />
          <div className="font-mono text-xs text-neutral-500">
            {formatTime(c.start)} – {formatTime(c.end)}
            {c.start >= length && ' (after the scene ends)'}
          </div>
        </div>
      ))}
      <Button icon={<PlusOutlined />} onClick={add}>
        Add caption
      </Button>
    </div>
  )
}
