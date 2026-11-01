import { Form, InputNumber, Segmented, Select, Slider } from 'antd'
import type { Music, ProjectDoc, Splash } from '#/lib/project'
import { snap } from '#/composition/schedule'
import type { AssetRow } from '#/server/db/schema'
import { AssetSelect } from './AssetSelect'
import { sceneLabels } from './labels'
import type { UpdateDoc } from './useProjectDoc'

interface Props {
  doc: ProjectDoc
  assets: AssetRow[]
  update: UpdateDoc
}

const splashOptions: Array<{ value: Splash; label: string }> = [
  { value: 'none', label: 'None' },
  { value: '1985', label: '1985' },
  { value: '1989', label: '1989' },
]

export function MusicPanel({ doc, assets, update }: Props) {
  const { music } = doc
  const setMusic = (fields: Partial<Music>) =>
    update((d) => ({ ...d, music: { ...d.music, ...fields } }))
  const ready = assets.filter((a) => a.status === 'ready')

  const sourceValue =
    music.source.type === 'none'
      ? 'none'
      : `${music.source.type}:${music.source.assetId}`
  const sourceOptions = [
    { value: 'none', label: 'No music' },
    ...ready
      .filter((a) => a.kind === 'audio')
      .map((a) => ({ value: `upload:${a.id}`, label: a.originalName })),
    ...ready
      .filter((a) => a.kind === 'video' && a.metadata.hasAudio)
      .map((a) => ({
        value: `clip:${a.id}`,
        label: `${a.originalName} (clip audio)`,
      })),
  ]

  const jingleValue =
    doc.splashJingle.type === 'upload'
      ? doc.splashJingle.assetId
      : doc.splashJingle.type
  const jingleOptions = [
    {
      value: 'built-in',
      label:
        doc.splash === '1989'
          ? 'Built-in jingle'
          : 'Built-in (silent, like the original)',
    },
    { value: 'none', label: 'No sound' },
    ...ready
      .filter((a) => a.kind === 'audio')
      .map((a) => ({ value: a.id, label: a.originalName })),
  ]

  const startValue =
    music.startAt.type === 'scene' ? music.startAt.sceneId : 'first-gameplay'
  const startOptions = [
    { value: 'first-gameplay', label: 'First gameplay scene' },
    ...doc.scenes.map((s, i) => ({
      value: s.id,
      label: `Scene ${i + 1}: ${sceneLabels[s.type]}`,
    })),
  ]

  return (
    <Form layout="vertical">
      <Form.Item label="Splash intro">
        <Segmented
          options={splashOptions}
          value={doc.splash}
          onChange={(splash) => update((d) => ({ ...d, splash }))}
        />
      </Form.Item>
      {doc.splash !== 'none' && (
        <>
          <Form.Item
            label="Splash logo"
            extra="Shown instead of the built-in Bulletin 1000 lettering."
          >
            <AssetSelect
              assets={assets}
              kind="image"
              value={doc.splashLogoAssetId}
              placeholder="Built-in lettering"
              onChange={(splashLogoAssetId) =>
                update((d) => ({ ...d, splashLogoAssetId }))
              }
            />
          </Form.Item>
          <Form.Item label="Splash sound">
            <Select
              value={jingleValue}
              options={jingleOptions}
              onChange={(v: string) =>
                update((d) => ({
                  ...d,
                  splashJingle:
                    v === 'built-in' || v === 'none'
                      ? { type: v }
                      : { type: 'upload', assetId: v },
                }))
              }
            />
          </Form.Item>
        </>
      )}
      <Form.Item
        label="Music"
        extra="An uploaded audio file, or the soundtrack of one of your clips."
      >
        <Select
          value={sourceValue}
          options={sourceOptions}
          onChange={(v: string) => {
            const [type, assetId] = v.split(':')
            setMusic({
              source:
                type === 'upload' || type === 'clip'
                  ? { type, assetId }
                  : { type: 'none' },
            })
          }}
        />
      </Form.Item>
      {music.source.type !== 'none' && (
        <>
          <Form.Item label="Music starts at">
            <Select
              value={startValue}
              options={startOptions}
              onChange={(v: string) =>
                setMusic({
                  startAt:
                    v === 'first-gameplay'
                      ? { type: 'first-gameplay' }
                      : { type: 'scene', sceneId: v },
                })
              }
            />
          </Form.Item>
          <Form.Item
            label="Skip into the track"
            extra="Seconds of the track to skip before it starts playing."
          >
            <InputNumber
              min={0}
              step={0.5}
              suffix="s"
              value={music.sourceOffset}
              onChange={(v) => setMusic({ sourceOffset: snap(v ?? 0) })}
            />
          </Form.Item>
          <Form.Item label="Volume">
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={music.volume}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
              onChange={(volume) => setMusic({ volume })}
            />
          </Form.Item>
          <Form.Item
            label="Under clip audio"
            extra="Music level while a scene that keeps its clip audio plays."
          >
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={music.ducking.level}
              tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
              onChange={(level) =>
                setMusic({ ducking: { ...music.ducking, level } })
              }
            />
          </Form.Item>
          <Form.Item label="Fade down and up over">
            <InputNumber
              min={0}
              max={2}
              step={0.05}
              suffix="s"
              value={music.ducking.ramp}
              onChange={(ramp) =>
                setMusic({ ducking: { ...music.ducking, ramp: ramp ?? 0 } })
              }
            />
          </Form.Item>
        </>
      )}
    </Form>
  )
}
