import { ColorPicker, Form, Segmented, Slider } from 'antd'
import { snap } from '#/composition/schedule'
import { fps } from '#/composition/theme'
import { MAX_TRANSITION_LENGTH } from '#/lib/project'
import type { Ending, ProjectDoc } from '#/lib/project'
import type { UpdateDoc } from './useProjectDoc'

interface Props {
  doc: ProjectDoc
  update: UpdateDoc
}

const DEFAULT_FADE: Ending = { type: 'fade', length: 1, colour: '#000000' }

// How the video ends: a cut, or a fade to a colour.
export function EndingPanel({ doc, update }: Props) {
  const ending = doc.ending
  const set = (next: Ending, merge?: string) =>
    update((d) => ({ ...d, ending: next }), { merge })

  return (
    <Form layout="vertical">
      <Form.Item
        label="End of the video"
        extra="The originals sometimes end by cutting or fading to a solid colour."
      >
        <Segmented
          block
          value={ending.type}
          options={[
            { value: 'cut', label: 'Cut' },
            { value: 'fade', label: 'Fade to colour' },
          ]}
          onChange={(type) =>
            set(type === 'cut' ? { type: 'cut' } : DEFAULT_FADE)
          }
        />
      </Form.Item>
      {ending.type === 'fade' && (
        <>
          <Form.Item label="Colour">
            <ColorPicker
              disabledAlpha
              showText
              value={ending.colour}
              presets={[
                {
                  label: 'Suggested',
                  colors: ['#000000', '#ffffff', doc.packshotColour],
                },
              ]}
              onChange={(c) =>
                set({ ...ending, colour: c.toHexString() }, 'ending-colour')
              }
            />
          </Form.Item>
          <Form.Item label={`Fade length: ${ending.length.toFixed(2)}s`}>
            <Slider
              min={3 / fps}
              max={MAX_TRANSITION_LENGTH}
              step={1 / fps}
              value={ending.length}
              tooltip={{ formatter: (v) => `${(v ?? 0).toFixed(2)}s` }}
              onChange={(length) =>
                set({ ...ending, length: snap(length) }, 'ending-length')
              }
            />
          </Form.Item>
        </>
      )}
    </Form>
  )
}
