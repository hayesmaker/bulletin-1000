import { useRef, useState } from 'react'
import { Alert, Button, Input, InputNumber, Select, Slider, Tag } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import {
  AudioOutlined,
  DeleteOutlined,
  DownOutlined,
  PauseOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { voiceClipUrl } from '#/lib/assets'
import {
  DEFAULT_PAUSE,
  DEFAULT_VOICE_LINE_OFFSET,
  DEFAULT_VOICE_SETTINGS,
  MAX_PAUSE,
  MAX_PAUSES,
  MAX_VOICE_LINE_LENGTH,
  pauseMarker,
  voiceLinePauses,
  voiceLineProblem,
  voiceLineStatus,
} from '#/lib/project'
import type { ProjectDoc, Scene, VoiceLine, VoiceSettings } from '#/lib/project'
import { VOICE_LINE_TAIL, snap } from '#/composition/schedule'
import { formatSeconds } from './labels'
import { voiceLabel } from './NarrationPanel'
import { PlayAudioButton } from './PlayAudioButton'
import type { NarrationState } from './useNarration'

interface Props {
  doc: ProjectDoc
  scene: Scene
  // Another line starts before this one ends, or this one starts before
  // an earlier one ends.
  overlaps: boolean
  narration: NarrationState
  onChange: (voiceLine: VoiceLine | null) => void
}

const sliders: Array<{
  key: keyof VoiceSettings
  label: string
  help: string
  min: number
  max: number
  format: (v: number) => string
}> = [
  {
    key: 'speed',
    label: 'Speed',
    help: 'Slower or faster delivery, pauses included.',
    min: 0.7,
    max: 1.2,
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'stability',
    label: 'Stability',
    help: 'Lower is more expressive; higher is steadier.',
    min: 0,
    max: 1,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'similarity',
    label: 'Similarity',
    help: 'How closely the read sticks to the original voice.',
    min: 0,
    max: 1,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'style',
    label: 'Style',
    help: 'Exaggerates the voice’s style. Slower to generate.',
    min: 0,
    max: 1,
    format: (v) => `${Math.round(v * 100)}%`,
  },
]

// The narration spoken over a scene.
export function VoiceLineEditor({
  doc,
  scene,
  overlaps,
  narration,
  onChange,
}: Props) {
  const line = scene.voiceLine
  const status = voiceLineStatus(doc, scene)
  const busy = narration.generating.has(scene.id)
  const setUp = Boolean(narration.status?.provider)
  const textRef = useRef<TextAreaRef>(null)
  const [showSettings, setShowSettings] = useState(false)

  if (!line) {
    return (
      <Button
        icon={<AudioOutlined />}
        block
        onClick={() =>
          onChange({
            text: '',
            offset: DEFAULT_VOICE_LINE_OFFSET,
            voiceId: null,
            settings: null,
            clip: null,
          })
        }
      >
        Add a voice line
      </Button>
    )
  }

  const clip = line.clip
  const problem = voiceLineProblem(line.text)
  const pauses = voiceLinePauses(line.text).length
  const custom = line.voiceId !== null || line.settings !== null
  const voiceId = line.voiceId ?? doc.narration.voiceId
  const projectVoice = narration.voices?.find(
    (v) => v.voiceId === doc.narration.voiceId,
  )
  const settings = line.settings ?? DEFAULT_VOICE_SETTINGS

  // Puts a pause marker at the cursor (or the end), spaced from its
  // neighbours, and puts the cursor after it.
  const addPause = () => {
    const el = textRef.current?.resizableTextArea?.textArea
    const at = el?.selectionStart ?? line.text.length
    const before = line.text.slice(0, at)
    const after = line.text.slice(el?.selectionEnd ?? at)
    const marker =
      (before && !/\s$/.test(before) ? ' ' : '') +
      pauseMarker(DEFAULT_PAUSE) +
      (/^\s/.test(after) ? '' : ' ')
    const text = before + marker + after
    if (text.length > MAX_VOICE_LINE_LENGTH) return
    onChange({ ...line, text })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + marker.length, at + marker.length)
    })
  }
  const stretchesTo =
    scene.type !== 'gameplay' && status === 'ready' && clip
      ? snap(line.offset + clip.duration + VOICE_LINE_TAIL)
      : 0

  const runsOver =
    scene.type === 'gameplay' && status === 'ready' && clip
      ? line.offset + clip.duration - (scene.trimOut - scene.trimIn)
      : 0

  return (
    <div className="flex flex-col gap-2">
      <Input.TextArea
        ref={textRef}
        aria-label="Voice line"
        value={line.text}
        autoSize={{ minRows: 2, maxRows: 6 }}
        maxLength={MAX_VOICE_LINE_LENGTH}
        showCount
        placeholder="What the narrator says over this scene"
        onChange={(e) => onChange({ ...line, text: e.target.value })}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="small"
          icon={<PauseOutlined />}
          disabled={pauses >= MAX_PAUSES}
          onClick={addPause}
        >
          Add pause
        </Button>
        <span className="flex-1" />
        {custom && !showSettings && <Tag className="m-0!">Custom</Tag>}
        <Button
          size="small"
          type="link"
          className="px-0!"
          aria-expanded={showSettings}
          icon={showSettings ? <DownOutlined /> : <RightOutlined />}
          onClick={() => setShowSettings((open) => !open)}
        >
          Voice settings
        </Button>
      </div>
      <div className="text-xs text-neutral-500">
        Pauses go at the cursor. Change the length in the text, e.g. [pause
        1.2s], up to {MAX_PAUSE}s; at most {MAX_PAUSES} a line.
      </div>
      {showSettings && (
        <div className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
          <div>
            <div className="mb-1 text-sm">Voice</div>
            <Select
              className="w-full"
              showSearch={{ optionFilterProp: 'label' }}
              loading={setUp && !narration.voices}
              value={line.voiceId ?? ''}
              options={[
                {
                  value: '',
                  label: `Project voice${projectVoice ? ` (${projectVoice.name})` : ''}`,
                },
                ...(narration.voices ?? []).map((v) => ({
                  value: v.voiceId,
                  label: voiceLabel(v),
                })),
              ]}
              onChange={(v: string) =>
                onChange({ ...line, voiceId: v || null })
              }
            />
          </div>
          {sliders.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{s.label}</span>
                <span className="text-xs text-neutral-500 tabular-nums">
                  {line.settings ? s.format(settings[s.key]) : 'Voice’s own'}
                </span>
              </div>
              <Slider
                className="my-1!"
                ariaLabelForHandle={s.label}
                min={s.min}
                max={s.max}
                step={0.05}
                value={settings[s.key]}
                tooltip={{ formatter: (v) => s.format(v ?? 0) }}
                onChange={(v) =>
                  onChange({ ...line, settings: { ...settings, [s.key]: v } })
                }
              />
              <div className="text-xs text-neutral-500">{s.help}</div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-neutral-500">
              {line.settings
                ? 'Moving any slider sets all four for this line.'
                : 'Until you move a slider, the voice’s own settings are used.'}
            </span>
            <Button
              size="small"
              disabled={!custom}
              onClick={() =>
                onChange({ ...line, voiceId: null, settings: null })
              }
            >
              Reset
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <InputNumber
          aria-label="Start after"
          prefix="Starts at"
          suffix="s"
          min={0}
          max={30}
          step={0.04}
          value={line.offset}
          onChange={(v) => onChange({ ...line, offset: snap(v ?? 0) })}
          style={{ width: 160 }}
        />
        <Button
          type={status === 'needs-generating' ? 'primary' : 'default'}
          loading={busy}
          disabled={!setUp || status === 'none' || !voiceId || !!problem}
          onClick={() => void narration.generate(doc, scene.id)}
        >
          {clip ? 'Regenerate' : 'Generate'}
        </Button>
        {status === 'ready' && clip && (
          <PlayAudioButton src={voiceClipUrl(clip.id)} label="the line" />
        )}
        <Button
          type="text"
          danger
          aria-label="Remove voice line"
          icon={<DeleteOutlined />}
          onClick={() => onChange(null)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        {status === 'ready' && clip && (
          <Tag color="success">{formatSeconds(clip.duration)} of speech</Tag>
        )}
        {status === 'needs-generating' && (
          <Tag color="warning">
            {clip ? 'Changed since generated' : 'Not generated yet'}
          </Tag>
        )}
        {scene.type !== 'gameplay' && stretchesTo > scene.duration && (
          <span>Lengthens this card to {formatSeconds(stretchesTo)}.</span>
        )}
        {runsOver > 0 && (
          <span>
            Runs {formatSeconds(runsOver)} past the end of the clip, over the
            next scene.
          </span>
        )}
      </div>
      {!setUp && narration.status && (
        <Alert
          type="info"
          showIcon
          title="Add ELEVENLABS_API_KEY to the server’s .env to generate voice lines."
        />
      )}
      {problem && <Alert type="error" showIcon title={problem} />}
      {setUp && !voiceId && (
        <Alert
          type="info"
          showIcon
          title="Choose a narration voice in the Audio tab."
        />
      )}
      {overlaps && (
        <Alert
          type="warning"
          showIcon
          title="This line overlaps another one. Shorten it, or start the next line later."
        />
      )}
    </div>
  )
}
