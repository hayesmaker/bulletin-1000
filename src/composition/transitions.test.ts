import { describe, expect, it } from 'vitest'
import { newTransition } from '#/lib/project'
import type { TransitionType } from '#/lib/project'
import {
  endingFrame,
  spectrumCellsLeftPath,
  spectrumLinesPath,
  spectrumLoadOrder,
  transitionFrame,
} from './transitions'

const size = { width: 1440, height: 1080 }

describe('spectrum screen load', () => {
  it('draws lines in the Spectrum’s interleaved order', () => {
    // Each third: the top pixel row of its 8 character rows, then the next.
    expect(spectrumLoadOrder.slice(0, 9)).toEqual([
      0, 8, 16, 24, 32, 40, 48, 56, 1,
    ])
    expect(spectrumLoadOrder[64]).toBe(64)
    expect(new Set(spectrumLoadOrder).size).toBe(192)
  })

  it('shows the loaded lines and the cells still to colour', () => {
    expect(spectrumLinesPath(0, size)).toBe('inset(50%)')
    // The first line loaded is the top one; the second is 8 lines down.
    expect(spectrumLinesPath(2, size)).toBe(
      "path('M0 0H1440V5.625H0ZM0 45H1440V50.625H0Z')",
    )
    expect(spectrumLinesPath(192, size)).toBe("path('M0 0H1440V1080H0Z')")
    expect(spectrumCellsLeftPath(768, size)).toBe('inset(50%)')
    expect(spectrumCellsLeftPath(33, size)).toBe(
      "path('M45 45H1440V90H45ZM0 90H1440V1080H0Z')",
    )
  })
})

describe('transitionFrame', () => {
  const types: TransitionType[] = [
    'dip',
    'wipe',
    'iris',
    'push',
    'slide',
    'zoom',
    'flip',
    'spectrum-load',
    'tape-loader',
  ]

  it('starts on the old scene and ends on the new one', () => {
    for (const type of types) {
      const t = newTransition(type)
      const end = transitionFrame(t, 1, size, 1)
      // Fully shown at the end: no clip hides the new scene.
      expect(end.incoming?.clipPath ?? '').not.toBe('inset(50%)')
      const start = transitionFrame(t, 0, size, 1)
      expect(start.outgoing?.clipPath ?? '').not.toBe('inset(50%)')
    }
  })

  it('wipes in the direction the new scene travels', () => {
    const wipe = { type: 'wipe', length: 1, soft: false } as const
    expect(
      transitionFrame({ ...wipe, direction: 'right' }, 0.25, size, 1).incoming,
    ).toEqual({ clipPath: 'inset(0 75% 0 0)' })
    expect(
      transitionFrame({ ...wipe, direction: 'up' }, 0.25, size, 1).incoming,
    ).toEqual({ clipPath: 'inset(75% 0 0 0)' })
  })

  it('pushes both scenes along together', () => {
    const f = transitionFrame(
      { type: 'push', length: 1, direction: 'left' },
      0.5,
      size,
      1,
    )
    expect(f.incoming?.transform).toBe('translateX(720px)')
    expect(f.outgoing?.transform).toBe('translateX(-720px)')
  })

  it('dips fully to the colour halfway through', () => {
    const f = transitionFrame(newTransition('dip'), 0.5, size, 1)
    expect(f.overlay).toMatchObject({ background: '#000000', opacity: '1' })
  })

  it('draws the same tape stripes for the same frame', () => {
    const t = newTransition('tape-loader')
    expect(transitionFrame(t, 0.3, size, 42)).toEqual(
      transitionFrame(t, 0.3, size, 42),
    )
    expect(transitionFrame(t, 0.3, size, 42)).not.toEqual(
      transitionFrame(t, 0.3, size, 43),
    )
  })

  it('fades the ending in to its colour', () => {
    expect(endingFrame({ type: 'cut' }, 1)).toBeNull()
    expect(
      endingFrame({ type: 'fade', length: 1, colour: '#ffffff' }, 0.5),
    ).toEqual({ background: '#ffffff', opacity: '0.5' })
  })
})
