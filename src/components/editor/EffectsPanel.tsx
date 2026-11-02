import { Button, Divider, Form, Slider } from 'antd'
import { effectPresets } from '#/composition/theme'
import type { Effect, Effects, ProjectDoc } from '#/lib/project'
import type { UpdateDoc } from './useProjectDoc'

interface Props {
  doc: ProjectDoc
  update: UpdateDoc
}

const tape: Array<{ key: Effect; label: string }> = [
  { key: 'softness', label: 'Softness' },
  { key: 'colourBleed', label: 'Colour bleed' },
  { key: 'grain', label: 'Grain' },
  { key: 'tracking', label: 'Tracking wobble and noise' },
]

const screen: Array<{ key: Effect; label: string }> = [
  { key: 'scanlines', label: 'Scanlines' },
  { key: 'curvature', label: 'Curvature' },
  { key: 'vignette', label: 'Vignette' },
]

const same = (a: Effects, b: Effects) =>
  (Object.keys(a) as Effect[]).every((k) => a[k] === b[k])

// Filter effects over the whole video: presets, then each effect's amount.
export function EffectsPanel({ doc, update }: Props) {
  const setEffect = (key: Effect, value: number) =>
    update((d) => ({ ...d, effects: { ...d.effects, [key]: value } }))

  const sliders = (items: typeof tape) =>
    items.map(({ key, label }) => (
      <Form.Item key={key} label={label} className="mb-2!">
        <Slider
          ariaLabelForHandle={label}
          min={0}
          max={1}
          step={0.05}
          value={doc.effects[key]}
          tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
          onChange={(v) => setEffect(key, v)}
        />
      </Form.Item>
    ))

  return (
    <Form layout="vertical">
      <Form.Item
        label="Look"
        extra="A starting point. Adjust each effect below."
      >
        <div className="flex flex-wrap gap-2">
          {effectPresets.map((preset) => (
            <Button
              key={preset.name}
              size="small"
              type={same(preset.effects, doc.effects) ? 'primary' : 'default'}
              onClick={() =>
                update((d) => ({ ...d, effects: { ...preset.effects } }))
              }
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </Form.Item>
      <Divider titlePlacement="start">VHS tape</Divider>
      {sliders(tape)}
      <Divider titlePlacement="start">CRT screen</Divider>
      {sliders(screen)}
    </Form>
  )
}
