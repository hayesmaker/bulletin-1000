import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Dropdown, Tag } from 'antd'
import { AudioOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons'
import { sceneLength, voiceLineStatus } from '#/lib/project'
import type {
  ProjectDoc,
  Scene,
  SceneType,
  VoiceLineStatus,
} from '#/lib/project'
import type { AssetRow } from '#/server/db/schema'
import { formatSeconds, sceneIcons, sceneLabels, thumbUrl } from './labels'

interface Props {
  doc: ProjectDoc
  assets: Map<string, AssetRow>
  // Each scene's length as scheduled.
  lengths: Map<string, number>
  selectedId: string | undefined
  onSelect: (sceneId: string) => void
  onMove: (from: number, to: number) => void
  onAdd: (type: SceneType) => void
}

const sceneTypes = Object.keys(sceneLabels) as SceneType[]

// The ordered scenes, after the splash. Drag a row by its handle to reorder.
export function SceneList({
  doc,
  assets,
  lengths,
  selectedId,
  onSelect,
  onMove,
  onAdd,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = doc.scenes.map((s) => s.id)
    onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-base font-semibold">Scenes</h2>
        <Dropdown
          trigger={['click']}
          menu={{
            items: sceneTypes.map((type) => ({
              key: type,
              icon: sceneIcons[type],
              label: sceneLabels[type],
            })),
            onClick: ({ key }) => onAdd(key as SceneType),
          }}
        >
          <Button icon={<PlusOutlined />}>Add scene</Button>
        </Dropdown>
      </div>
      {doc.splash !== 'none' && (
        <div className="flex items-center gap-3 rounded border border-dashed border-neutral-300 px-3 py-2 text-neutral-500">
          {doc.splash} splash intro
        </div>
      )}
      <DndContext
        // A fixed id keeps server and client markup the same.
        id="scene-list"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={doc.scenes.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {doc.scenes.map((scene, i) => (
            <SceneRow
              key={scene.id}
              index={i}
              scene={scene}
              thumb={thumbUrl(
                assets.get(
                  scene.type === 'packshot'
                    ? (doc.boxArtAssetId ?? '')
                    : ('assetId' in scene && scene.assetId) || '',
                ),
              )}
              voice={voiceLineStatus(doc, scene)}
              length={lengths.get(scene.id) ?? sceneLength(scene)}
              selected={scene.id === selectedId}
              onSelect={() => onSelect(scene.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {doc.scenes.length === 0 && (
        <p className="text-neutral-500">No scenes yet. Add one to start.</p>
      )}
    </div>
  )
}

function SceneRow({
  index,
  scene,
  thumb,
  voice,
  length,
  selected,
  onSelect,
}: {
  index: number
  scene: Scene
  thumb: string | undefined
  voice: VoiceLineStatus
  length: number
  selected: boolean
  onSelect: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id })
  const captions = 'captions' in scene ? scene.captions.length : 0

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={`flex cursor-pointer items-center gap-3 rounded border bg-white px-2 py-1.5 ${
        selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-neutral-200'
      } ${isDragging ? 'shadow-lg' : ''}`}
      onClick={onSelect}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab border-0 bg-transparent p-1 text-neutral-400"
        {...attributes}
        {...listeners}
      >
        <HolderOutlined />
      </button>
      <span className="w-5 text-right text-xs text-neutral-400">
        {index + 1}
      </span>
      <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-900 text-neutral-400">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          sceneIcons[scene.type]
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{sceneLabels[scene.type]}</div>
        <div className="text-xs text-neutral-500">
          {formatSeconds(length)}
          {captions > 0 && ` · ${captions} caption${captions > 1 ? 's' : ''}`}
          {scene.type === 'gameplay' && scene.keepClipAudio && ' · clip audio'}
        </div>
      </div>
      {voice === 'needs-generating' && (
        <Tag color="warning" icon={<AudioOutlined />}>
          Generate
        </Tag>
      )}
      {voice === 'ready' && (
        <AudioOutlined
          aria-label="Has a voice line"
          className="text-neutral-500"
        />
      )}
      {scene.transitionIn === 'dissolve' && <Tag>Dissolve</Tag>}
    </div>
  )
}
