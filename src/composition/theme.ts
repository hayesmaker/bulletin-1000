import { NO_EFFECTS } from '#/lib/project'
import type { AspectRatio, Effects } from '#/lib/project'

// The Bulletin 1000 template theme: every font, colour, brand string, layout
// measurement and timing the composition uses. Change the look here.
//
// Layout is in stage pixels. The 4:3 layout (1440×1080) is measured from the
// 1985 reference promos (see docs/style-guide.md); the 16:9 and 9:16 layouts
// are built from it. Font files are loaded in composition.css; keep `fonts`
// in sync with it.

export const fps = 25

export const brand = {
  name: 'Bulletin 1000',
  tagline: 'Video Magazine',
  // Under the 1989 splash lettering.
  tagline1989: 'Visual Communications',
}

export const fonts = {
  sans: "'Archivo Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  // 1985 splash: chunky condensed lettering and a neon script.
  logo: "'Archivo Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  script: "'Yellowtail', cursive",
  // 1989 splash: heavy rounded chrome lettering.
  chrome: "'Rubik Variable', 'Arial Rounded MT Bold', sans-serif",
}

export const colours = {
  background: '#000000',
  text: '#ffffff',
  textShadow: 'rgba(0, 0, 0, 0.6)',
  logo: '#ffc61a',
  // The packshot rule, sampled from the 1985 ACE promo.
  rule: '#daeeba',
  placeholder: '#1a1a1a',
  placeholderText: '#6b6b6b',
}

// How gameplay and stills are scaled into the inset. 'smooth' looks like the
// analogue originals; 'pixelated' keeps low-res pixel art crisp.
export const insetScaling: 'smooth' | 'pixelated' = 'pixelated'

// The 'blur' backdrop: a soft, darkened copy of the game screen filling the
// stage behind it. The copy is drawn small (`width` pixels across) and
// blurred; `scale` hides the blur's faded edges.
export const backdrop = {
  width: 160,
  blur: 28,
  brightness: 0.45,
  saturate: 1.2,
  scale: 1.15,
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  // The 4:3 game screen inset, used by gameplay, screenshot and title scenes.
  inset: Rect
  // "TITLE – Publisher" under the inset; y is the text's vertical centre.
  // 'stacked' puts the publisher on a line of its own.
  caption: {
    y: number
    fontSize: number
    fontWeight: number
    fontStretch: string
    letterSpacing: string
    lines: 'one' | 'stacked'
  }
  // Selling-point captions, centred in `area` (by default, over the game
  // screen).
  overlayCaption: {
    area?: Rect
    fontSize: number
    fontWeight: number
    fontStretch: string
    maxWidth: number
  }
  packshot: {
    boxArt: Rect
    // Price/platform pairs; the first pair aligns with the top of the area
    // and the last with its bottom. Beyond `maxRows` pairs they go into
    // more columns.
    // The title, when shown, sits at the top of the area and the pairs go
    // below it, with up to `titleGap` between (less when space is tight) and
    // at most `maxRowsWithTitle` rows.
    prices: Rect & {
      align: 'left' | 'center'
      maxRows: number
      maxRowsWithTitle: number
    }
    priceFontSize: number
    priceFontWeight: number
    platformFontSize: number
    platformFontWeight: number
    titleFontSize: number
    titleGap: number
    // A rule from `x` to the right edge of the stage; y is its top.
    rule: { x: number; y: number; thickness: number }
  }
  publisherLogo: { maxWidth: number; maxHeight: number; fontSize: number }
}

const layout4x3: Layout = {
  inset: { x: 180, y: 112, width: 1080, height: 810 },
  caption: {
    y: 1000,
    fontSize: 60,
    fontWeight: 600,
    fontStretch: '80%',
    letterSpacing: '0.01em',
    lines: 'one',
  },
  overlayCaption: {
    fontSize: 64,
    fontWeight: 700,
    fontStretch: '85%',
    maxWidth: 900,
  },
  packshot: {
    boxArt: { x: 135, y: 170, width: 450, height: 795 },
    prices: {
      x: 652,
      y: 170,
      width: 650,
      height: 795,
      align: 'left',
      maxRows: Infinity,
      maxRowsWithTitle: 4,
    },
    priceFontSize: 84,
    priceFontWeight: 800,
    platformFontSize: 62,
    platformFontWeight: 500,
    titleFontSize: 84,
    // Measured from the 1985 ACE promo: about a line between title and
    // price, and the rule about 57px below the box art.
    titleGap: 100,
    rule: { x: 135, y: 1022, thickness: 6 },
  },
  publisherLogo: { maxWidth: 1000, maxHeight: 700, fontSize: 120 },
}

