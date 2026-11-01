import { keyframeCurve } from './curve'
import type { Keyframes } from './curve'
import type { CompositionAsset } from './scenes'
import { brand, fonts, splash as theme, stage } from './theme'

// The splash intros, recreated in code from the reference footage as
// reinterpretations: the 1985 neon panel that flips in, and the static 1989
// "visual communications" ident. A project can swap the lettering for its
// own logo image.

export interface SplashLayer {
  el: HTMLElement
  images: HTMLImageElement[]
  // Adds the splash's motion to the timeline, starting at `start`.
  animate: (tl: gsap.core.Timeline, start: number) => void
}

// Fonts the splashes need loaded before rendering.
export const splashFontFaces = [
  `${theme['1985'].lettering.fontWeight} ${theme['1985'].lettering.fontSize}px ${fonts.logo}`,
  `${theme['1985'].script.fontSize}px ${fonts.script}`,
  `${theme['1989'].lettering.fontWeight} ${theme['1989'].lettering.fontSize}px ${fonts.chrome}`,
]

const SVG_NS = 'http://www.w3.org/2000/svg'

function svg(
  tag: string,
  attrs: Record<string, string | number>,
  ...children: Array<Node | string>
) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  node.append(...children)
  return node
}

function stageSvg(...children: Node[]) {
  const root = svg(
    'svg',
    {
      width: stage.width,
      height: stage.height,
      viewBox: `0 0 ${stage.width} ${stage.height}`,
    },
    ...children,
  )
  Object.assign((root as SVGSVGElement).style, {
    position: 'absolute',
    inset: '0',
    overflow: 'visible',
  })
  return root
}

const points = (pts: Array<[number, number]>) =>
  pts.map(([x, y]) => `${x},${y}`).join(' ')

// A glow: the shape blurred in a colour, under the shape itself.
function glowFilter(id: string, colour: string, blur: number) {
  return svg(
    'filter',
    { id, x: '-20%', y: '-40%', width: '140%', height: '180%' },
    svg('feGaussianBlur', {
      in: 'SourceAlpha',
      stdDeviation: blur,
      result: 'blur',
    }),
    svg('feFlood', { 'flood-color': colour, result: 'colour' }),
    svg('feComposite', {
      in: 'colour',
      in2: 'blur',
      operator: 'in',
      result: 'glow',
    }),
    svg(
      'feMerge',
      {},
      svg('feMergeNode', { in: 'glow' }),
      svg('feMergeNode', { in: 'glow' }),
      svg('feMergeNode', { in: 'SourceGraphic' }),
    ),
  )
}

function logoImage(
  asset: CompositionAsset,
  box: { x: number; y: number; width: number; height: number },
  images: HTMLImageElement[],
) {
  const img = document.createElement('img')
  Object.assign(img.style, {
    position: 'absolute',
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    objectFit: 'contain',
  })
  img.src = asset.url
  img.alt = ''
  images.push(img)
  return img
}

// A GSAP ease that follows keyframes from the first value to the last.
function keyframeEase(keys: Keyframes) {
  const curve = keyframeCurve(keys)
  const t0 = keys[0][0]
  const span = keys[keys.length - 1][0] - t0
  const v0 = keys[0][1]
  const range = keys[keys.length - 1][1] - v0
  return {
    from: v0,
    to: v0 + range,
    start: t0,
    duration: span,
    ease: (p: number) => (curve(t0 + p * span) - v0) / range,
  }
}

