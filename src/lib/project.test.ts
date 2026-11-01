import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DUCKING,
  assetIdsInDoc,
  createProjectDoc,
  moveScene,
  newScene,
  projectDocSchema,
  removeAssetReferences,
  removeScene,
} from './project'
import type { ProjectDoc, SceneType } from './project'

const uuid = () => crypto.randomUUID()

describe('projectDocSchema', () => {
  it('accepts a new project doc', () => {
    expect(projectDocSchema.safeParse(createProjectDoc()).success).toBe(true)
  })

  it('accepts a full promo with every scene type', () => {
    const doc = {
      ...createProjectDoc('Gyroscope'),
      publisher: 'Melbourne House',
      prices: [{ platform: 'Spectrum', price: '£7.95' }],
      splash: '1985',
      music: {
        source: { type: 'clip', assetId: uuid() },
        startAt: { type: 'first-gameplay' },
      },
      scenes: [
        { id: uuid(), type: 'publisher-logo', assetId: uuid(), duration: 3 },
        { id: uuid(), type: 'packshot', duration: 4 },
        { id: uuid(), type: 'title-screen', assetId: null, duration: 3 },
        {
          id: uuid(),
          type: 'gameplay',
          assetId: uuid(),
          trimIn: 2,
          trimOut: 12.5,
          transitionIn: 'dissolve',
          captions: [{ id: uuid(), text: '64 levels', start: 1, end: 4 }],
        },
        { id: uuid(), type: 'screenshot', assetId: uuid(), duration: 2 },
      ],
    }
    const parsed = projectDocSchema.parse(doc)
    expect(parsed.music.sourceOffset).toBe(0)
    expect(parsed.music.volume).toBe(1)
    const gameplay = parsed.scenes[3]
    expect(gameplay.type === 'gameplay' && gameplay.keepClipAudio).toBe(false)
    expect(parsed.scenes[0].transitionIn).toBe('cut')
  })

  it('rejects an out point before the in point', () => {
    const doc = {
      ...createProjectDoc(),
      scenes: [
        { id: uuid(), type: 'gameplay', assetId: null, trimIn: 5, trimOut: 2 },
      ],
    }
    expect(projectDocSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects a caption that ends before it starts', () => {
    const doc = {
      ...createProjectDoc(),
      scenes: [
        {
          id: uuid(),
          type: 'screenshot',
          assetId: null,
          duration: 3,
          captions: [{ id: uuid(), text: 'x', start: 2, end: 1 }],
        },
      ],
    }
    expect(projectDocSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects an invalid packshot colour and unknown splash', () => {
    const base = createProjectDoc()
    expect(
      projectDocSchema.safeParse({ ...base, packshotColour: 'blue' }).success,
    ).toBe(false)
    expect(
      projectDocSchema.safeParse({ ...base, splash: '1990' }).success,
    ).toBe(false)
  })
})

describe('editing helpers', () => {
  const types: SceneType[] = [
    'publisher-logo',
    'packshot',
    'title-screen',
    'screenshot',
    'gameplay',
  ]

  it('makes a valid new scene of every type', () => {
    const doc = { ...createProjectDoc(), scenes: types.map((t) => newScene(t)) }
    expect(projectDocSchema.safeParse(doc).success).toBe(true)
  })

  it('trims a new gameplay scene to the clip, up to the default length', () => {
    const short = newScene('gameplay', { id: uuid(), duration: 4.2 })
    const long = newScene('gameplay', { id: uuid(), duration: 90 })
    expect(short.type === 'gameplay' && short.trimOut).toBe(4.2)
    expect(long.type === 'gameplay' && long.trimOut).toBe(10)
  })

  it('moves a scene', () => {
    const doc = { ...createProjectDoc(), scenes: types.map((t) => newScene(t)) }
    const moved = moveScene(doc, 4, 1)
    expect(moved.scenes.map((s) => s.type)).toEqual([
      'publisher-logo',
      'gameplay',
      'packshot',
      'title-screen',
      'screenshot',
    ])
    expect(doc.scenes[4].type).toBe('gameplay')
  })

  it('removes a scene and resets a music start that pointed at it', () => {
    const gameplay = newScene('gameplay')
    const doc: ProjectDoc = {
      ...createProjectDoc(),
      scenes: [newScene('packshot'), gameplay],
    }
    doc.music = {
      ...doc.music,
      startAt: { type: 'scene', sceneId: gameplay.id },
    }
    const removed = removeScene(doc, gameplay.id)
    expect(removed.scenes).toHaveLength(1)
    expect(removed.music.startAt).toEqual({ type: 'first-gameplay' })
  })

  it('lists and removes asset references', () => {
    const [box, clip, other] = [uuid(), uuid(), uuid()]
    const doc: ProjectDoc = {
      ...createProjectDoc(),
      boxArtAssetId: box,
      music: {
        source: { type: 'clip', assetId: clip },
        sourceOffset: 0,
        startAt: { type: 'first-gameplay' },
        volume: 1,
        ducking: DEFAULT_DUCKING,
      },
      scenes: [
        newScene('gameplay', { id: clip }),
        newScene('screenshot', { id: other }),
        newScene('packshot'),
      ],
    }
    expect(assetIdsInDoc(doc)).toEqual(new Set([box, clip, other]))

    const cleaned = removeAssetReferences(doc, clip)
    expect(cleaned.music.source).toEqual({ type: 'none' })
    expect(cleaned.scenes).toHaveLength(3)
    expect(assetIdsInDoc(cleaned)).toEqual(new Set([box, other]))
    expect(removeAssetReferences(cleaned, box).boxArtAssetId).toBeNull()
  })
})