// Widescreen: the 4:3 layout, centred, with wider black sides.
const pillarbox = (dx: number): Layout => {
  const { inset, packshot: p } = layout4x3
  return {
    ...layout4x3,
    inset: { ...inset, x: inset.x + dx },
    packshot: {
      ...p,
      boxArt: { ...p.boxArt, x: p.boxArt.x + dx },
      prices: { ...p.prices, x: p.prices.x + dx },
      rule: { ...p.rule, x: p.rule.x + dx },
    },
  }
}

// Vertical: the game screen across the middle, the caption under it in two
// lines; the packshot has the box art above the prices.
const layout9x16: Layout = {
  ...layout4x3,
  inset: { x: 36, y: 480, width: 1008, height: 756 },
  caption: { ...layout4x3.caption, y: 1350, lines: 'stacked' },
  // Captions go in the space above the game screen.
  overlayCaption: {
    ...layout4x3.overlayCaption,
    area: { x: 60, y: 110, width: 960, height: 340 },
    maxWidth: 900,
  },
  packshot: {
    ...layout4x3.packshot,
    boxArt: { x: 190, y: 170, width: 700, height: 1040 },
    prices: {
      x: 90,
      y: 1290,
      width: 900,
      height: 460,
      align: 'center',
      maxRows: 3,
      maxRowsWithTitle: 2,
    },
    priceFontSize: 76,
    platformFontSize: 56,
    titleGap: 60,
    // Between the box art and the text.
    rule: { x: 190, y: 1240, thickness: 6 },
  },
  publisherLogo: { maxWidth: 900, maxHeight: 900, fontSize: 110 },
}

export interface Format {
  label: string
  width: number
  height: number
  layout: Layout
  // Where the splash's 1440×1080 artwork sits on the stage, and its scale.
  splash: { x: number; y: number; scale: number }
}

export const formats: Record<AspectRatio, Format> = {
  '4:3': {
    label: '4:3',
    width: 1440,
    height: 1080,
    layout: layout4x3,
    splash: { x: 0, y: 0, scale: 1 },
  },
  '16:9': {
    label: '16:9',
    width: 1920,
    height: 1080,
    layout: pillarbox(240),
    splash: { x: 240, y: 0, scale: 1 },
  },
  '9:16': {
    label: '9:16 vertical',
    width: 1080,
    height: 1920,
    layout: layout9x16,
    splash: { x: 0, y: 555, scale: 0.75 },
  },
}

// Filter effects (see effects.ts). Each is scaled by its amount in the
// project, from 0 to 1; sizes are stage pixels at full strength.
export const effects = {
  // Tape: a soft picture, smeared more across than down.
  softness: { blurX: 2.4, blurY: 0.9 },
  // Tape: red and blue drift apart and smear sideways.
  colourBleed: { offset: 5, smear: 4 },
  // Tape: a noise texture of light and dark specks, new every frame.
  grain: { tile: 256, opacity: 0.6, spread: 70 },
  // Tape: the picture wobbles sideways and the head-switching noise band
  // runs along the bottom.
  tracking: { jitter: 2, band: 30, bandOpacity: 0.85 },
  // Screen: dark lines `period` pixels apart.
  scanlines: { period: 4, opacity: 0.45 },
  // Screen: the picture bulges like a curved tube; corners go black.
  curvature: { displacement: 110, mapWidth: 256 },
  // Screen: darker towards the corners.
  vignette: { opacity: 0.75, inner: 0.55 },
}

