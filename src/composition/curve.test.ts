import { describe, expect, it } from 'vitest'
import { keyframeCurve } from './curve'

describe('keyframeCurve', () => {
  const curve = keyframeCurve([
    [0, -90],
    [0.5, 0],
    [1, 90],
    [2, 360],
  ])

  it('passes through every keyframe and holds outside them', () => {
    expect(curve(-1)).toBe(-90)
    expect(curve(0.5)).toBeCloseTo(0)
    expect(curve(1)).toBeCloseTo(90)
    expect(curve(3)).toBe(360)
  })

  it('never goes backwards between rising keyframes', () => {
    let last = -Infinity
    for (let t = 0; t <= 2; t += 0.01) {
      const v = curve(t)
      expect(v).toBeGreaterThanOrEqual(last - 1e-9)
      last = v
    }
  })

  it('eases into the last keyframe', () => {
    expect(curve(1.99) - curve(1.98)).toBeLessThan(curve(1.5) - curve(1.49))
  })
})
