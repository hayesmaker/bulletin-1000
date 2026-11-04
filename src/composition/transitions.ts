import type { Direction, Ending, Transition, ZoomOrigin } from '#/lib/project'
import type { ScheduledItem } from './schedule'
import { fps, transitionLook } from './theme'

// Transitions between scenes, and the video's ending. Each one is a pure
// function of its progress (0 to 1) that styles the incoming and outgoing
// layers and an overlay above them, so every frame is drawn from the time
// alone and preview and export match. Dissolves are animated on the GSAP
// timeline instead (see composition.ts), as they always have been.

type Style = Partial<CSSStyleDeclaration>

export interface TransitionFrame {
  incoming?: Style
  outgoing?: Style
  // Puts the outgoing layer over the incoming one.
  outgoingOnTop?: boolean
  overlay?: Style
}

interface Size {
  width: number
  height: number
}

// Every style a transition may set on a layer, so they can be cleared.
const LAYER_PROPS = [
  'clipPath',
  'maskImage',
  'transform',
  'transformOrigin',
  'filter',
  'zIndex',
] as const

const HIDDEN = 'inset(50%)'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeInOut = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2
const easeIn = (x: number) => 1 - Math.cos((Math.PI * x) / 2)
const easeOut = (x: number) => Math.sin((Math.PI * x) / 2)
const pct = (x: number) => `${+(x * 100).toFixed(4)}%`
const num = (x: number) => String(+x.toFixed(3))
const px = (x: number) => `${num(x)}px`

// Small seeded generator, so stripes are the same on every render.
export function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The order the ZX Spectrum draws its 192 screen lines: the screen is in
// thirds, and within each third the top pixel row of all 8 character rows
// comes first, then the second, and so on. loadOrder[y] is line y's place.
export const spectrumLoadOrder = Array.from({ length: 192 }, (_, y) => {
  const third = y >> 6
  const charRow = (y >> 3) & 7
  const pixelRow = y & 7
  return third * 64 + pixelRow * 8 + charRow
})

// A clip path showing the Spectrum screen lines loaded so far, as bands
// across the stage.
export function spectrumLinesPath(loaded: number, size: Size) {
  const band = size.height / 192
  let path = ''
  let runStart = -1
  for (let y = 0; y <= 192; y++) {
    const shown = y < 192 && spectrumLoadOrder[y] < loaded
    if (shown && runStart < 0) runStart = y
    if (!shown && runStart >= 0) {
      path += `M0 ${num(runStart * band)}H${size.width}V${num(y * band)}H0Z`
      runStart = -1
    }
  }
  return path ? `path('${path}')` : HIDDEN
}

// A clip path over the attribute cells (32 × 24) not yet coloured, after
// `done` of them have loaded in reading order.
export function spectrumCellsLeftPath(done: number, size: Size) {
  if (done >= 768) return HIDDEN
  const cellW = size.width / 32
  const cellH = size.height / 24
  const row = Math.floor(done / 32)
  const col = done % 32
  let path = `M${num(col * cellW)} ${num(row * cellH)}H${size.width}V${num((row + 1) * cellH)}H${num(col * cellW)}Z`
  if (row < 23) {
    path += `M0 ${num((row + 1) * cellH)}H${size.width}V${size.height}H0Z`
  }
  return `path('${path}')`
}

