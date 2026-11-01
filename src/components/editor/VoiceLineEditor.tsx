import { Alert, Button, Input, InputNumber, Tag } from 'antd'
import { AudioOutlined, DeleteOutlined } from '@ant-design/icons'
import { voiceClipUrl } from '#/lib/assets'
import {
  DEFAULT_VOICE_LINE_OFFSET,
  MAX_VOICE_LINE_LENGTH,
  voiceLineStatus,
} from '#/lib/project'
import type { ProjectDoc, Scene, VoiceLine } from '#/lib/project'
import { VOICE_LINE_TAIL, snap } from '#/composition/schedule'
import { formatSeconds } from './labels'
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

  if (!line) {
    return (
      <Button
        icon={<AudioOutlined />}
        block
        onClick={() =>
          onChange({ text: '', offset: DEFAULT_VOICE_LINE_OFFSET, clip: null })
        }
      >
        Add a voice line
      </Button>
    )
  }

  const clip = line.clip
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
        aria-label="Voice line"
        value={line.text}
        autoSize={{ minRows: 2, maxRows: 6 }}
        maxLength={MAX_VOICE_LINE_LENGTH}
        showCount
        placeholder="What the narrator says over this scene"
        onChange={(e) => onChange({ ...line, text: e.target.value })}
      />
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
          disabled={!setUp || status === 'none' || !doc.narration.voiceId}
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
      {setUp && !doc.narration.voiceId && (
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
