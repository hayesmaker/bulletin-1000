import { Alert, Button, Form, Select, Slider, Switch } from 'antd'
import { scenesNeedingVoice } from '#/lib/project'
import type { Narration, ProjectDoc } from '#/lib/project'
import type { Voice } from '#/server/tts.server'
import type { NarrationState } from './useNarration'
import { PlayAudioButton } from './PlayAudioButton'
import type { UpdateDoc } from './useProjectDoc'

interface Props {
  doc: ProjectDoc
  update: UpdateDoc
  narration: NarrationState
}

export const voiceLabel = (v: Voice) =>
  [v.name, [v.accent, v.gender].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ')

// Project-wide narration settings: the voice, its level, and generating
// every line at once.
export function NarrationPanel({ doc, update, narration }: Props) {
  const { status, voices, voicesError, generating } = narration
  const setNarration = (fields: Partial<Narration>) =>
    update((d) => ({ ...d, narration: { ...d.narration, ...fields } }))

  if (!status) return null
  if (!status.provider) {
    return (
      <Alert
        type="info"
        showIcon
        title="Narration is off"
        description="Add ELEVENLABS_API_KEY to the server’s .env (see .env.example) and restart it to give scenes spoken voice lines."
      />
    )
  }

  const stale = scenesNeedingVoice(doc)
  const characters = stale.reduce(
    (n, s) => n + (s.voiceLine?.text.trim().length ?? 0),
    0,
  )
  const chosen = voices?.find((v) => v.voiceId === doc.narration.voiceId)

  return (
    <Form layout="vertical">
      {status.provider === 'stand-in' && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          title="Using the stand-in voice (TTS_FAKE): tones, not speech."
        />
      )}
      {voicesError && (
        <Alert className="mb-4" type="error" showIcon title={voicesError} />
      )}
      <Form.Item
        label="Voice"
        extra="Changing it means generating the lines that use it again. A line can have its own voice (Voice settings, under its text)."
      >
        <div className="flex gap-2">
          <Select
            className="min-w-0 flex-1"
            showSearch={{ optionFilterProp: 'label' }}
            loading={!voices && !voicesError}
            placeholder="Choose a voice"
            value={doc.narration.voiceId ?? undefined}
            options={(voices ?? []).map((v) => ({
              value: v.voiceId,
              label: voiceLabel(v),
            }))}
            onChange={(voiceId: string) => setNarration({ voiceId })}
          />
          {chosen?.previewUrl && (
            <PlayAudioButton src={chosen.previewUrl} label="a sample" />
          )}
        </div>
      </Form.Item>
      <Form.Item label="Narration volume">
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={doc.narration.volume}
          tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
          onChange={(volume) => setNarration({ volume })}
        />
      </Form.Item>
      <Form.Item
        label="Lower the music under narration"
        extra="To the “Under clip audio” level above."
      >
        <Switch
          checked={doc.narration.duckMusic}
          onChange={(duckMusic) => setNarration({ duckMusic })}
        />
      </Form.Item>
      <Form.Item
        extra={`${status.usedToday.toLocaleString()} of ${status.dailyLimit.toLocaleString()} characters generated in the last 24 hours. Unchanged lines are reused for free.`}
      >
        <Button
          block
          type={stale.length > 0 ? 'primary' : 'default'}
          disabled={stale.length === 0 || !doc.narration.voiceId}
          loading={generating.size > 0}
          onClick={() => void narration.generateAll(doc)}
        >
          {stale.length === 0
            ? 'All voice lines are up to date'
            : `Generate ${stale.length} voice ${stale.length === 1 ? 'line' : 'lines'} (${characters.toLocaleString()} characters)`}
        </Button>
      </Form.Item>
    </Form>
  )
}