// Tape-loading border stripes: bands of two colours (or many, for the
// C64) with random heights, new every frame.
function tapeStripes(
  palette: 'spectrum' | 'c64',
  p: number,
  seed: number,
  size: Size,
) {
  const look = transitionLook.tape
  const rand = random(seed)
  // Spectrum: the wide red/cyan pilot tone, then thin blue/yellow data.
  const pilot = palette === 'spectrum' && p < look.pilot
  const [minH, maxH] = pilot ? look.pilotHeight : look.dataHeight
  const stops: string[] = []
  let y = -rand() * maxH
  let i = Math.floor(rand() * 2)
  while (y < size.height) {
    const h = minH + rand() * (maxH - minH)
    const colour =
      palette === 'c64'
        ? look.c64[Math.floor(rand() * look.c64.length)]
        : (pilot ? look.pilotColours : look.dataColours)[i % 2]
    stops.push(`${colour} ${px(y)}`, `${colour} ${px(y + h)}`)
    y += h
    i++
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

const travel = (direction: Direction, size: Size, amount: number) => {
  switch (direction) {
    case 'left':
      return `translateX(${px(-amount * size.width)})`
    case 'right':
      return `translateX(${px(amount * size.width)})`
    case 'up':
      return `translateY(${px(-amount * size.height)})`
    case 'down':
      return `translateY(${px(amount * size.height)})`
  }
}

const origins: Record<ZoomOrigin, string> = {
  centre: '50% 50%',
  'top-left': '0% 0%',
  'top-right': '100% 0%',
  'bottom-left': '0% 100%',
  'bottom-right': '100% 100%',
}

// A hard wipe as a clip; the new picture travels in `direction`.
const wipeClip = (direction: Direction, p: number) => {
  const rest = pct(1 - p)
  switch (direction) {
    case 'right':
      return `inset(0 ${rest} 0 0)`
    case 'left':
      return `inset(0 0 0 ${rest})`
    case 'down':
      return `inset(0 0 ${rest} 0)`
    case 'up':
      return `inset(${rest} 0 0 0)`
  }
}

const gradientTo: Record<Direction, string> = {
  right: 'to right',
  left: 'to left',
  down: 'to bottom',
  up: 'to top',
}

// The styles for a transition `p` of the way through. `seed` varies per
// frame and per transition, for anything random.
export function transitionFrame(
  t: Transition,
  p: number,
  size: Size,
  seed: number,
): TransitionFrame {
  switch (t.type) {
    case 'cut':
    case 'dissolve':
      return {}

    case 'dip':
      return {
        incoming: p < 0.5 ? { clipPath: HIDDEN } : {},
        overlay: {
          background: t.colour,
          opacity: String(1 - Math.abs(2 * p - 1)),
        },
      }

    case 'wipe': {
      if (!t.soft) return { incoming: { clipPath: wipeClip(t.direction, p) } }
      const soft = transitionLook.softWipe
      const edge = -soft + p * (1 + soft)
      return {
        incoming: {
          maskImage: `linear-gradient(${gradientTo[t.direction]}, #000 ${pct(edge)}, transparent ${pct(edge + soft)})`,
        },
      }
    }

    case 'iris': {
      const r = t.mode === 'open' ? p : 1 - p
      const clipPath =
        t.shape === 'box'
          ? `inset(${pct((1 - r) / 2)})`
          : `circle(${px((r * Math.hypot(size.width, size.height)) / 2)} at 50% 50%)`
      return t.mode === 'open'
        ? { incoming: { clipPath } }
        : { outgoing: { clipPath }, outgoingOnTop: true }
    }

    case 'push': {
      const e = easeInOut(p)
      return {
        incoming: { transform: travel(t.direction, size, e - 1) },
        outgoing: { transform: travel(t.direction, size, e) },
      }
    }

    case 'slide':
      return {
        incoming: { transform: travel(t.direction, size, easeInOut(p) - 1) },
      }

    case 'zoom': {
      const e = easeInOut(p)
      const transformOrigin = origins[t.origin]
      return t.mode === 'in'
        ? {
            incoming: { transform: `scale(${+e.toFixed(5)})`, transformOrigin },
          }
        : {
            outgoing: {
              transform: `scale(${+(1 - e).toFixed(5)})`,
              transformOrigin,
            },
            outgoingOnTop: true,
          }
    }

    case 'flip': {
      // The old scene turns edge-on, then the new one turns in from the
      // other side.
      const rotate = t.axis === 'horizontal' ? 'rotateX' : 'rotateY'
      const perspective = `perspective(${transitionLook.flipPerspective}px)`
      if (p < 0.5) {
        const angle = 90 * easeIn(p * 2)
        return {
          incoming: { clipPath: HIDDEN },
          outgoing: {
            transform: `${perspective} ${rotate}(${+angle.toFixed(4)}deg)`,
          },
        }
      }
      const angle = -90 * (1 - easeOut((p - 0.5) * 2))
      return {
        incoming: {
          transform: `${perspective} ${rotate}(${+angle.toFixed(4)}deg)`,
        },
        outgoing: { clipPath: HIDDEN },
      }
    }

    case 'spectrum-load': {
      const look = transitionLook.spectrum
      const lines = p / look.lines
      if (lines < 1) {
        return {
          incoming: {
            clipPath: spectrumLinesPath(Math.floor(lines * 192), size),
            filter: look.mono,
          },
        }
      }
      // The colour arrives cell by cell over what's still black and white.
      const cells = Math.floor(((p - look.lines) / (1 - look.lines)) * 768)
      return {
        overlay: {
          backdropFilter: look.mono,
          clipPath: spectrumCellsLeftPath(cells, size),
        },
      }
    }

    case 'tape-loader':
      return {
        incoming: p < 0.5 ? { clipPath: HIDDEN } : {},
        overlay: { background: tapeStripes(t.palette, p, seed, size) },
      }
  }
}

// The ending's overlay `p` of the way through.
export function endingFrame(ending: Ending, p: number): Style | null {
  if (ending.type === 'cut') return null
  return { background: ending.colour, opacity: String(p) }
}

const overlayBase: Style = {
  position: 'absolute',
  inset: '0',
  pointerEvents: 'none',
  visibility: 'hidden',
}

// Applies the transitions and ending to the built layers. `layers` are in
// schedule order, one per item.
export function buildTransitions(
  items: ScheduledItem[],
  layers: HTMLElement[],
  size: Size,
  duration: number,
  ending: Ending,
) {
  const active = items.flatMap((item, i) => {
    if (i === 0 || item.overlap <= 0) return []
    if (item.transition.type === 'cut' || item.transition.type === 'dissolve')
      return []
    const overlay = document.createElement('div')
    Object.assign(overlay.style, overlayBase, { zIndex: '2' })
    layers[i].after(overlay)
    return [
      {
        item,
        index: i,
        incoming: layers[i],
        outgoing: layers[i - 1],
        overlay,
        overlayKeys: new Set<string>(),
        applied: false,
      },
    ]
  })

  let endOverlay: HTMLElement | null = null
  const endLength =
    ending.type === 'cut' ? 0 : Math.min(ending.length, duration)
  if (endLength > 0) {
    endOverlay = document.createElement('div')
    Object.assign(endOverlay.style, overlayBase, { zIndex: '3' })
    layers.at(-1)?.after(endOverlay)
  }

  const clearLayer = (el: HTMLElement) => {
    for (const k of LAYER_PROPS) el.style[k] = ''
  }

  return (time: number) => {
    const frame = Math.floor(time * fps + 1e-6)
    const current: Array<[(typeof active)[number], number]> = []
    // Clear finished transitions first, so a layer that's in two of them
    // keeps the styles of the one that's running.
    for (const a of active) {
      const { start, overlap } = a.item
      const on = time >= start && time < start + overlap - 1e-9
      if (on) {
        current.push([
          a,
          clamp01(
            (frame - Math.round(start * fps)) / Math.round(overlap * fps),
          ),
        ])
      } else if (a.applied) {
        clearLayer(a.incoming)
        clearLayer(a.outgoing)
        a.overlay.style.visibility = 'hidden'
        a.applied = false
      }
    }
    for (const [a, p] of current) {
      const f = transitionFrame(
        a.item.transition,
        p,
        size,
        frame * 7919 + a.index,
      )
      clearLayer(a.incoming)
      clearLayer(a.outgoing)
      Object.assign(a.incoming.style, f.incoming)
      Object.assign(
        a.outgoing.style,
        f.outgoing,
        f.outgoingOnTop ? { zIndex: '1' } : {},
      )
      for (const k of a.overlayKeys) a.overlay.style.setProperty(k, '')
      a.overlayKeys.clear()
      if (f.overlay) {
        for (const [k, v] of Object.entries(f.overlay)) {
          ;(a.overlay.style as unknown as Record<string, string>)[k] =
            v as string
          a.overlayKeys.add(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
        }
        a.overlay.style.visibility = 'visible'
      } else {
        a.overlay.style.visibility = 'hidden'
      }
      a.applied = true
    }

    if (endOverlay) {
      const frames = Math.round(endLength * fps)
      const first = Math.round(duration * fps) - frames
      const style =
        frame >= first
          ? endingFrame(ending, clamp01((frame - first + 1) / frames))
          : null
      if (style)
        Object.assign(endOverlay.style, style, { visibility: 'visible' })
      else endOverlay.style.visibility = 'hidden'
    }
  }
}
