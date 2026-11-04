import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  App,
  Button,
  Card,
  Divider,
  Drawer,
  Space,
  Tabs,
  Tag,
  Tooltip,
} from 'antd'
import {
  ArrowLeftOutlined,
  ExportOutlined,
  EyeOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import compositionCss from '#/composition/composition.css?url'
import { toCompositionAssets } from '#/composition/assets'
import {
  buildSchedule,
  narrationOverlaps,
  snapDown,
} from '#/composition/schedule'
import { CompositionPlayer } from '#/components/CompositionPlayer'
import type { SceneSeek } from '#/components/CompositionPlayer'
import { AssetBin } from '#/components/editor/AssetBin'
import type { AssetUse } from '#/components/editor/AssetBin'
import { DetailsForm } from '#/components/editor/DetailsForm'
import { EffectsPanel } from '#/components/editor/EffectsPanel'
import { ExportPanel } from '#/components/editor/ExportPanel'
import { MusicPanel } from '#/components/editor/MusicPanel'
import { NarrationPanel } from '#/components/editor/NarrationPanel'
import { EndingPanel } from '#/components/editor/EndingPanel'
import { SceneInspector } from '#/components/editor/SceneInspector'
import { SceneList } from '#/components/editor/SceneList'
import { useAssets } from '#/components/editor/useAssets'
import { useNarration } from '#/components/editor/useNarration'
import { useDebounced, useProjectDoc } from '#/components/editor/useProjectDoc'
import type { SaveStatus } from '#/components/editor/useProjectDoc'
import {
  moveScene,
  newScene,
  removeAssetReferences,
  removeScene,
  scenesNeedingVoice,
} from '#/lib/project'
import type { ProjectDoc, SceneType } from '#/lib/project'
import { deleteAsset, getAssets } from '#/server/assets.functions'
import { getProject } from '#/server/projects.functions'
import type { AssetRow } from '#/server/db/schema'

export const Route = createFileRoute('/projects/$projectId/')({
  loader: async ({ params }) => {
    const [project, assets] = await Promise.all([
      getProject({ data: { id: params.projectId } }),
      getAssets({ data: { projectId: params.projectId } }),
    ])
    return { project, assets }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.project.title ?? 'Editor'} – Bulletin 1000` },
    ],
    links: [{ rel: 'stylesheet', href: compositionCss }],
  }),
  component: Editor,
})

const PREVIEW_DELAY = 300

const statusTags: Record<SaveStatus, { color: string; label: string }> = {
  saved: { color: 'success', label: 'Saved' },
  pending: { color: 'default', label: 'Unsaved changes' },
  saving: { color: 'processing', label: 'Saving…' },
  invalid: { color: 'warning', label: 'Not saved: fix errors' },
  error: { color: 'error', label: 'Save failed' },
}

function Editor() {
  const { project, assets: initialAssets } = Route.useLoaderData()
  const { message } = App.useApp()
  const {
    doc,
    update,
    rewriteHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    status,
    error,
  } = useProjectDoc(project.id, project.doc)
  const { assets, added, removed } = useAssets(project.id, initialAssets)
  const narration = useNarration(update)
  const [selectedId, setSelectedId] = useState<string | undefined>(
    doc.scenes[0]?.id,
  )
  const [seekTo, setSeekTo] = useState<SceneSeek>()
  // Selecting a scene also shows its start in the preview.
  const selectScene = (sceneId: string) => {
    setSelectedId(sceneId)
    setSeekTo({ sceneId })
  }
  const [exportOpen, setExportOpen] = useState(false)

  const assetMap = useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets],
  )
  // Rebuild the preview only when the set of ready assets changes, not on
  // every poll.
  const readyKey = assets
    .filter((a) => a.status === 'ready')
    .map((a) => a.id)
    .join()
  const compositionAssets = useMemo(
    () => toCompositionAssets(assets),
    [readyKey],
  )
  const previewDoc = useDebounced(doc, PREVIEW_DELAY)
  const schedule = useMemo(
    () => buildSchedule(doc, compositionAssets),
    [doc, compositionAssets],
  )
  // Scene lengths as played (cards stretch to fit their voice lines).
  const sceneLengths = useMemo(
    () => new Map(schedule.items.map((i) => [i.id, i.end - i.start])),
    [schedule],
  )
  // Scenes whose voice lines overlap another line.
  const overlapping = useMemo(
    () =>
      new Set(
        narrationOverlaps(schedule).flatMap((pair) => [
          pair.first,
          pair.second,
        ]),
      ),
    [schedule],
  )

  const selectedIndex = doc.scenes.findIndex((s) => s.id === selectedId)
  const selected = doc.scenes[selectedIndex] as
    (typeof doc.scenes)[number] | undefined

  const addScene = (type: SceneType, asset?: AssetRow) => {
    const scene = newScene(
      type,
      asset && {
        id: asset.id,
        duration:
          asset.metadata.duration === undefined
            ? undefined
            : snapDown(asset.metadata.duration),
      },
    )
    // New scenes go before a closing packshot, if there is one.
    update((d) => {
      const last = d.scenes.at(-1)
      const at =
        last?.type === 'packshot' && d.scenes.length > 1
          ? d.scenes.length - 1
          : d.scenes.length
      const scenes = [...d.scenes]
      scenes.splice(at, 0, scene)
      return { ...d, scenes }
    })
    selectScene(scene.id)
  }

  const applyAsset = (use: AssetUse, asset: AssetRow) => {
    const changes: Record<AssetUse, (d: ProjectDoc) => ProjectDoc> = {
      'box-art': (d) => ({ ...d, boxArtAssetId: asset.id }),
      music: (d) => ({
        ...d,
        music: {
          ...d.music,
          source: {
            type: asset.kind === 'audio' ? 'upload' : 'clip',
            assetId: asset.id,
          },
        },
      }),
      'splash-logo': (d) => ({ ...d, splashLogoAssetId: asset.id }),
      'splash-jingle': (d) => ({
        ...d,
        splashJingle: { type: 'upload', assetId: asset.id },
      }),
    }
    const messages: Record<AssetUse, string> = {
      'box-art': 'Box art set',
      music: `Music set to ${asset.originalName}`,
      'splash-logo': 'Splash logo set',
      'splash-jingle': `Splash sound set to ${asset.originalName}`,
    }
    update(changes[use])
    void message.success(messages[use])
  }

  const removeAsset = async (asset: AssetRow) => {
    // Throughout the history, so undo can't bring back a deleted asset.
    rewriteHistory((d) => removeAssetReferences(d, asset.id))
    try {
      await deleteAsset({ data: { id: asset.id } })
      removed(asset.id)
    } catch {
      void message.error(`Couldn’t delete ${asset.originalName}`)
    }
  }

  const tag = statusTags[status]

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-6 py-3">
        <Link to="/" className="text-neutral-500" aria-label="All projects">
          <ArrowLeftOutlined />
        </Link>
        <h1 className="m-0 flex-1 truncate text-lg font-semibold">
          {doc.title || 'Untitled game'}
        </h1>
        <Space.Compact>
          <Tooltip title="Undo (Ctrl+Z)">
            <Button
              icon={<UndoOutlined />}
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
            />
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <Button
              icon={<RedoOutlined />}
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
            />
          </Tooltip>
        </Space.Compact>
        <Tooltip title={error}>
          <Tag color={tag.color}>{tag.label}</Tag>
        </Tooltip>
        <Link
          to="/projects/$projectId/preview"
          params={{ projectId: project.id }}
          target="_blank"
        >
          <EyeOutlined /> Full preview
        </Link>
        <Button
          type="primary"
          icon={<ExportOutlined />}
          onClick={() => setExportOpen(true)}
        >
          Export
        </Button>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <Card size="small" className="self-start">
          <Tabs
            items={[
              {
                key: 'details',
                label: 'Details',
                children: (
                  <DetailsForm doc={doc} assets={assets} update={update} />
                ),
              },
              {
                key: 'assets',
                label: `Assets (${assets.length})`,
                children: (
                  <AssetBin
                    projectId={project.id}
                    assets={assets}
                    onUploaded={added}
                    onAddScene={addScene}
                    onUse={applyAsset}
                    onDelete={(asset) => void removeAsset(asset)}
                  />
                ),
              },
              {
                key: 'audio',
                label: 'Audio',
                children: (
                  <>
                    <MusicPanel doc={doc} assets={assets} update={update} />
                    <Divider titlePlacement="start">Narration</Divider>
                    <NarrationPanel
                      doc={doc}
                      update={update}
                      narration={narration}
                    />
                  </>
                ),
              },
              {
                key: 'effects',
                label: 'Effects',
                children: (
                  <>
                    <EffectsPanel doc={doc} update={update} />
                    <Divider titlePlacement="start">Ending</Divider>
                    <EndingPanel doc={doc} update={update} />
                  </>
                ),
              },
            ]}
          />
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card size="small">
            <CompositionPlayer
              doc={previewDoc}
              assets={compositionAssets}
              seekTo={seekTo}
            />
          </Card>
          <Card size="small">
            <SceneList
              doc={doc}
              assets={assetMap}
              lengths={sceneLengths}
              selectedId={selectedId}
              onSelect={selectScene}
              onMove={(from, to) => update((d) => moveScene(d, from, to))}
              onAdd={(type) => addScene(type)}
            />
          </Card>
        </div>

        <Card size="small" className="self-start lg:col-span-2 xl:col-span-1">
          {selected ? (
            <SceneInspector
              key={selected.id}
              scene={selected}
              doc={doc}
              narration={narration}
              voiceOverlaps={overlapping.has(selected.id)}
              projectDuckLevel={doc.music.ducking.level}
              index={selectedIndex}
              assets={assets}
              onPreviewTransition={() =>
                setSeekTo({ sceneId: selected.id, transition: true })
              }
              onChange={(scene) =>
                update((d) => ({
                  ...d,
                  scenes: d.scenes.map((s) => (s.id === scene.id ? scene : s)),
                }))
              }
              onDelete={() => {
                update((d) => removeScene(d, selected.id))
                const next =
                  doc.scenes[selectedIndex + 1]?.id ??
                  doc.scenes[selectedIndex - 1]?.id
                if (next) selectScene(next)
                else setSelectedId(undefined)
              }}
            />
          ) : (
            <p className="m-0 text-neutral-500">Select a scene to edit it.</p>
          )}
        </Card>
      </main>

      <Drawer
        title="Export"
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        size="large"
        destroyOnHidden
      >
        <ExportPanel
          projectId={project.id}
          aspectRatio={doc.aspectRatio}
          saved={status === 'saved'}
          voiceLinesToGenerate={scenesNeedingVoice(doc).length}
          generatingVoice={narration.generating.size > 0}
          onGenerateVoice={() => void narration.generateAll(doc)}
        />
      </Drawer>
    </div>
  )
}