// Starting points for the Effects tab.
export const effectPresets: Array<{ name: string; effects: Effects }> = [
  { name: 'Clean', effects: NO_EFFECTS },
  {
    name: 'VHS tape',
    effects: {
      softness: 0.6,
      colourBleed: 0.6,
      grain: 0.4,
      tracking: 0.5,
      scanlines: 0,
      curvature: 0,
      vignette: 0.2,
    },
  },
  {
    name: 'CRT screen',
    effects: {
      softness: 0.3,
      colourBleed: 0.2,
      grain: 0.15,
      tracking: 0,
      scanlines: 0.6,
      curvature: 0.5,
      vignette: 0.6,
    },
  },
  {
    name: 'Worn tape on a CRT',
    effects: {
      softness: 0.7,
      colourBleed: 0.8,
      grain: 0.6,
      tracking: 0.8,
      scanlines: 0.5,
      curvature: 0.5,
      vignette: 0.6,
    },
  },
]

export const timing = {
  // Length of a dissolve into a scene (capped at half of either scene).
  dissolve: 0.5,
  // Music fades out over the last part of the video.
  musicFadeOut: 1.5,
  // Splash lengths, measured from the reference footage.
  splash: { '1985': 2.4, '1989': 7 },
  // Length of the built-in 1989 jingle (src/server/jingle.server.ts).
  builtInJingle: 7,
}

// The splash intros, recreated from the reference footage (see
// docs/style-guide.md). Positions are in pixels of a 1440×1080 frame at
// rest, placed on the stage by each format's `splash`; times are seconds from
// the splash start.
export const splashFrame = { width: 1440, height: 1080 }

export const splash = {
  '1985': {
    background: '#040606',
    // A panel carrying the logo over a 5×3 neon grid. It turns 1¼ times
    // about its horizontal axis while flying in, then holds face-on.
    perspective: 1600,
    // Rotation (degrees about X) and scale keyframes: [time, value].
    // Negative turns the top edge towards the viewer, as in the original.
    rotation: [
      [0.04, 90],
      [0.5, 0],
      [0.79, -90],
      [1.07, -180],
      [1.35, -270],
      [1.9, -360],
    ],
    scale: [
      [0.04, 0.5],
      [0.2, 0.56],
      [0.5, 0.67],
      [0.9, 0.83],
      [1.5, 0.92],
      [1.7, 0.975],
      [1.9, 1],
    ],
    grid: {
      x: 255,
      y: 420,
      columns: 5,
      rows: 3,
      cellWidth: 177,
      cellHeight: 160,
      pitchX: 195,
      pitchY: 178,
      radius: 12,
      stroke: 7,
      colour: '#33a4ec',
      glow: '#1f7fd6',
    },
    lettering: {
      x: 248,
      baseline: 405,
      width: 997,
      fontSize: 372,
      fontWeight: 900,
      fontStretch: '62%',
      top: '#ffe03a',
      bottom: '#e8a90c',
      outline: '#b56a00',
      glow: '#ff9a00',
    },
    script: {
      // Centre, length and angle of the "Video Magazine" line.
      x: 880,
      y: 392,
      width: 820,
      angle: -13.4,
      fontSize: 150,
      core: '#ffc890',
      colour: '#ff6a1f',
      glow: '#ff3a00',
    },
    // Where an uploaded logo goes instead of the lettering.
    logoBox: { x: 230, y: 110, width: 1080, height: 400 },
  },
  '1989': {
    fadeIn: [0.04, 0.44],
    fadeOut: [6.36, 6.92],
    background: [
      [0, '#7894bd'],
      [0.35, '#3d5d8a'],
      [0.6, '#2b466c'],
      [1, '#162a47'],
    ],
    shadow: 'rgba(16, 30, 52, 0.55)',
    // Each shape's top face is lit from the upper left.
    triangle: { light: '#3592dc', top: '#0a5fa8', side: '#16416e' },
    disc: { light: '#4fdc52', top: '#06960f', side: '#036f09' },
    square: { light: '#e6cf2c', top: '#b29c08', side: '#7d7203' },
    // A faint mirror image of the lettering below it.
    reflectionOpacity: 0.16,
    lettering: {
      // Centre of the "Bulletin 1000" line.
      x: 682,
      baseline: 822,
      width: 1050,
      fontSize: 168,
      fontWeight: 800,
      tagline: { baseline: 893, fontSize: 44, gap: 24, rule: 2.5 },
    },
    logoBox: { x: 150, y: 650, width: 1080, height: 280 },
  },
} as const
