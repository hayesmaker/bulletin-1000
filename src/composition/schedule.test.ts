import { describe, expect, it } from 'vitest'
import { createProjectDoc } from '#/lib/project'
import type { ProjectDoc, Scene } from '#/lib/project'
import { buildSchedule, itemsAt, snapDown, toFrames } from './schedule'
import type { AssetInfo } from './schedule'

const clipId = crypto.randomUUID()
const silentClipId = crypto.randomUUID()
const tuneId = crypto.randomUUID()

const assets: AssetInfo[] = [
  { id: clipId, kind: 'video', duration: 20, hasAudio: true },
  { id: silentClipId, kind: 'video', duration: 20, hasAudio: false },
  { id: tuneId, kind: 'audio', duration: 60, hasAudio: true },
]

const card = (type: 'packshot', duration: number): Scene => ({
  id: crypto.randomUUID(),
  type,
  duration,
  transitionIn: 'cut',
})

const gameplay = (overrides: Partial<Scene> = {}): Scene =>
  ({
    id: crypto.randomUUID(),
    type: 'gameplay',
    assetId: clipId,
    trimIn: 2,
    trimOut: 8,
    keepClipAudio: false,
    captions: [],
    transitionIn: 'cut',
    ...overrides,
  }) as Scene

const doc = (overrides: Partial<ProjectDoc>): ProjectDoc => ({
  ...createProjectDoc('Gyroscope'),
  ...overrides,
})

describe('buildSchedule', () => {
  it('lays scenes end to end with hard cuts', () => {
    const s = buildSchedule(
      doc({ scenes: [card('packshot', 4), gameplay(), card('packshot', 3)] }),
      assets,
    )
    expect(s.items.map((i) => [i.start, i.end])).toEqual([
      [0, 4],
      [4, 10],
      [10, 13],
    ])
    expect(s.duration).toBe(13)
  })

  it('snaps a clip length down to a whole frame', () => {
    expect(snapDown(8.0133)).toBe(8)
    expect(snapDown(4.04)).toBe(4.04)
  })

  it('puts the splash first', () => {
    const s = buildSchedule(
      doc({ splash: '1989', scenes: [card('packshot', 4)] }),
      assets,
    )
    expect(s.items[0]).toMatchObject({ kind: 'splash', start: 0, end: 7 })
    expect(s.items[1]).toMatchObject({ start: 7, end: 11 })
  })

  it('overlaps dissolves and caps them at half a scene', () => {
    const s = buildSchedule(
      doc({
        scenes: [
          card('packshot', 4),
          gameplay({ transitionIn: 'dissolve' }),
          { ...card('packshot', 0.4), transitionIn: 'dissolve' },
        ],
      }),
      assets,
    )
    expect(s.items[1]).toMatchObject({ start: 3.52, end: 9.52, dissolve: 0.48 })
    expect(s.items[2]).toMatchObject({ start: 9.32, end: 9.72, dissolve: 0.2 })
    expect(itemsAt(s, 3.6).map((i) => i.id)).toEqual([
      s.items[0].id,
      s.items[1].id,
    ])
  })

  it('ignores a dissolve on the first item', () => {
    const s = buildSchedule(
      doc({ scenes: [gameplay({ transitionIn: 'dissolve' })] }),
      assets,
    )
    expect(s.items[0]).toMatchObject({ start: 0, dissolve: 0 })
  })

  it('snaps every time to whole frames', () => {
    const s = buildSchedule(
      doc({
        scenes: [
          card('packshot', 1.013),
          gameplay({ trimIn: 0.3, trimOut: 1.71 }),
        ],
      }),
      assets,
    )
    for (const item of s.items) {
      expect(toFrames(item.start) / 25).toBe(item.start)
      expect(toFrames(item.end) / 25).toBe(item.end)
    }
  })

  it('clamps gameplay to the clip length', () => {
    const s = buildSchedule(
      doc({ scenes: [gameplay({ trimIn: 15, trimOut: 30 })] }),
      assets,
    )
    expect(s.duration).toBe(5)
  })

  describe('music', () => {
    const scenes = [card('packshot', 4), gameplay(), card('packshot', 3)]

    it('starts with the first gameplay scene by default', () => {
      const s = buildSchedule(
        doc({
          scenes,
          music: {
            source: { type: 'upload', assetId: tuneId },
            sourceOffset: 5,
            startAt: { type: 'first-gameplay' },
            volume: 0.8,
          },
        }),
        assets,
      )
      expect(s.music).toEqual({
        assetId: tuneId,
        start: 4,
        end: 13,
        sourceOffset: 5,
        volume: 0.8,
        fadeOut: 1.5,
      })
    })

    it('can start at a chosen scene, and ends when the audio runs out', () => {
      const s = buildSchedule(
        doc({
          scenes,
          music: {
            source: { type: 'clip', assetId: clipId },
            sourceOffset: 12,
            startAt: { type: 'scene', sceneId: scenes[0].id },
            volume: 1,
          },
        }),
        assets,
      )
      expect(s.music).toMatchObject({ start: 0, end: 8 })
    })

    it('is null without a source or when the clip is silent', () => {
      expect(buildSchedule(doc({ scenes }), assets).music).toBeNull()
      const silent = buildSchedule(
        doc({
          scenes,
          music: {
            source: { type: 'clip', assetId: silentClipId },
            sourceOffset: 0,
            startAt: { type: 'first-gameplay' },
            volume: 1,
          },
        }),
        assets,
      )
      expect(silent.music).toBeNull()
    })
  })

  it('cues clip audio only for scenes that keep it and have it', () => {
    const keep = gameplay({ keepClipAudio: true })
    const s = buildSchedule(
      doc({
        scenes: [
          gameplay(),
          keep,
          gameplay({ keepClipAudio: true, assetId: silentClipId }),
        ],
      }),
      assets,
    )
    expect(s.clipAudio).toEqual([
      { sceneId: keep.id, assetId: clipId, start: 6, end: 12 },
    ])
  })
})
