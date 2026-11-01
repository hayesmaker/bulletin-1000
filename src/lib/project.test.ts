import { describe, expect, it } from 'vitest'
import { createProjectDoc, projectDocSchema } from './project'

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
