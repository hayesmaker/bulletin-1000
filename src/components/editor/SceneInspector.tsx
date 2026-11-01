import { Button, Form, InputNumber, Popconfirm, Segmented, Switch } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { DEFAULT_GAMEPLAY_LENGTH, sceneLength } from '#/lib/project'
import type { Scene, Transition } from '#/lib/project'
import { snap, snapDown } from '#/composition/schedule'
import { stage } from '#/composition/theme'
import type { AssetRow } from '#/server/db/schema'
import { AssetSelect } from './AssetSelect'
import { CaptionEditor } from './CaptionEditor'
import { ClipTrimmer } from './ClipTrimmer'
import { sceneIcons, sceneLabels } from './labels'

interface Props {
  scene: Scene
  index: number
  assets: AssetRow[]
  onChange: (scene: Scene) => void
  onDelete: () => void
}

const MAX_CARD_DURATION = 30

// Settings for the selected scene.
export function SceneInspector({
  scene,
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
      </Form>
    </div>
  )
}