function splash1985(logo: CompositionAsset | undefined): SplashLayer {
  const t = theme['1985']
  const { grid, lettering: l, script: s } = t
  const images: HTMLImageElement[] = []

  const cells: Node[] = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      cells.push(
        svg('rect', {
          x: grid.x + col * grid.pitchX,
          y: grid.y + row * grid.pitchY,
          width: grid.cellWidth,
          height: grid.cellHeight,
          rx: grid.radius,
        }),
      )
    }
  }

  const art = stageSvg(
    svg(
      'defs',
      {},
      glowFilter('b1k-grid-glow', grid.glow, 7),
      glowFilter('b1k-letter-glow', l.glow, 5),
      glowFilter('b1k-script-glow', s.glow, 6),
      svg(
        'linearGradient',
        { id: 'b1k-letter-fill', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: 0, 'stop-color': l.top }),
        svg('stop', { offset: 1, 'stop-color': l.bottom }),
      ),
    ),
    svg(
      'g',
      {
        fill: 'none',
        stroke: grid.colour,
        'stroke-width': grid.stroke,
        filter: 'url(#b1k-grid-glow)',
      },
      ...cells,
    ),
    ...(logo
      ? []
      : [
          svg(
            'text',
            {
              x: l.x,
              y: l.baseline,
              textLength: l.width,
              lengthAdjust: 'spacingAndGlyphs',
              fill: 'url(#b1k-letter-fill)',
              stroke: l.outline,
              'stroke-width': 4,
              'paint-order': 'stroke',
              filter: 'url(#b1k-letter-glow)',
              style: `font: ${l.fontWeight} ${l.fontSize}px ${fonts.logo}; font-stretch: ${l.fontStretch}`,
            },
            brand.name.toUpperCase(),
          ),
          svg(
            'text',
            {
              x: s.x,
              y: s.y,
              'text-anchor': 'middle',
              'dominant-baseline': 'middle',
              textLength: s.width,
              lengthAdjust: 'spacingAndGlyphs',
              transform: `rotate(${s.angle} ${s.x} ${s.y})`,
              fill: s.core,
              stroke: s.colour,
              'stroke-width': 9,
              'paint-order': 'stroke',
              filter: 'url(#b1k-script-glow)',
              style: `font: ${s.fontSize}px ${fonts.script}`,
            },
            brand.tagline,
          ),
        ]),
  )

  // The panel turns about its own centre: the grid and lettering together.
  const cx = grid.x + ((grid.columns - 1) * grid.pitchX + grid.cellWidth) / 2
  const cy = stage.height / 2
  const panel = document.createElement('div')
  Object.assign(panel.style, {
    position: 'absolute',
    inset: '0',
    transformOrigin: `${cx}px ${cy}px`,
    backfaceVisibility: 'visible',
  })
  panel.append(art)
  if (logo) panel.append(logoImage(logo, t.logoBox, images))

  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute',
    inset: '0',
    background: t.background,
  })
  el.append(panel)

  const rotation = keyframeEase(t.rotation)
  const scale = keyframeEase(t.scale)
  return {
    el,
    images,
    animate: (tl, start) => {
      tl.set(
        panel,
        {
          transformPerspective: t.perspective,
          rotationX: rotation.from,
          scale: scale.from,
        },
        start,
      )
      tl.fromTo(
        panel,
        { rotationX: rotation.from },
        {
          rotationX: rotation.to,
          duration: rotation.duration,
          ease: rotation.ease,
          immediateRender: false,
        },
        start + rotation.start,
      )
      tl.fromTo(
        panel,
        { scale: scale.from },
        {
          scale: scale.to,
          duration: scale.duration,
          ease: scale.ease,
          immediateRender: false,
        },
        start + scale.start,
      )
    },
  }
}

