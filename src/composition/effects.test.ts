import { describe, expect, it } from 'vitest'
import { NO_EFFECTS, effectsSchema } from '#/lib/project'
import { frameRandom, hasEffects } from './effects'
import { effectPresets } from './theme'

describe('frameRandom', () => {
  it('is the same for the same frame and salt', () => {
    expect(frameRandom(123, 4)).toBe(frameRandom(123, 4))
  })

  it('stays in [0, 1) and varies by frame and salt', () => {
    const values = new Set<number>()
    for (let frame = 0; frame < 500; frame++) {
      for (const salt of [1, 2, 3]) {
        const v = frameRandom(frame, salt)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
        values.add(v)
      }
    }
    expect(values.size).toBe(1500)
  })

  it('spreads evenly', () => {
    const n = 10_000
    let sum = 0
    for (let i = 0; i < n; i++) sum += frameRandom(i, 7)
    expect(sum / n).toBeCloseTo(0.5, 1)
  })
})

describe('effects', () => {
  it('knows when no effect is on', () => {
    expect(hasEffects(NO_EFFECTS)).toBe(false)
    expect(hasEffects({ ...NO_EFFECTS, grain: 0.1 })).toBe(true)
  })

  it('has valid presets, starting with Clean', () => {
    expect(effectPresets[0].effects).toEqual(NO_EFFECTS)
    for (const p of effectPresets) {
      expect(effectsSchema.safeParse(p.effects).success).toBe(true)
    }
  })
})
