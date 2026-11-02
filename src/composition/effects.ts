import type { Effects } from '#/lib/project'
import { effects as theme } from './theme'
import type { Format } from './theme'

// Filter effects over the whole video: the look of a VHS tape (softness,
// colour bleed, grain, tracking wobble and noise) played on a CRT
// (scanlines, curvature, vignette). Built from CSS and SVG filters on the
// stage, so the preview and the export draw them the same way. Everything
// that changes over time comes from the frame number, never the clock.
//
// The stage holds:
//   screen (curvature filter)
//     crop
//       tape (softness and colour bleed filter)
//         picture (the scene layers, slightly enlarged; wobbles sideways)
//         grain
//     head-switching noise band, scanlines, vignette

export interface BuiltEffects {
  // Where the scene layers go.
  content: HTMLElement
  // Shows frame n's grain, wobble and noise band.
  update: (frame: number) => void
  // Resolves when the generated textures have decoded.
  ready: Promise<void>
}

const SVG_NS = 'http://www.w3.org/2000/svg'
let nextId = 0

export const hasEffects = (fx: Effects) => Object.values(fx).some((v) => v > 0)

// A pseudo-random number in [0, 1) for a frame, the same on every run.
// `salt` gives each use its own sequence.
export function frameRandom(frame: number, salt: number) {
  let x = Math.imul(frame + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77)
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

// Seeded random numbers, for the generated textures.
function seeded(seed: number) {
  let n = 0
  return () => frameRandom(n++, seed)
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  return { c, ctx, image: ctx.createImageData(width, height) }
}

// Noise around mid-grey. With `transparent`, the noise is in the alpha
// instead: white specks for light, black for dark, clear for mid-grey, so
// it lightens and darkens the picture without a costly blend mode.
export function noiseTexture(
  size: number,
  spread: number,
  transparent = false,
) {
  const { c, ctx, image } = canvas(size, size)
  const random = seeded(1)
  for (let i = 0; i < image.data.length; i += 4) {
    // Roughly Gaussian: the sum of three uniforms.
    const d = (random() + random() + random() - 1.5) * spread
    if (transparent) {
      image.data[i] = image.data[i + 1] = image.data[i + 2] = d > 0 ? 255 : 0
      image.data[i + 3] = Math.min(255, Math.abs(d) * 2)
    } else {
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 128 + d
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return c.toDataURL('image/png')
}

// A displacement map that bulges the picture like a curved tube: each
// point takes its colour from further out, more so towards the corners.
// Red is the sideways shift and green the vertical, 128 meaning none.
export function curvatureMap(width: number, height: number) {
  const { c, ctx, image } = canvas(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width) * 2 - 1
      const v = ((y + 0.5) / height) * 2 - 1
      const r2 = (u * u + v * v) / 2
      const i = (y * width + x) * 4
      image.data[i] = 128 + u * r2 * 127
      image.data[i + 1] = 128 + v * r2 * 127
      image.data[i + 2] = 0
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return c.toDataURL('image/png')
}

function svg(tag: string, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

function layer(style: Partial<CSSStyleDeclaration> = {}) {
  const el = document.createElement('div')
  Object.assign(el.style, { position: 'absolute', inset: '0', ...style })
  return el
}

// A filter over the stage, reaching `margin` pixels past its edges.
function filter(
  id: string,
  format: Format,
  margin: number,
  ...primitives: Element[]
) {
  const f = svg('filter', {
    id,
    x: -margin,
    y: -margin,
    width: format.width + 2 * margin,
    height: format.height + 2 * margin,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  })
  f.append(...primitives)
  return f
}

// One colour channel of `input`, moved sideways and smeared.
function channel(
  input: string,
  index: 0 | 1 | 2,
  dx: number,
  smear: number,
  result: string,
) {
  const rows = [0, 1, 2].map((row) =>
    row === index
      ? [0, 1, 2].map((col) => (col === index ? 1 : 0)).join(' ') + ' 0 0'
      : '0 0 0 0 0',
  )
  const values = [...rows, '0 0 0 1 0'].join('  ')
  const out = [
    svg('feColorMatrix', {
      in: input,
      type: 'matrix',
      values,
      result: `${result}-c`,
    }),
  ]
  if (dx === 0 && smear === 0) {
    out[0].setAttribute('result', result)
    return out
  }
  out.push(
    svg('feOffset', { in: `${result}-c`, dx, dy: 0, result: `${result}-o` }),
    svg('feGaussianBlur', {
      in: `${result}-o`,
      stdDeviation: `${smear} 0`,
      result,
    }),
  )
  return out
}

function tapeFilter(id: string, format: Format, margin: number, fx: Effects) {
  const primitives: Element[] = []
  let input = 'SourceGraphic'
  if (fx.softness > 0) {
    const { blurX, blurY } = theme.softness
    primitives.push(
      svg('feGaussianBlur', {
        in: input,
        stdDeviation: `${blurX * fx.softness} ${blurY * fx.softness}`,
        result: 'soft',
      }),
    )
    input = 'soft'
  }
  if (fx.colourBleed > 0) {
    const dx = theme.colourBleed.offset * fx.colourBleed
    const smear = theme.colourBleed.smear * fx.colourBleed
    // Red one way, blue the other, then added back together.
    primitives.push(
      ...channel(input, 0, dx, smear, 'red'),
      ...channel(input, 1, 0, 0, 'green'),
      ...channel(input, 2, -dx, smear, 'blue'),
      svg('feComposite', {
        in: 'red',
        in2: 'green',
        operator: 'arithmetic',
        k2: 1,
        k3: 1,
        result: 'red-green',
      }),
      svg('feComposite', {
        in: 'red-green',
        in2: 'blue',
        operator: 'arithmetic',
        k2: 1,
        k3: 1,
      }),
    )
  }
  return primitives.length ? filter(id, format, margin, ...primitives) : null
}

export function buildEffects(
  stage: HTMLElement,
  format: Format,
  fx: Effects,
): BuiltEffects {
  if (!hasEffects(fx)) {
    return { content: stage, update: () => {}, ready: Promise.resolve() }
  }
  const id = `b1k-fx-${nextId++}`
  const defs = svg('svg', { width: 0, height: 0 })
  Object.assign((defs as SVGSVGElement).style, { position: 'absolute' })
  const screen = layer()
  // Keeps the overscanned tape picture to the stage, so the curvature
  // finds nothing beyond its edges and leaves the corners black.
  const crop = layer({ overflow: 'hidden' })
  const tape = layer()
  const picture = layer()
  stage.append(defs, screen)
  screen.append(crop)
  crop.append(tape)
  tape.append(picture)

  const textures: string[] = []
  const updates: Array<(frame: number) => void> = []

  // Overscan, like a TV: blur, colour bleed and wobble leave untidy edges,
  // so the picture is enlarged a little to push them off the stage. The
  // tape filter reaches past the stage to take in the enlarged picture.
  const margin = Math.ceil(
    theme.softness.blurX * fx.softness * 2 +
      (theme.colourBleed.offset + theme.colourBleed.smear * 2) *
        fx.colourBleed +
      theme.tracking.jitter * fx.tracking,
  )
  const overscan =
    margin > 0
      ? `scale(${1 + (2 * margin) / Math.min(format.width, format.height)})`
      : ''
  picture.style.transform = overscan

  const tapeFx = tapeFilter(`${id}-tape`, format, margin, fx)
  if (tapeFx) {
    defs.append(tapeFx)
    tape.style.filter = `url(#${id}-tape)`
  }

  const { tile, spread } = theme.grain
  const texture = (transparent: boolean) => {
    const src = noiseTexture(tile, spread, transparent)
    textures.push(src)
    return src
  }

  if (fx.grain > 0) {
    const grain = layer({
      backgroundImage: `url(${texture(true)})`,
      opacity: String(theme.grain.opacity * fx.grain),
    })
    tape.append(grain)
    updates.push((frame) => {
      const x = Math.floor(frameRandom(frame, 1) * tile)
      const y = Math.floor(frameRandom(frame, 2) * tile)
      grain.style.backgroundPosition = `${x}px ${y}px`
    })
  }

  if (fx.tracking > 0) {
    const { jitter, band, bandOpacity } = theme.tracking
    // Noise stretched into streaks along the bottom edge, outside the
    // overscan so it stays in view.
    const noiseBand = layer({
      top: 'auto',
      backgroundImage: `url(${texture(false)})`,
      backgroundSize: `${tile * 4}px ${tile / 16}px`,
      opacity: String(bandOpacity * fx.tracking),
    })
    screen.append(noiseBand)
    updates.push((frame) => {
      const shift = Math.round(
        (frameRandom(frame, 3) * 2 - 1) * jitter * fx.tracking,
      )
      picture.style.transform = shift
        ? `translateX(${shift}px) ${overscan}`
        : overscan
      const height = band * fx.tracking * (0.7 + 0.6 * frameRandom(frame, 4))
      noiseBand.style.height = `${Math.max(2, Math.round(height))}px`
      noiseBand.style.backgroundPosition = `${Math.floor(frameRandom(frame, 5) * tile * 4)}px 0`
    })
  }

  if (fx.scanlines > 0) {
    const { period, opacity } = theme.scanlines
    const dark = `rgba(0, 0, 0, ${opacity * fx.scanlines})`
    screen.append(
      layer({
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${period / 2}px, ${dark} ${period / 2}px, ${dark} ${period}px)`,
      }),
    )
  }

  if (fx.vignette > 0) {
    const { opacity, inner } = theme.vignette
    screen.append(
      layer({
        backgroundImage: `radial-gradient(ellipse at center, transparent ${inner * 100}%, rgba(0, 0, 0, ${opacity * fx.vignette}) 100%)`,
      }),
    )
  }

  if (fx.curvature > 0) {
    const { mapWidth, displacement } = theme.curvature
    const map = curvatureMap(
      mapWidth,
      Math.round((mapWidth * format.height) / format.width),
    )
    textures.push(map)
    defs.append(
      filter(
        `${id}-screen`,
        format,
        0,
        svg('feImage', {
          href: map,
          x: 0,
          y: 0,
          width: format.width,
          height: format.height,
          preserveAspectRatio: 'none',
          result: 'map',
        }),
        svg('feDisplacementMap', {
          in: 'SourceGraphic',
          in2: 'map',
          scale: displacement * fx.curvature,
          xChannelSelector: 'R',
          yChannelSelector: 'G',
        }),
      ),
    )
    screen.style.filter = `url(#${id}-screen)`
  }

  const ready = Promise.all(
    textures.map((src) => {
      const img = new Image()
      img.src = src
      return img.decode().catch(() => undefined)
    }),
  ).then(() => undefined)

  return {
    content: picture,
    update: (frame) => {
      for (const u of updates) u(frame)
    },
    ready,
  }
}