function splash1989(logo: CompositionAsset | undefined): SplashLayer {
  const t = theme['1989']
  const l = t.lettering
  const images: HTMLImageElement[] = []

  const shadow = (node: Element) => {
    node.setAttribute('fill', t.shadow)
    node.setAttribute('filter', 'url(#b1k-soft)')
    return node
  }
  // A flat shape lifted off the floor: a darker copy below for its edge.
  const gradients: Element[] = []
  const slab = (
    name: string,
    shape: (dy: number) => Element,
    colours: { light: string; top: string; side: string },
  ) => {
    gradients.push(
      svg(
        'linearGradient',
        { id: `b1k-${name}`, x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: 0, 'stop-color': colours.light }),
        svg('stop', { offset: 0.7, 'stop-color': colours.top }),
      ),
    )
    const side = shape(14)
    side.setAttribute('fill', colours.side)
    const top = shape(0)
    top.setAttribute('fill', `url(#b1k-${name})`)
    return svg('g', {}, side, top)
  }

  const triangle = (dy: number) =>
    svg('polygon', {
      points: points([
        [342, 378 + dy],
        [218, 567 + dy],
        [490, 495 + dy],
      ]),
    })
  const disc = (dy: number) =>
    svg('ellipse', {
      cx: 678,
      cy: 375 + dy,
      rx: 158,
      ry: 88,
      transform: `rotate(20 678 ${375 + dy})`,
    })
  const square = (dy: number) =>
    svg('polygon', {
      points: points([
        [906, 408 + dy],
        [1118, 405 + dy],
        [1103, 578 + dy],
        [867, 588 + dy],
      ]),
    })

  const chromeStops: Array<[number, string]> = [
    [0, '#f4f8fa'],
    [0.38, '#a9b6bc'],
    [0.52, '#2b363b'],
    [0.62, '#55636a'],
    [1, '#e6eef1'],
  ]
  const name = (attrs: Record<string, string | number>) =>
    svg(
      'text',
      {
        x: l.x,
        y: l.baseline,
        'text-anchor': 'middle',
        textLength: l.width,
        lengthAdjust: 'spacingAndGlyphs',
        style: `font: ${l.fontWeight} ${l.fontSize}px ${fonts.chrome}`,
        ...attrs,
      },
      brand.name,
    )
  const lettering = logo
    ? []
    : [
        // The reflection: flipped about the baseline, below the tagline.
        name({
          fill: '#c9d6db',
          opacity: t.reflectionOpacity,
          transform: `translate(0 ${2 * l.baseline + 26}) scale(1 -1)`,
          mask: 'url(#b1k-fade)',
        }),
        svg(
          'text',
          {
            x: l.x,
            y: l.baseline,
            'text-anchor': 'middle',
            textLength: l.width,
            lengthAdjust: 'spacingAndGlyphs',
            fill: 'url(#b1k-chrome)',
            stroke: '#1a2226',
            'stroke-width': 2.5,
            'paint-order': 'stroke',
            filter: 'url(#b1k-lift)',
            style: `font: ${l.fontWeight} ${l.fontSize}px ${fonts.chrome}`,
          },
          brand.name,
        ),
        ...taglineWithRules(),
      ]

  function taglineWithRules() {
    const tag = l.tagline
    const textWidth = 578
    const left = l.x - l.width / 2
    const right = l.x + l.width / 2
    const ruleY = tag.baseline - tag.fontSize * 0.36
    const rule = (x1: number, x2: number) =>
      svg('line', {
        x1,
        x2,
        y1: ruleY,
        y2: ruleY,
        stroke: '#c9d6db',
        'stroke-width': tag.rule,
      })
    return [
      rule(left, l.x - textWidth / 2 - tag.gap),
      rule(l.x + textWidth / 2 + tag.gap, right),
      svg(
        'text',
        {
          x: l.x,
          y: tag.baseline,
          'text-anchor': 'middle',
          textLength: textWidth,
          lengthAdjust: 'spacingAndGlyphs',
          fill: '#dbe5e9',
          style: `font: 500 ${tag.fontSize}px ${fonts.sans}; font-stretch: 80%`,
        },
        brand.tagline1989.toUpperCase(),
      ),
    ]
  }

  const shapes = [
    slab('triangle', triangle, t.triangle),
    slab('disc', disc, t.disc),
    slab('square', square, t.square),
  ]

  const art = stageSvg(
    svg(
      'defs',
      {},
      ...gradients,
      svg(
        'linearGradient',
        { id: 'b1k-sky', x1: 0, y1: 0, x2: 0, y2: 1 },
        ...t.background.map(([offset, colour]) =>
          svg('stop', { offset, 'stop-color': colour }),
        ),
      ),
      svg(
        'linearGradient',
        { id: 'b1k-chrome', x1: 0, y1: 0, x2: 0, y2: 1 },
        ...chromeStops.map(([offset, colour]) =>
          svg('stop', { offset, 'stop-color': colour }),
        ),
      ),
      svg(
        'linearGradient',
        { id: 'b1k-fade-gradient', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: 0, 'stop-color': '#fff' }),
        svg('stop', { offset: 0.6, 'stop-color': '#000' }),
      ),
      svg(
        'mask',
        {
          id: 'b1k-fade',
          maskUnits: 'userSpaceOnUse',
          x: 0,
          y: l.baseline,
          width: stage.width,
          height: l.fontSize,
        },
        svg('rect', {
          x: 0,
          y: l.baseline + 26,
          width: stage.width,
          height: l.fontSize,
          fill: 'url(#b1k-fade-gradient)',
        }),
      ),
      svg(
        'filter',
        { id: 'b1k-soft', x: '-20%', y: '-20%', width: '140%', height: '140%' },
        svg('feGaussianBlur', { stdDeviation: 9 }),
      ),
      svg(
        'filter',
        { id: 'b1k-lift', x: '-5%', y: '-20%', width: '110%', height: '160%' },
        svg('feDropShadow', {
          dx: 3,
          dy: 8,
          stdDeviation: 4,
          'flood-color': '#0c1726',
          'flood-opacity': 0.7,
        }),
      ),
    ),
    svg('rect', {
      width: stage.width,
      height: stage.height,
      fill: 'url(#b1k-sky)',
    }),
    // Shadows on the floor, then the shapes above them.
    shadow(
      svg('polygon', {
        points: points([
          [300, 548],
          [538, 600],
          [262, 676],
        ]),
      }),
    ),
    shadow(
      svg('ellipse', {
        cx: 690,
        cy: 518,
        rx: 160,
        ry: 52,
        transform: 'rotate(4 690 518)',
      }),
    ),
    shadow(
      svg('polygon', {
        points: points([
          [1010, 452],
          [1190, 458],
          [1172, 662],
          [944, 668],
        ]),
      }),
    ),
    ...shapes,
    ...lettering,
  )

  const scene = document.createElement('div')
  Object.assign(scene.style, { position: 'absolute', inset: '0' })
  scene.append(art)
  if (logo) scene.append(logoImage(logo, t.logoBox, images))

  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute',
    inset: '0',
    background: '#000',
  })
  el.append(scene)

  return {
    el,
    images,
    animate: (tl, start) => {
      const [inStart, inEnd] = t.fadeIn
      const [outStart, outEnd] = t.fadeOut
      tl.fromTo(
        scene,
        { opacity: 0 },
        {
          opacity: 1,
          duration: inEnd - inStart,
          ease: 'none',
          immediateRender: false,
        },
        start + inStart,
      )
      tl.fromTo(
        scene,
        { opacity: 1 },
        {
          opacity: 0,
          duration: outEnd - outStart,
          ease: 'none',
          immediateRender: false,
        },
        start + outStart,
      )
    },
  }
}

export function buildSplash(
  year: '1985' | '1989',
  logo: CompositionAsset | undefined,
) {
  return year === '1985' ? splash1985(logo) : splash1989(logo)
}
