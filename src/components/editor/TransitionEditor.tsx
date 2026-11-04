import {
  Button,
  ColorPicker,
  Form,
  Segmented,
  Select,
  Slider,
  Switch,
} from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { snap } from '#/composition/schedule'
import { fps } from '#/composition/theme'
import { MAX_TRANSITION_LENGTH, newTransition } from '#/lib/project'
import type {
  Direction,
  ProjectDoc,
  Transition,
  TransitionType,
  ZoomOrigin,
} from '#/lib/project'

export const transitionLabels: Record<TransitionType, string> = {
  cut: 'Cut',
  dissolve: 'Dissolve',
  dip: 'Dip to colour',
  wipe: 'Wipe',
  iris: 'Box / iris',
  push: 'Push',
  slide: 'Slide',
  zoom: 'Zoom',
  flip: 'Flip',
  'spectrum-load': 'Spectrum screen load',
  'tape-loader': 'Tape loader',
}

const groups: Array<{ label: string; types: TransitionType[] }> = [
  { label: 'Broadcast', types: ['cut', 'dissolve', 'dip'] },
  {
    label: 'Vision mixer',
    types: ['wipe', 'iris', 'push', 'slide', 'zoom', 'flip'],
  },
  { label: 'Retro computer', types: ['spectrum-load', 'tape-loader'] },
]

const help: Partial<Record<TransitionType, string>> = {
  dip: 'Fades out to a colour, then in from it.',
  'spectrum-load':
    'Drawn in line by line in the ZX Spectrum’s screen order, in black and white, then the colour arrives.',
  'tape-loader': 'A burst of tape-loading border stripes over the cut.',
}

const directions: Array<{ value: Direction; label: string }> = [
  { value: 'left', label: '← Left' },
  { value: 'right', label: 'Right →' },
  { value: 'up', label: '↑ Up' },
  { value: 'down', label: 'Down ↓' },
]

const origins: Array<{ value: ZoomOrigin; label: string }> = [
  { value: 'centre', label: 'Centre' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
]

const STEP = 1 / fps

interface Props {
  doc: ProjectDoc
  value: Transition
  // 'from the splash' for the first scene after a splash.
  label: string
  onChange: (transition: Transition) => void
  onPreview: () => void
}

// A scene's transition in: its type, settings and length.
export function TransitionEditor({
  doc,
  value,
  label,
  onChange,
  onPreview,
}: Props) {
  const set = (fields: Partial<Transition>) =>
    onChange({ ...value, ...fields } as Transition)

  return (
    <>
      <Form.Item label={label} extra={help[value.type]}>
        <div className="flex gap-2">
          <Select<TransitionType>
            className="flex-1"
            value={value.type}
            options={groups.map((g) => ({
              label: g.label,
              options: g.types.map((t) => ({
                value: t,
                label: transitionLabels[t],
              })),
            }))}
            onChange={(type) => onChange(newTransition(type))}
          />
          {value.type !== 'cut' && (
            <Button
              icon={<PlayCircleOutlined />}
              aria-label="Preview transition"
              title="Preview transition"
              onClick={onPreview}
            />
          )}
        </div>
      </Form.Item>

      {value.type === 'dip' && (
        <Form.Item label="Colour">
          <ColorPicker
            disabledAlpha
            showText
            value={value.colour}
            presets={[
              {
                label: 'Suggested',
                colors: ['#000000', '#ffffff', doc.packshotColour],
              },
            ]}
            onChange={(c) => set({ colour: c.toHexString() })}
          />
        </Form.Item>
      )}

      {(value.type === 'wipe' ||
        value.type === 'push' ||
        value.type === 'slide') && (
        <Form.Item label="Direction" extra="The way the new scene moves.">
          <Segmented<Direction>
            block
            value={value.direction}
            options={directions}
            onChange={(direction) => set({ direction })}
          />
        </Form.Item>
      )}
      {value.type === 'wipe' && (
        <Form.Item label="Soft edge">
          <Switch checked={value.soft} onChange={(soft) => set({ soft })} />
        </Form.Item>
      )}

      {value.type === 'iris' && (
        <>
          <Form.Item label="Shape">
            <Segmented<'box' | 'circle'>
              block
              value={value.shape}
              options={[
                { value: 'box', label: 'Box' },
                { value: 'circle', label: 'Circle' },
              ]}
              onChange={(shape) => set({ shape })}
            />
          </Form.Item>
          <Form.Item label="Mode">
            <Segmented<'open' | 'close'>
              block
              value={value.mode}
              options={[
                { value: 'open', label: 'Open on the new scene' },
                { value: 'close', label: 'Close on the old scene' },
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Form.Item>
        </>
      )}

      {value.type === 'zoom' && (
        <>
          <Form.Item label="Mode">
            <Segmented<'in' | 'out'>
              block
              value={value.mode}
              options={[
                { value: 'in', label: 'New scene grows' },
                { value: 'out', label: 'Old scene shrinks away' },
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Form.Item>
          <Form.Item label="From / to">
            <Select<ZoomOrigin>
              value={value.origin}
              options={origins}
              onChange={(origin) => set({ origin })}
            />
          </Form.Item>
        </>
      )}

      {value.type === 'flip' && (
        <Form.Item label="Turns">
          <Segmented<'horizontal' | 'vertical'>
            block
            value={value.axis}
            options={[
              { value: 'horizontal', label: 'Top over bottom' },
              { value: 'vertical', label: 'Side to side' },
            ]}
            onChange={(axis) => set({ axis })}
          />
        </Form.Item>
      )}

      {value.type === 'tape-loader' && (
        <Form.Item label="Stripes">
          <Segmented<'spectrum' | 'c64'>
            block
            value={value.palette}
            options={[
              { value: 'spectrum', label: 'Spectrum' },
              { value: 'c64', label: 'C64' },
            ]}
            onChange={(palette) => set({ palette })}
          />
        </Form.Item>
      )}

      {value.type !== 'cut' && (
        <Form.Item
          label={`Length: ${value.length.toFixed(2)}s`}
          extra="Overlaps the scene before; at most half of either scene."
        >
          <Slider
            min={STEP * 3}
            max={MAX_TRANSITION_LENGTH}
            step={STEP}
            value={value.length}
            tooltip={{ formatter: (v) => `${(v ?? 0).toFixed(2)}s` }}
            onChange={(length) => set({ length: snap(length) })}
          />
        </Form.Item>
      )}
    </>
  )
}
