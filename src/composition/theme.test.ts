import { describe, expect, it } from 'vitest'
import { formats, splashFrame } from './theme'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const inside = (r: Rect, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h

describe.each(Object.entries(formats))('%s format', (_, format) => {
  const { width, height, layout } = format

  it('fits its layout on the stage', () => {
    expect(inside(layout.inset, width, height)).toBe(true)
    expect(inside(layout.packshot.boxArt, width, height)).toBe(true)
    expect(inside(layout.packshot.prices, width, height)).toBe(true)
    expect(layout.publisherLogo.maxWidth).toBeLessThanOrEqual(width)
    expect(layout.publisherLogo.maxHeight).toBeLessThanOrEqual(height)
    expect(layout.caption.y).toBeGreaterThan(
      layout.inset.y + layout.inset.height,
    )
    expect(layout.caption.y).toBeLessThan(height)
  })

  it('keeps the game screen 4:3', () => {
    expect(layout.inset.width / layout.inset.height).toBeCloseTo(4 / 3)
  })

  it('centres the splash artwork on the stage', () => {
    const { x, y, scale } = format.splash
    expect(x * 2 + splashFrame.width * scale).toBeCloseTo(width)
    expect(y * 2 + splashFrame.height * scale).toBeCloseTo(height)
  })

  it('uses even dimensions for H.264', () => {
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
  })
})
