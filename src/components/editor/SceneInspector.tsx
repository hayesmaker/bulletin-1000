import {
  Button,
  Form,
  InputNumber,
  Popconfirm,
  Segmented,
  Slider,
  Switch,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { DEFAULT_GAMEPLAY_LENGTH, sceneLength } from '#/lib/project'
import type { ProjectDoc, Scene, Transition } from '#/lib/project'
import { snap, snapDown } from '#/composition/schedule'
import { stage } from '#/composition/theme'
import type { AssetRow } from '#/server/db/schema'
import { AssetSelect } from './AssetSelect'
import { CaptionEditor } from './CaptionEditor'
import { ClipTrimmer } from './ClipTrimmer'
import { VoiceLineEditor } from './VoiceLineEditor'
import type { NarrationState } from './useNarration'
import { sceneIcons, sceneLabels } from './labels'

interface Props {
  doc: ProjectDoc
  narration: NarrationState
  // Whether this scene's voice line overlaps another.
  voiceOverlaps: boolean
  scene: Scene
  // The project's music level under clip audio, used unless the scene sets
  // its own.
  projectDuckLevel: number
  index: number
  assets: AssetRow[]
  onChange: (scene: Scene) => void
  onDelete: () => void
}

const MAX_CARD_DURATION = 30

// Settings for the selected scene.
export function SceneInspector({
  doc,
  narration,
  voiceOverlaps,
  scene,
  projectDuckLevel,
  index,
  assets,
  onChange,
  onDelete,
}: Props) {
  const asset =
    'assetId' in scene && scene.assetId
      ? assets.find((a) => a.id === scene.assetId && a.status === 'ready')
      : undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {sceneIcons[scene.type]}
        <h2 className="m-0 flex-1 text-base font-semibold">
          {index + 1}. {sceneLabels[scene.type]}
        </h2>
        <Popconfirm
          title="Delete this scene?"
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button type="text" danger icon={<DeleteOutlined />}>
            Delete
          </Button>
        </Popconfirm>
      </div>
      <Form layout="vertical">
        <Form.Item label="Transition in">
          <Segmented<Transition>
            value={scene.transitionIn}
            options={[
              { value: 'cut', label: 'Cut' },
              { value: 'dissolve', label: 'Dissolve' },
            ]}
            onChange={(transitionIn) => onChange({ ...scene, transitionIn })}
          />
        </Form.Item>

        {scene.type === 'packshot' && (
          <p className="text-neutral-500">
            Uses the box art, prices and colour from the Details tab.
          </p>
        )}

        {scene.type !== 'gameplay' && scene.type !== 'packshot' && (
          <Form.Item
            label={scene.type === 'publisher-logo' ? 'Logo image' : 'Image'}
            extra={
              scene.type === 'publisher-logo'
                ? 'Without a logo, the publisher name is shown.'
                : undefined
            }
          >
            <AssetSelect
              assets={assets}
              kind="image"
              value={scene.assetId}
              onChange={(assetId) => onChange({ ...scene, assetId })}
            />
          </Form.Item>
        )}

        {scene.type !== 'gameplay' && (
          <Form.Item label="Length">
            <InputNumber
              min={1 / stage.fps}
              max={MAX_CARD_DURATION}
              step={0.5}
              suffix="s"
              value={scene.duration}
              onChange={(v) =>
                v !== null && onChange({ ...scene, duration: snap(v) })
              }
            />
          </Form.Item>
        )}

        {scene.type === 'gameplay' && (
          <>
            <Form.Item label="Clip">
              <AssetSelect
                assets={assets}
                kind="video"
                value={scene.assetId}
                onChange={(assetId) => {
                  const clip = assets.find((a) => a.id === assetId)
                  const length = Math.min(
                    clip?.metadata.duration ?? DEFAULT_GAMEPLAY_LENGTH,
                    DEFAULT_GAMEPLAY_LENGTH,
                  )
                  onChange({
                    ...scene,
                    assetId,
                    trimIn: 0,
                    trimOut: snapDown(length),
                  })
                }}
              />
            </Form.Item>
            {asset && (
              <Form.Item label="Trim">
                <ClipTrimmer
                  key={asset.id}
                  asset={asset}
                  trimIn={scene.trimIn}
                  trimOut={scene.trimOut}
                  onChange={(trim) => onChange({ ...scene, ...trim })}
                />
              </Form.Item>
            )}
            <Form.Item
              label="Keep clip audio"
              extra={
                asset && !asset.metadata.hasAudio
                  ? 'This clip has no audio.'
                  : 'Plays the clip’s own sound over the music.'
              }
            >
              <Switch
                checked={scene.keepClipAudio}
                disabled={!asset?.metadata.hasAudio}
                onChange={(keepClipAudio) =>
                  onChange({ ...scene, keepClipAudio })
                }
              />
            </Form.Item>
            {scene.keepClipAudio && (
              <Form.Item
                label="Lower the music"
                extra="Drops the music under this clip’s sound."
              >
                <Switch
                  checked={scene.duckMusic}
                  onChange={(duckMusic) => onChange({ ...scene, duckMusic })}
                />
              </Form.Item>
            )}
            {scene.keepClipAudio && scene.duckMusic && (
              <Form.Item
                label="Music level under this clip"
                extra={
                  scene.duckLevel === null ? (
                    'The project setting, from the Audio tab.'
                  ) : (
                    <>
                      This scene’s own level.{' '}
                      <Button
                        type="link"
                        size="small"
                        className="p-0"
                        onClick={() => onChange({ ...scene, duckLevel: null })}
                      >
                        Use the project setting (
                        {Math.round(projectDuckLevel * 100)}%)
                      </Button>
                    </>
                  )
                }
              >
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={scene.duckLevel ?? projectDuckLevel}
                  tooltip={{
                    formatter: (v) => `${Math.round((v ?? 0) * 100)}%`,
                  }}
                  onChange={(duckLevel) => onChange({ ...scene, duckLevel })}
                />
              </Form.Item>
            )}
          </>
        )}

        {(scene.type === 'gameplay' || scene.type === 'screenshot') && (
          <Form.Item label="Captions">
            <CaptionEditor
              captions={scene.captions}
              length={sceneLength(scene)}
              onChange={(captions) => onChange({ ...scene, captions })}
            />
          </Form.Item>
        )}

        <Form.Item label="Voice line">
          <VoiceLineEditor
            doc={doc}
            scene={scene}
            overlaps={voiceOverlaps}
            narration={narration}
            onChange={(voiceLine) => onChange({ ...scene, voiceLine })}
          />
        </Form.Item>
      </Form>
    </div>
  )
}
